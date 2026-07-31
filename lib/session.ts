import { bridgeSessionSecret } from "@/lib/env";

// Signed session tokens for the site auth cookie. Replaces the old "cookie is
// present" check (which any value satisfied) with an HMAC-signed, expiring token
// that can't be forged without the server secret. Uses Web Crypto so it runs in
// both the Node route handler and the edge proxy/middleware.

const enc = new TextEncoder();

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

function decodeBase64Url(value: string): ArrayBuffer | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let index = 0; index < bin.length; index++) bytes[index] = bin.charCodeAt(index);
    return bytes.buffer;
  } catch {
    return null;
  }
}

// token = "v1.<expiryMs>.<random nonce>.<hmac(version.expiry.nonce)>"
export async function signSession(days = 7): Promise<string> {
  const exp = Date.now() + days * 86_400_000;
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  let nonceBin = "";
  for (const byte of nonceBytes) nonceBin += String.fromCharCode(byte);
  const nonce = btoa(nonceBin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const payload = `v1.${exp}.${nonce}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySession(token?: string): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const [version, expStr, nonce, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  if (!/^[A-Za-z0-9_-]{20,24}$/.test(nonce)) return false;
  const signature = decodeBase64Url(sig);
  if (!signature) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secretKey()), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, signature, enc.encode(`${version}.${expStr}.${nonce}`));
}

function sessionCookie(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const entry of cookieHeader.split(";")) {
    const [name, ...parts] = entry.trim().split("=");
    if (name === "bridge_auth") return parts.join("=");
  }
  return undefined;
}

// Sensitive handlers verify again instead of relying solely on Proxy redirects.
export async function requireBridgeSession(request: Request): Promise<Response | null> {
  try {
    if (await verifySession(sessionCookie(request))) return null;
  } catch (error) {
    console.error("[bridge/route session]", error);
  }
  return Response.json({ error: "Unauthorized" }, {
    status: 401,
    headers: { "Cache-Control": "no-store" },
  });
}
