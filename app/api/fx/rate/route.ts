import { NextResponse } from "next/server";

// Fallback rate in case all APIs fail
const FALLBACK_AUD = 1.55;

export async function GET() {
  // Primary: fawazahmed0 CDN (open, no key, updated daily)
  try {
    const res = await fetch(
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
      { next: { revalidate: 3600 } }
    );
    if (res.ok) {
      const data = await res.json();
      const rate = data?.usd?.aud;
      if (typeof rate === "number" && rate > 0) {
        return NextResponse.json({ usdToAud: rate }, {
          headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=7200" },
        });
      }
    }
  } catch {}

  // Fallback: exchangerate-api free tier
  try {
    const res = await fetch(
      "https://api.exchangerate-api.com/v4/latest/USD",
      { next: { revalidate: 3600 } }
    );
    if (res.ok) {
      const data = await res.json();
      const rate = data?.rates?.AUD;
      if (typeof rate === "number" && rate > 0) {
        return NextResponse.json({ usdToAud: rate }, {
          headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=7200" },
        });
      }
    }
  } catch {}

  return NextResponse.json({ usdToAud: FALLBACK_AUD });
}
