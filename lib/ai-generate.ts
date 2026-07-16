// Server-side, non-streaming model calls that return text (usually JSON) plus any
// web-search sources. Shared by the Learning course + interactive-artifact routes.
import { providerOf } from "@/lib/chat-models";

export interface GenOpts { jsonMode?: boolean; webSearch?: boolean; maxTokens?: number; thinkingBudget?: number }

export function extractJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const t = text.trim().replace(/^```(?:json|html)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const start = t.indexOf("{"); const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) { try { return JSON.parse(t.slice(start, end + 1)); } catch { /* noop */ } }
  return null;
}

async function callGemini(model: string, prompt: string, o: GenOpts): Promise<{ text: string; sources: string[] }> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("No GEMINI_API_KEY set.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;
  const generationConfig: Record<string, unknown> = { temperature: 0.6, maxOutputTokens: o.maxTokens ?? 8192 };
  if (o.jsonMode) generationConfig.responseMimeType = "application/json";
  // Gemini 2.5 "thinking" spends output tokens before the answer — disable it (budget 0)
  // for short-answer calls so the response isn't truncated by hidden reasoning.
  if (o.thinkingBudget !== undefined) generationConfig.thinkingConfig = { thinkingBudget: o.thinkingBudget };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig }) });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return { text: (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join(""), sources: [] };
}

async function callAnthropic(model: string, prompt: string, o: GenOpts): Promise<{ text: string; sources: string[] }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("No ANTHROPIC_API_KEY set.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: o.maxTokens ?? 8192, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json() as { content?: { text?: string }[] };
  return { text: (j.content ?? []).map((c) => c.text ?? "").join(""), sources: [] };
}

async function callPerplexity(model: string, prompt: string, o: GenOpts): Promise<{ text: string; sources: string[] }> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) throw new Error("No PERPLEXITY_API_KEY set.");
  const body: Record<string, unknown> = { model, input: prompt };
  if (o.webSearch) body.tools = [{ type: "web_search", search_context_size: "high" }];
  const res = await fetch("https://api.perplexity.ai/v1/agent", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Perplexity ${res.status}: ${raw.slice(0, 300)}`);
  let text = ""; const urls = new Set<string>();
  try {
    const json = JSON.parse(raw) as { output_text?: unknown; output?: unknown };
    const acc: string[] = [];
    const visit = (v: unknown) => {
      if (!v || typeof v !== "object") return;
      const it = v as Record<string, unknown>;
      if (typeof it.text === "string") acc.push(it.text);
      if (typeof it.url === "string" && it.url.startsWith("http")) urls.add(it.url);
      Object.values(it).forEach((c) => { if (Array.isArray(c)) c.forEach(visit); else if (c && typeof c === "object") visit(c); });
    };
    if (typeof json.output_text === "string" && json.output_text.trim()) { text = json.output_text; visit(json.output); }
    else { visit(json.output); text = acc.join(""); }
  } catch { text = raw; }
  return { text, sources: [...urls].slice(0, 20) };
}

export async function callModel(model: string, prompt: string, opts: GenOpts = {}): Promise<{ text: string; sources: string[] }> {
  const provider = providerOf(model);
  if (provider === "gemini") return callGemini(model, prompt, opts);
  if (provider === "anthropic") return callAnthropic(model, prompt, opts);
  if (provider === "perplexity") return callPerplexity(model, prompt, opts);
  throw new Error("Only Gemini, Perplexity and Claude models can generate here (local models can't be reached by the server).");
}
