// Demo mode: example data only. Nothing here talks to Hermes.
// Every reply is tagged so viewers can tell it is sample data.

const now = () => Date.now();
const { t } = require("./i18n");

const SKILLS = {
  hamster: {
    skills: ["주간 매출 정리", "세금계산서 확인", "할 일 우선순위 정하기"],
    connectors: ["구글 시트", "텔레그램"],
  },
  shiba: {
    skills: ["문의 답장 초안", "견적서 만들기", "고객 메모 정리"],
    connectors: ["Gmail", "구글 시트", "텔레그램"],
  },
  penguin: {
    skills: ["릴스 대본 쓰기", "썸네일 문구 뽑기", "게시 일정 짜기"],
    connectors: ["인스타그램", "노션"],
  },
  otter: {
    skills: ["웹 검색 요약", "경쟁사 가격 조사", "보고서 정리"],
    connectors: ["웹 브라우저", "노션"],
  },
  cat: {
    skills: ["일정 정리", "아침 브리핑", "일 나눠 맡기기"],
    connectors: ["구글 캘린더", "텔레그램"],
  },
};

const REPLIES = {
  hamster: "이번 주 매출 정리했어요. 지난주보다 주문이 조금 늘었고, 환불 2건은 시트에 표시해 뒀어요.",
  shiba: "문의 3건 답장 초안 써 뒀어요. 보내기 전에 한 번만 확인해 주세요.",
  penguin: "릴스 대본 2개 다듬었어요. 첫 3초 문장을 더 짧게 바꿨어요.",
  otter: "경쟁 상품 5개 가격 조사 끝났어요. 표로 노션에 올려 뒀어요.",
  cat: "오늘 일정 정리했어요. 오후 3시 미팅 전에 자료 하나만 챙기시면 돼요.",
};

function initialState(config) {
  const agents = config.agents.map((a) => ({
    id: a.id,
    name: a.name,
    team: a.team,
    animal: a.animal,
    profile: a.profile,
    status: "idle",
    task: "",
    location: "desk",
  }));
  const set = (id, status, task) => { const a = agents.find((x) => x.id === id); if (a) Object.assign(a, { status, task }); };
  set("hamster", "working", "주간 매출 정리 중");
  set("shiba", "needs_approval", "고객 3명에게 답장 보내도 될까요?");
  set("penguin", "working", "릴스 대본 다듬는 중");
  set("otter", "done", "경쟁사 가격 조사 완료");
  set("cat", "idle", "");

  return {
    mode: "demo",
    connected: false,
    title: config.title,
    agents,
    meeting: { active: false, topic: "", members: [] },
    kanban: [
      { id: "t1", title: "신제품 상세페이지 문구", status: "todo", assignee: "penguin" },
      { id: "t2", title: "고객 문의 답장 3건", status: "blocked", assignee: "shiba" },
      { id: "t3", title: "주간 매출 정리", status: "running", assignee: "hamster" },
      { id: "t4", title: "릴스 대본 2개", status: "running", assignee: "penguin" },
      { id: "t5", title: "경쟁사 가격 조사", status: "done", assignee: "otter" },
      { id: "t6", title: "아침 브리핑", status: "done", assignee: "cat" },
      { id: "t7", title: "다음 달 이벤트 아이디어", status: "todo", assignee: "cat" },
    ],
    skills: SKILLS,
    feed: [
      { agentId: "otter", text: "경쟁사 가격 조사 끝났어요. 노션에 표로 올렸어요.", ts: now() - 1000 * 60 * 4 },
      { agentId: "cat", text: "아침 브리핑 보냈어요. 오늘 일정은 3개예요.", ts: now() - 1000 * 60 * 32 },
    ],
    chats: {},
  };
}

// The four sample members, plus any bots added beyond the first five.
const BASE_IDS = ["hamster", "shiba", "penguin", "otter", "cat"];
function meetingMembers(agents) {
  const ids = agents.map((a) => a.id);
  return ["cat", "shiba", "penguin", "otter"].filter((id) => ids.includes(id))
    .concat(ids.filter((id) => !BASE_IDS.includes(id)));
}

class DemoOffice {
  constructor(config, emit) {
    this.config = config;
    this.emit = emit;
    this.state = initialState(config);
  }

  snapshot() {
    return this.state;
  }

