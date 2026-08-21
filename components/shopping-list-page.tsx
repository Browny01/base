"use client";

import { useState } from "react";
import { useBridge } from "@/lib/hooks";
import { uid, cn } from "@/lib/utils";
import type { ShoppingCategory } from "@/lib/store";
import {
  Plus, Trash2, ShoppingCart, Check, ChevronDown, ChevronUp,
} from "lucide-react";

const CATEGORIES: { value: ShoppingCategory; label: string; emoji: string }[] = [
  { value: "produce",    label: "Produce",    emoji: "🥬" },
  { value: "dairy",      label: "Dairy",      emoji: "🥛" },
  { value: "meat",       label: "Meat",       emoji: "🥩" },
  { value: "bakery",     label: "Bakery",     emoji: "🍞" },
  { value: "pantry",     label: "Pantry",     emoji: "🫙" },
  { value: "frozen",     label: "Frozen",     emoji: "🧊" },
  { value: "drinks",     label: "Drinks",     emoji: "🥤" },
  { value: "snacks",     label: "Snacks",     emoji: "🍿" },
  { value: "household",  label: "Household",  emoji: "🧹" },
  { value: "other",      label: "Other",      emoji: "📦" },
];

function getCategoryInfo(cat: ShoppingCategory) {
  return CATEGORIES.find((c) => c.value === cat) ?? CATEGORIES[CATEGORIES.length - 1];
}

export function ShoppingListPage() {
  const { data, mutate } = useBridge();

  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formQty, setFormQty] = useState("1");
  const [formCategory, setFormCategory] = useState<ShoppingCategory>("other");
  const [showCompleted, setShowCompleted] = useState(false);

  function addItem() {
    if (!formName.trim()) return;
    mutate((d) => ({
      ...d,
      shoppingList: [
        ...d.shoppingList,
        {
          id: uid(),
          name: formName.trim(),
          quantity: formQty.trim() || "1",
          category: formCategory,
          checked: false,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    setFormName("");
    setFormQty("1");
    setFormCategory("other");
    setShowForm(false);
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

  const unchecked = data.shoppingList.filter((i) => !i.checked);
  const checked = data.shoppingList.filter((i) => i.checked);

  // Group unchecked items by category
  const groupedUnchecked = unchecked.reduce<Record<string, typeof unchecked>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">Shopping List</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--muted)]">{unchecked.length} remaining</span>
          <button
            onClick={() => setShowForm((v) => !v)}
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
        <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-xl p-5 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--text)]">Add Item</h2>

          {/* Name + Quantity */}
          <div className="flex gap-3">
            <input
              autoFocus
              className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors"
              placeholder="Item name…"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
            />
            <input
              className="w-20 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors text-center"
              placeholder="Qty"
              value={formQty}
              onChange={(e) => setFormQty(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
            />
          </div>

          {/* Category selector */}
          <div>
            <p className="text-xs text-[var(--muted)] uppercase tracking-widest font-semibold mb-2">Category</p>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setFormCategory(cat.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                    formCategory === cat.value
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

          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={addItem}
              className="px-5 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs font-semibold rounded-lg transition-colors"
            >
              Add Item
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {data.shoppingList.length === 0 && (
        <div className="text-center py-16 text-[var(--faint)]">
          <ShoppingCart className="w-8 h-8 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No items yet. Add something to your list!</p>
        </div>
      )}

      {/* Unchecked items by category */}
      {Object.entries(groupedUnchecked).map(([cat, items]) => (
        <div key={cat} className="mb-5 last:mb-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm">{getCategoryInfo(cat as ShoppingCategory).emoji}</span>
            <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-widest">
              {getCategoryInfo(cat as ShoppingCategory).label}
            </h2>
            <span className="text-[10px] text-[var(--faint)] bg-[var(--chip)] border border-[var(--border)] px-1.5 py-0.5 rounded-md font-medium">
              {items.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 flex items-center gap-3 transition-colors"
              >
                <button
                  onClick={() => toggleItem(item.id)}
                  className={cn(
                    "w-5 h-5 rounded-md border shrink-0 flex items-center justify-center transition-all",
                    "border-[var(--border-2)] hover:bg-[var(--chip)]"
                  )}
                />
                <span className="flex-1 text-sm text-[var(--text)]">{item.name}</span>
                {item.quantity !== "1" && (
                  <span className="text-xs text-[var(--muted)] bg-[var(--surface-2)] border border-[var(--border)] px-2 py-0.5 rounded-md font-medium tabular">
                    ×{item.quantity}
                  </span>
                )}
                <button
                  onClick={() => deleteItem(item.id)}
                  className="text-[var(--faint)] hover:text-[var(--text)] transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

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
              {checked.map((item) => (
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
                  <span className="flex-1 text-sm text-[var(--text)] line-through">{item.name}</span>
                  {item.quantity !== "1" && (
                    <span className="text-xs text-[var(--muted)] bg-[var(--surface-2)] border border-[var(--border)] px-2 py-0.5 rounded-md font-medium tabular">
                      ×{item.quantity}
                    </span>
                  )}
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="text-[var(--faint)] hover:text-[var(--text)] transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
