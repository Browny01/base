import { createHash, randomBytes } from "node:crypto";
import { mcpRedis } from "./mcp-data.ts";

const SESSION_PREFIX = "base:desktop:session:";
export const DESKTOP_SESSION_SECONDS = 30 * 24 * 60 * 60;
export type DesktopSession = { workspaceId: string; deviceId: string; expiresAt: number };
const key = (token: string) => SESSION_PREFIX + createHash("sha256").update(token).digest("hex");

export async function workspaceIdentity(): Promise<string | null> {
  const redis = mcpRedis();
  if (!redis) return null;
  await redis.set("base:workspace:id", randomBytes(24).toString("hex"), { nx: true });
  return redis.get<string>("base:workspace:id");
}
export async function issueDesktopSession(deviceId: string) {
  const redis = mcpRedis();
  const workspaceId = await workspaceIdentity();
  if (!redis || !workspaceId) return null;
  const token = randomBytes(32).toString("base64url");
  const session: DesktopSession = { workspaceId, deviceId, expiresAt: Date.now() + DESKTOP_SESSION_SECONDS * 1000 };
  await redis.set(key(token), session, { ex: DESKTOP_SESSION_SECONDS });
  return { ...session, token };
}
export async function readDesktopSession(request: Request): Promise<DesktopSession | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer (base_desktop_[\w-]{43})$/)?.[1];
  if (!token) return null;
  const redis = mcpRedis();
  if (!redis) return null;
  try {
    const session = await redis.get<DesktopSession>(key(token.slice("base_desktop_".length)));
    return session && session.expiresAt > Date.now() ? session : null;
  } catch { return null; }
}
export async function revokeDesktopSession(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer base_desktop_([\w-]{43})$/)?.[1];
  const redis = mcpRedis();
  if (token && redis) await redis.del(key(token));
}
