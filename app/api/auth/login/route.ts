import { NextRequest, NextResponse } from "next/server";
import { bridgePassword } from "@/lib/env";
import { signSession } from "@/lib/session";

const COOKIE = "bridge_auth";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

// Simple in-memory rate limit per IP to blunt password brute-forcing.
const attempts = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function rateLimited(ip: string): boolean {
  const now = Date.now();
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
  if (b.length === 0) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i % b.length);
  return diff === 0;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const { password } = await req.json();
  const correct = bridgePassword();

  if (typeof password !== "string" || !safeEqual(password, correct)) {
    recordFail(ip);
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  attempts.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await signSession(30), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: THIRTY_DAYS,
    path: "/",
    sameSite: "lax",
  });
  return res;
}
