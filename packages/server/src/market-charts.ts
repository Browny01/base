import { convertMarketAsset, marketCurrency } from "../../core/src/market-currency.ts";
import { cachedFetch as fetch } from "./fetch.ts";

import type { AssetData } from "../../core/src/integrations.ts";
export type { AssetData } from "../../core/src/integrations.ts";

const YAHOO_ASSETS = [
  { id: "gold", name: "Gold", symbol: "GC=F", currency: "AUD/oz" },
  { id: "silver", name: "Silver", symbol: "SI=F", currency: "AUD/oz" },
  { id: "oil", name: "Oil (WTI)", symbol: "CL=F", currency: "AUD/bbl" },
  { id: "sp500", name: "S&P 500", symbol: "^GSPC", currency: "points" },
  { id: "nasdaq", name: "Nasdaq", symbol: "^IXIC", currency: "points" },
  { id: "asx200", name: "ASX 200", symbol: "^AXJO", currency: "points" },
  { id: "natgas", name: "Nat Gas", symbol: "NG=F", currency: "AUD/MMBtu" },
  { id: "nvidia", name: "Nvidia", symbol: "NVDA", currency: "AUD" },
  { id: "tesla", name: "Tesla", symbol: "TSLA", currency: "AUD" },
  { id: "amazon", name: "Amazon", symbol: "AMZN", currency: "AUD" },
  { id: "apple", name: "Apple", symbol: "AAPL", currency: "AUD" },
  { id: "palantir", name: "Palantir", symbol: "PLTR", currency: "AUD" },
];

const CRYPTO_ASSETS = [
  { id: "bitcoin", name: "Bitcoin", symbol: "BTC", coingeckoId: "bitcoin" },
  { id: "ethereum", name: "Ethereum", symbol: "ETH", coingeckoId: "ethereum" },
  { id: "solana", name: "Solana", symbol: "SOL", coingeckoId: "solana" },
  { id: "ripple", name: "XRP", symbol: "XRP", coingeckoId: "ripple" },
];

// Private / not publicly traded — no live price or chart, shown as an info card.
const PRIVATE_ASSETS: AssetData[] = [
  {
    id: "spacex",
    name: "SpaceX",
    symbol: "SPACEX",
    price: null,
    priceUsd: null,
    change24h: null,
    history: [],
    currency: "",
    note: "Private",
  },
];

async function getUsdRates(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
      {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      } as RequestInit,
    );
    if (res.ok) {
      const d = await res.json();
      if (typeof d?.usd?.aud === "number" && d.usd.aud > 0) return d.usd;
    }
  } catch {}
  return null;
}

async function fetchYahooAsset(
  symbol: string,
  usdToAud: number | null,
): Promise<{
  price: number | null;
  priceUsd: number | null;
  change24h: number | null;
  history: { t: number; v: number }[];
}> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error("No result from Yahoo Finance");

  const meta = result.meta;
  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

  const index = meta.instrumentType === "INDEX";
  const conversion = index || meta.currency === "AUD" ? 1 : (usdToAud ?? 1);
  const quotedPrice = meta.regularMarketPrice ?? null;
  const priceUsd = index
    ? null
    : meta.currency === "AUD"
      ? quotedPrice !== null && usdToAud
        ? quotedPrice / usdToAud
        : null
      : quotedPrice;
  const validCloses = closes.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
  const prevClose =
    meta.previousClose ?? validCloses.at(-2) ?? meta.chartPreviousClose ?? null;
  const change24h =
    quotedPrice !== null && prevClose
      ? ((quotedPrice - prevClose) / prevClose) * 100
      : null;
  const price = quotedPrice !== null ? quotedPrice * conversion : null;

  const history: { t: number; v: number }[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const v = closes[i];
    if (v !== null && v !== undefined && !isNaN(v)) {
      history.push({ t: timestamps[i] * 1000, v: v * conversion });
    }
  }

  return { price, priceUsd, change24h, history };
}

async function fetchCryptoAsset(
  coingeckoId: string,
  apiKey?: string,
): Promise<{
  price: number | null;
  priceUsd: number | null;
  change24h: number | null;
  history: { t: number; v: number }[];
}> {
  const headers = apiKey ? { "x-cg-demo-api-key": apiKey } : undefined;
  const [chartRes, priceRes] = await Promise.all([
    fetch(
      `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=aud&days=30&interval=daily`,
      {
        headers,
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(8000),
      } as RequestInit,
    ),
    fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=aud,usd&include_24hr_change=true`,
      {
        headers,
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(8000),
      } as RequestInit,
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

export async function GET(_request?: Request, apiKey?: string) {
  const usdRates = await getUsdRates();
  const usdToAud = usdRates?.aud ?? null;
  const currency = marketCurrency(_request ? new URL(_request.url).searchParams.get("currency") : "AUD");

  const results = await Promise.allSettled([
    ...YAHOO_ASSETS.map(async (asset) => {
      const d = await fetchYahooAsset(asset.symbol, usdToAud);
      return {
        ...asset,
        currency:
          usdToAud === null
            ? asset.currency.replace("AUD", "USD")
            : asset.currency,
        ...d,
      } as AssetData;
    }),
    ...CRYPTO_ASSETS.map(async (asset) => {
      try {
        const d = await fetchCryptoAsset(asset.coingeckoId, apiKey);
        return { ...asset, currency: "AUD", ...d } as AssetData;
      } catch {
        // Use real provider history when public CoinGecko requests are limited.
        const symbol = (
          {
            bitcoin: "BTC-USD",
            ethereum: "ETH-USD",
            solana: "SOL-USD",
            ripple: "XRP-USD",
          } as Record<string, string>
        )[asset.coingeckoId];
        const d = await fetchYahooAsset(symbol, usdToAud);
        return {
          ...asset,
          currency: usdToAud === null ? "USD" : "AUD",
          ...d,
          note: "Yahoo Finance",
        } as AssetData;
      }
    }),
  ]);

  const allAssets: AssetData[] = [
    ...YAHOO_ASSETS.map((a, i) => {
      const r = results[i];
      if (r.status === "fulfilled") return r.value;
      return {
        ...a,
        price: null,
        priceUsd: null,
        change24h: null,
        history: [],
        error: (r.reason as Error).message,
      } as AssetData;
    }),
    ...CRYPTO_ASSETS.map((a, i) => {
      const r = results[YAHOO_ASSETS.length + i];
      if (r.status === "fulfilled") return r.value;
      return {
        ...a,
        currency: "AUD",
        price: null,
        priceUsd: null,
        change24h: null,
        history: [],
        error: (r.reason as Error).message,
      } as AssetData;
    }),
    ...PRIVATE_ASSETS,
  ];

  return Response.json(
    { assets: allAssets.map(asset => convertMarketAsset(asset, currency, usdRates)), usdToAud, requestedCurrency: currency },
    {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" },
    },
  );
}
