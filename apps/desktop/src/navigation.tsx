import { useSyncExternalStore } from "react";
const listeners = new Set<() => void>();
window.addEventListener("hashchange", () => { for (const listener of listeners) listener(); });
const path = () => window.location.hash.slice(1).split("?")[0] || "/";
function navigate(href: string, replace = false) {
  if (!href.startsWith("/") || href.startsWith("//")) return;
  if (replace) window.history.replaceState(null, "", `#${href}`);
  else window.history.pushState(null, "", `#${href}`);
  for (const listener of listeners) listener();
  document.querySelector("main")?.scrollTo(0, 0);
}
const router = { push: (href: string) => navigate(href), replace: (href: string) => navigate(href, true), back: () => window.history.back(), refresh: () => {} };
export const useRouter = () => router;
export const usePathname = () => useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, path);
