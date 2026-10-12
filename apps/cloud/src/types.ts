import type {
  D1Database,
  R2Bucket,
  KVNamespace,
  Queue,
} from "@cloudflare/workers-types";
export interface Env {
  TMDB_API_KEY?: string;
  INTEGRATION_ENCRYPTION_KEY?: string;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  DB: D1Database;
  FILES: R2Bucket;
  CACHE: KVNamespace;
  JOBS: Queue<{ id: string }>;
  PUBLIC_URL: string;
  ENVIRONMENT: "staging" | "production";
  CLERK_WEBHOOK_SIGNING_SECRET?: string;
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_JWT_KEY?: string;
  CLERK_ISSUER?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PLUS_PRICE_ID?: string;
}
export type WorkspaceRow = {
  id: string;
  owner_id: string;
  revision: number;
  document_bytes: number;
  file_bytes: number;
  reserved_bytes: number;
  plan: string;
  customer_id: string | null;
  subscription_id: string | null;
  subscription_status: string;
  paid_until: number;
  billing_version: number;
  next_backup_at: number;
};
export type Principal = {
  workspace: WorkspaceRow;
  deviceId: string;
  accountId: string;
  sessionExpires?: number;
};
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export const now = () => Math.floor(Date.now() / 1000);
export const bytes = (value: string) =>
  new TextEncoder().encode(value).byteLength;
export const response = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function boundedText(request: Request, max = 2_000_000) {
  const size = Number(request.headers.get("Content-Length"));
  if (size > max)
    throw new HttpError(
      413,
      "Request too large. Your original data is retained.",
    );
  if (!request.body) return "";
  const reader = request.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let length = 0,
    raw = "";
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > max) {
        await reader.cancel();
        throw new HttpError(
          413,
          "Request too large. Your original data is retained.",
        );
      }
      raw += decoder.decode(part.value, { stream: true });
    }
    return raw + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
export async function body(request: Request, max = 2_000_000) {
  const raw = await boundedText(request, max);
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
export async function sha(value: string | Uint8Array) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        typeof value === "string"
          ? new TextEncoder().encode(value)
          : (value as BufferSource),
      ),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export function random() {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
