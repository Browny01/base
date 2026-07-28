import { createDeviceToken } from "@/lib/device-session";
import { verifySession } from "@/lib/session";

function sessionCookie(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("bridge_auth="))?.slice("bridge_auth=".length);
}

export async function POST(request: Request) {
  if (!(await verifySession(sessionCookie(request)))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as { deviceId?: unknown };
  const deviceId = typeof body.deviceId === "string" && body.deviceId.trim()
    ? body.deviceId.trim()
    : crypto.randomUUID();
  return Response.json({
    token: await createDeviceToken(deviceId),
    deviceId,
    expiresAt: Date.now() + 365 * 86_400_000,
  });
}
