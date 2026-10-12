import { GET as charts } from "@/packages/server/src/market-charts";
export function GET(request: Request) {
  return charts(request, process.env.COINGECKO_API_KEY);
}
