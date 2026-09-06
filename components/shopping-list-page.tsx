"use client";

import { useRef, useState } from "react";
import { useBridge } from "@/lib/hooks";
import { uid, cn } from "@/lib/utils";
import type { ShoppingCategory, ShoppingListItem } from "@/lib/store";
import {
  Plus, Trash2, ShoppingCart, Check, ChevronDown, ChevronUp,
  ArrowUp, ArrowRight, ArrowDown, GripVertical, Pencil, ExternalLink,
  ImagePlus, X,
} from "lucide-react";

const CATEGORIES: { value: ShoppingCategory; label: string; emoji: string }[] = [
  { value: "clothing",    label: "Clothing",    emoji: "👔" },
  { value: "shoes",       label: "Shoes",       emoji: "👟" },
  { value: "tech",        label: "Tech",        emoji: "💻" },
  { value: "gaming",      label: "Gaming",      emoji: "🎮" },
  { value: "home",        label: "Home",        emoji: "🏠" },
  { value: "furniture",   label: "Furniture",   emoji: "🛋️" },
  { value: "books",       label: "Books",       emoji: "📚" },
  { value: "fitness",     label: "Fitness",     emoji: "💪" },
  { value: "accessories", label: "Accessories", emoji: "⌚" },
  { value: "other",       label: "Other",       emoji: "📦" },
];

const PRIORITIES: { value: 1 | 2 | 3; label: string; icon: typeof ArrowUp; color: string }[] = [
  { value: 1, label: "Must Have", icon: ArrowUp,   color: "text-[var(--c-red)]" },
  { value: 2, label: "Want",      icon: ArrowRight, color: "text-[var(--c-yellow)]" },
  { value: 3, label: "Nice to Have", icon: ArrowDown, color: "text-[var(--faint)]" },
];

function getCategoryInfo(cat: ShoppingCategory) {
  return CATEGORIES.find((c) => c.value === cat) ?? CATEGORIES[CATEGORIES.length - 1];
}

function getPriorityInfo(p: 1 | 2 | 3) {
  return PRIORITIES.find((pr) => pr.value === p) ?? PRIORITIES[2];
}

function prioritySort(a: ShoppingListItem, b: ShoppingListItem) {
  return a.priority - b.priority || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

// Manual order first; items without a saved order fall back to priority/age.
function orderSort(a: ShoppingListItem, b: ShoppingListItem) {
  const ao = a.order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.order ?? Number.MAX_SAFE_INTEGER;
  return ao !== bo ? ao - bo : prioritySort(a, b);
}

function formatPrice(amount: number) {
  return amount === 0 ? null : `$${amount.toFixed(2)}`;
}

function isImageIcon(s?: string) {
  return !!s && (s.startsWith("data:") || /^https?:\/\//i.test(s));
}

function normalizeUrl(u: string): string | undefined {
  const t = u.trim();
  if (!t) return undefined;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

// Shrink an uploaded image to a small square data-URL so it's cheap to store & sync.
async function fileToIcon(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(new Error("read failed"));
    fr.readAsDataURL(file);
  });
  const img = document.createElement("img");
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error("decode failed"));
    img.src = dataUrl;
  });
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  const scale = Math.max(size / img.width, size / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL("image/webp", 0.8);
}

function ItemIcon({ item, size = "sm" }: { item: ShoppingListItem; size?: "sm" | "lg" }) {
  const dim = size === "lg" ? "w-9 h-9 text-2xl" : "w-5 h-5 text-sm";
  if (isImageIcon(item.icon)) {
    return <img src={item.icon} alt="" className={cn("rounded object-cover shrink-0", dim)} />;
  }
  const cat = getCategoryInfo(item.category);
  return (
    <span className={cn("shrink-0 grid place-items-center leading-none", dim)} title={cat.label}>
      {item.icon || cat.emoji}
    </span>
  );
}

interface FormValues {
  name: string;
  price: number;
  category: ShoppingCategory;
  priority: 1 | 2 | 3;
  icon: string;
  url: string;
}

function ItemForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<ShoppingListItem>;
  submitLabel: string;
  onSubmit: (v: FormValues) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(initial?.price ? String(initial.price) : "");
  const [category, setCategory] = useState<ShoppingCategory>(initial?.category ?? "other");
  const [priority, setPriority] = useState<1 | 2 | 3>(initial?.priority ?? 2);
  const [icon, setIcon] = useState(initial?.icon ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      price: parseFloat(price) || 0,
      category,
      priority,
      icon: icon.trim(),
      url: url.trim(),
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    try {
      setIcon(await fileToIcon(file));
    } catch {
      setUploadError("Couldn't read that image.");
    }
  }

  const previewItem: ShoppingListItem = {
    id: "preview", name: "", category, price: 0, priority: 2, checked: false, createdAt: "", icon,
  };

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-[var(--text)]">{submitLabel}</h2>

      {/* Name + Price */}
      <div className="flex gap-3">
        <input
          autoFocus
          className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors"
          placeholder="What do you want?…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--faint)]">$</span>
          <input
            className="w-24 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl pl-7 pr-3 py-2.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors text-right tabular"
            placeholder="0.00"
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
      </div>

      {/* Link */}
      <div>
        <p className="text-xs text-[var(--muted)] uppercase tracking-widest font-semibold mb-2">Link</p>
        <input
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors"
          placeholder="https://store.example.com/product"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>

      {/* Icon */}
      <div>
        <p className="text-xs text-[var(--muted)] uppercase tracking-widest font-semibold mb-2">Icon</p>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 shrink-0 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] grid place-items-center overflow-hidden">
            <ItemIcon item={previewItem} size="lg" />
          </div>
          <input
            className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors"
            placeholder="Emoji (🎧) or image URL"
            value={isImageIcon(icon) ? "" : icon}
            onChange={(e) => setIcon(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors shrink-0"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            Upload
          </button>
          {icon && (
            <button
              type="button"
              onClick={() => setIcon("")}
              className="text-[var(--faint)] hover:text-[var(--text)] transition-colors shrink-0"
              title="Clear icon"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>
        {uploadError ? (
          <p className="text-[11px] text-[var(--c-red)] mt-1.5">{uploadError}</p>
        ) : (
          <p className="text-[11px] text-[var(--faint)] mt-1.5">Leave blank to use the category emoji.</p>
        )}
      </div>

      {/* Category selector */}
      <div>
        <p className="text-xs text-[var(--muted)] uppercase tracking-widest font-semibold mb-2">Category</p>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                category === cat.value
                  ? "bg-[var(--chip)] border-[var(--border-2)] text-[var(--text)]"
                  : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--border)]"
              )}
            >
              <span>{cat.emoji}</span>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Priority selector */}
      <div>
        <p className="text-xs text-[var(--muted)] uppercase tracking-widest font-semibold mb-2">Priority</p>
        <div className="grid grid-cols-3 gap-2">
          {PRIORITIES.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setPriority(p.value)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all",
                  priority === p.value
                    ? "bg-[var(--chip)] border-[var(--border-2)] text-[var(--text)]"
                    : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--border)]"
                )}
              >
                <Icon className={cn("w-3.5 h-3.5", p.color)} />
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          className="px-5 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs font-semibold rounded-lg transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

