import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { readCurrentData } from "@/lib/bridge-data";
import { bridgeAgentToken } from "@/lib/env";
import { calcStreak } from "@/lib/utils";

// Read-only summary for the iOS home-screen widget. Guarded by a token (query
// ?token= or x-bridge-token header) so it can be fetched from the WidgetKit
// timeline provider without the app running. Single-user app → one shared blob.
export const dynamic = "force-dynamic";

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const unwrap = (data: unknown): unknown => {
  if (typeof data === "string") { try { return JSON.parse(data); } catch { return data; } }
  return data;
};

type AnyRec = Record<string, unknown>;
const arr = (v: unknown): AnyRec[] => (Array.isArray(v) ? (v as AnyRec[]) : []);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const day = (v: unknown): string => (typeof v === "string" ? v.slice(0, 10) : "");

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || req.headers.get("x-bridge-token") || "";
  const expected = bridgeAgentToken();
  if (token !== expected) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const data = unwrap(await readCurrentData(redis)) as AnyRec | null;
  if (!data) return NextResponse.json({ error: "no data" }, { status: 404 });

  // The device passes its LOCAL date so "today" matches what the app shows.
  const today = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

  const tasks = arr(data.tasks);
  const habits = arr(data.habits);
  const habitLogs = arr(data.habitLogs) as { date: string; completed: boolean; habitId: string }[];
  const income = arr(data.incomeEntries);
  const snaps = arr(data.portfolioSnapshots);

  const tasksLeft = tasks.filter((t) => !t.done && (t.dueDate === today || !t.dueDate)).length;
  const doneToday = tasks.filter((t) => t.done && day(t.completedAt ?? t.createdAt) === today).length;

  const habitsDone = habitLogs.filter((l) => l.date === today && l.completed).length;
  const habitsTotal = habits.length;
  const streak = habits.length
    ? Math.max(0, ...habits.map((h) => calcStreak(habitLogs.filter((l) => l.habitId === (h.id as string)), today)))
    : 0;

  const revenueToday = income
    .filter((e) => e.date === today && e.type === "income")
    .reduce((s, e) => s + num(e.amount), 0);
  const revenueTarget = num(data.dailyRevenueTarget);

  const last14 = snaps.slice(-14);
  const portfolio = snaps.length ? num((snaps[snaps.length - 1] as AnyRec).totalAud) : null;
  const first = last14.length ? num((last14[0] as AnyRec).totalAud) : 0;
  const lastV = last14.length ? num((last14[last14.length - 1] as AnyRec).totalAud) : 0;
  const portfolioPct = last14.length >= 2 && first > 0 ? ((lastV - first) / first) * 100 : null;

  return NextResponse.json(
    {
      date: today,
      tasksLeft, doneToday,
      habitsDone, habitsTotal,
      streak,
      revenueToday, revenueTarget,
      portfolio, portfolioPct,
      updatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
