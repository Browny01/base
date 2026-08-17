#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────────────────────
// Base local bridge — lets the Base web app talk to CLIs on YOUR machine
// (Claude Code with your Claude Pro/Max plan, or Codex with your ChatGPT plan).
//
// The browser calls this server directly; nothing goes through Vercel, and your
// prompts never leave your computer except to the CLI you already use.
//
// SECURITY
//   • Binds to 127.0.0.1 only — not exposed on your LAN. Reach it remotely via
//     `tailscale serve` (HTTPS, tailnet-only), never a raw public port.
//   • If BRIDGE_CLI_TOKEN is set, every request must send
//     `Authorization: Bearer <token>`. Set it in Base → Settings.
//   • CORS is limited to the Base origin (BRIDGE_ALLOWED_ORIGIN).
//
// USAGE
//   BRIDGE_CLI_TOKEN=<secret> node scripts/bridge-cli.mjs      # port 8787
//   PORT=8787 BRIDGE_CLI_TOKEN=<secret> node scripts/bridge-cli.mjs
//
//   Uses your personal subscriptions via their official CLIs. Single-user use.
// ────────────────────────────────────────────────────────────────────────────────

import { createServer, request as httpRequest } from "node:http";
import { spawn, spawnSync } from "node:child_process";

const PORT = Number(process.env.PORT || 8787);
const HOST = "127.0.0.1";
const TOKEN = process.env.BRIDGE_CLI_TOKEN || "";
const DEFAULT_ORIGIN = "https://base.lucasbrown.xyz";
const ALLOWED = (process.env.BRIDGE_ALLOWED_ORIGIN || DEFAULT_ORIGIN).split(",").map((s) => s.trim());
// Local Ollama the bridge proxies to. The browser can't reach http://localhost from
// the HTTPS site, and Ollama rejects non-loopback Host headers (DNS-rebind guard) — so
// we forward here with the Host rewritten to loopback. Tailnet-only; Ollama has no auth.
const OLLAMA_TARGET = process.env.BRIDGE_OLLAMA_URL || "http://127.0.0.1:11434";

function corsHeaders(req) {
  const origin = req.headers.origin || "";
  const ok = ALLOWED.includes(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin) || origin.endsWith(".vercel.app") || origin.endsWith(".ts.net");
  return {
    "Access-Control-Allow-Origin": ok ? origin : ALLOWED[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    // Private Network Access: a public HTTPS site (Vercel) → a private tailnet IP (100.x)
    // is blocked by Chrome unless the preflight is answered with this header.
    "Access-Control-Allow-Private-Network": "true",
    "Vary": "Origin",
  };
}

function authed(req) {
  if (!TOKEN) return true; // no token configured → open (localhost only)
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") && h.slice(7) === TOKEN;
}

const have = (cmd) => { try { return spawnSync(cmd, ["--version"], { timeout: 4000 }).status === 0; } catch { return false; } };

const RUNNERS = {
  claude: { label: "Claude (local)", note: "Local · Claude Code plan", cmd: "claude", args: ["-p"] },
  codex:  { label: "Codex (local)",  note: "Local · Codex plan",       cmd: "codex",  args: ["exec"] },
};

function models() {
  const out = [];
  if (have("claude")) out.push({ id: "claude", label: RUNNERS.claude.label, note: RUNNERS.claude.note });
  if (have("codex")) out.push({ id: "codex", label: RUNNERS.codex.label, note: RUNNERS.codex.note });
  return out;
}

function buildPrompt(system, messages) {
  const convo = (messages || []).map((m) => {
    let s = `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content || ""}`;
    for (const a of m.attachments || []) {
      if (a.kind === "text" && a.text) s += `\n\n[File: ${a.name}]\n${a.text}`;
      else s += `\n[attached ${a.kind}: ${a.name}]`;
    }
    return s;
  }).join("\n\n");
  const preamble = "Continue the following conversation as the assistant. Reply only with your next message, no role label.\n\n";
  return (system ? system + "\n\n" : "") + preamble + convo + "\n\nAssistant:";
}

const server = createServer((req, res) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }

  // Transparent Ollama reverse-proxy (GET /ollama/api/tags, POST /ollama/api/chat, …).
  // No bearer required: it only reaches the local Ollama, and access is already gated by
  // the tailnet. We strip Origin/Referer and rewrite Host so Ollama sees a loopback call.
  if (req.url.startsWith("/ollama/")) {
    const base = new URL(OLLAMA_TARGET);
    const path = req.url.slice("/ollama".length);
    const headers = { ...req.headers, host: base.host };
    delete headers.origin; delete headers.referer;
    const proxyReq = httpRequest(
      { protocol: base.protocol, hostname: base.hostname, port: base.port || 80, path, method: req.method, headers },
      (pr) => { res.writeHead(pr.statusCode || 502, { ...pr.headers, ...cors }); pr.pipe(res); }
    );
    proxyReq.on("error", (e) => { res.writeHead(502, { "Content-Type": "text/plain", ...cors }); res.end(`ollama proxy error: ${e.message}`); });
    req.pipe(proxyReq);
    return;
  }

  if (!authed(req)) {
    res.writeHead(401, { "Content-Type": "application/json", ...cors });
    return res.end(JSON.stringify({ error: "Unauthorized — set the bridge token in Base." }));
  }

  if (req.method === "GET" && req.url.startsWith("/models")) {
    res.writeHead(200, { "Content-Type": "application/json", ...cors });
    return res.end(JSON.stringify({ models: models() }));
  }

  if (req.method === "POST" && req.url.startsWith("/chat")) {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 8_000_000) req.destroy(); });
    req.on("end", () => {
      let payload;
      try { payload = JSON.parse(body); } catch { res.writeHead(400, cors); return res.end("bad json"); }
      const runner = RUNNERS[payload.model];
      if (!runner) { res.writeHead(400, { "Content-Type": "text/plain", ...cors }); return res.end(`Unknown local model "${payload.model}".`); }

      const prompt = buildPrompt(payload.system, payload.messages);
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...cors });

      let child;
      try { child = spawn(runner.cmd, runner.args, { stdio: ["pipe", "pipe", "pipe"] }); }
      catch (e) { return res.end(`Failed to start ${runner.cmd}: ${e.message}`); }

      child.stdout.on("data", (d) => res.write(d));
      child.stderr.on("data", (d) => process.stderr.write(d));
      child.on("error", (e) => res.end(`\n[bridge error: ${e.message}. Is "${runner.cmd}" installed and on PATH?]`));
      child.on("close", () => res.end());
      req.on("close", () => { try { child.kill(); } catch {} });

      child.stdin.write(prompt);
      child.stdin.end();
    });
    return;
  }

  res.writeHead(404, cors); res.end("Base bridge. Try GET /models or POST /chat.");
});

server.listen(PORT, HOST, () => {
  const found = models();
  console.log(`\n  Base bridge → http://${HOST}:${PORT}  (localhost only)`);
  console.log(`  Auth: ${TOKEN ? "token required ✓" : "OPEN (no BRIDGE_CLI_TOKEN set — set one!)"}`);
  console.log(`  CLIs: ${found.length ? found.map((m) => m.id).join(", ") : "none (install `claude` / `codex` and log in)"}`);
  console.log(`  Ollama proxy: /ollama/* → ${OLLAMA_TARGET}`);
  console.log(`  Expose over HTTPS with: tailscale serve --bg --https=8443 http://127.0.0.1:${PORT}\n`);
});
