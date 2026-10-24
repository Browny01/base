import { useSyncExternalStore } from "react";
import { DEFAULT, type BaseData } from "../../lib/store";
import { habitDays, habitDay } from "../../lib/habits";
const today = habitDay(), timestamp = new Date().toISOString();
const tag = { id: "fixture-tag", name: "For the weekend", color: "#579781" };
// Synthetic data for local UI checks/screenshots. This module is never a production entry point.
let data: BaseData = {
  ...structuredClone(DEFAULT), profile: { ...DEFAULT.profile, name: "Alex Example", onboardedAt: timestamp },
  habits: [{ id: "read", name: "Read a few pages", emoji: "📖", type: "input", unit: "pages", reminderTime: null }, { id: "walk", name: "Get outside", emoji: "🌿", type: "button", reminderTime: null }, { id: "write", name: "Make room for ideas", emoji: "✍️", type: "button", reminderTime: null }],
  habitLogs: habitDays(today, 10).flatMap((date, index) => ["read", "walk", "write"].flatMap(habitId => index % 4 === 0 && habitId !== "read" ? [] : [{ id: `${habitId}-${date}`, habitId, date, completed: habitId !== "write" || date !== today, value: habitId === "read" ? "12" : undefined }])),
  shoppingList: [{ id: "notebook", name: "Pocket notebook", category: "other", priority: 2, price: 12, checked: false, createdAt: timestamp, tags: [tag] }, { id: "lamp", name: "Reading lamp", category: "home", priority: 1, price: 45, checked: false, createdAt: timestamp }],
  readingList: [{ id: "book", name: "A field guide to curiosity", author: "Sample book", category: "non-fiction", checked: false, createdAt: timestamp, tags: [tag] }],
  watchList: [{ id: "film", title: "The art of paying attention", kind: "youtube", channel: "Sample channel", checked: false, createdAt: timestamp, tags: [tag] }, { id: "movie", title: "A quieter weekend", kind: "movie", year: "2026", checked: false, createdAt: timestamp }],
  wikiPages: [{ id: "ideas", title: "A little space for ideas", icon: "🦦", parentId: null, createdAt: timestamp, updatedAt: timestamp, blocks: [{ id: "b1", type: "h2", text: "Start with a little curiosity." }, { id: "b2", type: "text", text: "A place for <b>unfinished thoughts</b>, useful links, and the things worth coming back to.<div><br></div><div>Leave yourself room to explore.</div>" }, { id: "b3", type: "bulleted", text: "Take a walk without a plan" }, { id: "b4", type: "bulleted", text: "Write down one thing you noticed" }, { id: "b5", type: "quote", text: "Small ideas become something when you give them a place to grow." }] }],
};
const listeners = new Set<() => void>();
export function useBase() {
  const snapshot = useSyncExternalStore(callback => { listeners.add(callback); return () => { listeners.delete(callback); }; }, () => data, () => data);
  return { data: snapshot, loaded: true, syncStatus: null, mutate: (update: (data: BaseData) => BaseData) => { data = update(data); for (const listener of listeners) listener(); } };
}
