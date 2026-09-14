import { NextRequest, NextResponse } from "next/server";
import { scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { bridgePassword, bridgePasswordHash } from "@/lib/env";
import { signSession } from "@/lib/session";

const COOKIE = "bridge_auth";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;

// Simple in-memory rate limit per IP to blunt password brute-forcing. This is a
// best-effort belt-and-braces layer: on serverless (Vercel) functions it resets
// per warm instance, so the real protections are a strong BRIDGE_PASSWORD /
// BRIDGE_PASSWORD_HASH and a dedicated BRIDGE_SESSION_SECRET.
const attempts = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const MAX_ENTRIES = 2048;

function prune(now: number) {
  if (attempts.size > MAX_ENTRIES) {
    for (const [k, v] of attempts) if (now >= v.until) attempts.delete(k);
  }
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  prune(now);
  const rec = attempts.get(ip);
  if (rec && now < rec.until) return rec.n >= MAX_ATTEMPTS;
  return false;
}

function recordFail(ip: string) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now >= rec.until) attempts.set(ip, { n: 1, until: now + WINDOW_MS });
  else rec.n++;
}

// Length-independent constant-time compare, so response time can't leak the password.
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i % b.length);
  return diff === 0;
}

// Verify a candidate password against BRIDGE_PASSWORD_HASH (scrypt) when set,
// otherwise against the plaintext BRIDGE_PASSWORD env value.
async function verifyPassword(password: string): Promise<boolean> {
  const hashSpec = bridgePasswordHash();
  if (hashSpec) {
    const colon = hashSpec.indexOf(":");
    if (colon <= 0) return false;
    const salt = Buffer.from(hashSpec.slice(0, colon), "base64");
    const expected = Buffer.from(hashSpec.slice(colon + 1), "base64");
    if (salt.length === 0 || expected.length === 0) return false;
    try {
      const derived = Buffer.from(await scryptAsync(password, salt, expected.length));
      return derived.length === expected.length && timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }
  const correct = bridgePassword();
  return correct !== undefined && safeEqual(password, correct);
}

// Reject cross-site login POSTs (CSRF). Browsers send an Origin header on
// cross-origin POSTs; same-origin fetches must match the app's host.
function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients
  try {
    const originHost = new URL(origin).hostname;
    const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0];
    return originHost === host;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const configured = bridgePassword() !== undefined || bridgePasswordHash() !== undefined;
  if (!configured) {
    return NextResponse.json(
      { error: "Login is not configured — set BRIDGE_PASSWORD in deployment env vars." },
      { status: 503 }
    );
  }

  if (!originAllowed(req)) {
    return NextResponse.json({ error: "Rejected cross-site request" }, { status: 403 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let password = "";
  try {
    const body = await req.json();
    if (typeof body?.password === "string") password = body.password;
  } catch {
    /* treat as empty */
  }
  if (password.length === 0) {
    recordFail(ip);
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const ok = await verifyPassword(password);
  if (!ok) {
    recordFail(ip);
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  attempts.delete(ip);

  const token = await signSession(30);
  if (!token) {
    return NextResponse.json(
      { error: "Session signing is not configured — set BRIDGE_SESSION_SECRET." },
      { status: 503 }
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: THIRTY_DAYS,
    path: "/",
    sameSite: "lax",
    priority: "high",
  });
  return res;
}