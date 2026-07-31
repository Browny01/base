import { providerOf } from "@/lib/chat-models";
import { callModel } from "@/lib/ai-generate";
import { buildLearnPrompt, extractCourseJson, normalizeCourse, type Level } from "@/lib/learn-gen";
import { requireBridgeSession } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const unauthorized = await requireBridgeSession(req); if (unauthorized) return unauthorized;
  let body: { topic?: string; specifics?: string; level?: Level; model?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "Bad request" }, { status: 400 }); }

  const topic = (body.topic ?? "").trim();
  const specifics = (body.specifics ?? "").trim();
  const level: Level = (["beginner", "intermediate", "advanced"] as const).includes(body.level as Level) ? (body.level as Level) : "beginner";
  const model = body.model || "perplexity/sonar";
  if (!topic) return Response.json({ ok: false, error: "Topic is required." }, { status: 400 });

  const provider = providerOf(model);
  const prompt = buildLearnPrompt(topic, specifics, level);

  try {
    const result = await callModel(model, prompt, { jsonMode: provider === "gemini", webSearch: provider === "perplexity", maxTokens: 8192 });
    const parsed = extractCourseJson(result.text);
    if (!parsed) return Response.json({ ok: false, error: "The model didn't return a usable course. Try again or pick a different model." }, { status: 502 });
    const { overview, modules } = normalizeCourse(parsed);
    if (modules.length === 0) return Response.json({ ok: false, error: "The generated course had no lessons. Try again." }, { status: 502 });

    return Response.json({ ok: true, overview, modules, sources: result.sources });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error).message || e) }, { status: 500 });
  }
}
