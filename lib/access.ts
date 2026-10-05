import type { NextRequest } from "next/server";
import { hasValidSession } from "@/lib/session-cookie";

// API-access gate for endpoints that are reachable both from the logged-in
// browser (session cookie) and from the Vercel cron job (bearer secret).
// Fails closed: no valid session and no valid cron secret => denied.
export async function apiAccessAllowed(req: NextRequest): Promise<boolean> {
  if (await hasValidSession(req)) return true;

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    const key = new URL(req.url).searchParams.get("key");
    if (auth === `Bearer ${secret}` || key === secret) return true;
  }
  return false;
}