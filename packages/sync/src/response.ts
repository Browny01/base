import type { SyncResponse } from "./protocol.ts";

// Gate acknowledgements before callers can advance a cursor or remove queued edits.
export async function readSyncResponse(response: Response): Promise<SyncResponse> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      `Sync service returned ${response.status} with an unreadable response. Your offline edits are retained; retry synchronization.`,
    );
  }
  if (!response.ok) {
    const detail = body && typeof body === "object" && "error" in body &&
      typeof body.error === "string" ? ` ${body.error.slice(0, 500)}` : "";
    throw new Error(`Sync failed (${response.status}).${detail} Your offline edits are retained.`);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`Invalid sync response (${response.status}); your offline edits are retained.`);
  }
  return body as SyncResponse;
}
