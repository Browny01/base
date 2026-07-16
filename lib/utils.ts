import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function formatAUD(amount: number, compact = false): string {
  if (compact && Math.abs(amount) >= 1000) {
    const val = amount / 1000;
    return `A$${val.toLocaleString("en-AU", { maximumFractionDigits: 1 })}k`;
  }
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

export function calcStreak(logs: { date: string; completed: boolean }[]): number {
  const today = getToday();
  const sorted = [...logs]
    .filter((l) => l.completed)
    .sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  let cur = new Date(today);
  for (const log of sorted) {
    const d = cur.toISOString().split("T")[0];
    if (log.date === d) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    } else if (log.date < d) {
      break;
    }
  }
  return streak;
}
