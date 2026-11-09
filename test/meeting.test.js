const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const stepFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "office-")), "step");
process.env.FAKE_HERMES_STEP_FILE = stepFile;
process.env.HERMES_BIN = path.join(__dirname, "fake-hermes.js");
process.env.OFFICE_MEETING_MS = "2000";
const { HermesOffice } = require("../server/hermes");
const { layoutAgents } = require("../server/layout");

test("a card split by decompose shows its assignees in the meeting room", async () => {
  const raw = [{ id: "hamster", name: "햄찌", profile: "default", animal: "hamster" }];
  const config = layoutAgents({ seats: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }], agents: raw.map((a) => ({ ...a })), rawAgents: raw });
  const office = new HermesOffice(config, () => {});

  fs.writeFileSync(stepFile, "1");
  await office.refresh();
  assert.deepStrictEqual(office.state.agents.map((a) => a.id), ["hamster", "profile-sales", "profile-content"]);
  assert.strictEqual(office.state.meeting.active, false);

  fs.writeFileSync(stepFile, "2");
  await office.refresh();
  assert.strictEqual(office.state.meeting.active, true);
  assert.deepStrictEqual(office.state.meeting.members, ["hamster", "profile-sales", "profile-content"]);
  assert.ok(office.state.agents.every((a) => a.location === "meeting"));

  await new Promise((r) => setTimeout(r, 2300));
  assert.strictEqual(office.state.meeting.active, false);
  assert.match(office.state.feed[0].text, /할 일 2개/);
});
