import { GET as prices } from "@/packages/server/src/market-prices";
export function GET(request: Request) {
  return prices(request, process.env.COINGECKO_API_KEY);
}
