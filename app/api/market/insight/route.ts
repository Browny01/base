import { callModel, extractJson } from "@/lib/ai-generate";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "gemini-3.1-flash-lite";

export interface MarketInsight {
  moveSummary: string;
  drivers: string[];
  baseCase: string;
  bullCase: string;
  bearCase: string;
  watchItems: string[];
  confidence: "low" | "medium" | "high";
  generatedAt: string;
}

interface InsightRequest {
  asset?: {
    name?: string;
    symbol?: string;
    price?: number | null;
    change24h?: number | null;
    currency?: string;
    note?: string;
    history?: { t: number; v: number }[];
  };
  headlines?: { title?: string; description?: string; source?: string; pubDate?: string }[];
}

function strings(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, limit)
    : [];
}

function fallbackInsight(asset: NonNullable<InsightRequest["asset"]>, headlines: NonNullable<InsightRequest["headlines"]>): MarketInsight {
  const values = (asset.history ?? []).map((point) => point.v);
  const last = values.at(-1);
  const start = values[0];
  const monthMove = start && last ? ((last - start) / start) * 100 : null;
  const dailyMove = asset.change24h;
  const direction = dailyMove === null || dailyMove === undefined ? "does not have a reliable daily move" : dailyMove >= 0 ? "is higher today" : "is lower today";
  const trend = monthMove === null ? "the broader trend is unclear" : monthMove >= 0 ? "the 30-day trend remains positive" : "the 30-day trend remains negative";
  const headlineDrivers = headlines.slice(0, 2).map((headline) => `Recent matched coverage: ${headline.title ?? "Untitled update"}. This is context, not proof of causation.`);

  return {
    moveSummary: `${asset.name} ${direction}; ${trend}. The available price series shows the move, but the supplied headlines do not establish a single confirmed cause.`,
    drivers: headlineDrivers.length ? headlineDrivers : [
      "No directly matched current headline was available, so the cause of the move cannot be confirmed from this feed.",
      "Short-term positioning and broader market direction may be contributing, but that remains an inference.",
    ],
    baseCase: "The base case is consolidation around the recent range while the market waits for clearer company, macro, or sector information.",
    bullCase: "The upside case requires positive momentum to persist, stronger relative performance, and supportive new information.",
    bearCase: "The downside case strengthens if the recent range breaks lower, momentum deteriorates, or new information challenges current expectations.",
    watchItems: ["Recent range high and low", "Volume and relative strength", "Company or sector announcements", "Macro and rate expectations"],
    confidence: "low",
    generatedAt: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  let body: InsightRequest;
  try {
    body = await request.json() as InsightRequest;
  } catch {
    return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const asset = body.asset;
  if (!asset?.name || !asset.symbol) {
    return Response.json({ ok: false, error: "Asset details are required." }, { status: 400 });
  }

  const history = (asset.history ?? []).slice(-30);
  const headlines = (body.headlines ?? []).slice(0, 10);
  const prompt = `You are a careful market analyst preparing a compact decision brief for ${asset.name} (${asset.symbol}).

Use ONLY the supplied market data and headlines. Do not invent live events, price targets, analyst ratings, or causes. When the evidence cannot establish a cause, explicitly call it a likely driver or say the signal is unclear. The outlook must be conditional scenarios, not financial advice or a guaranteed prediction.

Return JSON with exactly:
{
  "moveSummary": "2 concise sentences explaining the observed move and evidence quality",
  "drivers": ["2-4 evidence-based or clearly labelled likely drivers"],
  "baseCase": "conditional 1-2 sentence base scenario",
  "bullCase": "conditional 1-2 sentence upside scenario",
  "bearCase": "conditional 1-2 sentence downside scenario",
  "watchItems": ["3-5 concrete signals/events to monitor"],
  "confidence": "low|medium|high"
}

Current data:
${JSON.stringify({
    name: asset.name,
    symbol: asset.symbol,
    priceAud: asset.price,
    change24hPercent: asset.change24h,
    currency: asset.currency,
    note: asset.note,
    history,
  })}

Matched headlines:
${JSON.stringify(headlines)}`;

  try {
    const result = await callModel(MODEL, prompt, { jsonMode: true, maxTokens: 1400, thinkingBudget: 0 });
    const parsed = extractJson(result.text);
    if (!parsed) throw new Error("The model returned an invalid analysis.");

    const confidence = parsed.confidence === "high" || parsed.confidence === "medium" ? parsed.confidence : "low";
    const insight: MarketInsight = {
      moveSummary: typeof parsed.moveSummary === "string" ? parsed.moveSummary : "There is not enough evidence to explain this move confidently.",
      drivers: strings(parsed.drivers, 4),
      baseCase: typeof parsed.baseCase === "string" ? parsed.baseCase : "The base case depends on the current trend holding while new information remains limited.",
      bullCase: typeof parsed.bullCase === "string" ? parsed.bullCase : "Upside would require improving momentum and supportive new information.",
      bearCase: typeof parsed.bearCase === "string" ? parsed.bearCase : "Downside risk rises if momentum weakens or adverse information emerges.",
      watchItems: strings(parsed.watchItems, 5),
      confidence,
      generatedAt: new Date().toISOString(),
    };
    return Response.json({ ok: true, insight });
  } catch (error) {
    return Response.json({
      ok: true,
      fallback: true,
      warning: error instanceof Error ? error.message : "AI analysis unavailable.",
      insight: fallbackInsight(asset, headlines),
    });
  }
}
