// localStorage keys are namespaced per product so a stale key from a previous
// era can never be mistaken for current state. `base_*` is canonical.

export function readBaseKey(name: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(name);
  } catch {
    return null;
  }
}

export function writeBaseKey(name: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(name, value);
  } catch {
    /* private mode / quota — the UI falls back to its default */
  }
}

export function removeBaseKey(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(name);
  } catch {
    /* ignore */
  }
}

// ── Native app handoff ────────────────────────────────────────────────────────
//
// The macOS app can't call into the page directly, so it drops a flag in
// localStorage before navigating. This is a live cross-process contract: users
// are running builds we can't ship an update to on their own schedule. So the
// web side still *reads* `bridge_open_new_*`, and the app now *writes* both
// names. Retire the legacy names once no supported build emits them.

export const HANDOFF_OPEN_NEW_TASK = "base_open_new_task";
export const HANDOFF_OPEN_NEW_PROJECT = "base_open_new_project";
export const LEGACY_HANDOFF_OPEN_NEW_TASK = "bridge_open_new_task";
export const LEGACY_HANDOFF_OPEN_NEW_PROJECT = "bridge_open_new_project";

/** Consumes a native handoff flag for `name`, including any legacy alias. */
export function consumeHandoff(
  name: string,
  legacy: readonly string[] = [],
): boolean {
  let hit = false;
  for (const key of [name, ...legacy]) {
    if (readBaseKey(key) !== null) {
      removeBaseKey(key);
      hit = true;
    }
  }
  return hit;
}

/** Requests a handoff to `path`; native clients watch both names. */
export function requestHandoff(name: string, legacy: readonly string[] = []): void {
  for (const key of [name, ...legacy]) writeBaseKey(key, "1");
}