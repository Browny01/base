import { callModel } from "@/lib/ai-generate";

export const runtime = "nodejs";
export const maxDuration = 60;

// Web access for LOCAL models. Local Ollama/bridge models have no internet, so the
// browser calls this first: Perplexity (Sonar) does the live search server-side and
// returns a factual briefing + source URLs, which the client injects into the local
// model's context. Falls back gracefully if no PERPLEXITY_API_KEY is configured.
export async function POST(req: Request) {
  let query = "";
  try { query = String(((await req.json()) as { query?: string }).query ?? "").trim(); } catch { /* ignore */ }
  if (!query) return Response.json({ ok: false, error: "Empty query." }, { status: 400 });

  const prompt = `Search the web and write a concise, up-to-date factual briefing that answers or informs this request:\n\n"${query}"\n\nInclude concrete facts, numbers, names and dates. Be neutral and dense. No preamble.`;
  try {
    const r = await callModel("perplexity/sonar", prompt, { webSearch: true, maxTokens: 1200 });
    return Response.json({ ok: true, text: r.text.trim(), sources: r.sources });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error).message || e) }, { status: 500 });
  }
}
