import { GET as youtubeChannel } from "../../../packages/server/src/youtube-channel.ts";
import { readCredential } from "./credentials.ts";
import type { IntegrationProvider } from "../../../packages/core/src/providers.ts";
import { summarize } from "../../../packages/server/src/news-summary.ts";
import { GET as liveStatus } from "../../../packages/server/src/live-status.ts";
import { GET as socialFeed } from "../../../packages/server/src/social-feed.ts";
import { GET as calcom } from "../../../packages/server/src/calcom-bookings.ts";
import { GET as prices } from "../../../packages/server/src/market-prices.ts";
import { GET as charts } from "../../../packages/server/src/market-charts.ts";
import { GET as rate } from "../../../packages/server/src/fx-rate.ts";
import { GET as news } from "../../../packages/server/src/news.ts";
import { GET as youtube } from "../../../packages/server/src/youtube-oembed.ts";
import { GET as tmdb } from "../../../packages/server/src/tmdb-search.ts";
import { GET as balance } from "../../../packages/server/src/wallet-balance.ts";
import { GET as tokens } from "../../../packages/server/src/wallet-tokens.ts";
import { sha, body, type Env, type Principal } from "./types.ts";
const handlers: Record<string, (request: Request) => Promise<Response>> = {
  "/api/live-status": liveStatus,
  "/api/social-feed": socialFeed,
  "/api/calcom/bookings": calcom,
  "/api/market/prices": prices,
  "/api/market/charts": charts,
  "/api/fx/rate": rate,
  "/api/news": news,
  "/api/youtube/oembed": youtube,
  "/api/youtube/channel": youtubeChannel,
  "/api/wallet/balance": balance,
  "/api/wallet/tokens": tokens,
};
const ttl: Record<string, number> = {
  "/api/market/prices": 60,
  "/api/market/charts": 300,
  "/api/fx/rate": 3600,
  "/api/news": 300,
};
export async function integration(
  env: Env,
  request: Request,
  principal?: Principal,
) {
  const url = new URL(request.url);
  const credential = async (provider: IntegrationProvider) =>
    principal
      ? readCredential(env, principal, provider)
      : request.headers.get(`X-Base-Key-${provider}`) || undefined;
  if (
    url.pathname === "/api/news/summary" &&
    ["GET", "POST"].includes(request.method)
  ) {
    const input = request.method === "POST" ? await body(request, 8192) : {};
    return summarize(
      input,
      {
        get: async (key) => {
          const value = await env.CACHE.get(key);
          return value ? JSON.parse(value) : null;
        },
        set: async (key, value, options) =>
          env.CACHE.put(key, JSON.stringify(value), {
            expirationTtl: options.ex,
          }),
      },
      `workspace:${principal?.workspace.id ?? "public"}:`,
      true,
    );
  }
  if (url.pathname === "/api/tmdb/search")
    return tmdb(request, await credential("tmdb"));
  if (url.pathname === "/api/calcom/bookings")
    return calcom(request, await credential("calcom"));
  if (url.pathname === "/api/social-feed")
    return socialFeed(request, await credential("x"));
  const marketKey = ["/api/market/prices", "/api/market/charts"].includes(
    url.pathname,
  )
    ? await credential("coingecko")
    : undefined;
  const handler =
    url.pathname === "/api/market/charts"
      ? (r: Request) => charts(r, marketKey)
      : url.pathname === "/api/market/prices"
        ? (r: Request) => prices(r, marketKey)
        : handlers[url.pathname];
  if (!handler || request.method !== "GET") return null;
  // Only public market/news data is shared in disposable KV. Wallet addresses
  // and user-specific integration results never enter a cross-account cache.
  const seconds = ttl[url.pathname];
  const key = seconds
    ? "public-v2:" +
      url.pathname +
      ":" +
      (await sha(url.search + (marketKey ? ":" + marketKey : "")))
    : "";
  if (key) {
    try {
      const cached = await env.CACHE.get(key);
      if (cached)
        return new Response(cached, {
          headers: { "Content-Type": "application/json" },
        });
    } catch {
      /* cache is not required */
    }
  }
  const response = await handler(request);
  if (key && response.ok) {
    try {
      await env.CACHE.put(key, await response.clone().text(), {
        expirationTtl: seconds,
      });
    } catch {
      /* live result remains available */
    }
  }
  return response;
}
