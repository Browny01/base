import { decodeNodes, encodeNodes } from "./nodes.ts";
import type { Document } from "./protocol.ts";
/** Do not advance the durable cursor or acknowledge writes until every page is consistent. */
export async function downloadNodes(
  request: (path: string) => Promise<Response>,
  workspaceId: string,
  baseline: Document,
  cursor: number,
  full = false,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const nodes = full ? new Map<string, string>() : encodeNodes(baseline),
      changed = new Map<string, string>();
    let after: string | null = null,
      revision = -1,
      retry = false;
    const seen = new Set<string>(),
      indices = new Map<string, number>();
    do {
      const query = new URLSearchParams({
        cursor: String(cursor),
        revision: String(revision),
        full: full ? "1" : "0",
        ...(after ? { after } : {}),
      });
      const response = await request("/api/workspace/nodes?" + query);
      if (response.status === 409) {
        retry = true;
        break;
      }
      if (!response.ok || response.headers.has("X-Base-Cached"))
        throw new Error(
          `Could not download workspace changes (${response.status}). Offline edits are retained.`,
        );
      let value;
      try {
        value = await response.json();
      } catch {
        throw new Error(
          "Cloud returned an unreadable change page. Offline edits are retained; retry synchronization.",
        );
      }
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        value.workspaceId !== workspaceId ||
        !Number.isSafeInteger(value.revision) ||
        value.revision < cursor ||
        (revision !== -1 && revision !== value.revision) ||
        !Array.isArray(value.parts) ||
        value.parts.length > 4 ||
        (value.next !== null && typeof value.next !== "string")
      )
        throw new Error(
          "Invalid incremental response; offline edits are retained.",
        );
      revision = value.revision;
      for (const row of value.parts) {
        if (
          !row ||
          typeof row.node !== "string" ||
          row.node.length > 2048 ||
          ![0, 1].includes(row.deleted)
        )
          throw new Error("Invalid workspace node");
        if (row.deleted) {
          nodes.delete(row.node);
          changed.delete(row.node);
          continue;
        }
        if (
          !Number.isSafeInteger(row.part) ||
          row.part < 0 ||
          typeof row.body !== "string" ||
          row.body.length > 128000
        )
          throw new Error("Invalid workspace record part");
        if ((indices.get(row.node) ?? -1) + 1 !== row.part)
          throw new Error("Workspace record is incomplete; retry sync.");
        indices.set(row.node, row.part);
        if (row.part === 0) changed.set(row.node, row.body);
        else {
          if (!changed.has(row.node))
            throw new Error("Workspace record is incomplete; retry sync.");
          changed.set(row.node, changed.get(row.node)! + row.body);
        }
      }
      after = value.next;
      if (after) {
        if (seen.has(after))
          throw new Error(
            "Repeated workspace page; no edits were acknowledged.",
          );
        seen.add(after);
      }
    } while (after);
    if (retry) continue;
    for (const [key, body] of changed) nodes.set(key, body);
    try {
      return { data: decodeNodes(nodes), revision };
    } catch {
      throw new Error(
        "Cloud returned an incomplete workspace. Offline edits are retained; retry synchronization.",
      );
    }
  }
  throw new Error(
    "Workspace changed during download. Your original edits remain queued; retry synchronization.",
  );
}
