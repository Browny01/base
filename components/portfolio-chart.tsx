"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import { formatAUD } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { PortfolioSnapshot } from "@/lib/store";

type PnlPeriod = "Day" | "Week" | "Month" | "Year";
type ChartRange = "7D" | "1M" | "3M" | "All";

const PNL_DAYS: Record<PnlPeriod, number> = { Day: 1, Week: 7, Month: 30, Year: 365 };
const RANGE_DAYS: Record<ChartRange, number> = { "7D": 7, "1M": 30, "3M": 90, All: 9999 };

function getPastDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function findClosestSnapshot(
  snapshots: PortfolioSnapshot[],
  targetDate: string
): PortfolioSnapshot | null {
  if (snapshots.length === 0) return null;
  // Find exact or nearest older snapshot
  const candidates = snapshots.filter((s) => s.date <= targetDate);
  if (candidates.length === 0) return null;
  return candidates[candidates.length - 1];
}

interface Props {
  snapshots: PortfolioSnapshot[];
  currentTotal: number | null;
}

export function PortfolioChart({ snapshots, currentTotal }: Props) {
  const [pnlPeriod, setPnlPeriod] = useState<PnlPeriod>("Day");
  const [chartRange, setChartRange] = useState<ChartRange>("1M");

  const today = new Date().toISOString().split("T")[0];

  // Build chart data within selected range
  const rangeDays = RANGE_DAYS[chartRange];
  const rangeStart = getPastDate(rangeDays);
  const chartData = [
    ...snapshots.filter((s) => s.date >= rangeStart),
    // Add current value as today if it's newer than last snapshot
    ...(currentTotal !== null &&
      (snapshots.length === 0 || snapshots[snapshots.length - 1]?.date < today)
      ? [{ date: today, totalAud: currentTotal }]
      : []),
  ].map((s) => ({
    date: new Date(s.date + "T00:00:00").toLocaleDateString("en-AU", {
      month: "short",
      day: "numeric",
    }),
    value: s.totalAud,
  }));

  // PNL calculation
  const pnlDays = PNL_DAYS[pnlPeriod];
  const pnlDate = getPastDate(pnlDays);
  const pastSnap = findClosestSnapshot(snapshots, pnlDate);
  const currentValue = currentTotal;

  let pnlAbs: number | null = null;
  let pnlPct: number | null = null;
  if (currentValue !== null && pastSnap !== null) {
    pnlAbs = currentValue - pastSnap.totalAud;
    pnlPct = (pnlAbs / pastSnap.totalAud) * 100;
  }

  const pnlUp = pnlAbs !== null ? pnlAbs >= 0 : null;

  // Chart color based on performance
  const isPositive = chartData.length >= 2
    ? (chartData[chartData.length - 1]?.value ?? 0) >= (chartData[0]?.value ?? 0)
    : true;
  const lineColor = isPositive ? "#0a0a0a" : "#0a0a0a";

  const totalDisplay = currentValue !== null
    ? formatAUD(currentValue)
    : snapshots.length > 0
    ? formatAUD(snapshots[snapshots.length - 1].totalAud)
    : null;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        {/* Balance display */}
        <div>
          <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">
            Total Portfolio
          </p>
          {totalDisplay ? (
            <p className="text-3xl font-bold text-[var(--text)]">{totalDisplay}</p>
          ) : (
            <p className="text-lg text-[var(--muted)]">Add wallets to track portfolio</p>
          )}

          {/* PNL */}
          <div className="flex items-center gap-3 mt-2">
            {pnlAbs !== null && pnlPct !== null ? (
              <span
                className={cn(
                  "flex items-center gap-1 text-sm font-semibold",
                  pnlUp ? "text-[var(--text)]" : "text-[var(--text)]"
                )}
              >
                {pnlUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {pnlUp ? "+" : ""}{formatAUD(pnlAbs)}
                <span className="text-xs font-normal opacity-80">
                  ({pnlUp ? "+" : ""}{pnlPct.toFixed(2)}%)
                </span>
              </span>
            ) : (
              <span className="text-sm text-[var(--muted)]">
                {snapshots.length < 2 ? "Collect more data for PNL" : "—"}
              </span>
            )}

            {/* PNL period switcher */}
            <div className="flex gap-0.5 bg-[var(--surface-2)] rounded-lg p-0.5">
              {(["Day", "Week", "Month", "Year"] as PnlPeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPnlPeriod(p)}
                  className={cn(
                    "px-2 py-1 text-xs rounded-md transition-colors font-medium",
                    pnlPeriod === p
                      ? "bg-[var(--surface-2)] text-[var(--text)]"
                      : "text-[var(--muted)] hover:text-[var(--text)]"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chart range switcher */}
        <div className="flex gap-0.5 bg-[var(--surface-2)] rounded-lg p-0.5 self-start">
          {(["7D", "1M", "3M", "All"] as ChartRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setChartRange(r)}
              className={cn(
                "px-2.5 py-1 text-xs rounded-md transition-colors font-medium",
                chartRange === r
                  ? "bg-[var(--surface-2)] text-[var(--text)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {chartData.length < 2 ? (
        <div className="flex items-center justify-center h-40 text-[var(--muted)] text-sm">
          {snapshots.length === 0
            ? "Chart will appear as you track your portfolio over time."
            : "Need at least 2 data points to draw a chart."}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={lineColor} stopOpacity={0.25} />
                <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#737373", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: "#737373", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={72}
              tickFormatter={(v: number) =>
                v >= 1000 ? `A$${(v / 1000).toFixed(0)}k` : `A$${v.toFixed(0)}`
              }
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0a0a0a",
                border: "1px solid #262626",
                borderRadius: "8px",
                color: "#0a0a0a",
                fontSize: "12px",
              }}
              formatter={(v: unknown) => [formatAUD(Number(v)), "Portfolio"]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={2}
              fill="url(#portfolioGrad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
