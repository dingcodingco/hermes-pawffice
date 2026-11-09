// Hermes mode: reads real state from Hermes Agent on this computer.
//
// Two paths, both official:
//   1) the `hermes` CLI (no key): profiles, gateway running/stopped, kanban, skills
//   2) the API server (needs API_SERVER_KEY): talking to a bot, live progress, approvals
//      docs: website/docs/user-guide/features/api-server.md in the hermes-agent repo
//
// Nothing is invented. If something can't be read, the agent shows as offline
// or the feature is reported as unavailable.

const { execFile } = require("node:child_process");
const { layoutAgents } = require("./layout");

const HERMES_BIN = process.env.HERMES_BIN || "hermes";
const API_URL = (process.env.HERMES_API_URL || "http://127.0.0.1:8642").replace(/\/$/, "");
const POLL_MS = Number(process.env.OFFICE_POLL_MS || 15000);
const DONE_HOLD_MS = 10 * 60 * 1000;
const MEETING_MS = Number(process.env.OFFICE_MEETING_MS || 12000);

function cli(args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    execFile(HERMES_BIN, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`hermes ${args.join(" ")} failed: ${(stderr || err.message).trim().slice(0, 300)}`));
      resolve(stdout);
    });
  });
}

// `hermes profile list` prints a table:  ◆default  gpt-x  running  —  —
function parseProfiles(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*[◆*]?\s*([A-Za-z0-9_.-]+)\s+(\S+)\s+(running|stopped)\b/);
    if (m) out[m[1]] = { model: m[2], gateway: m[3] };
  }
  return out;
}

// `hermes skills list` prints a box table: │ name │ category │ source │ trust │ status │
function parseSkills(text) {
  const names = [];
  for (const line of text.split("\n")) {
    const cells = line.split("│").map((c) => c.trim());
    if (cells.length >= 6 && cells[1] && cells[1] !== "Name" && /enabled/.test(cells[5] || "")) names.push(cells[1]);
  }
  return names;
}

function apiKeyFor(profile) {
  return process.env[envName("HERMES_API_KEY", profile)] || (profile === "default" ? process.env.HERMES_API_KEY : "") || "";
}

