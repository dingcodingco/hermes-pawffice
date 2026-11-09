// Front end: draws the office and the side panel from /api/events.
const FRAMES = 5; // 0,1 typing · 2 sleepy · 3 raise hand · 4 done

const I18N = {
  ko: {
    title: "Pawffice · Hermes 픽셀 사무실",
    demo_mode: "데모 · 예시 데이터",
    hermes_connected: "헤르메스 연결됨",
    hermes_disconnected: "헤르메스 연결 안 됨",
    feed: "보고함",
    kanban: "칸반",
    skills: "스킬·연결",
    meeting_btn: "회의 열기",
    board_title: "칸반 보기",
    building_page: (n) => `${n}관`,
    status_working: "일하는 중",
    status_needs_approval: "승인 필요",
    status_done: "완료",
    status_idle: "대기",
    status_offline: "꺼짐",
    col_todo: "할 일",
    col_running: "진행 중",
    col_blocked: "막힘",
    col_done: "완료",
    just_now: "방금",
    m_ago: (m) => `${m}분 전`,
    h_ago: (h) => `${Math.round(h)}시간 전`,
    demo_reply: "데모 응답",
    approval_needed: "승인이 필요해요",
    btn_approve: "진행해 주세요",
    btn_deny: "하지 마세요",
    chat_empty: (name) => `${name}에게 할 일을 말해 보세요.`,
    chat_placeholder: (name) => `${name}에게 말 걸기`,
    btn_send: "보내기",
    kanban_title: "칸반 보드",
    kanban_desc: "누가 무슨 일을 맡았는지 한눈에 봐요.",
    unassigned: "담당 없음",
    skills_title: "스킬·연결",
    skills_desc: "직원마다 챙겨 준 스킬과 연결 도구예요.",
    label_skills: "스킬",
    label_tools: "연결 도구",
    none: "없음",
    feed_title: "보고함",
    feed_desc: "직원들이 끝낸 일을 여기로 보고해요. 캐릭터를 누르면 말을 걸 수 있어요.",
    feed_meeting_title: "회의 중",
    feed_meeting_desc: (topic) => `${topic} · 끝나면 칸반에 할 일이 생겨요.`,
    feed_empty: "아직 보고가 없어요.",
    meeting_sign: (topic, count) => `회의 중 · ${topic} (${count}명)`,
  },
  en: {
    title: "Pawffice · Hermes Pixel Office",
    demo_mode: "Demo · Sample Data",
    hermes_connected: "Hermes Connected",
    hermes_disconnected: "Hermes Disconnected",
    feed: "Feed",
    kanban: "Kanban",
    skills: "Skills",
    meeting_btn: "Start Meeting",
    board_title: "View Kanban",
    building_page: (n) => `Bldg ${n}`,
    status_working: "Working",
    status_needs_approval: "Needs approval",
    status_done: "Done",
    status_idle: "Idle",
    status_offline: "Offline",
    col_todo: "To Do",
    col_running: "In Progress",
    col_blocked: "Blocked",
    col_done: "Done",
    just_now: "just now",
    m_ago: (m) => `${m}m ago`,
    h_ago: (h) => `${Math.round(h)}h ago`,
    demo_reply: "Demo response",
    approval_needed: "Approval needed",
    btn_approve: "Approve",
    btn_deny: "Deny",
    chat_empty: (name) => `Ask ${name} to do something.`,
    chat_placeholder: (name) => `Message ${name}`,
    btn_send: "Send",
    kanban_title: "Kanban Board",
    kanban_desc: "See at a glance who is doing what.",
    unassigned: "Unassigned",
    skills_title: "Skills & Tools",
    skills_desc: "Skills and tools assigned to each agent.",
    label_skills: "Skills",
    label_tools: "Connected Tools",
    none: "None",
    feed_title: "Feed",
    feed_desc: "Completed work is reported here. Click a character to chat.",
    feed_meeting_title: "In Meeting",
    feed_meeting_desc: (topic) => `${topic} · When finished, tasks will appear on Kanban.`,
    feed_empty: "No reports yet.",
    meeting_sign: (topic, count) => `Meeting · ${topic} (${count} members)`,
  },
};

