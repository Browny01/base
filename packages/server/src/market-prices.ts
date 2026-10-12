import { cachedFetch as fetch } from "./fetch.ts";
export async function GET() {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,hyperliquid&vs_currencies=usd",
      {
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(15_000),
      } as RequestInit,
    );
    if (!response.ok)
      return Response.json(
        { error: "Prices are temporarily unavailable." },
        { status: 502 },
      );
    return Response.json(await response.json());
  } catch {
    return Response.json(
      { error: "Prices are temporarily unavailable." },
      { status: 502 },
    );
  }
}
