import { bridgeAgentToken } from "@/lib/env";
import { verifyDeviceToken } from "@/lib/device-session";
import { verifySession } from "@/lib/session";

function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie") ?? "";
  for (const item of cookie.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return undefined;
}

export async function authorizeSyncRequest(request: Request): Promise<boolean> {
  if (await verifySession(cookieValue(request, "bridge_auth"))) return true;
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const token = authorization.slice(7);
  return token === bridgeAgentToken() || verifyDeviceToken(token);
}
