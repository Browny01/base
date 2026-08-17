import { NextRequest } from "next/server";
import { getClient, saveCode, checkPassword, randId, oauthPassword } from "@/lib/mcp-oauth";

export const runtime = "nodejs";

interface Params { response_type: string; client_id: string; redirect_uri: string; state: string; scope: string; code_challenge: string; code_challenge_method: string; resource: string; }

function read(sp: URLSearchParams): Params {
  const g = (k: string) => sp.get(k) || "";
  return {
    response_type: g("response_type"), client_id: g("client_id"), redirect_uri: g("redirect_uri"),
    state: g("state"), scope: g("scope"), code_challenge: g("code_challenge"),
    code_challenge_method: g("code_challenge_method"), resource: g("resource"),
  };
}

function errorPage(msg: string, status = 400) {
  return new Response(page(`<p class="err">${msg}</p>`), { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function validate(p: Params): Promise<string | null> {
  if (p.response_type !== "code") return "Only response_type=code is supported.";
  if (!p.client_id) return "Missing client_id.";
  if (!p.redirect_uri) return "Missing redirect_uri.";
  const client = await getClient(p.client_id);
  if (!client) return "Unknown client. Re-add the connector so it can register.";
  if (client.redirect_uris.length && !client.redirect_uris.includes(p.redirect_uri)) return "redirect_uri is not registered for this client.";
  return null;
}

// Show the login page.
export async function GET(req: NextRequest) {
  if (!oauthPassword()) return errorPage("This server has no MCP_PASSWORD / MCP_TOKEN set, so authorization is disabled.", 503);
  const p = read(req.nextUrl.searchParams);
  const bad = await validate(p);
  if (bad) return errorPage(bad);
  return new Response(page(form(p)), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// Handle the password submission → issue a code and redirect back to the client.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sp = new URLSearchParams(raw);
  const p = read(sp);
  const password = sp.get("password") || "";

  const bad = await validate(p);
  if (bad) return errorPage(bad);

  if (!checkPassword(password)) {
    return new Response(page(form(p, "Incorrect password — try again.")), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const code = randId(32);
  await saveCode(code, { client_id: p.client_id, redirect_uri: p.redirect_uri, code_challenge: p.code_challenge || undefined, resource: p.resource || undefined });

  const url = new URL(p.redirect_uri);
  url.searchParams.set("code", code);
  if (p.state) url.searchParams.set("state", p.state);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

// ── minimal styled login page ─────────────────────────────────────────────────────
function form(p: Params, err = ""): string {
  const hidden = (["response_type", "client_id", "redirect_uri", "state", "scope", "code_challenge", "code_challenge_method", "resource"] as const)
    .map((k) => `<input type="hidden" name="${k}" value="${escapeAttr(p[k])}">`).join("");
  return `
    <form method="post" class="card">
      <div class="logo">B</div>
      <h1>Connect to Base</h1>
      <p class="sub">An AI assistant wants permission to read and edit your Base workspace. Locked notes stay private. Enter your MCP password to approve.</p>
      ${err ? `<p class="err">${escapeHtml(err)}</p>` : ""}
      ${hidden}
      <input type="password" name="password" placeholder="MCP password" autofocus autocomplete="off" />
      <button type="submit">Approve access</button>
    </form>`;
}
function page(inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Base · Authorize</title>
  <style>
    *{box-sizing:border-box} body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#ededed;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;padding:20px}
    .card{width:100%;max-width:360px;background:#131316;border:1px solid #272729;border-radius:16px;padding:28px;text-align:center;box-shadow:0 20px 60px -20px rgba(0,0,0,.6)}
    .logo{width:40px;height:40px;border-radius:10px;background:#5b50e8;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:18px}
    h1{font-size:19px;font-weight:700;margin:0 0 6px} .sub{font-size:13px;color:#9a9a9a;line-height:1.5;margin:0 0 18px}
    input[type=password]{width:100%;background:#0a0a0a;border:1px solid #272729;border-radius:10px;padding:11px 13px;color:#ededed;font-size:15px;outline:none;margin-bottom:12px}
    input[type=password]:focus{border-color:#3a3a3e}
    button{width:100%;background:#ededed;color:#0a0a0a;border:0;border-radius:10px;padding:11px;font-size:14px;font-weight:600;cursor:pointer}
    button:hover{background:#fff} .err{color:#f87171;font-size:13px;margin:0 0 12px}
  </style></head><body>${inner}</body></html>`;
}
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => escapeHtml(s).replace(/"/g, "&quot;");
