/** Adding a provider requires an adapter; credentials are never workspace records. */
export const INTEGRATION_PROVIDERS = [
  {
    id: "tmdb",
    name: "TMDB",
    description: "Movie and TV search and artwork.",
    keyLabel: "API key or read access token",
    helpUrl: "https://www.themoviedb.org/settings/api",
  },
  {
    id: "calcom",
    name: "Cal.com",
    description: "Bookings alongside your Base calendar.",
    keyLabel: "API key",
    helpUrl: "https://app.cal.com/settings/developer/api-keys",
  },
  {
    id: "x",
    name: "X",
    description: "Posts from the accounts in your news sources.",
    keyLabel: "Bearer token",
    helpUrl: "https://developer.x.com/",
  },
  {
    id: "coingecko",
    name: "CoinGecko",
    description: "Optional Demo key for crypto prices and history.",
    keyLabel: "Demo API key",
    helpUrl: "https://www.coingecko.com/en/api",
  },
] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number]["id"];
export const isIntegrationProvider = (
  value: unknown,
): value is IntegrationProvider =>
  INTEGRATION_PROVIDERS.some((provider) => provider.id === value);
export const PUBLIC_INTEGRATION_PATHS = [
  "/api/news",
  "/api/news/summary",
  "/api/market/charts",
  "/api/market/prices",
  "/api/fx/rate",
  "/api/social-feed",
  "/api/live-status",
  "/api/tmdb/search",
  "/api/youtube/oembed",
  "/api/youtube/channel",
  "/api/calcom/bookings",
  "/api/wallet/balance",
  "/api/wallet/tokens",
] as const;