const envName = (prefix, profile) => `${prefix}_${String(profile).toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;

// One shared gateway: /p/<profile>/... (docs: "Multi-profile routing").
// A profile that runs its own gateway on another port: set HERMES_API_URL_<PROFILE>.
function apiBase(profile) {
  const own = process.env[envName("HERMES_API_URL", profile)];
  if (own) return own.replace(/\/$/, "");
  return profile === "default" ? API_URL : `${API_URL}/p/${encodeURIComponent(profile)}`;
}

const KANBAN_STATUS = { triage: "todo", todo: "todo", ready: "todo", running: "running", blocked: "blocked", done: "done" };

class HermesOffice {
  constructor(config, emit) {
    this.config = config;
    this.emit = emit;
    this.runs = {}; // agentId -> { runId, status }
    this.state = {
      mode: "hermes",
      connected: false,
      title: config.title,
      agents: config.agents.map((a) => ({
        id: a.id, name: a.name, team: a.team, animal: a.animal, profile: a.profile,
        status: "offline", task: "확인 중", location: "desk",
      })),
      meeting: { active: false, topic: "", members: [] },
      kanban: [],
      skills: {},
      feed: [],
      chats: {},
      notes: [],
    };
  }

  snapshot() {
    return this.state;
  }

  agent(id) {
    return this.state.agents.find((a) => a.id === id);
  }

  async start() {
    await this.refresh();
    this.timer = setInterval(() => this.refresh().catch(() => {}), POLL_MS);
  }

  // Agent bubbles from profile state + runs started from this office. Sync, so chat events show at once.
  applyRuns() {
    const profiles = this.profiles || {};
    for (const a of this.state.agents) {
      const p = profiles[a.profile];
      const run = this.runs[a.id];
      if (!p) Object.assign(a, { status: "offline", task: `프로필 '${a.profile}' 없음` });
      else if (run && run.status === "running") Object.assign(a, { status: "working", task: run.task || "일하는 중" });
      else if (run && run.status === "needs_approval") Object.assign(a, { status: "needs_approval", task: run.task || "승인이 필요해요" });
      else if (run && run.status === "done" && Date.now() - run.at < DONE_HOLD_MS) Object.assign(a, { status: "done", task: "방금 끝낸 일 보고" });
      else if (p.gateway === "running") Object.assign(a, { status: "idle", task: "" });
      else Object.assign(a, { status: "offline", task: "게이트웨이 꺼짐" });
    }
  }

  async refresh() {
    const notes = [];
    let profiles = {};
    try {
      profiles = parseProfiles(await cli(["profile", "list"]));
      this.state.connected = true;
    } catch (e) {
      this.state.connected = false;
      notes.push("hermes 명령을 찾지 못했어요. 헤르메스가 이 컴퓨터에 설치돼 있는지 확인해 주세요.");
    }

    if (this.state.connected) this.syncAgents(profiles);
    this.profiles = profiles;
    this.applyRuns();

    try {
      const tasks = JSON.parse(await cli(["kanban", "list", "--json"]));
      const byProfile = Object.fromEntries(this.config.agents.map((a) => [a.profile, a.id]));
      const list = Array.isArray(tasks) ? tasks : [];
      await this.detectMeeting(list, byProfile);
      this.state.kanban = list
        .filter((t) => KANBAN_STATUS[t.status])
        .map((t) => ({ id: t.id, title: t.title, status: KANBAN_STATUS[t.status], assignee: byProfile[t.assignee] || null, assigneeProfile: t.assignee }));
    } catch (e) {
      notes.push("칸반을 읽지 못했어요.");
    }

    for (const a of this.config.agents) {
      if (!profiles[a.profile]) continue;
      try {
        const names = parseSkills(await cli(["-p", a.profile, "skills", "list"]));
        this.state.skills[a.id] = { skills: names, connectors: [] };
      } catch (e) {
        /* keep previous */
      }
    }

    if (this.missing?.length) notes.push(`설정 파일에 있지만 헤르메스에 없는 프로필은 빼고 보여 줘요: ${this.missing.join(", ")}`);
    if (!process.env.HERMES_API_KEY) notes.push("말 걸기는 API 서버 키가 있어야 해요. README의 '말 걸기 켜기'를 따라 해 주세요.");
    this.state.notes = notes;
    this.emit();
  }

  // The office shows exactly the profiles that exist in Hermes.
  // - a profile listed in office.config.json keeps its name, team and animal
  // - a profile not listed there is added with the next free character and seat
  // - a listed profile that Hermes does not have is left out (and named in a note)
  syncAgents(profiles) {
    const names = Object.keys(profiles);
    const raw = this.config.rawAgents || [];
    const listed = raw.filter((a) => names.includes(a.profile));
    const known = new Set(listed.map((a) => a.profile));
    const added = this.config.autoAddProfiles === false ? [] : names.filter((p) => !known.has(p))
      .map((p) => ({ id: `profile-${p}`, name: p, team: "헤르메스 프로필", profile: p }));
    const next = [...listed, ...added].map((a) => JSON.parse(JSON.stringify(a)));
    const sig = next.map((a) => a.id).join(",");
    this.missing = raw.filter((a) => !names.includes(a.profile)).map((a) => a.profile);
    if (sig === this.agentSig) return;
    this.agentSig = sig;
    this.config.layoutId = this.state.layoutId = sig;
    this.config.agents = next;
    layoutAgents(this.config);
    const prev = Object.fromEntries(this.state.agents.map((a) => [a.id, a]));
    this.state.agents = this.config.agents.map((a) => ({
      ...(prev[a.id] || { status: "offline", task: "확인 중", location: "desk" }),
      id: a.id, name: a.name, team: a.team, animal: a.animal, profile: a.profile,
    }));
  }

  // Meeting scene = `hermes kanban decompose`: a card leaves Triage and gets child cards
  // routed to several profiles. `kanban list --json` has no parent/child fields, so the
  // children are read with `kanban show <id> --json` only for a card that just left Triage.
  async detectMeeting(list, byProfile) {
    const prev = this.prevStatus;
    this.prevStatus = Object.fromEntries(list.map((t) => [t.id, t.status]));
    if (!prev) return;
    for (const t of list) {
      if (prev[t.id] !== "triage" || t.status === "triage") continue;
      let shown;
      try { shown = JSON.parse(await cli(["kanban", "show", t.id, "--json"])); } catch { continue; }
      const kids = (shown.children || []).map((id) => list.find((x) => x.id === id)).filter(Boolean);
      if (!kids.length) continue;
      const profiles = [t.assignee, ...kids.map((k) => k.assignee)];
      const members = [...new Set(profiles.map((p) => byProfile[p]).filter(Boolean))];
      if (members.length) this.showMeeting(t.title, members, kids.length);
    }
  }

  showMeeting(topic, members, count) {
    this.state.meeting = { active: true, topic: `${topic} · 할 일 ${count}개로 나누는 중`, members };
    for (const a of this.state.agents) a.location = members.includes(a.id) ? "meeting" : "desk";
    clearTimeout(this.meetingTimer);
    this.meetingTimer = setTimeout(() => {
      this.state.meeting = { active: false, topic: "", members: [] };
      for (const a of this.state.agents) a.location = "desk";
      this.state.feed.unshift({ agentId: members[0], text: `「${topic}」을 할 일 ${count}개로 나눠 맡겼어요.`, ts: Date.now() });
      this.emit();
    }, MEETING_MS);
  }

  pushChat(agentId, msg) {
    (this.state.chats[agentId] ||= []).push({ ...msg, ts: Date.now() });
  }

  async chat(agentId, text) {
    const cfg = this.config.agents.find((a) => a.id === agentId);
    if (!cfg) throw new Error("unknown agent");
    const key = apiKeyFor(cfg.profile);
    if (!key) throw new Error("이 봇에게 말을 걸려면 API 서버 키가 필요해요. README의 '말 걸기 켜기'를 봐 주세요.");

    this.pushChat(agentId, { role: "user", text });
    this.emit();
    const res = await fetch(`${apiBase(cfg.profile)}/v1/runs`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ input: text, session_id: this.sessionIdFor(agentId) }),
    });
    if (!res.ok) throw new Error(`헤르메스가 요청을 받지 않았어요 (HTTP ${res.status})`);
    const { run_id: runId } = await res.json();
    this.runs[agentId] = { runId, status: "running", task: text.slice(0, 30), at: Date.now() };
    this.applyRuns();
    this.emit();
    this.refresh().catch(() => {});
    this.follow(agentId, cfg.profile, runId, key).catch((e) => {
      this.pushChat(agentId, { role: "system", text: `진행 상황을 받지 못했어요: ${e.message}` });
      this.emit();
    });
    return { ok: true, runId };
  }

  sessionIdFor(agentId) {
    return `pawffice-${agentId}`;
  }

  // GET /v1/runs/{id}/events is SSE; each `data:` line is JSON with an `event` field.
  async follow(agentId, profile, runId, key) {
    const res = await fetch(`${apiBase(profile)}/v1/runs/${runId}/events`, { headers: { authorization: `Bearer ${key}` } });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const decoder = new TextDecoder();
    let buf = "";
    let answer = "";
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = block.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
        const run = this.runs[agentId];
        if (ev.event === "message.delta") answer += ev.delta || "";
        if (ev.event === "tool.started") { run.task = `${ev.tool || "도구"} 사용 중`; this.applyRuns(); this.emit(); await this.refresh(); }
        if (ev.event === "approval.request") {
          Object.assign(run, { status: "needs_approval", task: ev.description || ev.command || "승인이 필요해요", choices: ev.choices, requestId: ev.request_id });
          this.applyRuns(); this.emit(); await this.refresh();
        }
        if (ev.event === "approval.responded") { run.status = "running"; this.applyRuns(); this.emit(); await this.refresh(); }
        if (ev.event === "run.completed") {
          const text = ev.output || answer || "(빈 답변)";
          Object.assign(run, { status: "done", at: Date.now() });
          this.pushChat(agentId, { role: "agent", text });
          this.state.feed.unshift({ agentId, text: text.slice(0, 140), ts: Date.now() });
          this.applyRuns(); this.emit(); await this.refresh();
          return;
        }
        if (ev.event === "run.failed" || ev.event === "run.cancelled") {
          Object.assign(run, { status: "idle" });
          this.pushChat(agentId, { role: "system", text: ev.error || "작업이 멈췄어요." });
          this.applyRuns(); this.emit(); await this.refresh();
          return;
        }
      }
    }
  }

  async approve(agentId, choice) {
    const cfg = this.config.agents.find((a) => a.id === agentId);
    const run = this.runs[agentId];
    if (!cfg || !run || run.status !== "needs_approval") return { ok: false };
    const res = await fetch(`${apiBase(cfg.profile)}/v1/runs/${run.runId}/approval`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKeyFor(cfg.profile)}`, "content-type": "application/json" },
      body: JSON.stringify({ choice: choice === "deny" ? "deny" : "once", request_id: run.requestId }),
    });
    this.pushChat(agentId, { role: "user", text: choice === "deny" ? "하지 마세요" : "진행해 주세요" });
    return { ok: res.ok };
  }

  startMeeting() {
    // Hermes splits work across profiles with `hermes kanban decompose <task>`.
    // The office does not run it on its own; it only shows the result on the board.
    throw new Error("헤르메스 모드에서는 칸반 할 일을 `hermes kanban decompose <할 일 id>` 로 나누면 회의 장면이 보여요.");
  }

  scene() {
    return { ok: false };
  }
}

module.exports = { HermesOffice, parseProfiles, parseSkills };
