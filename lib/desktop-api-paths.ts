/** Keep this allowlist aligned with the Rust transport. Privileged endpoints
 * (agent/MCP/cron/setup/data) are intentionally absent. */
export const DESKTOP_API_PATHS = new Set([
  "/api/native/sync", "/api/native/sync/chunk", "/api/auth/desktop", "/api/news", "/api/news/summary",
  "/api/social-feed", "/api/live-status", "/api/market/charts", "/api/market/prices", "/api/fx/rate",
  "/api/wallet/balance", "/api/wallet/tokens", "/api/calcom/bookings",
  "/api/blob/upload", "/api/blob/delete", "/api/link-preview", "/api/favicon",
  "/api/tmdb/search", "/api/youtube/oembed",
]);
