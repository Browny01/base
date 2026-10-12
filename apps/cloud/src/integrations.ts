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
  principal: Principal,
) {
  const url = new URL(request.url);
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
      `workspace:${principal.workspace.id}:`,
      true,
    );
  }
  if (url.pathname === "/api/tmdb/search")
    return tmdb(request, env.TMDB_API_KEY);
  const handler = handlers[url.pathname];
  if (!handler || request.method !== "GET") return null;
  // Only public market/news data is shared in disposable KV. Wallet addresses
  // and user-specific integration results never enter a cross-account cache.
  const seconds = ttl[url.pathname];
  const key = seconds ? `public:${url.pathname}:${await sha(url.search)}` : "";
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
