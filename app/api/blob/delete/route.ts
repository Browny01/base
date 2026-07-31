import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { requireBridgeSession } from "@/lib/session";

// Best-effort cleanup of a Blob when its board item is deleted, so removed
// photos don't linger as orphaned objects.
export async function POST(req: NextRequest) {
  const unauthorized = await requireBridgeSession(req); if (unauthorized) return unauthorized;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ ok: false, configured: false });
  try {
    const { url } = await req.json();
    if (typeof url === "string" && url.startsWith("http")) {
      await del(url, { token });
    }
    return NextResponse.json({ ok: true, configured: true });
  } catch (err) {
    console.error("[blob/delete]", err);
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
