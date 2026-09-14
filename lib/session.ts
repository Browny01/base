import { bridgeSessionSecret } from "@/lib/env";

// Signed session tokens for the site auth cookie. Replaces the old "cookie is
// present" check (which any value satisfied) with an HMAC-signed, expiring token
// that can't be forged without the server secret. Each issuance includes a
// random nonce so no two sessions share a cookie value (previously the token was
// deterministic: same password + same lifetime => identical cookie for everyone).
// Uses Web Crypto so it runs in both the Node route handler and the edge
// proxy/middleware.
//
// Making this fail closed: if no session secret is configured, signSession
// returns null and verifySession returns false, so the site can't be logged
// into or appear authenticated — there is no "known default" secret value.

const enc = new TextEncoder();

function secretKey(): string | undefined {
  return bridgeSessionSecret();
}

async function hmac(msg: string): Promise<string> {
  const key = secretKey();
  if (!key) return ""; // sign/verify both fail closed
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// token = "<expiryMs>.<nonce>.<hmac(expiryMs.nonce)>"
export async function signSession(days = 30): Promise<string | null> {
  if (!secretKey()) return null;
  const exp = Date.now() + days * 86_400_000;
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `${exp}.${nonce}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySession(token?: string): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expStr, nonce, sig] = parts;
  if (!nonce || !/[A-Za-z0-9_-]{16,}/.test(nonce)) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || !(exp > 0) || exp < Date.now()) return false;
  const expected = await hmac(`${expStr}.${nonce}`);
  if (!expected || sig.length !== expected.length) return false;
  let diff = 0; // constant-time compare
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}