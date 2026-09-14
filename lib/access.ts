import type { NextRequest } from "next/server";
import { verifySession } from "@/lib/session";

const COOKIE = "bridge_auth";

// API-access gate for endpoints that are reachable both from the logged-in
// browser (session cookie) and from the Vercel cron job (bearer secret).
// Fails closed: no valid session and no valid cron secret => denied.
export async function apiAccessAllowed(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get(COOKIE)?.value;
  if (cookie && (await verifySession(cookie))) return true;

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    const key = new URL(req.url).searchParams.get("key");
    if (auth === `Bearer ${secret}` || key === secret) return true;
  }
  return false;
}