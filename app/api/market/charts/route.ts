import { NextResponse } from "next/server";

export interface AssetData {
  id: string;
  name: string;
  symbol: string;
  price: number | null;       // in AUD
  priceUsd: number | null;    // kept for reference
  change24h: number | null;
  history: { t: number; v: number }[];  // values in AUD
  currency: string;
  note?: string;   // shown instead of a price for assets that don't trade (e.g. private companies)
  error?: string;
}

const YAHOO_ASSETS = [
  { id: "gold",  name: "Gold",      symbol: "GC=F",   currency: "AUD/oz" },
  { id: "silver",name: "Silver",    symbol: "SI=F",   currency: "AUD/oz" },
  { id: "oil",   name: "Oil (WTI)", symbol: "CL=F",   currency: "AUD/bbl" },
  { id: "sp500", name: "S&P 500",   symbol: "%5EGSPC", currency: "AUD" },
  { id: "nasdaq", name: "Nasdaq",    symbol: "%5EIXIC", currency: "AUD" },
  { id: "asx200", name: "ASX 200",   symbol: "%5EAXJO", currency: "AUD" },
  { id: "natgas", name: "Nat Gas",   symbol: "NG=F",    currency: "AUD/MMBtu" },
  { id: "nvidia", name: "Nvidia",    symbol: "NVDA",    currency: "AUD" },
  { id: "tesla",  name: "Tesla",     symbol: "TSLA",    currency: "AUD" },
  { id: "amazon", name: "Amazon",    symbol: "AMZN",    currency: "AUD" },
  { id: "apple",  name: "Apple",     symbol: "AAPL",    currency: "AUD" },
  { id: "palantir", name: "Palantir", symbol: "PLTR",   currency: "AUD" },
];

const CRYPTO_ASSETS = [
  { id: "bitcoin",  name: "Bitcoin",  symbol: "BTC", coingeckoId: "bitcoin" },
  { id: "ethereum", name: "Ethereum", symbol: "ETH", coingeckoId: "ethereum" },
  { id: "solana",   name: "Solana",   symbol: "SOL", coingeckoId: "solana" },
  { id: "ripple",   name: "XRP",      symbol: "XRP", coingeckoId: "ripple" },
];

// Private / not publicly traded — no live price or chart, shown as an info card.
const PRIVATE_ASSETS: AssetData[] = [
  { id: "spacex", name: "SpaceX", symbol: "SPACEX", price: null, priceUsd: null, change24h: null, history: [], currency: "", note: "Private" },
];

async function getUsdToAud(): Promise<number> {
  try {
    const res = await fetch(
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
      { next: { revalidate: 3600 } }
    );
    if (res.ok) {
      const d = await res.json();
      if (typeof d?.usd?.aud === "number") return d.usd.aud;
    }
  } catch {}
  return 1.55;
}

async function fetchYahooAsset(
  symbol: string,
  usdToAud: number
): Promise<{ price: number | null; priceUsd: number | null; change24h: number | null; history: { t: number; v: number }[] }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=30d`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
    },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error("No result from Yahoo Finance");

  const meta = result.meta;
  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

  const priceUsd = meta.regularMarketPrice ?? null;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
  const change24h = priceUsd && prevClose ? ((priceUsd - prevClose) / prevClose) * 100 : null;
  const price = priceUsd !== null ? priceUsd * usdToAud : null;

  const history: { t: number; v: number }[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const v = closes[i];
    if (v !== null && v !== undefined && !isNaN(v)) {
      history.push({ t: timestamps[i] * 1000, v: v * usdToAud });
    }
  }

  return { price, priceUsd, change24h, history };
}

async function fetchCryptoAsset(
  coingeckoId: string
): Promise<{ price: number | null; priceUsd: number | null; change24h: number | null; history: { t: number; v: number }[] }> {
  const [chartRes, priceRes] = await Promise.all([
    fetch(
      `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=aud&days=30&interval=daily`,
      { next: { revalidate: 300 } }
    ),
    fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=aud,usd&include_24hr_change=true`,
      { next: { revalidate: 60 } }
    ),
  ]);

  if (!chartRes.ok || !priceRes.ok) throw new Error("CoinGecko request failed");

  const chartData = await chartRes.json();
  const priceData = await priceRes.json();

  const prices: [number, number][] = chartData.prices ?? [];
  const history = prices.map(([t, v]) => ({ t, v }));

  const coinInfo = priceData[coingeckoId];
  const price = coinInfo?.aud ?? null;
  const priceUsd = coinInfo?.usd ?? null;
  const change24h = coinInfo?.aud_24h_change ?? null;

  return { price, priceUsd, change24h, history };
}

export async function GET() {
  const usdToAud = await getUsdToAud();

  const results = await Promise.allSettled([
    ...YAHOO_ASSETS.map(async (asset) => {
      const d = await fetchYahooAsset(asset.symbol, usdToAud);
      return { ...asset, ...d } as AssetData;
    }),
    ...CRYPTO_ASSETS.map(async (asset) => {
      const d = await fetchCryptoAsset(asset.coingeckoId);
      return { ...asset, currency: "AUD", ...d } as AssetData;
    }),
  ]);

  const allAssets: AssetData[] = [
    ...YAHOO_ASSETS.map((a, i) => {
      const r = results[i];
      if (r.status === "fulfilled") return r.value;
      return { ...a, price: null, priceUsd: null, change24h: null, history: [], error: (r.reason as Error).message } as AssetData;
    }),
    ...CRYPTO_ASSETS.map((a, i) => {
      const r = results[YAHOO_ASSETS.length + i];
      if (r.status === "fulfilled") return r.value;
      return { ...a, currency: "AUD", price: null, priceUsd: null, change24h: null, history: [], error: (r.reason as Error).message } as AssetData;
    }),
    ...PRIVATE_ASSETS,
  ];

  return NextResponse.json({ assets: allAssets, usdToAud }, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" },
  });
}
