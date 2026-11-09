#!/usr/bin/env node
// Stand-in for the `hermes` CLI in tests. FAKE_HERMES_STEP=1 before decompose, 2 after.
const fs = require("node:fs");
const step = fs.readFileSync(process.env.FAKE_HERMES_STEP_FILE, "utf8").trim();
const args = process.argv.slice(2).join(" ");
const out = (x) => process.stdout.write(typeof x === "string" ? x : JSON.stringify(x));
if (args === "profile list") out(" ◆default  m  running  —\n  sales  m  running  —\n  content  m  stopped  —\n");
else if (args === "kanban list --json") {
  out(step === "1"
    ? [{ id: "r1", title: "신제품 출시 준비", status: "triage", assignee: "default" }]
    : [{ id: "r1", title: "신제품 출시 준비", status: "todo", assignee: "default" },
       { id: "c1", title: "안내 문자", status: "todo", assignee: "sales" },
       { id: "c2", title: "릴스 대본", status: "todo", assignee: "content" }]);
} else if (args === "kanban show r1 --json") out({ task: {}, parents: [], children: ["c1", "c2"] });
else if (args.endsWith("skills list")) out("");
else process.exit(1);
