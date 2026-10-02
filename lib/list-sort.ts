// Sorting for the list pages. Kept free of React so it stays unit-testable.

export type ListSort = "custom" | "price-asc" | "price-desc" | "date-asc" | "date-desc";

export const LIST_SORTS: ReadonlyArray<{ value: ListSort; label: string }> = [
  { value: "custom",     label: "Custom Arrangement" },
  { value: "price-asc",  label: "Price · Low to High" },
  { value: "price-desc", label: "Price · High to Low" },
  { value: "date-asc",   label: "Date Added · Oldest First" },
  { value: "date-desc",  label: "Date Added · Newest First" },
];

// The minimum shape needed to sort. Real items carry more fields.
export interface SortableItem {
  price: number;
  createdAt: string;
  priority: number;
  order?: number;
}

const NO_ORDER = Number.MAX_SAFE_INTEGER;

function time(iso: string) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export function prioritySort(a: SortableItem, b: SortableItem) {
  return a.priority - b.priority || time(a.createdAt) - time(b.createdAt);
}

// Manual order first; items without a saved order fall back to priority/age.
export function orderSort(a: SortableItem, b: SortableItem) {
  const ao = a.order ?? NO_ORDER;
  const bo = b.order ?? NO_ORDER;
  return ao !== bo ? ao - bo : prioritySort(a, b);
}

// Every mode falls back to the manual order so equal keys never shuffle.
const COMPARATORS: Record<ListSort, (a: SortableItem, b: SortableItem) => number> = {
  "custom": orderSort,
  "price-asc":  (a, b) => a.price - b.price || orderSort(a, b),
  "price-desc": (a, b) => b.price - a.price || orderSort(a, b),
  "date-asc":   (a, b) => time(a.createdAt) - time(b.createdAt) || orderSort(a, b),
  "date-desc":  (a, b) => time(b.createdAt) - time(a.createdAt) || orderSort(a, b),
};

export const DEFAULT_LIST_SORT: ListSort = "custom";

// Returns a new array; the input is never mutated.
export function sortItems<T extends SortableItem>(items: readonly T[], sort: ListSort): T[] {
  return [...items].sort(COMPARATORS[sort] ?? orderSort);
}

export function isListSort(v: unknown): v is ListSort {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(COMPARATORS, v);
}

export function sortLabel(sort: ListSort) {
  return LIST_SORTS.find((s) => s.value === sort)?.label ?? LIST_SORTS[0].label;
}
