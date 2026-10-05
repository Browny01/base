import type { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

// Session cookie, renamed Bridge -> Base. Sessions live 30 days, so renaming
// this without reading the old name would sign out every device on deploy and
// look like the app had forgotten everyone's login. We always write `base_auth`
// and transparently accept `bridge_auth`, so old cookies drain naturally.
export const SESSION_COOKIE = "base_auth";
export const LEGACY_SESSION_COOKIES = ["bridge_auth"] as const;

export function readSessionCookie(req: NextRequest): string | undefined {
  const current = req.cookies.get(SESSION_COOKIE)?.value;
  if (current) return current;
  for (const name of LEGACY_SESSION_COOKIES) {
    const value = req.cookies.get(name)?.value;
    if (value) return value;
  }
  return undefined;
}

export async function hasValidSession(req: NextRequest): Promise<boolean> {
  return verifySession(readSessionCookie(req));
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: THIRTY_DAYS,
    path: "/",
    sameSite: "lax",
    priority: "high",
  });
  // Retire the pre-rename cookie so a stale copy can't outlive the migration.
  for (const name of LEGACY_SESSION_COOKIES) {
    res.cookies.set(name, "", { httpOnly: true, path: "/", maxAge: 0 });
  }
}