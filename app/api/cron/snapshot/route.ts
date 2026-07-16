import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import type { NexusData, Wallet } from "@/lib/store";

// This route is hit by a Vercel Cron Job once a day. It recomputes the
// portfolio's total AUD value server-side (no browser needed) and appends a
// daily snapshot to the same Redis blob the app reads — so the chart fills in
// every day even when the site is never opened.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KEY = "nexus:data";

function getRedis(): Redis | null {
  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const COINGECKO_ID: Record<Wallet["network"], string> = {
  bitcoin: "bitcoin",
  solana: "solana",
  ethereum: "ethereum",
  hyperevm: "hyperliquid",
};

async function getUsdToAud(origin: string): Promise<number> {
  try {
    const r = await fetch(`${origin}/api/fx/rate`, { cache: "no-store" });
    if (r.ok) { const d = await r.json(); if (typeof d.usdToAud === "number" && d.usdToAud > 0) return d.usdToAud; }
  } catch {}
  return 1.55;
}

async function getNativePrices(): Promise<Record<string, number | null>> {
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,hyperliquid&vs_currencies=usd",
      { cache: "no-store" }
    );
    if (!r.ok) return {};
    const d = await r.json();
    return {
      bitcoin: d.bitcoin?.usd ?? null,
      ethereum: d.ethereum?.usd ?? null,
      solana: d.solana?.usd ?? null,
      hyperliquid: d.hyperliquid?.usd ?? null,
    };
  } catch { return {}; }
}

// Fetch JSON with one retry — guards a daily snapshot against a single flaky
// upstream call (RPCs / price APIs occasionally rate-limit).
async function fetchJsonRetry(url: string, attempts = 2): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json();
      if (res.ok && !body.error) return { ok: true, body };
      if (i === attempts - 1) return { ok: false, body };
    } catch {
      if (i === attempts - 1) return { ok: false, body: {} };
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  return { ok: false, body: {} };
}

async function walletTotalAud(w: Wallet, origin: string, rate: number, prices: Record<string, number | null>): Promise<number> {
  let total = 0;
  // native coin value
  const { body: balData } = await fetchJsonRetry(
    `${origin}/api/wallet/balance?network=${encodeURIComponent(w.network)}&address=${encodeURIComponent(w.address)}`
  );
  const balance = typeof balData.balance === "number" ? balData.balance : 0;
  const priceUsd = prices[COINGECKO_ID[w.network]];
  if (priceUsd != null) total += balance * priceUsd * rate;

  // SPL / ERC-20 token value (already in AUD)
  if (w.network === "solana" || w.network === "ethereum") {
    const { body: tokData } = await fetchJsonRetry(
      `${origin}/api/wallet/tokens?network=${encodeURIComponent(w.network)}&address=${encodeURIComponent(w.address)}`
    );
    for (const t of (tokData.tokens ?? []) as { valueAud: number | null }[]) {
      if (typeof t.valueAud === "number") total += t.valueAud;
    }
  }
  return total;
}

async function run(req: NextRequest) {
  // Auth: when CRON_SECRET is configured, require Vercel's bearer header.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    const key = new URL(req.url).searchParams.get("key");
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const redis = getRedis();
  if (!redis) return NextResponse.json({ ok: false, error: "redis not configured" });

  // Load current data blob (may be double-encoded)
  let data = (await redis.get(KEY)) as NexusData | string | null;
  if (typeof data === "string") { try { data = JSON.parse(data) as NexusData; } catch { data = null; } }
  if (!data || typeof data !== "object") return NextResponse.json({ ok: false, error: "no data" });

  const wallets = data.wallets ?? [];
  if (wallets.length === 0) return NextResponse.json({ ok: true, skipped: "no wallets" });

  const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : new URL(req.url).origin;
  const [rate, prices] = await Promise.all([getUsdToAud(origin), getNativePrices()]);

  const totals = await Promise.all(wallets.map(w => walletTotalAud(w, origin, rate, prices)));
  const grandTotal = totals.reduce((a, b) => a + b, 0);

  if (!(grandTotal > 0)) return NextResponse.json({ ok: false, error: "computed total is 0 — leaving data untouched" });

  // Upsert today's snapshot (UTC date, matching the client's getToday())
  const today = new Date().toISOString().split("T")[0];
  const snapshots = [...(data.portfolioSnapshots ?? [])];
  const idx = snapshots.findIndex(s => s.date === today);
  if (idx >= 0) snapshots[idx] = { date: today, totalAud: grandTotal };
  else snapshots.push({ date: today, totalAud: grandTotal });
  snapshots.sort((a, b) => a.date.localeCompare(b.date));

  const next: NexusData = {
    ...data,
    portfolioSnapshots: snapshots.slice(-365),
    updatedAt: Date.now(),
  };
  await redis.set(KEY, next);

  return NextResponse.json({ ok: true, date: today, totalAud: grandTotal, wallets: wallets.length, snapshots: next.portfolioSnapshots.length });
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
