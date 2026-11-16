const test = require("node:test");
const assert = require("node:assert");
const { parseProfiles, parseSkills } = require("../server/hermes");
const { layoutAgents } = require("../server/layout");
const { t } = require("../server/i18n");

test("parseProfiles reads names with one or more spaces after them", () => {
  const text = [
    " Profile           Model        Gateway   Alias",
    " ◆default          gpt-x        running   —",
    "  dingcolabsoffice gpt-y        stopped   —",
  ].join("\n");
  assert.deepStrictEqual(parseProfiles(text), {
    default: { model: "gpt-x", gateway: "running" },
    dingcolabsoffice: { model: "gpt-y", gateway: "stopped" },
  });
});

test("parseSkills keeps enabled rows only", () => {
  const text = [
    "┃ Name   ┃ Category ┃ Source ┃ Trust ┃ Status   ┃",
    "│ notes  │          │ local  │ local │ enabled  │",
    "│ old    │          │ local  │ local │ disabled │",
  ].join("\n");
  assert.deepStrictEqual(parseSkills(text), ["notes"]);
});

test("layoutAgents gives free animals and seats, then opens building 2", () => {
  const seats = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
  const config = { seats, agents: [{ id: "a", animal: "cat" }, { id: "b" }, { id: "c" }] };
  layoutAgents(config);
  const animals = config.agents.map((a) => a.animal);
  assert.strictEqual(animals[0], "cat");
  assert.strictEqual(new Set(animals).size, 3);
  assert.deepStrictEqual(config.agents.map((a) => a.page), [1, 1, 2]);
  assert.strictEqual(config.pages, 2);
});

test("i18n string table returns localized and formatted strings", () => {
  assert.strictEqual(t("ko", "msg_empty"), "메시지가 비어 있어요.");
  assert.strictEqual(t("en", "msg_empty"), "Message cannot be empty.");
  assert.strictEqual(t("en", "meeting_decompose_topic", "Launch", 3), "Launch · Splitting into 3 tasks");
  assert.strictEqual(t("unknown", "msg_empty"), "메시지가 비어 있어요.");
});