function t(key, ...args) {
  const lang = config?.lang === "en" ? "en" : "ko";
  const val = I18N[lang]?.[key] ?? I18N.ko[key] ?? key;
  return typeof val === "function" ? val(...args) : val;
}

const STATUS_ICONS = {
  working: "…",
  needs_approval: "!",
  done: "✓",
  idle: "z",
  offline: "–",
};
const statusLabel = (k) => t(`status_${k}`);

const COLS = ["todo", "running", "blocked", "done"];

const $ = (s, el = document) => el.querySelector(s);
const params = new URLSearchParams(location.search);
let config, state;
let sprites = {};
let panel = { kind: "feed", agentId: null };
let tick = 0;
let page = Number(params.get("page")) || 1;
const DESK_W = 90;

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const agentCfg = (id) => config.agents.find((a) => a.id === id);
const agentState = (id) => state.agents.find((a) => a.id === id);
const ago = (ts) => {
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? t("just_now") : m < 60 ? t("m_ago", m) : t("h_ago", m / 60);
};

function applyI18n() {
  document.documentElement.lang = config?.lang || "ko";
  document.title = t("title");
  const feedBtn = $("[data-panel='feed']");
  if (feedBtn) feedBtn.textContent = t("feed");
  const kanbanBtn = $("[data-panel='kanban']");
  if (kanbanBtn) kanbanBtn.textContent = t("kanban");
  const skillsBtn = $("[data-panel='skills']");
  if (skillsBtn) skillsBtn.textContent = t("skills");
  const meetingBtn = $("#meetingBtn");
  if (meetingBtn) meetingBtn.textContent = t("meeting_btn");
  const board = $("#board");
  if (board) board.title = t("board_title");
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = src;
  });
}

async function boot() {
  await loadConfig();
  fit();
  addEventListener("resize", fit);

  document.querySelectorAll("[data-panel]").forEach((b) => b.addEventListener("click", () => openPanel(b.dataset.panel)));
  $("#meetingBtn").addEventListener("click", async () => {
    const r = await post("/api/meeting");
    if (r.error) alert(r.error);
  });

  const scene = params.get("scene");
  if (scene) {
    await post("/api/scene", { name: scene });
    if (scene === "chat") openPanel("chat", params.get("agent") || "shiba");
    else if (scene === "meeting") openPanel("feed");
    else openPanel(scene);
  } else openPanel("feed");

  const es = new EventSource("/api/events");
  es.onmessage = async (e) => {
    state = JSON.parse(e.data);
    if (state.agents.length !== config.agents.length || (state.layoutId && state.layoutId !== config.layoutId)) await loadConfig(); // Hermes found a new profile
    render();
  };
  setInterval(() => { tick++; animate(); }, 380);
}

async function loadConfig() {
  config = await (await fetch("/api/config")).json();
  applyI18n();
  await Promise.all(config.agents.map(async (a) => {
    if (sprites[a.animal]) return;
    const img = await loadImage(`assets/sprites/${a.animal}.png`);
    sprites[a.animal] = { w: img.width / FRAMES, h: img.height, sheetW: img.width };
  }));
  page = Math.min(page, config.pages || 1);
  drawPages();
  drawFurniture();
}

// Building tabs appear only when the bots do not fit in one building.
function drawPages() {
  const box = $("#pages");
  const n = config.pages || 1;
  box.hidden = n < 2;
  box.innerHTML = Array.from({ length: n }, (_, i) => `<button data-page="${i + 1}" class="${i + 1 === page ? "on" : ""}">${t("building_page", i + 1)}</button>`).join("");
  box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    page = Number(b.dataset.page);
    drawPages();
    drawFurniture();
    render();
  }));
}

async function post(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  return r.json();
}

function fit() {
  const wrap = $("#stageWrap");
  const v = config.view || { x: 0, y: 0, w: 1376, h: 768 };
  const s = Math.min(wrap.clientWidth / v.w, wrap.clientHeight / v.h);
  const stage = $("#stage");
  stage.style.transform = `scale(${s})`;
  stage.style.left = `${(wrap.clientWidth - v.w * s) / 2 - v.x * s}px`;
  stage.style.top = `${(wrap.clientHeight - v.h * s) / 2 - v.y * s}px`;
}

