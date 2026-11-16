// Small HTTP server: static files + JSON API + server-sent events. No dependencies.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { DemoOffice } = require("./demo");
const { HermesOffice } = require("./hermes");
const { layoutAgents } = require("./layout");
const { t } = require("./i18n");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function loadConfig() {
  const local = path.join(process.cwd(), "office.config.json");
  const file = fs.existsSync(local) ? local : path.join(ROOT, "office.config.json");
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  config.lang = config.lang || "ko";
  config.rawAgents = JSON.parse(JSON.stringify(config.agents)); // before seats are filled in
  return layoutAgents(config);
}

function start({ mode = "demo", port = 4300, host = "127.0.0.1" } = {}) {
  loadDotEnv(path.join(process.cwd(), ".env"));
  const config = loadConfig();
  const clients = new Set();
  const emit = () => {
    const data = `data: ${JSON.stringify(office.snapshot())}\n\n`;
    for (const res of clients) res.write(data);
  };
  const office = mode === "hermes" ? new HermesOffice(config, emit) : new DemoOffice(config, emit);
  if (office.start) office.start().catch((e) => console.error(e.message));

  const json = (res, code, body) => {
    res.writeHead(code, { "content-type": TYPES[".json"], "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) => new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => { s += c; if (s.length > 64 * 1024) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(s || "{}")); } catch { resolve({}); } });
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname === "/api/config") return json(res, 200, config);
      if (url.pathname === "/api/state") return json(res, 200, office.snapshot());
      if (url.pathname === "/api/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        res.write(`data: ${JSON.stringify(office.snapshot())}\n\n`);
        clients.add(res);
        const ping = setInterval(() => res.write(": ping\n\n"), 20000);
        req.on("close", () => { clients.delete(res); clearInterval(ping); });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/chat") {
        const { agentId, text } = await readBody(req);
        if (!text || !String(text).trim()) return json(res, 400, { error: t(config.lang, "msg_empty") });
        return json(res, 200, await office.chat(agentId, String(text).slice(0, 4000)));
      }
      if (req.method === "POST" && url.pathname === "/api/approve") {
        const { agentId, choice } = await readBody(req);
        return json(res, 200, await office.approve(agentId, choice));
      }
      if (req.method === "POST" && url.pathname === "/api/meeting") return json(res, 200, office.startMeeting());
      if (req.method === "POST" && url.pathname === "/api/scene") {
        const { name } = await readBody(req);
        return json(res, 200, office.scene(name));
      }

      const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
      const file = path.join(PUBLIC, rel);
      if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return json(res, 404, { error: "not found" });
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  });

  server.listen(port, host, () => {
    const modeLabel = mode === "hermes" ? t(config.lang, "hermes_mode") : t(config.lang, "demo_mode");
    console.log(`\n  ${config.title} — ${modeLabel}`);
    console.log(`  ${t(config.lang, "open_browser")}: http://${host === "0.0.0.0" ? "localhost" : host}:${port}\n`);
  });
  return server;
}

module.exports = { start };
