// Task ordering and priority naming. Free of React so it stays unit-testable.
import type { Priority } from "@/lib/store";

export type TaskSort = "custom" | "priority";

export const TASK_SORTS: ReadonlyArray<{ value: TaskSort; label: string }> = [
  { value: "custom",   label: "Custom Arrangement" },
  { value: "priority", label: "Priority" },
];

export const DEFAULT_TASK_SORT: TaskSort = "custom";

// P1/P2/P3 are kept in storage so the agent API and the native client keep
// working, but the stored codes are meaningless on screen.
export const PRIORITY_META: ReadonlyArray<{ value: Priority; label: string; rank: number }> = [
  { value: "P1", label: "Urgent",    rank: 0 },
  { value: "P2", label: "Important", rank: 1 },
  { value: "P3", label: "Later",     rank: 2 },
];

export const DEFAULT_PRIORITY: Priority = "P2";

const RANKS = new Map<string, number>(PRIORITY_META.map((p) => [p.value, p.rank]));
const LABELS = new Map<string, string>(PRIORITY_META.map((p) => [p.value, p.label]));

export function priorityRank(priority: string): number {
  return RANKS.get(priority) ?? 1;
}

export function priorityLabel(priority: string): string {
  return LABELS.get(priority) ?? "Important";
}

export function isTaskSort(v: unknown): v is TaskSort {
  return v === "custom" || v === "priority";
}

export interface SortableTask {
  priority: string;
  createdAt: string;
  order?: number;
}

const NO_ORDER = Number.MAX_SAFE_INTEGER;

function time(iso: string) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

// Every mode falls back to the manual order on ties so items never shuffle.
export function sortTasks<T extends SortableTask>(tasks: readonly T[], sort: TaskSort): T[] {
  return [...tasks].sort((a, b) =>
    sort === "priority"
      ? priorityRank(a.priority) - priorityRank(b.priority) || orderFallback(a, b)
      : orderFallback(a, b),
  );
}

function orderFallback(a: SortableTask, b: SortableTask) {
  const ao = a.order ?? NO_ORDER;
  const bo = b.order ?? NO_ORDER;
  return ao !== bo ? ao - bo : time(a.createdAt) - time(b.createdAt);
}