function drawFurniture() {
  const box = $("#furniture");
  const fronts = $("#fronts");
  box.innerHTML = "";
  fronts.innerHTML = "";
  for (const a of config.agents.filter((x) => x.page === page)) {
    if (a.desk) {
      const img = document.createElement("img");
      img.className = "sprite";
      img.src = `assets/furniture/${a.desk.type}.png`;
      img.onload = () => { img.style.left = `${a.desk.x}px`; img.style.top = `${a.desk.y - img.naturalHeight}px`; };
      box.appendChild(img);
    }
    if (a.frontCrop) {
      // re-draws part of the background in front of the agent (e.g. the reception desk)
      const c = a.frontCrop;
      const d = document.createElement("div");
      d.className = "front";
      Object.assign(d.style, {
        left: `${c.x}px`, top: `${c.y}px`, width: `${c.w}px`, height: `${c.h}px`,
        backgroundImage: "url(assets/office-day.webp)", backgroundPosition: `-${c.x}px -${c.y}px`, backgroundSize: "1376px 768px",
      });
      fronts.appendChild(d);
    }
  }
}

function framesFor(status) {
  if (status === "working") return [0, 1];
  if (status === "needs_approval") return [3];
  if (status === "done") return [4];
  return [2];
}

function seatOf(a, s) {
  if (s.location === "meeting") {
    const i = state.meeting.members.indexOf(a.id);
    const n = state.meeting.members.length;
    const fixed = config.meetingSeats || [];
    if (n <= fixed.length || !config.meetingArea) return fixed[i] || fixed[0];
    const m = config.meetingArea;
    return { x: Math.round(m.x0 + ((m.x1 - m.x0) * (i + 0.5)) / n - 28), y: m.y };
  }
  return a.seat;
}

function render() {
  $("#title").textContent = state.title;
  const badge = $("#mode");
  badge.textContent = state.mode === "demo" ? t("demo_mode") : state.connected ? t("hermes_connected") : t("hermes_disconnected");
  badge.classList.toggle("live", state.mode === "hermes" && state.connected);

  const layer = $("#agents");
  for (const a of config.agents) {
    const s = agentState(a.id);
    const sp = sprites[a.animal];
    let el = layer.querySelector(`[data-id="${a.id}"]`);
    if (!el) {
      el = document.createElement("div");
      el.dataset.id = a.id;
      el.innerHTML = `<div class="bubble"><span class="ico"></span><span class="txt"></span></div><div class="body"></div><div class="tag"></div>`;
      el.addEventListener("click", () => openPanel("chat", a.id));
      layer.appendChild(el);
    }
    const seat = seatOf(a, s);
    el.hidden = !(a.page === page || s.location === "meeting");
    el.className = `agent ${s.status}${s.location === "meeting" ? " in-meeting" : ""}${panel.kind === "chat" && panel.agentId === a.id ? " selected" : ""}`;
    Object.assign(el.style, { left: `${seat.x}px`, top: `${seat.y - sp.h}px`, width: `${sp.w}px`, height: `${sp.h}px` });
    const body = el.querySelector(".body");
    Object.assign(body.style, { width: `${sp.w}px`, height: `${sp.h}px`, backgroundImage: `url(assets/sprites/${a.animal}.png)` });
    const b = el.querySelector(".bubble");
    b.className = `bubble s-${s.status}`;
    b.querySelector(".ico").textContent = STATUS_ICONS[s.status] || "–";
    const text = s.task || statusLabel(s.status);
    b.querySelector(".txt").innerHTML = `${esc(a.name)} <b>·</b> ${esc(text.length > 16 ? `${text.slice(0, 15)}…` : text)}`;
    el.querySelector(".tag").textContent = `${a.name} · ${a.team}`;
  }
  placeBubbles();

  const board = $("#board");
  if (config.lobbyBoard) {
    const lb = config.lobbyBoard;
    Object.assign(board.style, { left: `${lb.x}px`, top: `${lb.y}px`, width: `${lb.w}px`, height: `${lb.h}px` });
    const lanes = [["todo", "blocked"], ["running"], ["done"]];
    board.innerHTML = lanes.map((ks) => `<div class="lane">${state.kanban.filter((t) => ks.includes(t.status)).slice(0, 8)
      .map((t) => `<span class="note n-${t.status}" title="${esc(t.title)}"></span>`).join("")}</div>`).join("");
    board.onclick = () => openPanel("kanban");
  }

  const sign = $("#meetingSign");
  sign.hidden = !state.meeting.active;
  sign.textContent = state.meeting.active ? t("meeting_sign", state.meeting.topic, state.meeting.members.length) : "";
  animate();
  renderPanel();
}

