#!/usr/bin/env node
// Local proxy: forwards requests to api.anthropic.com with OAuth auth.
// Injects Authorization + anthropic-beta headers; streams the response back.

const { createServer } = require("http");
const { request: httpsRequest } = require("https");
const fs = require("fs");
const path = require("path");

// ── Configuration ───────────────────────────────────────────────────────────

const PORT = 7337;
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_RPM = 10;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, anthropic-version, anthropic-beta",
};

// ── Minimal .env loader (no dotenv dependency) ──────────────────────────────
// Matches KEY=value lines, strips optional surrounding quotes.

const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
  }
}

const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
if (!token) {
  console.error("Error: CLAUDE_CODE_OAUTH_TOKEN not set. Copy .env.example -> .env and fill it in.");
  process.exit(1);
}

// ── Rate limiter ────────────────────────────────────────────────────────────

let reqCount = 0;
setInterval(() => { reqCount = 0; }, 60_000);

// ── Helpers ─────────────────────────────────────────────────────────────────

function collectBody(stream) {
  return new Promise((resolve) => {
    let data = "";
    stream.on("data", (chunk) => { data += chunk; });
    stream.on("end", () => resolve(data));
  });
}

function forwardToAnthropic(msg, res) {
  if (!msg.model?.startsWith("claude-")) msg.model = DEFAULT_MODEL;
  const payload = JSON.stringify(msg);

  console.log(`-> ${payload.length}b  model=${msg.model}`);

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
  }, (apiRes) => {
    console.log(`<- ${apiRes.statusCode}`);

    if (apiRes.statusCode !== 200) {
      collectBody(apiRes).then((body) => {
        console.error("API error:", body);
        res.writeHead(apiRes.statusCode, CORS_HEADERS);
        res.end(body);
      });
      return;
    }

    res.writeHead(200, {
      ...CORS_HEADERS,
      "content-type": apiRes.headers["content-type"] ?? "text/event-stream",
    });
    apiRes.pipe(res);
  });

  apiReq.on("error", (err) => {
    console.error("Request failed:", err.message);
    if (!res.headersSent) res.writeHead(500, CORS_HEADERS);
    res.end();
  });

  apiReq.end(payload);
}

// ── Server ──────────────────────────────────────────────────────────────────

function handleRequest(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
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
    res.writeHead(429, CORS_HEADERS);
    res.end();
    return;
  }

  collectBody(req).then((raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      res.writeHead(400);
      res.end("Bad JSON");
      return;
    }
    forwardToAnthropic(msg, res);
  });
}

createServer(handleRequest).listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Claude proxy -> http://127.0.0.1:${PORT}`);
  console.log(`  Token: ${token.slice(0, 8)}...${token.slice(-4)}\n`);
});
