"use client";

import { useState, type ReactNode } from "react";
import { useBridge } from "@/lib/hooks";
import type { BridgeData } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronUp, Trash2, type LucideIcon } from "lucide-react";

// Minimum shape every card item must expose. Pages may extend this (poster,
// author, kind, …) — unknown fields are preserved on write.
export interface MediaCardLike {
  id: string;
  checked: boolean;
  createdAt: string;
  order?: number;
}

export interface CardConfig<T extends MediaCardLike> {
  dataKey: "readingList" | "watchList";
  title: string;
  addLabel: string;
  emptyIcon: LucideIcon;
  emptyText: string;
  doneLabel: (n: number) => string;
  cover: (item: T) => string | undefined;      // poster / thumbnail / uploaded cover
  titleOf: (item: T) => string;
  subtitleOf: (item: T) => string | undefined;
  aspect: (item: T) => string;                 // "aspect-[2/3]" | "aspect-video" …
  badge?: (item: T) => { label: string; icon?: LucideIcon } | null;
  fallbackEmoji: (item: T) => string;
}

function orderSort<T extends MediaCardLike>(a: T, b: T) {
  const ao = a.order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export function CardListPage<T extends MediaCardLike>({
  config,
  items,
  renderAdd,
  filterBar,
  filter,
}: {
  config: CardConfig<T>;
  items: T[];
  renderAdd: (ops: { close: () => void; append: (item: T) => void }) => ReactNode;
  filterBar?: ReactNode;
  filter?: (item: T) => boolean;
}) {
  const { mutate } = useBridge();
  const [showForm, setShowForm] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function write(next: T[]) {
    mutate((d) => ({ ...d, [config.dataKey]: next }) as unknown as BridgeData);
  }

  function append(item: T) {
    const nextOrder = items.reduce((m, i) => Math.max(m, i.order ?? -1), -1) + 1;
    write([...items, { ...item, order: nextOrder } as T]);
    setShowForm(false);
  }

  function toggle(id: string) {
    write(items.map((i) => (i.id === id ? { ...i, checked: !i.checked } as T : i)));
  }

  function remove(id: string) {
    write(items.filter((i) => i.id !== id));
  }

  function clearDone() {
    write(items.filter((i) => !i.checked));
  }

  // Drop `dragId` onto the slot occupied by `targetId`, then renumber so `order`
  // stays dense and stable. Only unchecked items are draggable slots.
  function moveTo(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const ordered = items.filter((i) => !i.checked).sort(orderSort);
    const from = ordered.findIndex((i) => i.id === draggedId);
    const to = ordered.findIndex((i) => i.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    const orderMap = new Map(ordered.map((i, idx) => [i.id, idx]));
    write(items.map((i) => (orderMap.has(i.id) ? { ...i, order: orderMap.get(i.id)! } as T : i)));
  }

  const view = filter ? items.filter(filter) : items;
  const unchecked = view.filter((i) => !i.checked).sort(orderSort);
  const done = view.filter((i) => i.checked).sort(orderSort);

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">{config.title}</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs font-medium rounded-lg transition-colors"
        >
          <PlusIcon />
          {config.addLabel}
        </button>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-[var(--chip)] rounded-full h-1.5 mb-6">
        <div
          className="bg-[var(--text)] h-1.5 rounded-full transition-all"
          style={{ width: items.length ? `${(done.length / items.length) * 100}%` : "0%" }}
        />
      </div>

      {filterBar && <div className="mb-4">{filterBar}</div>}

      {/* Add form */}
      {showForm && (
        <div className="mb-6">
          {renderAdd({ close: () => setShowForm(false), append })}
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center py-16 text-[var(--faint)]">
          <config.emptyIcon className="w-8 h-8 mx-auto mb-3 opacity-20" />
          <p className="text-sm">{config.emptyText}</p>
        </div>
      )}

      {/* Filtered-empty note */}
      {items.length > 0 && unchecked.length === 0 && done.length === 0 && (
        <div className="text-center py-10 text-[var(--faint)] text-sm">Nothing here yet.</div>
      )}

      {/* Cards */}
      {unchecked.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {unchecked.map((item) => {
            const cover = config.cover(item);
            const title = config.titleOf(item);
            const subtitle = config.subtitleOf(item);
            const badge = config.badge?.(item) ?? null;
            const BadgeIcon = badge?.icon;
            return (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => { setDragId(item.id); e.dataTransfer.effectAllowed = "move"; }}
                onDragEnd={() => { setDragId(null); setOverId(null); }}
                onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== item.id) setOverId(item.id); }}
                onDragLeave={() => setOverId((o) => (o === item.id ? null : o))}
                onDrop={(e) => { e.preventDefault(); if (dragId) moveTo(dragId, item.id); setDragId(null); setOverId(null); }}
                className={cn(
                  "rounded-2xl border bg-[var(--surface)] overflow-hidden flex flex-col cursor-grab active:cursor-grabbing transition-colors",
                  overId === item.id ? "border-[var(--text)]" : "border-[var(--border)]",
                  dragId === item.id && "opacity-40"
                )}
              >
                <div className={cn("relative w-full", config.aspect(item))}>
                  {cover ? (
                    <img src={cover} alt={title} draggable={false} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 bg-[var(--chip)] grid place-items-center">
                      <span className="text-3xl opacity-40">{config.fallbackEmoji(item)}</span>
                    </div>
                  )}

                  {/* Mark done */}
                  <button
                    onClick={() => toggle(item.id)}
                    title="Mark done"
                    className="absolute bottom-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all bg-[var(--bg)]/85 border-[var(--border-2)] hover:scale-110"
                  >
                    <Check className="w-3.5 h-3.5 text-transparent hover:text-[var(--muted)]" strokeWidth={3} />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => remove(item.id)}
                    title="Delete"
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[var(--bg)]/85 border border-[var(--border)] text-[var(--faint)] hover:text-[var(--c-red)] flex items-center justify-center transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>

                  {badge && (
                    <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-[var(--bg)]/85 border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                      {BadgeIcon && <BadgeIcon className="w-3 h-3" />}
                      {badge.label}
                    </span>
                  )}
                </div>

                <div className="p-2.5 flex-1">
                  <p className="text-[13px] font-semibold text-[var(--text)] leading-snug line-clamp-2">{title}</p>
                  {subtitle && <p className="text-[11px] text-[var(--faint)] truncate mt-0.5">{subtitle}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Done section */}
      {done.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setShowDone((v) => !v)} className="flex items-center gap-2 mb-3 group">
            {showDone ? <ChevronDown className="w-4 h-4 text-[var(--faint)]" /> : <ChevronUp className="w-4 h-4 text-[var(--faint)]" />}
            <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-widest">{config.doneLabel(done.length)}</h2>
            <button
              onClick={(e) => { e.stopPropagation(); clearDone(); }}
              className="text-[10px] text-[var(--faint)] hover:text-[var(--text)] transition-colors uppercase tracking-wide font-semibold"
            >
              Clear
            </button>
          </button>

          {showDone && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 opacity-60">
              {done.map((item) => {
                const title = config.titleOf(item);
                const subtitle = config.subtitleOf(item);
                return (
                  <div key={item.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden flex flex-col">
                    {config.cover(item) ? (
                      <img src={config.cover(item)} alt={title} className={cn("w-full object-cover", config.aspect(item))} />
                    ) : (
                      <div className={cn("w-full bg-[var(--chip)] grid place-items-center", config.aspect(item))}>
                        <span className="text-3xl opacity-40">{config.fallbackEmoji(item)}</span>
                      </div>
                    )}
                    <div className="p-2.5 flex-1 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[var(--text)] leading-snug line-clamp-2 line-through">{title}</p>
                        {subtitle && <p className="text-[11px] text-[var(--faint)] truncate mt-0.5">{subtitle}</p>}
                      </div>
                      <button
                        onClick={() => toggle(item.id)}
                        title="Not done"
                        className="w-5 h-5 rounded-full bg-[var(--text)] text-[var(--bg)] flex items-center justify-center shrink-0 mt-0.5"
                      >
                        <Check className="w-3 h-3" strokeWidth={3} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}