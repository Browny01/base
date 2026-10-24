import service from "./service.json" with { type: "json" };
/** Release configuration, deliberately not a user-editable setting. */
export const BASE_CLOUD_URL = service.cloudUrl;
const cloudOrigins = new Set([BASE_CLOUD_URL, ...service.cloudAliases]);
/** Resolve only a workspace attachment, never an arbitrary credential-bearing URL. */
export function cloudAttachmentPath(input: string, workspaceOrigin: string): string | null {
  try {
    const url = new URL(input);
    if (url.username || url.password || url.search || url.hash ||
        !/^\/api\/files\/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(url.pathname)) return null;
    return url.origin === workspaceOrigin || (cloudOrigins.has(url.origin) && cloudOrigins.has(workspaceOrigin))
      ? url.pathname : null;
  } catch { return null; }
}
