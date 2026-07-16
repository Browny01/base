"use client";

import { useState, useEffect, useCallback } from "react";
import { useNexus } from "@/lib/hooks";
import { uid } from "@/lib/utils";
import type { SocialStat, SocialPlatform, BusinessKPI } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  RefreshCw, Plus, Pencil, X, Check, ExternalLink, Calendar,
  TrendingUp, TrendingDown, Briefcase, DollarSign, Users, Zap, ArrowRight,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import Link from "next/link";

// ── Types from API routes ──────────────────────────────────────────────────────

interface StripeData {
  configured: boolean;
  error?: string;
  balance?: number;
  currency?: string;
  monthlyRevenue?: number;
  transactionCount?: number;
  avgOrder?: number;
  customerCount?: number;
  recentCharges?: { id: string; amount: number; currency: string; description: string; date: string }[];
  dailyRevenue?: { date: string; amount: number }[];
}

interface CalcomData {
  configured: boolean;
  error?: string;
  upcoming?: { id: number; title: string; startTime: string; endTime: string; status: string; attendee: string }[];
  todayCount?: number;
  weekCount?: number;
  monthCount?: number;
}

// ── Social platform config ─────────────────────────────────────────────────────

const SOCIAL_CONFIG: Record<SocialPlatform, {
  label: string; color: string; bg: string; text: string; border: string;
  fields: { key: keyof SocialStat; label: string; suffix?: string }[];
}> = {
  x:         { label: "X",         color: "#0a0a0a", bg: "bg-[var(--chip)]",    text: "text-[var(--text)]",       border: "border-[var(--border)]",
                fields: [{ key: "followers", label: "Followers" }, { key: "following", label: "Following" }, { key: "posts", label: "Posts" }, { key: "monthlyGrowth", label: "Monthly Growth" }] },
  instagram: { label: "Instagram", color: "#737373", bg: "bg-[var(--chip)]",     text: "text-[var(--text)]",    border: "border-[var(--border-2)]",
                fields: [{ key: "followers", label: "Followers" }, { key: "posts", label: "Posts" }, { key: "avgViews", label: "Avg Views" }, { key: "engagementRate", label: "Eng Rate", suffix: "%" }] },
  tiktok:    { label: "TikTok",    color: "#737373", bg: "bg-[var(--chip)]",     text: "text-[var(--text)]",    border: "border-[var(--border-2)]",
                fields: [{ key: "followers", label: "Followers" }, { key: "avgViews", label: "Avg Views" }, { key: "posts", label: "Videos" }, { key: "monthlyGrowth", label: "Monthly Growth" }] },
  linkedin:  { label: "LinkedIn",  color: "#737373", bg: "bg-[var(--chip)]",     text: "text-[var(--text)]",    border: "border-[var(--border-2)]",
                fields: [{ key: "followers", label: "Connections" }, { key: "posts", label: "Posts" }, { key: "monthlyGrowth", label: "Monthly Growth" }] },
  youtube:   { label: "YouTube",   color: "#0a0a0a", bg: "bg-[var(--chip)]",      text: "text-[var(--text)]",     border: "border-[var(--border-2)]",
                fields: [{ key: "followers", label: "Subscribers" }, { key: "avgViews", label: "Avg Views" }, { key: "posts", label: "Videos" }, { key: "monthlyGrowth", label: "Monthly Growth" }] },
};

const KPI_COLORS: Record<string, string> = {
  indigo: "bg-[var(--chip)] text-[var(--text)] border-[var(--border-2)]",
  cyan:   "bg-[var(--chip)]   text-[var(--text)]   border-[var(--border-2)]",
  emerald:"bg-[var(--chip)] text-[var(--text)] border-[var(--border-2)]",
  violet: "bg-[var(--chip)] text-[var(--text)]  border-[var(--border-2)]",
  yellow: "bg-[var(--chip)] text-[var(--text)]  border-[var(--border-2)]",
  pink:   "bg-[var(--chip)]   text-[var(--text)]    border-[var(--border-2)]",
  red:    "bg-[var(--chip)]    text-[var(--text)]     border-[var(--border-2)]",
  teal:   "bg-[var(--chip)]   text-[var(--text)]    border-[var(--border-2)]",
};