// Bubbles go to the left of a bot. If a neighbour sits there, they go right of the desk,
// and if both sides are taken, above the head.
function placeBubbles() {
  const spans = [];
  for (const a of config.agents) {
    const s = agentState(a.id);
    if (!s || s.location === "meeting" || a.page !== page) continue;
    const w = sprites[a.animal].w;
    spans.push({ id: a.id, y: a.seat.y, x0: a.seat.x, x1: Math.max(a.seat.x + w, a.desk ? a.desk.x + DESK_W : 0) });
  }
  const v = config.view || { x: 0, w: 1376 };
  const right = v.x + v.w - 10; // may reach over the elevator shaft
  const free = (y, x0, x1, self) => !spans.some((o) => o.id !== self && Math.abs(o.y - y) < 5 && o.x0 < x1 && o.x1 > x0);
  for (const sp of spans) {
    const b = document.querySelector(`.agent[data-id="${sp.id}"] .bubble`);
    const bw = b.offsetWidth + 12;
    b.classList.remove("right", "top");
    b.style.left = "";
    if (free(sp.y, sp.x0 - bw, sp.x0, sp.id)) continue;
    const start = sp.x1 + 12;
    if (start + bw <= right && free(sp.y, start, start + bw, sp.id)) {
      b.classList.add("right");
      b.style.left = `${start - sp.x0}px`;
    } else b.classList.add("top");
  }
}

function animate() {
  if (!state) return;
  for (const a of config.agents) {
    const s = agentState(a.id);
    const el = document.querySelector(`.agent[data-id="${a.id}"] .body`);
    if (!el) continue;
    const fr = framesFor(s.status);
    const f = fr[tick % fr.length];
    el.style.backgroundPosition = `-${f * sprites[a.animal].w}px 0`;
  }
}

function face(animal, size = 46) {
  const sp = sprites[animal];
  const k = (size * 1.35) / sp.w;
  return `background-image:url(assets/sprites/${animal}.png);background-size:${sp.sheetW * k}px ${sp.h * k}px;background-position:${-(sp.w * k - size) / 2}px -2px`;
}

function openPanel(kind, agentId = null) {
  panel = { kind, agentId };
  document.querySelectorAll("[data-panel]").forEach((b) => b.classList.toggle("on", b.dataset.panel === kind));
  if (state) render();
}

function renderPanel() {
  const p = $("#panel");
  const notes = (state.notes || []).map((n) => `<div class="note">${esc(n)}</div>`).join("");
  if (panel.kind === "chat") return renderChat(p, notes);
  if (panel.kind === "kanban") return renderKanban(p, notes);
  if (panel.kind === "skills") return renderSkills(p, notes);
  return renderFeed(p, notes);
}