  agent(id) {
    return this.state.agents.find((a) => a.id === id);
  }

  pushChat(agentId, msg) {
    (this.state.chats[agentId] ||= []).push({ ...msg, ts: now() });
  }

  async chat(agentId, text) {
    const a = this.agent(agentId);
    if (!a) throw new Error("unknown agent");
    this.pushChat(agentId, { role: "user", text });
    Object.assign(a, { status: "working", task: t(this.config.lang, "task_processing") });
    this.emit();
    setTimeout(() => {
      const reply = REPLIES[agentId] || (this.config.lang === "en" ? "Understood. I will let you know when finished." : "알겠어요. 끝나면 알려 드릴게요.");
      this.pushChat(agentId, { role: "agent", text: reply, demo: true });
      Object.assign(a, { status: "done", task: t(this.config.lang, "task_done_report") });
      this.state.feed.unshift({ agentId, text: reply, ts: now() });
      this.emit();
    }, 2600);
    return { ok: true };
  }

  approve(agentId, choice) {
    const a = this.agent(agentId);
    if (!a || a.status !== "needs_approval") return { ok: false };
    const ok = choice !== "deny";
    Object.assign(a, ok ? { status: "working", task: t(this.config.lang, "task_sending_reply") } : { status: "idle", task: "" });
    this.pushChat(agentId, { role: "user", text: ok ? t(this.config.lang, "chat_approve") : t(this.config.lang, "chat_deny") });
    this.emit();
    if (ok) {
      setTimeout(() => {
        Object.assign(a, { status: "done", task: t(this.config.lang, "task_sent_replies") });
        const t2 = this.state.kanban.find((k) => k.id === "t2");
        if (t2) t2.status = "done";
        this.state.feed.unshift({ agentId, text: t(this.config.lang, "feed_sent_replies"), ts: now() });
        this.emit();
      }, 2000);
    }
    return { ok: true };
  }

  // Meeting = a kanban card split into child cards for several agents.
  // In Hermes this maps to `hermes kanban decompose`, so the demo shows the same thing.
  startMeeting() {
    const members = meetingMembers(this.state.agents);
    this.state.meeting = { active: true, topic: "신제품 출시 준비, 할 일 나누기", members };
    for (const id of members) Object.assign(this.agent(id), { location: "meeting", status: "working", task: t(this.config.lang, "task_meeting") });
    this.emit();
    setTimeout(() => this.endMeeting(), 6000);
    return { ok: true };
  }

  endMeeting() {
    if (!this.state.meeting.active) return;
    const kids = [
      { title: "출시 안내 문자 초안", assignee: "shiba" },
      { title: "출시 릴스 대본", assignee: "penguin" },
      { title: "비슷한 상품 가격 비교", assignee: "otter" },
    ];
    kids.forEach((k, i) => this.state.kanban.push({ id: `m${Date.now()}${i}`, status: "todo", ...k }));
    for (const id of this.state.meeting.members) Object.assign(this.agent(id), { location: "desk", status: "idle", task: "" });
    this.state.feed.unshift({ agentId: "cat", text: "출시 준비 할 일 3개로 나눠서 맡겼어요.", ts: now() });
    this.state.meeting = { active: false, topic: "", members: [] };
    this.emit();
  }

  // Fixed poses for screenshots: ?scene=chat|meeting|kanban|skills
  scene(name) {
    this.state = initialState(this.config);
    if (name === "chat") {
      this.state.chats.shiba = [
        { role: "user", text: "오늘 들어온 문의 정리해 줄래?", ts: now() - 90000 },
        { role: "agent", text: "문의 3건이에요. 배송 2건, 교환 1건이에요. 답장 초안도 써 뒀어요.", demo: true, ts: now() - 60000 },
        { role: "user", text: "좋아, 초안 보여 줘", ts: now() - 30000 },
        { role: "agent", text: REPLIES.shiba, demo: true, ts: now() - 5000 },
      ];
    }
    if (name === "meeting") {
      const members = meetingMembers(this.state.agents);
      this.state.meeting = { active: true, topic: "신제품 출시 준비, 할 일 나누기", members };
      for (const id of members) Object.assign(this.agent(id), { location: "meeting", status: "working", task: t(this.config.lang, "task_meeting") });
    }
    this.emit();
    return { ok: true };
  }
}

module.exports = { DemoOffice };
