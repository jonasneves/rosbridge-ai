#!/usr/bin/env node
// Local proxy: pipes chat messages through `claude -p` using your Claude Code subscription.
// Run with: node local-proxy.js  (or: make proxy)

const { createServer } = require("http");
const { spawn } = require("child_process");

const PORT = 7337;

createServer((req, res) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

  let body = "";
  req.on("data", chunk => (body += chunk));
  req.on("end", () => {
    let prompt;
    try {
      ({ prompt } = JSON.parse(body));
    } catch {
      res.writeHead(400);
      res.end("Bad JSON");
      return;
    }

    console.log("\n── prompt ──────────────────────────────");
    console.log(prompt);
    console.log("────────────────────────────────────────\n");

    const proc = spawn("claude", ["-p", "--output-format", "stream-json", "--verbose", "--max-turns", "1"]);

    res.writeHead(200, { ...cors, "Content-Type": "application/x-ndjson" });

    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.stdout.on("data", chunk => {
      for (const line of chunk.toString().split("\n").filter(Boolean)) {
        try {
          const evt = JSON.parse(line);
          if (evt.type === "assistant") console.log("[assistant]", JSON.stringify(evt.message?.content));
          else if (evt.type === "result") console.log("[result]", evt.result);
          else console.log(`[${evt.type}]`, evt.subtype ?? "");
        } catch {
          console.log(line);
        }
        res.write(line + "\n");
      }
    });

    proc.stderr.on("data", d => console.error("claude:", d.toString().trim()));
    proc.on("close", (code, signal) => {
      if (code !== 0) console.error(`claude exited (code=${code}, signal=${signal})`);
      res.end();
    });

    // Kill subprocess only if client disconnects before response completes
    res.on("close", () => proc.kill());
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Claude proxy → http://127.0.0.1:${PORT}`);
  console.log("Forwarding requests to `claude -p` (uses your Claude Code account)");
});