export function ShoppingListPage() {
  const { data, mutate } = useBridge();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function addItem(v: FormValues) {
    mutate((d) => {
      const nextOrder =
        d.shoppingList.reduce((m, i) => Math.max(m, i.order ?? -1), -1) + 1;
      return {
        ...d,
        shoppingList: [
          ...d.shoppingList,
          {
            id: uid(),
            name: v.name,
            category: v.category,
            price: v.price,
            priority: v.priority,
            checked: false,
            createdAt: new Date().toISOString(),
            icon: v.icon || undefined,
            url: normalizeUrl(v.url),
            order: nextOrder,
          },
        ],
      };
    });
    setShowForm(false);
  }

  function saveEdit(id: string, v: FormValues) {
    mutate((d) => ({
      ...d,
      shoppingList: d.shoppingList.map((item) =>
        item.id === id
          ? {
              ...item,
              name: v.name,
              category: v.category,
              price: v.price,
              priority: v.priority,
              icon: v.icon || undefined,
              url: normalizeUrl(v.url),
            }
          : item
      ),
    }));
    setEditingId(null);
  }

  function toggleItem(id: string) {
    mutate((d) => ({
      ...d,
      shoppingList: d.shoppingList.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      ),
    }));
  }

  function deleteItem(id: string) {
    mutate((d) => ({
      ...d,
      shoppingList: d.shoppingList.filter((item) => item.id !== id),
    }));
  }

  function clearChecked() {
    mutate((d) => ({
      ...d,
      shoppingList: d.shoppingList.filter((item) => !item.checked),
    }));
  }

  function setPriority(id: string, p: 1 | 2 | 3) {
    mutate((d) => ({
      ...d,
      shoppingList: d.shoppingList.map((item) =>
        item.id === id ? { ...item, priority: p } : item
      ),
    }));
  }

  // Drop `dragId` onto the slot occupied by `targetId`, then renumber the whole
  // unchecked list so `order` stays dense and stable.
  function moveTo(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    mutate((d) => {
      const ordered = d.shoppingList.filter((i) => !i.checked).sort(orderSort);
      const from = ordered.findIndex((i) => i.id === draggedId);
      const to = ordered.findIndex((i) => i.id === targetId);
      if (from < 0 || to < 0) return d;
      const [moved] = ordered.splice(from, 1);
      ordered.splice(to, 0, moved);
      const orderMap = new Map(ordered.map((i, idx) => [i.id, idx]));
      return {
        ...d,
        shoppingList: d.shoppingList.map((i) =>
          orderMap.has(i.id) ? { ...i, order: orderMap.get(i.id)! } : i
        ),
      };
    });
  }

  function nudge(id: string, dir: -1 | 1) {
    const ids = unchecked.map((i) => i.id);
    const idx = ids.indexOf(id);
    const target = ids[idx + dir];
    if (target) moveTo(id, target);
  }

  const unchecked = data.shoppingList.filter((i) => !i.checked).sort(orderSort);
  const checked = data.shoppingList.filter((i) => i.checked);
  const totalCost = unchecked.reduce((sum, i) => sum + i.price, 0);

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">Wish List</h1>
        <div className="flex items-center gap-3">
          {totalCost > 0 && (
            <span className="text-sm font-medium tabular text-[var(--muted)]">
              ~${totalCost.toFixed(2)} total
            </span>
          )}
          <button
            onClick={() => { setShowForm((v) => !v); setEditingId(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs font-medium rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Item
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-[var(--chip)] rounded-full h-1.5 mb-7">
        <div
          className="bg-[var(--text)] h-1.5 rounded-full transition-all"
          style={{
            width: data.shoppingList.length
              ? `${(checked.length / data.shoppingList.length) * 100}%`
              : "0%",
          }}
        />
      </div>

      {/* New item form */}
      {showForm && (
        <div className="mb-6">
          <ItemForm submitLabel="Add Item" onSubmit={addItem} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {/* Empty state */}
      {data.shoppingList.length === 0 && (
        <div className="text-center py-16 text-[var(--faint)]">
          <ShoppingCart className="w-8 h-8 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Your wish list is empty. Start adding things you want!</p>
        </div>
      )}

      {/* Unchecked items */}
      {unchecked.length > 0 && (
        <div className="space-y-1.5">
          {unchecked.map((item, idx) => {
            if (editingId === item.id) {
              return (
                <ItemForm
                  key={item.id}
                  initial={item}
                  submitLabel="Save"
                  onSubmit={(v) => saveEdit(item.id, v)}
                  onCancel={() => setEditingId(null)}
                />
              );
            }

            const pri = getPriorityInfo(item.priority);
            const PriIcon = pri.icon;
            const priceStr = formatPrice(item.price);

            return (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => {
                  setDragId(item.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => { setDragId(null); setOverId(null); }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== item.id) setOverId(item.id);
                }}
                onDragLeave={() => setOverId((o) => (o === item.id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) moveTo(dragId, item.id);
                  setDragId(null);
                  setOverId(null);
                }}
                className={cn(
                  "bg-[var(--surface)] border rounded-xl px-3 py-3 flex items-center gap-2.5 transition-colors",
                  overId === item.id ? "border-[var(--text)]" : "border-[var(--border)]",
                  dragId === item.id && "opacity-40"
                )}
              >
                {/* Drag handle + keyboard reorder */}
                <div className="flex flex-col items-center shrink-0 -my-1">
                  <button
                    onClick={() => nudge(item.id, -1)}
                    disabled={idx === 0}
                    className="text-[var(--faint)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:text-[var(--faint)] transition-colors"
                    title="Move up"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <GripVertical className="w-3.5 h-3.5 text-[var(--faint)] cursor-grab active:cursor-grabbing" />
                  <button
                    onClick={() => nudge(item.id, 1)}
                    disabled={idx === unchecked.length - 1}
                    className="text-[var(--faint)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:text-[var(--faint)] transition-colors"
                    title="Move down"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Checkbox */}
                <button
                  onClick={() => toggleItem(item.id)}
                  className="w-5 h-5 rounded-md border border-[var(--border-2)] shrink-0 flex items-center justify-center transition-all hover:bg-[var(--chip)]"
                />

                {/* Priority toggle */}
                <button
                  onClick={() => {
                    const next = ((item.priority % 3) + 1) as 1 | 2 | 3;
                    setPriority(item.id, next);
                  }}
                  title={pri.label}
                  className="shrink-0"
                >
                  <PriIcon className={cn("w-4 h-4", pri.color)} />
                </button>

                {/* Icon */}
                <ItemIcon item={item} />

                {/* Name (link if a URL is set) */}
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-w-0 text-sm text-[var(--text)] truncate hover:underline flex items-center gap-1"
                  >
                    <span className="truncate">{item.name}</span>
                    <ExternalLink className="w-3 h-3 text-[var(--faint)] shrink-0" />
                  </a>
                ) : (
                  <span className="flex-1 min-w-0 text-sm text-[var(--text)] truncate">{item.name}</span>
                )}

                {/* Price */}
                {priceStr && (
                  <span className="text-sm font-medium tabular text-[var(--muted)] shrink-0">
                    {priceStr}
                  </span>
                )}

                {/* Edit */}
                <button
                  onClick={() => { setEditingId(item.id); setShowForm(false); }}
                  className="text-[var(--faint)] hover:text-[var(--text)] transition-colors shrink-0"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                {/* Delete */}
                <button
                  onClick={() => deleteItem(item.id)}
                  className="text-[var(--faint)] hover:text-[var(--text)] transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Checked items */}
      {checked.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-2 mb-3 group"
          >
            {showCompleted ? (
              <ChevronDown className="w-4 h-4 text-[var(--faint)]" />
            ) : (
              <ChevronUp className="w-4 h-4 text-[var(--faint)]" />
            )}
            <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-widest">
              Got ({checked.length})
            </h2>
            <button
              onClick={(e) => { e.stopPropagation(); clearChecked(); }}
              className="text-[10px] text-[var(--faint)] hover:text-[var(--text)] transition-colors uppercase tracking-wide font-semibold"
            >
              Clear
            </button>
          </button>

          {showCompleted && (
            <div className="space-y-1.5">
              {checked.sort(orderSort).map((item) => {
                const priceStr = formatPrice(item.price);
                return (
                  <div
                    key={item.id}
                    className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 flex items-center gap-3 transition-colors opacity-50"
                  >
                    <button
                      onClick={() => toggleItem(item.id)}
                      className="w-5 h-5 rounded-md bg-[var(--text)] border shrink-0 flex items-center justify-center transition-all border-[var(--text)]"
                    >
                      <Check className="w-3 h-3 text-[var(--bg)]" strokeWidth={3} />
                    </button>
                    <ItemIcon item={item} />
                    <span className="flex-1 text-sm text-[var(--text)] line-through truncate">{item.name}</span>
                    {priceStr && (
                      <span className="text-sm font-medium tabular text-[var(--muted)] shrink-0">
                        {priceStr}
                      </span>
                    )}
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="text-[var(--faint)] hover:text-[var(--text)] transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