function fmt(n: number, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}
function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-AU", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const inputCls = "w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors";

// ── Connect prompt ─────────────────────────────────────────────────────────────

function ConnectCard({ name, envVar, docsUrl, icon, description }: {
  name: string; envVar: string; docsUrl?: string; icon: React.ReactNode; description: string;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex flex-col items-center text-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-[var(--chip)] flex items-center justify-center text-2xl">{icon}</div>
      <div>
        <p className="text-sm font-bold text-[var(--text)]">{name} not connected</p>
        <p className="text-xs text-[var(--faint)] mt-1">{description}</p>
      </div>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2 w-full text-left">
        <p className="text-[10px] text-[var(--faint)] uppercase tracking-wider mb-1">Add to Vercel Environment Variables</p>
        <code className="text-xs text-[var(--text)] font-mono">{envVar}</code>
      </div>
      {docsUrl && (
        <a href={docsUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-[var(--text)] hover:text-[var(--text)] transition-colors">
          View setup guide <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

// ── Stripe section ─────────────────────────────────────────────────────────────

function StripeSection({ data, loading }: { data: StripeData | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex items-center justify-center h-48">
        <RefreshCw className="w-5 h-5 text-[var(--faint)] animate-spin" />
      </div>
    );
  }
  if (!data?.configured) {
    return (
      <ConnectCard name="Stripe" envVar="STRIPE_SECRET_KEY=sk_live_..." icon="💳"
        description="Connect Stripe to see live revenue, transactions, and customer data."
        docsUrl="https://dashboard.stripe.com/apikeys"
      />
    );
  }
  if (data.error) {
    return (
      <div className="bg-[var(--chip)] border border-[var(--border-2)] rounded-2xl p-5 text-sm text-[var(--text)]">
        Stripe error: {data.error}
      </div>
    );
  }

  const currency = data.currency ?? "AUD";
  const tooltipStyle = { backgroundColor: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", color: "#ffffff", fontSize: "11px", fontFamily: "var(--font-sans)" };

  return (
    <div className="space-y-4">
      {/* Stripe stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Balance",           value: fmt(data.balance ?? 0, currency),           icon: <DollarSign className="w-3.5 h-3.5" />, color: "emerald" },
          { label: "Revenue (30d)",     value: fmt(data.monthlyRevenue ?? 0, currency),    icon: <TrendingUp className="w-3.5 h-3.5" />,  color: "indigo"  },
          { label: "Transactions",      value: (data.transactionCount ?? 0).toString(),    icon: <Zap className="w-3.5 h-3.5" />,        color: "cyan"    },
          { label: "Avg Order",         value: fmt(data.avgOrder ?? 0, currency),          icon: <TrendingUp className="w-3.5 h-3.5" />,  color: "violet"  },
        ].map(s => (
          <div key={s.label} className={cn("bg-[var(--surface)] border rounded-xl p-4", KPI_COLORS[s.color])}>
            <div className="flex items-center gap-2 mb-2">
              <div className={cn("p-1.5 rounded-lg", KPI_COLORS[s.color].split(" ")[0])}>{s.icon}</div>
              <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-[var(--faint)]">{s.label}</p>
            </div>
            <p className="text-xl font-extrabold text-[var(--text)] tabular">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue chart + transactions */}
      <div className="grid md:grid-cols-[1fr_300px] gap-4">
        {/* Chart */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
          <p className="text-xs font-bold text-[var(--faint)] uppercase tracking-wider mb-4">Daily Revenue — Last 30 Days</p>
          {(data.dailyRevenue?.some(d => d.amount > 0)) ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={data.dailyRevenue}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#0a0a0a" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0a0a0a" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#e5e5e5" />
                <XAxis dataKey="date" tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, "Revenue"]} />
                <Area type="monotone" dataKey="amount" stroke="#0a0a0a" strokeWidth={1.5} fill="url(#revGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-[var(--faint)]">No revenue in the last 30 days</div>
          )}
        </div>

        {/* Recent transactions */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
          <p className="text-xs font-bold text-[var(--faint)] uppercase tracking-wider mb-4">Recent Transactions</p>
          {(data.recentCharges?.length ?? 0) === 0 ? (
            <p className="text-sm text-[var(--faint)]">No recent transactions</p>
          ) : (
            <div className="space-y-2">
              {data.recentCharges!.map(c => (
                <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-[var(--border)] last:border-0">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text)] truncate">{c.description}</p>
                    <p className="text-[10px] text-[var(--faint)]">{c.date}</p>
                  </div>
                  <p className="text-sm font-bold text-[var(--text)] tabular shrink-0 ml-3">+{fmt(c.amount, c.currency)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Cal.com section ────────────────────────────────────────────────────────────

function CalcomSection({ data, loading }: { data: CalcomData | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex items-center justify-center h-36">
        <RefreshCw className="w-5 h-5 text-[var(--faint)] animate-spin" />
      </div>
    );
  }
  if (!data?.configured) {
    return (
      <ConnectCard name="Cal.com" envVar="CALCOM_API_KEY=cal_live_..." icon="📅"
        description="Connect Cal.com to see upcoming bookings and meeting stats."
        docsUrl="https://app.cal.com/settings/developer/api-keys"
      />
    );
  }
  if (data.error) {
    return (
      <div className="bg-[var(--chip)] border border-[var(--border-2)] rounded-2xl p-5 text-sm text-[var(--text)]">
        Cal.com error: {data.error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Booking counts */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Today",      value: data.todayCount ?? 0, color: "bg-[var(--chip)] text-[var(--text)] border-[var(--border-2)]" },
          { label: "This Week",  value: data.weekCount  ?? 0, color: "bg-[var(--chip)]   text-[var(--text)]   border-[var(--border-2)]"   },
          { label: "This Month", value: data.monthCount ?? 0, color: "bg-[var(--chip)] text-[var(--text)] border-[var(--border-2)]" },
        ].map(s => (
          <div key={s.label} className={cn("border rounded-xl p-4 text-center", s.color)}>
            <p className="text-[10px] uppercase tracking-wider font-bold text-[var(--faint)] mb-1">{s.label}</p>
            <p className="text-3xl font-extrabold text-[var(--text)] tabular">{s.value}</p>
            <p className="text-[11px] text-[var(--faint)] mt-0.5">bookings</p>
          </div>
        ))}
      </div>

      {/* Upcoming list */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
        <p className="text-xs font-bold text-[var(--faint)] uppercase tracking-wider mb-4">Upcoming Bookings</p>
        {(data.upcoming?.length ?? 0) === 0 ? (
          <p className="text-sm text-[var(--faint)]">No upcoming bookings</p>
        ) : (
          <div className="space-y-2">
            {data.upcoming!.map(b => (
              <div key={b.id} className="flex items-start gap-3 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-[var(--chip)] flex items-center justify-center shrink-0 mt-0.5">
                  <Calendar className="w-4 h-4 text-[var(--text)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text)] truncate">{b.title}</p>
                  <p className="text-xs text-[var(--faint)] mt-0.5">{fmtTime(b.startTime)}</p>
                  <p className="text-xs text-[var(--faint)]">with {b.attendee}</p>
                </div>
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0",
                  b.status === "ACCEPTED" ? "bg-[var(--chip)] text-[var(--text)]" : "bg-[var(--chip)] text-[var(--text)]"
                )}>{b.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Social media section ───────────────────────────────────────────────────────

function SocialCard({ stat, onEdit }: { stat: SocialStat; onEdit: (s: SocialStat) => void }) {
  const cfg = SOCIAL_CONFIG[stat.platform];
  return (
    <div className={cn("bg-[var(--surface)] border rounded-2xl p-5 group", cfg.border)}>
      <div className="flex items-center justify-between mb-4">
        <div className={cn("flex items-center gap-2")}>
          <span className="text-lg">{
            { x: "𝕏", instagram: "📸", tiktok: "🎵", linkedin: "💼", youtube: "▶️" }[stat.platform]
          }</span>
          <span className={cn("text-sm font-bold", cfg.text)}>{cfg.label}</span>
        </div>
        <button onClick={() => onEdit(stat)}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-[var(--chip)] text-[var(--faint)] hover:text-[var(--text)] transition-all">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[10px] text-[var(--faint)] uppercase tracking-wider mb-0.5">Followers</p>
          <p className="text-2xl font-extrabold text-[var(--text)] tabular">{fmtNum(stat.followers)}</p>
          {(stat.monthlyGrowth ?? 0) !== 0 && (
            <p className={cn("text-xs font-semibold flex items-center gap-1 mt-0.5",
              (stat.monthlyGrowth ?? 0) > 0 ? "text-[var(--text)]" : "text-[var(--text)]"
            )}>
              {(stat.monthlyGrowth ?? 0) > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {(stat.monthlyGrowth ?? 0) > 0 ? "+" : ""}{fmtNum(stat.monthlyGrowth ?? 0)} this month
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border)]">
          {(stat.posts ?? 0) > 0 && (
            <div>
              <p className="text-[10px] text-[var(--faint)]">Posts</p>
              <p className="text-sm font-bold text-[var(--text)]">{fmtNum(stat.posts ?? 0)}</p>
            </div>
          )}
          {(stat.avgViews ?? 0) > 0 && (
            <div>
              <p className="text-[10px] text-[var(--faint)]">Avg Views</p>
              <p className="text-sm font-bold text-[var(--text)]">{fmtNum(stat.avgViews ?? 0)}</p>
            </div>
          )}
          {(stat.engagementRate ?? 0) > 0 && (
            <div>
              <p className="text-[10px] text-[var(--faint)]">Engagement</p>
              <p className="text-sm font-bold text-[var(--text)]">{stat.engagementRate}%</p>
            </div>
          )}
        </div>
        {stat.lastUpdated && (
          <p className="text-[10px] text-[var(--faint)]">Updated {stat.lastUpdated}</p>
        )}
      </div>
    </div>
  );
}

function EditSocialModal({ stat, onSave, onClose }: {
  stat: SocialStat; onSave: (s: SocialStat) => void; onClose: () => void;
}) {
  const cfg = SOCIAL_CONFIG[stat.platform];
  const [form, setForm] = useState({ ...stat });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className={cn("flex items-center justify-between px-5 py-4 border-b border-[var(--border)]", cfg.bg, cfg.border)}>
          <p className={cn("text-sm font-bold", cfg.text)}>Edit {cfg.label} Stats</p>
          <button onClick={onClose} className="text-[var(--faint)] hover:text-[var(--text)] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          {cfg.fields.map(field => (
            <div key={field.key}>
              <label className="text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-bold block mb-1.5">
                {field.label}{field.suffix ? ` (${field.suffix})` : ""}
              </label>
              <input type="number" className={inputCls}
                value={(form[field.key] as number | undefined) ?? ""}
                onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value ? parseFloat(e.target.value) : 0 }))}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-[var(--faint)] border border-[var(--border)] rounded-xl hover:text-[var(--text)] transition-colors">Cancel</button>
          <button onClick={() => { onSave({ ...form, lastUpdated: new Date().toISOString().split("T")[0] }); onClose(); }}
            className="flex-1 py-2 text-sm font-semibold text-[var(--bg)] bg-[var(--text)] hover:bg-[var(--text-hover)] rounded-xl transition-colors">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Business KPIs ──────────────────────────────────────────────────────────────

function KPICard({ kpi, onEdit }: { kpi: BusinessKPI; onEdit: (k: BusinessKPI) => void }) {
  const colorCls = KPI_COLORS[kpi.color] ?? KPI_COLORS.indigo;
  const [bg, text] = colorCls.split(" ");
  return (
    <div className={cn("bg-[var(--surface)] border rounded-2xl p-5 group cursor-pointer hover:border-[var(--border)] transition-all", colorCls.split(" ")[2] ?? "border-[var(--border)]")}
      onClick={() => onEdit(kpi)}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-sm", bg)}>{kpi.icon}</div>
          <p className="text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-bold">{kpi.label}</p>
        </div>
        <Pencil className="w-3.5 h-3.5 text-[var(--faint)] opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="text-2xl font-extrabold text-[var(--text)] tabular">
        {kpi.prefix ?? ""}{kpi.value}{kpi.suffix ?? ""}
      </p>
      {kpi.change !== undefined && kpi.change !== 0 && (
        <p className={cn("text-xs font-semibold flex items-center gap-1 mt-1",
          kpi.change > 0 ? "text-[var(--text)]" : "text-[var(--text)]")}>
          {kpi.change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {kpi.change > 0 ? "+" : ""}{kpi.change}% MOM
        </p>
      )}
      {kpi.lastUpdated && <p className="text-[10px] text-[var(--faint)] mt-1">Updated {kpi.lastUpdated}</p>}
    </div>
  );
}

function EditKPIModal({ kpi, onSave, onDelete, onClose }: {
  kpi: BusinessKPI; onSave: (k: BusinessKPI) => void; onDelete: (id: string) => void; onClose: () => void;
}) {
  const [form, setForm] = useState({ ...kpi });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }));
  const colors = Object.keys(KPI_COLORS);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <p className="text-sm font-bold text-[var(--text)]">Edit KPI</p>
          <button onClick={onClose} className="text-[var(--faint)] hover:text-[var(--text)] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-[10px] text-[var(--faint)] uppercase tracking-wider font-bold block mb-1.5">Label</label>
            <input className={inputCls} value={form.label} onChange={e => set("label", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-[10px] text-[var(--faint)] uppercase tracking-wider font-bold block mb-1.5">Value</label>
              <input className={inputCls} value={form.value} onChange={e => set("value", e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-[var(--faint)] uppercase tracking-wider font-bold block mb-1.5">Emoji</label>
              <input className={inputCls} value={form.icon} onChange={e => set("icon", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-[var(--faint)] uppercase tracking-wider font-bold block mb-1.5">Prefix</label>
              <input className={inputCls} placeholder="e.g. $" value={form.prefix ?? ""} onChange={e => set("prefix", e.target.value || undefined)} />
            </div>
            <div>
              <label className="text-[10px] text-[var(--faint)] uppercase tracking-wider font-bold block mb-1.5">Suffix</label>
              <input className={inputCls} placeholder="e.g. %" value={form.suffix ?? ""} onChange={e => set("suffix", e.target.value || undefined)} />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-[var(--faint)] uppercase tracking-wider font-bold block mb-1.5">MOM Change (%)</label>
            <input type="number" className={inputCls} placeholder="e.g. 12 or -5"
              value={form.change ?? ""} onChange={e => set("change", e.target.value ? parseFloat(e.target.value) : undefined)} />
          </div>
          <div>
            <label className="text-[10px] text-[var(--faint)] uppercase tracking-wider font-bold block mb-2">Color</label>
            <div className="flex flex-wrap gap-2">
              {colors.map(c => (
                <button key={c} onClick={() => set("color", c)}
                  className={cn("w-6 h-6 rounded-full border-2 transition-all",
                    form.color === c ? "border-white scale-110" : "border-transparent opacity-50 hover:opacity-100"
                  )}
                  style={{ background: { indigo:"#0a0a0a",cyan:"#737373",emerald:"#0a0a0a",violet:"#525252",yellow:"#a3a3a3",pink:"#8a8a8a",red:"#0a0a0a",teal:"#c4c4c4" }[c] }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between px-5 pb-5">
          <button onClick={() => { onDelete(kpi.id); onClose(); }}
            className="text-xs text-[var(--text)] hover:text-[var(--text)] transition-colors">Delete</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-[var(--faint)] hover:text-[var(--text)] transition-colors">Cancel</button>
            <button onClick={() => { onSave({ ...form, lastUpdated: new Date().toISOString().split("T")[0] }); onClose(); }}
              className="px-4 py-1.5 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs font-semibold rounded-lg transition-colors">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add KPI modal ──────────────────────────────────────────────────────────────

function AddKPIModal({ onAdd, onClose }: { onAdd: (k: BusinessKPI) => void; onClose: () => void }) {
  const [form, setForm] = useState({ label: "", value: "0", icon: "📊", color: "indigo", prefix: "", suffix: "", category: "custom" });
  const set = <K extends keyof typeof form>(k: K, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <p className="text-sm font-bold text-[var(--text)]">Add KPI</p>
          <button onClick={onClose} className="text-[var(--faint)] hover:text-[var(--text)] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-[10px] text-[var(--faint)] uppercase tracking-wider font-bold block mb-1.5">Label</label>
            <input autoFocus className={inputCls} placeholder="e.g. Email Subscribers" value={form.label} onChange={e => set("label", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-[10px] text-[var(--faint)] uppercase tracking-wider font-bold block mb-1.5">Value</label>
              <input className={inputCls} placeholder="0" value={form.value} onChange={e => set("value", e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-[var(--faint)] uppercase tracking-wider font-bold block mb-1.5">Icon</label>
              <input className={inputCls} value={form.icon} onChange={e => set("icon", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-[10px] text-[var(--faint)] uppercase tracking-wider font-bold block mb-1.5">Prefix</label>
              <input className={inputCls} placeholder="$" value={form.prefix} onChange={e => set("prefix", e.target.value)} /></div>
            <div><label className="text-[10px] text-[var(--faint)] uppercase tracking-wider font-bold block mb-1.5">Suffix</label>
              <input className={inputCls} placeholder="%" value={form.suffix} onChange={e => set("suffix", e.target.value)} /></div>
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-[var(--faint)] border border-[var(--border)] rounded-xl hover:text-[var(--text)] transition-colors">Cancel</button>
          <button onClick={() => {
            if (!form.label.trim()) return;
            onAdd({ id: uid(), ...form, prefix: form.prefix || undefined, suffix: form.suffix || undefined, lastUpdated: new Date().toISOString().split("T")[0] });
            onClose();
          }} className="flex-1 py-2 text-sm font-semibold text-[var(--bg)] bg-[var(--text)] hover:bg-[var(--text-hover)] rounded-xl transition-colors">Add</button>
        </div>
      </div>
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, sub, action }: {
  icon: React.ReactNode; title: string; sub?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-1.5 h-5 rounded-full bg-[var(--chip)]" />
        <div className="flex items-center gap-2">{icon}
          <div>
            <h2 className="text-sm font-bold text-[var(--text)]">{title}</h2>
            {sub && <p className="text-xs text-[var(--faint)]">{sub}</p>}
          </div>
        </div>
      </div>
      {action}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function BusinessPage() {
  const { data, mutate } = useNexus();
  const [stripeData, setStripeData]   = useState<StripeData | null>(null);
  const [calcomData, setCalcomData]   = useState<CalcomData | null>(null);
  const [loadingStripe, setLS]        = useState(true);
  const [loadingCalcom, setLC]        = useState(true);
  const [editingSocial, setEditSocial] = useState<SocialStat | null>(null);
  const [editingKPI, setEditKPI]      = useState<BusinessKPI | null>(null);
  const [showAddKPI, setShowAddKPI]   = useState(false);

  const fetchData = useCallback(async () => {
    setLS(true); setLC(true);
    fetch("/api/stripe/stats")
      .then(r => r.json()).then(setStripeData).catch(() => setStripeData(null))
      .finally(() => setLS(false));
    fetch("/api/calcom/bookings")
      .then(r => r.json()).then(setCalcomData).catch(() => setCalcomData(null))
      .finally(() => setLC(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  function updateSocial(updated: SocialStat) {
    mutate(d => ({
      ...d,
      socialStats: (d.socialStats ?? []).map(s => s.platform === updated.platform ? updated : s),
    }));
  }

  function updateKPI(updated: BusinessKPI) {
    mutate(d => ({
      ...d,
      businessKPIs: (d.businessKPIs ?? []).map(k => k.id === updated.id ? updated : k),
    }));
  }

  function deleteKPI(id: string) {
    mutate(d => ({ ...d, businessKPIs: (d.businessKPIs ?? []).filter(k => k.id !== id) }));
  }

  function addKPI(kpi: BusinessKPI) {
    mutate(d => ({ ...d, businessKPIs: [...(d.businessKPIs ?? []), kpi] }));
  }

  const social = data.socialStats ?? [];
  const kpis   = data.businessKPIs ?? [];
  const today  = new Date().toISOString().split("T")[0];

  // Quick top-line numbers
  const todayRevenue = (data.incomeEntries ?? [])
    .filter(e => e.date === today && e.type === "income")
    .reduce((s, e) => s + e.amount, 0);

  const activeProjects = (data.projects ?? []).filter(p => p.status === "active");

  return (
    <div className="p-4 sm:p-6 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Briefcase className="w-5 h-5 text-[var(--text)]" />
            <h1 className="text-[1.6rem] font-extrabold text-[var(--text)] tracking-tight">Business</h1>
          </div>
          <p className="text-sm text-[var(--faint)] font-medium">Revenue, bookings, social & metrics — all in one place.</p>
        </div>
        <button onClick={fetchData}
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[var(--faint)] hover:text-[var(--text)] bg-[var(--chip)] hover:bg-[var(--chip)] border border-[var(--border)] rounded-lg transition-all">
          <RefreshCw className={cn("w-3.5 h-3.5", (loadingStripe || loadingCalcom) && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Top-line quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Revenue Today",    value: `$${todayRevenue.toFixed(2)}`,           color: "emerald", icon: <DollarSign className="w-3.5 h-3.5 text-[var(--text)]" /> },
          { label: "Bookings Today",   value: (calcomData?.todayCount ?? "—").toString(), color: "indigo",  icon: <Calendar className="w-3.5 h-3.5 text-[var(--text)]" /> },
          { label: "Active Projects",  value: activeProjects.length.toString(),         color: "cyan",    icon: <Briefcase className="w-3.5 h-3.5 text-[var(--text)]" /> },
          { label: "Active Clients",   value: kpis.find(k => k.id === "clients")?.value ?? "0", color: "violet", icon: <Users className="w-3.5 h-3.5 text-[var(--text)]" /> },
        ].map(s => (
          <div key={s.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn("p-1.5 rounded-lg", `bg-${s.color}-500/10`)}>{s.icon}</div>
              <p className="text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-bold">{s.label}</p>
            </div>
            <p className="text-xl font-extrabold text-[var(--text)] tabular">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Stripe */}
      <section>
        <SectionHeader
          icon={<span className="text-sm">💳</span>}
          title="Stripe Revenue"
          sub={stripeData?.configured ? "Live data from your Stripe account" : "Not connected"}
          action={
            stripeData?.configured ? (
              <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-[var(--text)] hover:text-[var(--text)] transition-colors">
                Dashboard <ExternalLink className="w-3 h-3" />
              </a>
            ) : undefined
          }
        />
        <StripeSection data={stripeData} loading={loadingStripe} />
      </section>

      {/* Cal.com */}
      <section>
        <SectionHeader
          icon={<span className="text-sm">📅</span>}
          title="Bookings"
          sub={calcomData?.configured ? "Live from Cal.com" : "Not connected"}
          action={
            calcomData?.configured ? (
              <a href="https://app.cal.com" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-[var(--text)] hover:text-[var(--text)] transition-colors">
                Cal.com <ExternalLink className="w-3 h-3" />
              </a>
            ) : undefined
          }
        />
        <CalcomSection data={calcomData} loading={loadingCalcom} />
      </section>

      {/* Business KPIs */}
      <section>
        <SectionHeader
          icon={<TrendingUp className="w-4 h-4 text-[var(--text)]" />}
          title="Business KPIs"
          sub="Click any card to update"
          action={
            <button onClick={() => setShowAddKPI(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--faint)] hover:text-[var(--text)] bg-[var(--chip)] hover:bg-[var(--chip)] border border-[var(--border)] rounded-lg transition-all">
              <Plus className="w-3.5 h-3.5" /> Add KPI
            </button>
          }
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {kpis.map(kpi => (
            <KPICard key={kpi.id} kpi={kpi} onEdit={setEditKPI} />
          ))}
        </div>
      </section>

      {/* Social Media */}
      <section>
        <SectionHeader
          icon={<span className="text-sm">📱</span>}
          title="Social Media"
          sub="Hover a card to edit — update manually"
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {social.map(s => (
            <SocialCard key={s.platform} stat={s} onEdit={setEditSocial} />
          ))}
        </div>
      </section>

      {/* Active Projects quick view */}
      <section>
        <SectionHeader
          icon={<Briefcase className="w-4 h-4 text-[var(--text)]" />}
          title="Active Projects"
          sub={`${activeProjects.length} running`}
          action={
            <Link href="/projects" className="flex items-center gap-1 text-xs text-[var(--text)] hover:text-[var(--text)] transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          }
        />
        {activeProjects.length === 0 ? (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 text-center text-sm text-[var(--faint)]">
            No active projects. <Link href="/projects" className="text-[var(--text)] hover:text-[var(--text)]">Create one →</Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeProjects.map(proj => {
              const openTasks = (data.tasks ?? []).filter(t => t.projectId === proj.id && !t.done).length;
              const docs      = (data.projectDocuments ?? []).filter(d => d.projectId === proj.id).length;
              return (
                <Link key={proj.id} href={`/projects/${proj.id}`}
                  className="bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border)] rounded-xl p-4 flex items-center gap-3 transition-all group">
                  <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", {
                    indigo:"bg-[var(--text)]", cyan:"bg-[var(--text)]", emerald:"bg-[var(--text)]",
                    yellow:"bg-[var(--text)]", red:"bg-[var(--text)]", purple:"bg-[var(--text)]",
                    orange:"bg-[var(--text)]", pink:"bg-[var(--text)]"
                  }[proj.color])} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--text)] truncate group-hover:text-[var(--text)] transition-colors">{proj.name}</p>
                    <p className="text-xs text-[var(--faint)]">{openTasks} tasks · {docs} docs</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-[var(--faint)] group-hover:text-[var(--text)] transition-colors shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Modals */}
      {editingSocial && <EditSocialModal stat={editingSocial} onSave={updateSocial} onClose={() => setEditSocial(null)} />}
      {editingKPI    && <EditKPIModal   kpi={editingKPI}     onSave={updateKPI}    onDelete={deleteKPI} onClose={() => setEditKPI(null)} />}
      {showAddKPI    && <AddKPIModal    onAdd={addKPI}        onClose={() => setShowAddKPI(false)} />}
    </div>
  );
}
