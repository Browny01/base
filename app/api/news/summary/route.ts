import { getArticles } from "../route";
import { callModel } from "@/lib/ai-generate";
import { mcpRedis } from "@/lib/mcp-data";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "gemini-3.1-flash-lite";

export async function GET() {
  const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH — one summary per hour
  const key = `bridge:news:summary:v4:${hour}`;
  const redis = mcpRedis();

  if (redis) {
    try { const cached = await redis.get(key); if (cached) return Response.json({ ok: true, cached: true, ...(cached as object) }); } catch { /* ignore */ }
  }

  let articles;
  try { articles = await getArticles(); } catch { return Response.json({ ok: false, error: "Couldn't load the news feeds." }, { status: 502 }); }
  if (!articles.length) return Response.json({ ok: false, error: "No news available right now." });

  const list = articles.slice(0, 60).map((a) => `- [${a.source}/${a.category}] ${a.title}${a.description ? ` — ${a.description}` : ""}`).join("\n");
  const prompt = `You are a sharp editor writing an HOURLY BRIEFING for a busy trader/builder. Work ONLY from the headlines below.

Write it in markdown with these sections, in this order, using "## " headings:

## Markets
The general market picture — indices, stocks, commodities, macro/rates, and any market-moving economic data.

## Crypto
The crypto market and notable coin/protocol/regulatory news.

## Technology & AI
The tech and AI landscape — model releases, big-tech moves, AI-relevant company news.

## Politics
ONLY political/geopolitical news that genuinely matters to markets or tech (elections, policy, tariffs, conflict, regulation). If nothing qualifies, omit this whole section.

Rules:
- Under each heading, 2-4 tight bullet points. Be specific (name the company/coin/index and the move).
- Only include what actually matters. If a section has no real signal, omit that entire section — do not pad.
- Neutral, factual, no hype, no preamble, no closing note. Just the sections.

Headlines:
${list}`;

  let summary = "";
  try { const r = await callModel(MODEL, prompt, { maxTokens: 2048, thinkingBudget: 0 }); summary = r.text.trim(); }
  catch (e) { return Response.json({ ok: false, error: String((e as Error).message || e) }, { status: 500 }); }
  if (!summary) return Response.json({ ok: false, error: "The model returned an empty summary." }, { status: 502 });

  const payload = { summary, generatedAt: new Date().toISOString(), articleCount: articles.length, model: MODEL };
  if (redis) { try { await redis.set(key, payload, { ex: 7200 }); } catch { /* ignore */ } }
  return Response.json({ ok: true, cached: false, ...payload });
}
