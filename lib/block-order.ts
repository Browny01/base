"use client";

import type { WikiBlock } from "@/lib/store";

// Drag-and-drop reorder maths, kept pure so it can be tested without a DOM.

/**
 * Insertion index reported while dragging: the index of the first block whose
 * vertical midpoint is below the pointer, or `blocks.length` past the last one.
 *
 * A row whose position is not yet known is passed as `-Infinity` so it is
 * skipped instead of swallowing every drop.
 */
export function insertIndexAt(midpoints: number[], pointerY: number): number {
  for (let i = 0; i < midpoints.length; i++) {
    if (pointerY < midpoints[i]) return i;
  }
  return midpoints.length;
}

/**
 * Convert an insertion index into the final position for the moved block.
 *
 * The drop index is measured while the dragged block is still in the list, so
 * every index after it is one higher than where the block actually ends up.
 */
export function dropTargetIndex(from: number, over: number, length: number): number {
  const to = over > from ? over - 1 : over;
  return Math.max(0, Math.min(to, length - 1));
}

/** Returns a new array with `id` moved to `to`, or the same array if nothing changes. */
export function moveBlockTo(blocks: WikiBlock[], id: string, to: number): WikiBlock[] {
  const from = blocks.findIndex((b) => b.id === id);
  if (from < 0) return blocks;
  const next = [...blocks];
  const [moved] = next.splice(from, 1);
  const at = Math.max(0, Math.min(to, next.length));
  if (at === from) return blocks;
  next.splice(at, 0, moved);
  return next;
}