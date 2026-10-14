import { invoke, isTauri } from "@tauri-apps/api/core";
import type { BaseData } from "@/lib/store";
import type {
  Document,
  Operation,
  Conflict,
} from "@/packages/sync/src/protocol";
export type Workspace = {
  scope: string;
  origin: string;
  workspaceId: string;
  document: Document;
  baseline: Document;
  revision: number;
  localRevision: number;
  pending: Operation[];
  conflicts: Conflict[];
};
export { isTauri };
export function native<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!isTauri())
    return import("./browser-native").then((module) =>
      module.browserCommand<T>(command, args),
    );
  return invoke<T>(command, args);
}
export const encoded = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 16384)
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(binary);
};
export async function request(
  scope: string,
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  if (init.signal?.aborted)
    throw new DOMException("Request aborted", "AbortError");
  const headers = new Headers(init.headers);
  let body: Uint8Array | undefined;
  if (typeof init.body === "string") body = new TextEncoder().encode(init.body);
  else if (init.body instanceof Blob) {
    body = new Uint8Array(await init.body.arrayBuffer());
    if (!headers.has("content-type"))
      headers.set("content-type", init.body.type);
  } else if (init.body) throw new Error("Unsupported request body.");
  const result = await native<{
    status: number;
    contentType: string;
    bodyBase64: string;
    cached: boolean;
  }>("api_request", {
    scope,
    path: input,
    method: init.method ?? "GET",
    bodyBase64: body ? encoded(body) : null,
    contentType: headers.get("content-type"),
  });
  if (init.signal?.aborted)
    throw new DOMException("Request aborted", "AbortError");
  return responseOf(result);
}
export function responseOf(result: {status:number;contentType:string;bodyBase64:string;cached:boolean}): Response {
  const bytes = Uint8Array.from(atob(result.bodyBase64), ch => ch.charCodeAt(0));
  // Fetch forbids bodies for these statuses, including an empty Uint8Array.
  return new Response([204,205,304].includes(result.status) ? null : bytes, {
    status:result.status,
    headers:{"Content-Type":result.contentType,...(result.cached?{"X-Base-Cached":"1"}:{})},
  });
}

export const documentOf = (data: BaseData): Document =>
  JSON.parse(JSON.stringify(data)) as Document;
