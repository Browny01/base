// Server-side data access + sanitization for the MCP server.
// The golden rule: locked (and trashed) notes pages must NEVER leave this file.

import { Redis } from "@upstash/redis";
import type { BridgeData, WikiBlock, WikiPage } from "@/lib/store";
import { safeWriteBridgeData } from "@/lib/autonomy-persistence";
import {
  claimAutonomyTaskInData,
  reapExpiredAutonomyLeases,
  submitAutonomyResultInData,
  type AtomicAutonomyResult,
  type SubmitAutonomyInput,
} from "@/lib/autonomy-control";
import { mutateBridgeDataAtomically, readVersionedBridgeData } from "@/lib/versioned-bridge-store";

export function mcpRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function readRawData(): Promise<BridgeData | null> {
  const redis = mcpRedis();
  if (!redis) return null;
  const snapshot = await readVersionedBridgeData(redis);
  return snapshot.data as unknown as BridgeData;
}

// MCP writes deliberately go through the same Redis key as the web app. The
// route handler keeps the current raw state around while applying a mutation,
// so protected notes are retained even though they are never returned to MCP.
export async function writeRawData(data: BridgeData): Promise<boolean> {
  const redis = mcpRedis();
  if (!redis) return false;
  await safeWriteBridgeData(redis, data, true);
  return true;
}

export async function reapExpiredAutonomyLeasesAtomic(): Promise<{ ok: boolean; reaped: number; at: string; error?: string }> {
  const redis = mcpRedis();
  if (!redis) return { ok: false, reaped: 0, at: new Date().toISOString(), error: "Bridge data is not configured." };
  const at = new Date().toISOString();
  const mutation = await mutateBridgeDataAtomically(redis, (current) => {
    const reaped = reapExpiredAutonomyLeases(current, at);
    return {
      data: reaped.data,
      result: { ok: true, reaped: reaped.reaped, at },
      write: reaped.reaped > 0,
    };
  });
  return mutation.result;
}

export async function claimAutonomyTask(taskId: string, runId: string, agent: string, model: string, startedAt: string): Promise<AtomicAutonomyResult> {
  const redis = mcpRedis();
  if (!redis) return { ok: false, error: "Bridge data is not configured." };
  const mutation = await mutateBridgeDataAtomically(redis, (current) => {
    const claim = claimAutonomyTaskInData(current, { taskId, runId, agent, model, startedAt });
    return { data: claim.data, result: claim.result, write: claim.changed };
  });
  return mutation.result;
}

export async function submitAutonomyResult(input: SubmitAutonomyInput): Promise<AtomicAutonomyResult> {
  const redis = mcpRedis();
  if (!redis) return { ok: false, error: "Bridge data is not configured." };
  const mutation = await mutateBridgeDataAtomically(redis, (current) => {
    const submitted = submitAutonomyResultInData(current, input);
    return { data: submitted.data, result: submitted.result, write: submitted.changed };
  });
  return mutation.result;
}

// A live (non-deleted) notes page counts as "locked & hidden" for the MCP.
export const isReadableNote = (p: WikiPage) => !p.locked && !p.deletedAt;

// Strip locked/trashed notes from the blob so nothing downstream can leak them.
export function sanitize(d: BridgeData): BridgeData {
  return { ...d, wikiPages: (d.wikiPages ?? []).filter(isReadableNote) };
}

// ── plaintext extraction for note blocks (no client/DOM code) ─────────────────────
const stripTags = (html: string) =>
  (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .trim();

function blockToText(b: WikiBlock): string {
  const t = stripTags(b.text);
  switch (b.type) {
    case "h1": return `# ${t}`;
    case "h2": return `## ${t}`;
    case "h3": return `### ${t}`;
    case "bulleted": return `- ${t}`;
    case "numbered": return `1. ${t}`;
    case "todo": return `[${b.checked ? "x" : " "}] ${t}`;
    case "quote": return `> ${t}`;
    case "code": return "```\n" + t + "\n```";
    case "callout": return `${b.emoji || "💡"} ${t}`;
    case "toggle": return `▸ ${t}${b.body ? "\n  " + stripTags(b.body) : ""}`;
    case "divider": case "labeleddivider": return "---";
    case "image": return b.caption ? `[image: ${b.caption}]` : "[image]";
    case "sticky": return `📝 ${t}`;
    case "bookmark": case "embed": case "video": case "audio": case "file": return `[${b.type}] ${b.url ?? ""}`.trim();
    case "columns": return (b.cols ?? []).map(stripTags).join("\n\n");
    case "tabs": case "accordion": return (b.panels ?? []).map((p) => `${p.title}\n${stripTags(p.body)}`).join("\n");
    case "checklist": return (b.checks ?? []).map((c) => `[${c.done ? "x" : " "}] ${c.text}`).join("\n");
    case "properties": return (b.props ?? []).map((p) => `${p.key}: ${p.value}`).join("\n");
    case "progress": return `${t}: ${b.value ?? 0}%`;
    case "counter": return `${t}: ${b.value ?? 0}`;
    case "countdown": return `${t} — ${b.date ?? ""}`;
    case "rating": return `${t}: ${b.value ?? 0}/5`;
    case "table": return (b.table?.rows ?? []).map((r) => r.map(stripTags).join(" | ")).join("\n");
    case "board": return (b.board ?? []).map((c) => `${c.title}: ${c.cards.map((x) => x.text).join(", ")}`).join("\n");
    case "chart": return `[chart] ` + (b.chart?.data ?? []).map((d) => `${d.label}=${d.value}`).join(", ");
    case "math": return `$${t}$`;
    case "diagram": return "```mermaid\n" + t + "\n```";
    default: return t;
  }
}

export function noteToText(p: WikiPage): string {
  return (p.blocks ?? []).map(blockToText).filter(Boolean).join("\n");
}
