"use client";

import { useState } from "react";
import { useBridge } from "@/lib/hooks";
import { uid, getToday, formatCurrency } from "@/lib/utils";
import type { IncomeType } from "@/lib/store";
import { Plus, Trash2, TrendingUp, DollarSign, Clock, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { WalletSection } from "./wallet-section";

const TYPES: { value: IncomeType; label: string; color: string }[] = [
  { value: "income", label: "Income", color: "emerald" },
  { value: "spent",  label: "Spent",  color: "red" },
];

export function MoneyPage() {
  const { data, mutate } = useBridge();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    source: "",
    amount: "",
    date: getToday(),
    type: "income" as IncomeType,
    client: "",
  });
  const [targetEdit, setTargetEdit] = useState(false);
  const [targetInput, setTargetInput] = useState(String(data.dailyRevenueTarget));

  const today = getToday();

  const todayEarned = data.incomeEntries
    .filter((e) => e.date === today && e.type === "income")
    .reduce((s, e) => s + e.amount, 0);

  const monthStart = today.slice(0, 7);
  const monthlyTotal = data.incomeEntries
    .filter((e) => e.date.startsWith(monthStart) && e.type === "income")
    .reduce((s, e) => s + e.amount, 0);

  const allTimeTotal = data.incomeEntries
    .filter((e) => e.type === "income")
    .reduce((s, e) => s + e.amount, 0);

  const pendingInvoiced = data.incomeEntries
    .filter((e) => e.type === "income")
    .reduce((s, e) => s + e.amount, 0);

  const dailyProgress = data.dailyRevenueTarget
    ? Math.min((todayEarned / data.dailyRevenueTarget) * 100, 100)
    : 0;

  function addEntry() {
    if (!form.source.trim() || !form.amount) return;
    mutate((d) => ({
      ...d,
      incomeEntries: [
        ...d.incomeEntries,
        {
          id: uid(),
          source: form.source.trim(),
          amount: parseFloat(form.amount),
          date: form.date,
          type: form.type,
          client: form.client || undefined,
        },
      ],
    }));
    setForm({ source: "", amount: "", date: getToday(), type: "income", client: "" });
    setShowForm(false);
  }

  function deleteEntry(id: string) {
    mutate((d) => ({ ...d, incomeEntries: d.incomeEntries.filter((e) => e.id !== id) }));
  }

  function saveTarget() {
    const v = parseFloat(targetInput);
    if (!isNaN(v) && v >= 0) {
      mutate((d) => ({ ...d, dailyRevenueTarget: v }));
    }
    setTargetEdit(false);
  }

  const sorted = [...data.incomeEntries].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">Money</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Log Income
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Today" value={formatCurrency(todayEarned)} icon={<DollarSign className="w-4 h-4 text-[var(--text)]" />} />
        <StatCard label="This Month" value={formatCurrency(monthlyTotal)} icon={<TrendingUp className="w-4 h-4 text-[var(--text)]" />} />
        <StatCard label="All Time" value={formatCurrency(allTimeTotal)} icon={<CheckCircle className="w-4 h-4 text-[var(--text)]" />} />
        <StatCard label="Pending" value={formatCurrency(pendingInvoiced)} icon={<Clock className="w-4 h-4 text-[var(--text)]" />} />
      </div>

      {/* Daily Target */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-[var(--muted)]">Daily Target</span>
          {targetEdit ? (
            <div className="flex items-center gap-2">
              <span className="text-[var(--muted)] text-sm">$</span>
              <input
                autoFocus
                className="w-24 bg-[var(--surface-2)] border border-[var(--border-2)] rounded px-2 py-1 text-sm text-[var(--text)] focus:outline-none"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveTarget()}
              />
              <button onClick={saveTarget} className="text-xs text-[var(--text)] hover:text-[var(--text)]">Save</button>
            </div>
          ) : (
            <button
              onClick={() => { setTargetEdit(true); setTargetInput(String(data.dailyRevenueTarget)); }}
              className="text-xs text-[var(--text)] hover:text-[var(--text)]"
            >
              {formatCurrency(data.dailyRevenueTarget)} · Edit
            </button>
          )}
        </div>
        <div className="w-full bg-[var(--surface-2)] rounded-full h-2 mb-2">
          <div
            className="bg-[var(--text)] h-2 rounded-full transition-all"
            style={{ width: `${dailyProgress}%` }}
          />
        </div>
        <p className="text-xs text-[var(--muted)]">
          {formatCurrency(todayEarned)} income today
          {dailyProgress < 100 && ` · ${formatCurrency(data.dailyRevenueTarget - todayEarned)} to go`}
          {dailyProgress >= 100 && " · 🎯 Target hit!"}
        </p>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-xl p-4 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Source</label>
              <input
                autoFocus
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]"
                placeholder="Freelance, client name..."
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Amount ($)</label>
              <input
                type="number"
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Date</label>
              <input
                type="date"
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Type</label>
              <div className="flex gap-1">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                    className={cn(
                      "flex-1 py-1.5 text-xs font-medium rounded transition-colors",
                      form.type === t.value
                        ? t.color === "emerald"
                          ? "bg-[var(--text)] text-[var(--bg)]"
                          : t.color === "yellow"
                          ? "bg-[var(--text)] text-[var(--bg)]"
                          : "bg-[var(--text)] text-[var(--bg)]"
                        : "bg-[var(--surface-2)] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors">Cancel</button>
            <button onClick={addEntry} className="px-4 py-1.5 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs font-medium rounded-lg transition-colors">
              Log Entry
            </button>
          </div>
        </div>
      )}

      {/* Entries List */}
      <div className="space-y-2">
        {sorted.length === 0 ? (
          <p className="text-center text-sm text-[var(--muted)] py-8">No entries yet. Start logging income!</p>
        ) : (
          sorted.map((entry) => {
            const typeInfo = TYPES.find((t) => t.value === entry.type)!;
            return (
              <div key={entry.id} className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 group hover:border-[var(--border)] transition-colors">
                <div className="flex-1">
                  <p className="text-sm text-[var(--text)]">{entry.source}</p>
                  <p className="text-xs text-[var(--muted)]">{entry.date}</p>
                </div>
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    typeInfo.color === "emerald"
                      ? "bg-[var(--chip)] text-[var(--text)]"
                      : typeInfo.color === "yellow"
                      ? "bg-[var(--chip)] text-[var(--text)]"
                      : "bg-[var(--chip)] text-[var(--text)]"
                  )}
                >
                  {typeInfo.label}
                </span>
                <span className="font-mono font-semibold text-[var(--text)]">{formatCurrency(entry.amount)}</span>
                <button
                  onClick={() => deleteEntry(entry.id)}
                  className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-[var(--text)] transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Crypto Wallets */}
      <WalletSection />
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs text-[var(--muted)]">{label}</span></div>
      <p className="text-xl font-bold text-[var(--text)]">{value}</p>
    </div>
  );
}
