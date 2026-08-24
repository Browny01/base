"use client";

import { useState } from "react";
import { useBridge } from "@/lib/hooks";
import { uid, cn } from "@/lib/utils";
import type { ShoppingCategory, ShoppingListItem } from "@/lib/store";
import {
  Plus, Trash2, ShoppingCart, Check, ChevronDown, ChevronUp,
  ArrowUp, ArrowRight, ArrowDown, GripVertical,
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

function formatPrice(amount: number) {
  return amount === 0 ? null : `$${amount.toFixed(2)}`;
}

export function ShoppingListPage() {
  const { data, mutate } = useBridge();

  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formCategory, setFormCategory] = useState<ShoppingCategory>("other");
  const [formPriority, setFormPriority] = useState<1 | 2 | 3>(2);
  const [showCompleted, setShowCompleted] = useState(false);

  function addItem() {
    if (!formName.trim()) return;
    const price = parseFloat(formPrice) || 0;
    mutate((d) => ({
      ...d,
      shoppingList: [
        ...d.shoppingList,
        {
          id: uid(),
          name: formName.trim(),
          category: formCategory,
          price,
          priority: formPriority,
          checked: false,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    setFormName("");
    setFormPrice("");
    setFormCategory("other");
    setFormPriority(2);
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

  function setPriority(id: string, p: 1 | 2 | 3) {
    mutate((d) => ({
      ...d,
      shoppingList: d.shoppingList.map((item) =>
        item.id === id ? { ...item, priority: p } : item
      ),
    }));
  }

  const unchecked = data.shoppingList.filter((i) => !i.checked).sort(prioritySort);
  const checked = data.shoppingList.filter((i) => i.checked);
  const totalCost = unchecked.reduce((sum, i) => sum + i.price, 0);
  const pricedCount = unchecked.filter((i) => i.price > 0).length;

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

          {/* Name + Price */}
          <div className="flex gap-3">
            <input
              autoFocus
              className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors"
              placeholder="What do you want?…"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
            />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--faint)]">$</span>
              <input
                className="w-24 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl pl-7 pr-3 py-2.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors text-right tabular"
                placeholder="0.00"
                type="number"
                step="0.01"
                min="0"
                value={formPrice}
                onChange={(e) => setFormPrice(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addItem()}
              />
            </div>
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
                    onClick={() => setFormPriority(p.value)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all",
                      formPriority === p.value
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
          <p className="text-sm">Your wish list is empty. Start adding things you want!</p>
        </div>
      )}

      {/* Unchecked items */}
      {unchecked.length > 0 && (
        <div className="space-y-1.5">
          {unchecked.map((item) => {
            const cat = getCategoryInfo(item.category);
            const pri = getPriorityInfo(item.priority);
            const PriIcon = pri.icon;
            const priceStr = formatPrice(item.price);

            return (
              <div
                key={item.id}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 flex items-center gap-3 transition-colors"
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleItem(item.id)}
                  className="w-5 h-5 rounded-md border border-[var(--border-2)] shrink-0 flex items-center justify-center transition-all hover:bg-[var(--chip)]"
                />

                {/* Priority toggle */}
                <button
                  onClick={() => {
                    const next = (item.priority % 3) + 1 as 1 | 2 | 3;
                    setPriority(item.id, next);
                  }}
                  title={pri.label}
                  className="shrink-0"
                >
                  <PriIcon className={cn("w-4 h-4", pri.color)} />
                </button>

                {/* Category emoji */}
                <span className="shrink-0 text-sm" title={cat.label}>{cat.emoji}</span>

                {/* Name */}
                <span className="flex-1 min-w-0 text-sm text-[var(--text)] truncate">{item.name}</span>

                {/* Price */}
                {priceStr && (
                  <span className="text-sm font-medium tabular text-[var(--muted)] shrink-0">
                    {priceStr}
                  </span>
                )}

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
              {checked.sort(prioritySort).map((item) => {
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
                    <span className="flex-1 text-sm text-[var(--text)] line-through">{item.name}</span>
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
