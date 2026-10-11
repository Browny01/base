import { readDesktopSession, revokeDesktopSession } from "@/lib/desktop-session";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await readDesktopSession(request);
  return Response.json(session ?? { error: "Unauthorized" }, { status: session ? 200 : 401, headers: { "Cache-Control": "no-store" } });
}
export async function DELETE(request: Request) {
  await revokeDesktopSession(request);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
