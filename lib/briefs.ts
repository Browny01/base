import type { BridgeData, Brief, BriefType } from "@/lib/store";

export const BRIEF_TYPES = ["morning_coo", "weekly_business_review", "content_opportunity"] as const satisfies readonly BriefType[];

export type BriefInput = {
  type: BriefType;
  title: string;
  contentMarkdown: string;
  generatedAt: string;
  periodStart?: string;
  periodEnd?: string;
  workspace?: string;
  sourceRunId?: string;
  status?: "published";
};

export type BriefUpsertResult =
  | { ok: true; data: BridgeData; record: Brief; created: boolean }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const PRIVATE_CONTENT_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bbearer\s+[a-z0-9._~+/=-]{12,}/i,
  /\b(?:api[_ -]?key|access[_ -]?token|client[_ -]?secret|password)\s*[:=]\s*["']?[a-z0-9._~+/=-]{12,}/i,
  /<tool_(?:call|result)>/i,
  /"tool_calls"\s*:/i,
];

export function isBriefType(value: unknown): value is BriefType {
  return typeof value === "string" && (BRIEF_TYPES as readonly string[]).includes(value);
}

function isDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function stringField(value: unknown, name: string, max: number, required = false): { value?: string; error?: string } {
  if (value === undefined || value === null) return required ? { error: `${name} is required.` } : {};
  if (typeof value !== "string") return { error: `${name} must be a string.` };
  const clean = value.trim();
  if (required && !clean) return { error: `${name} is required.` };
  if (clean.length > max) return { error: `${name} must be ${max} characters or fewer.` };
  return clean ? { value: clean } : {};
}

export function validateBriefInput(value: Record<string, unknown>): { ok: true; input: BriefInput } | { ok: false; error: string } {
  if (!isBriefType(value.type)) return { ok: false, error: `type must be one of: ${BRIEF_TYPES.join(", ")}.` };

  const title = stringField(value.title, "title", 200, true);
  if (title.error) return { ok: false, error: title.error };
  const content = stringField(value.contentMarkdown, "contentMarkdown", 100_000, true);
  if (content.error) return { ok: false, error: content.error };
  const generatedAt = stringField(value.generatedAt, "generatedAt", 40, true);
  if (generatedAt.error) return { ok: false, error: generatedAt.error };
  if (!TIMESTAMP_RE.test(generatedAt.value!) || Number.isNaN(Date.parse(generatedAt.value!))) {
    return { ok: false, error: "generatedAt must be an ISO 8601 timestamp with a timezone." };
  }
  if (value.status !== undefined && value.status !== "published") return { ok: false, error: "status must be published." };

  const periodStart = stringField(value.periodStart, "periodStart", 10);
  const periodEnd = stringField(value.periodEnd, "periodEnd", 10);
  if (periodStart.error || periodEnd.error) return { ok: false, error: periodStart.error || periodEnd.error! };
  if (!!periodStart.value !== !!periodEnd.value) return { ok: false, error: "periodStart and periodEnd must be provided together." };
  if (periodStart.value && (!isDate(periodStart.value) || !isDate(periodEnd.value!))) {
    return { ok: false, error: "periodStart and periodEnd must be valid YYYY-MM-DD dates." };
  }
  if (periodStart.value && periodStart.value > periodEnd.value!) return { ok: false, error: "periodEnd must be on or after periodStart." };

  const workspace = stringField(value.workspace, "workspace", 200);
  const sourceRunId = stringField(value.sourceRunId, "sourceRunId", 200);
  if (workspace.error || sourceRunId.error) return { ok: false, error: workspace.error || sourceRunId.error! };
  const publicText = [title.value, content.value, workspace.value, sourceRunId.value].filter(Boolean).join("\n");
  if (PRIVATE_CONTENT_PATTERNS.some((pattern) => pattern.test(publicText))) {
    return { ok: false, error: "The briefing appears to contain a secret or raw tool transcript and cannot be published." };
  }

  return {
    ok: true,
    input: {
      type: value.type,
      title: title.value!,
      contentMarkdown: content.value!,
      generatedAt: generatedAt.value!,
      ...(periodStart.value ? { periodStart: periodStart.value, periodEnd: periodEnd.value! } : {}),
      ...(workspace.value ? { workspace: workspace.value } : {}),
      ...(sourceRunId.value ? { sourceRunId: sourceRunId.value } : {}),
      status: "published",
    },
  };
}

export function briefIdempotencyKey(brief: Pick<BriefInput, "type" | "generatedAt" | "periodStart" | "periodEnd">): string {
  return brief.periodStart && brief.periodEnd
    ? `${brief.type}:period:${brief.periodStart}:${brief.periodEnd}`
    : `${brief.type}:date:${brief.generatedAt.slice(0, 10)}`;
}

export function upsertBriefCollection(data: BridgeData, rawInput: Record<string, unknown>, stamp = new Date().toISOString()): BriefUpsertResult {
  const validated = validateBriefInput(rawInput);
  if (!validated.ok) return validated;

  const input = validated.input;
  const key = briefIdempotencyKey(input);
  const briefs = data.briefs ?? [];
  const index = briefs.findIndex((brief) => briefIdempotencyKey(brief) === key);
  const existing = index >= 0 ? briefs[index] : null;
  const record: Brief = {
    id: existing?.id ?? `brief:${key}`,
    ...input,
    status: "published",
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
  };
  const nextBriefs = briefs.filter((brief) => briefIdempotencyKey(brief) !== key);
  nextBriefs.push(record);

  return {
    ok: true,
    data: { ...data, briefs: nextBriefs, updatedAt: Date.now() },
    record,
    created: index < 0,
  };
}

export function newestBriefs(briefs: Brief[] | undefined, type?: BriefType, limit = 20): Brief[] {
  return (briefs ?? [])
    .filter((brief) => brief.status === "published" && (!type || brief.type === type))
    .sort((a, b) => (Date.parse(b.generatedAt) || 0) - (Date.parse(a.generatedAt) || 0))
    .slice(0, limit);
}
