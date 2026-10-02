import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { bridgePassword, bridgePasswordHash, bridgeSessionSecret } from "@/lib/env";
import { parseVerifier, readStoredVerifier, writeStoredVerifier } from "@/lib/auth-store";
import { signSession } from "@/lib/session";

export const runtime = "nodejs";

// First-run setup. It writes a password the browser hashed, so the site can be
// locked down without the person running it touching deployment env vars.
//
// Deliberately narrow:
//   • If BRIDGE_PASSWORD / BRIDGE_PASSWORD_HASH is set, the operator's value
//     wins and setup refuses to overwrite it.
//   • Once a password is stored, this endpoint is closed — changing it is a
//     deliberate reset, not a side effect of reopening onboarding.
//   • Same-origin POSTs only, like the login route.

const COOKIE = "bridge_auth";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

const envConfigured = () => bridgePassword() !== undefined || bridgePasswordHash() !== undefined;

function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const originHost = new URL(origin).hostname;
    const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0];
    return originHost === host;
  } catch {
    return false;
  }
}

// What onboarding is allowed to do right now: "full" on a fresh install, and
// "locked" once a password exists (the wizard then only collects profile/pages).
export async function GET() {
  const stored = await readStoredVerifier();
  const configured = envConfigured();
  const needsPassword = !configured && !stored;
  return NextResponse.json({
    passwordMode: configured ? "env" : stored ? "saved" : "none",
    needsPassword,
    canSetPassword: !configured && !stored,
    sessionReady: Boolean(bridgeSessionSecret()),
  });
}

export async function POST(req: NextRequest) {
  if (!originAllowed(req)) {
    return NextResponse.json({ error: "Rejected cross-site request" }, { status: 403 });
  }

  let body: { password?: unknown };
  try {
    body = (await req.json()) as { password?: unknown };
  } catch {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8 || password.length > 512) {
    return NextResponse.json({ error: "Use a password between 8 and 512 characters." }, { status: 400 });
  }

  if (envConfigured()) {
    return NextResponse.json({ error: "This install already has a server password. Use it to sign in." }, { status: 409 });
  }
  if (await readStoredVerifier()) {
    return NextResponse.json({ error: "A password is already set for this install." }, { status: 409 });
  }

  if (!parseVerifier(password)) {
    return NextResponse.json({ error: "That verifier isn't in the expected format." }, { status: 400 });
  }

  if (!(await writeStoredVerifier(password))) {
    return NextResponse.json(
      { error: "Base data isn't configured, so a password can't be saved yet. Set BRIDGE_PASSWORD in the environment instead." },
      { status: 503 },
    );
  }

  // Sign them straight in: they just proved they hold the password.
  const token = await signSession(30);
  if (!token) {
    return NextResponse.json(
      { error: "Password saved, but session signing isn't configured — set BRIDGE_SESSION_SECRET before signing in." },
      { status: 503 },
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

