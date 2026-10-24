import type { ListTag } from "./store";
export type ListKey = "watchList" | "shoppingList" | "readingList";
export type TaggedItem = { id: string; tags?: ListTag[] };
export function itemTags(item: TaggedItem): ListTag[] {
  return Array.isArray(item.tags) ? item.tags.filter(tag => tag && typeof tag.id === "string" && typeof tag.name === "string" && /^#[a-f\d]{6}$/i.test(tag.color)) : [];
}
export function listTagCatalog(items: TaggedItem[]): ListTag[] {
  const tags = new Map<string, ListTag>();
  for (const item of items) for (const tag of itemTags(item)) if (!tags.has(tag.id)) tags.set(tag.id, tag);
  return [...tags.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export function updateListTag<T extends TaggedItem>(items: T[], id: string, patch: Pick<ListTag, "name" | "color"> | null): T[] {
  return items.map(item => itemTags(item).some(tag => tag.id === id) ? { ...item, tags: itemTags(item).flatMap(tag => tag.id !== id ? [tag] : patch ? [{ ...tag, ...patch }] : []) } : item);
}
export function matchesListFilters(item: TaggedItem & { category?: string; priority?: number }, tags: string[], category = "", priority = ""): boolean {
  return tags.every(id => itemTags(item).some(tag => tag.id === id)) && (!category || item.category === category) && (!priority || item.priority === Number(priority));
}