function renderChat(p, notes) {
  const a = agentCfg(panel.agentId);
  const s = agentState(a.id);
  const msgs = (state.chats[a.id] || []).map((m) =>
    `<div class="msg msg-${m.role}">${esc(m.text)}${m.demo ? `<span class="demo">${t("demo_reply")}</span>` : ""}</div>`).join("");
  const approval = s.status === "needs_approval" ? `
    <div class="approve"><strong>${t("approval_needed")}</strong><br>${esc(s.task)}
      <div class="row"><button class="btn" data-approve="once">${t("btn_approve")}</button><button class="btn ghost" data-approve="deny">${t("btn_deny")}</button></div>
    </div>` : "";
  const old = p.querySelector(".composer input");
  const keep = old?.value || "";
  const focused = old && document.activeElement === old ? [old.selectionStart, old.selectionEnd] : null;
  p.innerHTML = `
    <div class="p-head"><div class="who"><span class="face" style="${face(a.animal)}"></span>
      <div><h2>${esc(a.name)}</h2><p>${esc(a.team)} · ${statusLabel(s.status)}${s.task ? ` · ${esc(s.task)}` : ""}</p></div></div></div>
    <div class="p-body">${notes}${approval}${msgs || `<p style="color:var(--muted);font-size:13px">${esc(t("chat_empty", a.name))}</p>`}</div>
    <form class="composer"><input placeholder="${esc(t("chat_placeholder", a.name))}" value="${esc(keep)}" /><button>${t("btn_send")}</button></form>`;
  const body = p.querySelector(".p-body");
  body.scrollTop = body.scrollHeight;
  if (focused) {
    const input = p.querySelector(".composer input");
    input.focus();
    input.setSelectionRange(...focused);
  }
  p.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = p.querySelector("input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    const r = await post("/api/chat", { agentId: a.id, text });
    if (r.error) alert(r.error);
  });
  p.querySelectorAll("[data-approve]").forEach((b) => b.addEventListener("click", () => post("/api/approve", { agentId: a.id, choice: b.dataset.approve })));
}

function renderKanban(p, notes) {
  const cols = COLS.map((k) => {
    const label = t(`col_${k}`);
    const cards = state.kanban.filter((t) => t.status === k);
    return `<div class="col ${k}"><h3>${label}<span>${cards.length}</span></h3>${cards.map((t) => {
      const a = t.assignee && agentCfg(t.assignee);
      return `<div class="card">${esc(t.title)}<div class="by">${a ? `<i style="${face(a.animal, 18)}"></i>${esc(a.name)}` : esc(t.assigneeProfile || t("unassigned"))}</div></div>`;
    }).join("")}</div>`;
  }).join("");
  p.innerHTML = `
    <div class="p-head"><h2>${t("kanban_title")}</h2><p>${t("kanban_desc")}</p></div>
    <div class="p-body">${notes}<div class="cols">${cols}</div></div>`;
}

function renderSkills(p, notes) {
  const list = config.agents.map((a) => {
    const sk = state.skills[a.id] || { skills: [], connectors: [] };
    return `<div class="staff"><div class="who"><span class="face" style="${face(a.animal)}"></span><div><strong>${esc(a.name)}</strong><span>${esc(a.team)}</span></div></div>
      <div class="label">${t("label_skills")}</div><div class="chips">${sk.skills.map((x) => `<span class="chip">${esc(x)}</span>`).join("") || `<span class="chip">${t("none")}</span>`}</div>
      ${sk.connectors.length ? `<div class="label">${t("label_tools")}</div><div class="chips">${sk.connectors.map((x) => `<span class="chip conn">${esc(x)}</span>`).join("")}</div>` : ""}
    </div>`;
  }).join("");
  p.innerHTML = `
    <div class="p-head"><h2>${t("skills_title")}</h2><p>${t("skills_desc")}</p></div>
    <div class="p-body">${notes}${list}</div>`;
}

function renderFeed(p, notes) {
  const items = state.feed.map((f) => {
    const a = agentCfg(f.agentId);
    return `<div class="feed-item"><span class="face" style="width:36px;height:36px;flex:none;border:2px solid var(--ink);background-color:#f1e6d4;background-repeat:no-repeat;image-rendering:pixelated;${face(a.animal, 36)}"></span>
      <div><strong>${esc(a.name)}</strong> <time>${ago(f.ts)}</time>${esc(f.text)}</div></div>`;
  }).join("");
  p.innerHTML = `
    <div class="p-head"><h2>${state.meeting.active ? t("feed_meeting_title") : t("feed_title")}</h2><p>${state.meeting.active ? esc(t("feed_meeting_desc", state.meeting.topic)) : t("feed_desc")}</p></div>
    <div class="p-body">${notes}${items || `<p style="color:var(--muted);font-size:13px">${t("feed_empty")}</p>`}</div>`;
}

boot();
