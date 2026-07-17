import { bridgeSessionSecret } from "@/lib/env";

// Signed session tokens for the site auth cookie. Replaces the old "cookie is
// present" check (which any value satisfied) with an HMAC-signed, expiring token
// that can't be forged without the server secret. Uses Web Crypto so it runs in
// both the Node route handler and the edge proxy/middleware.

const enc = new TextEncoder();

// Prefer a dedicated secret; fall back to the login password, then a constant so
// the app never hard-locks if env is momentarily missing (login + proxy always
// derive the SAME key, so no lock-out). Set BRIDGE_SESSION_SECRET for real safety.
function secretKey(): string {
  return bridgeSessionSecret();
}

async function hmac(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secretKey()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  const bytes = new Uint8Array(sig);
  let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// token = "<expiryMs>.<hmac(expiryMs)>"
export async function signSession(days = 30): Promise<string> {
  const exp = Date.now() + days * 86_400_000;
  return `${exp}.${await hmac(String(exp))}`;
}

export async function verifySession(token?: string): Promise<boolean> {
  if (!token || !token.includes(".")) return false;
  const dot = token.indexOf(".");
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = await hmac(expStr);
  if (sig.length !== expected.length) return false;
  let diff = 0; // constant-time-ish compare
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
