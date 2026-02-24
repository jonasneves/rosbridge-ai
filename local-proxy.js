#!/usr/bin/env node
// Local proxy: transparent forwarder to api.anthropic.com with OAuth auth.
// Injects Authorization + anthropic-beta headers; streams the response back.
// Run with: node local-proxy.js  (or: make proxy)

const { createServer } = require("http");
const { request: httpsRequest } = require("https");
const fs = require("fs");
const path = require("path");

// Load .env (no dotenv dependency)
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
  }
}

const PORT    = 7337;
const MODEL   = "claude-sonnet-4-6";
const MAX_RPM = 10;

const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
if (!token) {
  console.error("Error: CLAUDE_CODE_OAUTH_TOKEN not set. Copy .env.example → .env and fill it in.");
  process.exit(1);
}

let reqCount = 0;
setInterval(() => { reqCount = 0; }, 60_000);

function forwardError(apiRes, res, cors) {
  let errBody = "";
  apiRes.on("data", c => (errBody += c));
  apiRes.on("end", () => {
    console.error("API error body:", errBody);
    res.writeHead(apiRes.statusCode, cors);
    res.end(errBody);
  });
}

createServer((req, res) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, anthropic-version, anthropic-beta",
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/claude") {
    res.writeHead(404);
    res.end();
    return;
  }

  if (++reqCount > MAX_RPM) {
    console.warn(`Rate limit hit (${MAX_RPM} req/min)`);
    res.writeHead(429, cors);
    res.end();
    return;
  }

  let raw = "";
  req.on("data", chunk => (raw += chunk));
  req.on("end", () => {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      res.writeHead(400);
      res.end("Bad JSON");
      return;
    }

    // Ensure a valid model ID -- the local option stores "claude" as a shorthand
    if (!parsed.model?.startsWith("claude-")) parsed.model = MODEL;
    const payload = JSON.stringify(parsed);

    console.log(`→ ${payload.length}b  model=${parsed.model}`);

    const apiReq = httpsRequest({
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
        "authorization": `Bearer ${token}`,
        "content-length": Buffer.byteLength(payload),
      },
    }, apiRes => {
      console.log(`← ${apiRes.statusCode}`);
      if (apiRes.statusCode !== 200) {
        return forwardError(apiRes, res, cors);
      }
      res.writeHead(200, {
        ...cors,
        "content-type": apiRes.headers["content-type"] ?? "text/event-stream",
      });
      apiRes.pipe(res);
    });

    apiReq.on("error", e => {
      console.error("Request failed:", e.message);
      if (!res.headersSent) res.writeHead(500, cors);
      res.end();
    });

    apiReq.write(payload);
    apiReq.end();
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Claude proxy → http://127.0.0.1:${PORT}`);
  console.log(`  Token: ${token.slice(0, 8)}…${token.slice(-4)}\n`);
});
