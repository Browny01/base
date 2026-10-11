/** Recompute from a deadline so throttled/background intervals never lose time. */
export function remainingFocusSeconds(deadline: number, now: number): number {
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.ceil((deadline-now)/1000));
}
export function elapsedFocusMinutes(totalSeconds: number, remainingSeconds: number): number {
  return Math.max(0, Math.round((totalSeconds-Math.max(0,remainingSeconds))/60));
}
