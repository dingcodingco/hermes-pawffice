#!/usr/bin/env node
// Usage:
//   npx hermes-pawffice            -> demo mode (sample data, no Hermes needed)
//   npx hermes-pawffice --hermes   -> read real state from Hermes on this computer
//   options: --port 4300
const { start } = require("../server");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

start({
  mode: flag("--hermes") ? "hermes" : "demo",
  port: Number(value("--port", process.env.PORT || 4300)),
});
