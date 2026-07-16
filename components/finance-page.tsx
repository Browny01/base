"use client";

import { useState, useCallback } from "react";
import { useBridge } from "@/lib/hooks";
import { uid, getToday, formatCurrency } from "@/lib/utils";
import type { IncomeType, PaymentSubscription, SubscriptionFrequency } from "@/lib/store";
import { Plus, Trash2, TrendingUp, DollarSign, Clock, CheckCircle, CalendarClock, CreditCard, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { WalletSection } from "./wallet-section";
import { PortfolioChart } from "./portfolio-chart";

const TYPES: { value: IncomeType; label: string; color: string }[] = [
  { value: "income", label: "Income", color: "emerald" },
  { value: "spent",  label: "Spent",  color: "red" },
];

const FREQUENCIES: { value: SubscriptionFrequency; label: string; monthlyFactor: number }[] = [
  { value: "weekly", label: "Weekly", monthlyFactor: 52 / 12 },
  { value: "monthly", label: "Monthly", monthlyFactor: 1 },
  { value: "quarterly", label: "Quarterly", monthlyFactor: 1 / 3 },
  { value: "yearly", label: "Yearly", monthlyFactor: 1 / 12 },
];

function daysUntil(date: string) {
  const today = new Date(`${getToday()}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function monthlyEquivalent(sub: PaymentSubscription) {
  const freq = FREQUENCIES.find((f) => f.value === sub.frequency);
  return sub.amount * (freq?.monthlyFactor ?? 1);
}

export function FinancePage() {
  const { data, mutate } = useBridge();
  const [currentPortfolioAud, setCurrentPortfolioAud] = useState<number | null>(null);
  const handleTotalUpdate = useCallback((total: number) => {
    setCurrentPortfolioAud(total);
  }, []);
  const [showForm, setShowForm] = useState(false);
  const [showSubForm, setShowSubForm] = useState(false);
  const [form, setForm] = useState({
    source: "",
    amount: "",
    date: getToday(),
    type: "income" as IncomeType,
    client: "",
  });
  const [subForm, setSubForm] = useState({
    name: "",
    amount: "",
    dueDate: getToday(),
    frequency: "monthly" as SubscriptionFrequency,
    category: "",
    notes: "",
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

  const totalSpent = data.incomeEntries
    .filter((e) => e.type === "spent")
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

  function addSubscription() {
    if (!subForm.name.trim() || !subForm.amount || !subForm.dueDate) return;
    mutate((d) => ({
      ...d,
      subscriptions: [
        ...(d.subscriptions ?? []),
        {
          id: uid(),
          name: subForm.name.trim(),
          amount: parseFloat(subForm.amount),
          dueDate: subForm.dueDate,
          frequency: subForm.frequency,
          category: subForm.category.trim() || "General",
          notes: subForm.notes.trim() || undefined,
          active: true,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    setSubForm({ name: "", amount: "", dueDate: getToday(), frequency: "monthly", category: "", notes: "" });
    setShowSubForm(false);
  }

  function toggleSubscription(id: string) {
    mutate((d) => ({
      ...d,
      subscriptions: (d.subscriptions ?? []).map((sub) => sub.id === id ? { ...sub, active: !sub.active } : sub),
    }));
  }

  function deleteSubscription(id: string) {
    mutate((d) => ({ ...d, subscriptions: (d.subscriptions ?? []).filter((sub) => sub.id !== id) }));
  }

  function saveTarget() {
    const v = parseFloat(targetInput);
    if (!isNaN(v) && v >= 0) {
      mutate((d) => ({ ...d, dailyRevenueTarget: v }));
    }
    setTargetEdit(false);
  }

  const sorted = [...data.incomeEntries].sort((a, b) => b.date.localeCompare(a.date));
  const subscriptions = [...(data.subscriptions ?? [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const activeSubscriptions = subscriptions.filter((sub) => sub.active);
  const monthlySubscriptions = activeSubscriptions.reduce((sum, sub) => sum + monthlyEquivalent(sub), 0);
  const dueSoon = activeSubscriptions.filter((sub) => daysUntil(sub.dueDate) <= 7).length;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">Finance</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSubForm(!showSubForm)}
            className="flex items-center gap-2 px-3 py-2 border border-[var(--border)] hover:bg-[var(--chip)] text-[var(--text)] text-sm font-medium rounded-lg transition-colors"
          >
            <Bell className="w-4 h-4" />
            Subscription
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Log Income
          </button>
        </div>
      </div>

      {/* Portfolio Chart */}
      <PortfolioChart
        snapshots={data.portfolioSnapshots ?? []}
        currentTotal={currentPortfolioAud}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Today" value={formatCurrency(todayEarned)} icon={<DollarSign className="w-4 h-4 text-[var(--text)]" />} />
        <StatCard label="This Month" value={formatCurrency(monthlyTotal)} icon={<TrendingUp className="w-4 h-4 text-[var(--text)]" />} />
        <StatCard label="All Time" value={formatCurrency(allTimeTotal)} icon={<CheckCircle className="w-4 h-4 text-[var(--text)]" />} />
        <StatCard label="Total Spent" value={formatCurrency(totalSpent)} icon={<Clock className="w-4 h-4 text-[var(--text)]" />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] mb-6">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[var(--chip)] flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-[var(--text)]" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[var(--text)]">Subscriptions</h2>
                <p className="text-xs text-[var(--muted)]">{activeSubscriptions.length} active · {formatCurrency(monthlySubscriptions)} / month est.</p>
              </div>
            </div>
            <button onClick={() => setShowSubForm(!showSubForm)} className="text-xs font-medium text-[var(--text)] hover:opacity-70">
              {showSubForm ? "Close" : "Add"}
            </button>
          </div>

          {showSubForm && (
            <div className="grid gap-3 border border-[var(--border)] bg-[var(--bg)] rounded-lg p-3 mb-4 md:grid-cols-3">
              <input className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] outline-none" placeholder="Netflix, Spotify..." value={subForm.name} onChange={(e) => setSubForm((f) => ({ ...f, name: e.target.value }))} />
              <input type="number" className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] outline-none" placeholder="Amount" value={subForm.amount} onChange={(e) => setSubForm((f) => ({ ...f, amount: e.target.value }))} />
              <input type="date" className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] outline-none" value={subForm.dueDate} onChange={(e) => setSubForm((f) => ({ ...f, dueDate: e.target.value }))} />
              <select className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] outline-none" value={subForm.frequency} onChange={(e) => setSubForm((f) => ({ ...f, frequency: e.target.value as SubscriptionFrequency }))}>
                {FREQUENCIES.map((freq) => <option key={freq.value} value={freq.value}>{freq.label}</option>)}
              </select>
              <input className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] outline-none" placeholder="Category" value={subForm.category} onChange={(e) => setSubForm((f) => ({ ...f, category: e.target.value }))} />
              <button onClick={addSubscription} className="bg-[var(--text)] text-[var(--bg)] rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--text-hover)]">Save</button>
            </div>
          )}

          <div className="grid gap-2 lg:grid-cols-2">
            {subscriptions.length === 0 ? (
              <p className="lg:col-span-2 text-sm text-[var(--muted)] text-center py-8">No subscriptions tracked yet.</p>
            ) : subscriptions.map((sub) => {
              const remaining = daysUntil(sub.dueDate);
              const dueLabel = remaining < 0 ? `${Math.abs(remaining)}d overdue` : remaining === 0 ? "Due today" : `${remaining}d left`;
              return (
                <div key={sub.id} className={cn("group rounded-lg border bg-[var(--bg)] p-3", sub.active ? "border-[var(--border)]" : "border-[var(--border)] opacity-55")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">{sub.name}</p>
                      <p className="text-xs text-[var(--muted)]">{sub.category} · {sub.frequency}</p>
                    </div>
                    <p className="font-mono text-sm font-semibold text-[var(--text)]">{formatCurrency(sub.amount)}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className={cn("text-xs rounded-full px-2 py-0.5", remaining <= 7 && sub.active ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--chip)] text-[var(--muted)]")}>{dueLabel}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleSubscription(sub.id)} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">{sub.active ? "Pause" : "Resume"}</button>
                      <button onClick={() => deleteSubscription(sub.id)} className="p-1 text-[var(--muted)] hover:text-[var(--text)]"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarClock className="w-4 h-4 text-[var(--text)]" />
            <h2 className="text-sm font-bold text-[var(--text)]">Payment Reminders</h2>
          </div>
          <div className="space-y-3">
            <StatCard label="Due This Week" value={String(dueSoon)} icon={<Bell className="w-4 h-4 text-[var(--text)]" />} />
            <StatCard label="Monthly Subs" value={formatCurrency(monthlySubscriptions)} icon={<CreditCard className="w-4 h-4 text-[var(--text)]" />} />
          </div>
        </div>
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
        <div className="w-full bg-[var(--chip)] rounded-full h-2 mb-2">
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
                          : "bg-[var(--text)] text-[var(--bg)]"
                        : "bg-[var(--surface-2)] text-[var(--muted)] hover:bg-[var(--chip)]"
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
      <WalletSection onTotalUpdate={handleTotalUpdate} />
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
