import { providerOf } from "@/lib/chat-models";
import { callModel, extractJson } from "@/lib/ai-generate";

export const runtime = "nodejs";
export const maxDuration = 300;

function buildPrompt(topic: string, lessonTitle: string, lessonContent: string, idea: string): string {
  return `You are an expert interactive educator and front-end engineer. Build a SINGLE self-contained HTML document that is a hands-on, genuinely interactive widget to help a learner practice or explore this lesson.

Course topic: ${topic}
Lesson: ${lessonTitle}
Lesson summary: ${lessonContent.slice(0, 1500)}
Interactive to build: ${idea || "design the most useful hands-on practice tool, simulator, or mini-game for this lesson"}

HARD REQUIREMENTS:
- One complete HTML document: <!doctype html> with inline <style> and <script>. NO external resources at all — no CDNs, no <img src=http...>, no fonts, no network/fetch/XHR. Everything self-contained.
- It runs in a sandboxed iframe: do NOT use localStorage, sessionStorage, cookies, or top/parent access (they throw). Keep all state in JS variables.
- It renders inside a sandboxed iframe about 100% wide and ~460px tall (make it scroll internally if needed). Design for that size.
- Make it truly INTERACTIVE and stateful: clickable controls, live feedback, scoring, or a playable simulation — not just static text.
- Clean, modern UI. Use a dark, high-contrast theme (dark background ~#0f0f12, light text) with a tasteful accent. Rounded corners, good spacing, system font stack.
- Robust: handle edge cases, no runtime errors. Keep it focused and genuinely useful for practicing the lesson.

Return ONLY JSON (no markdown fences): {"title": "short widget title", "html": "<!doctype html>...the entire document..."}`;
}

export async function POST(req: Request) {
  let body: { topic?: string; lessonTitle?: string; lessonContent?: string; idea?: string; model?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "Bad request" }, { status: 400 }); }

  const topic = (body.topic ?? "").trim();
  const lessonTitle = (body.lessonTitle ?? "").trim();
  const lessonContent = (body.lessonContent ?? "").trim();
  const idea = (body.idea ?? "").trim();
  const model = body.model || "google/gemini-3-flash-preview";
  if (!lessonTitle) return Response.json({ ok: false, error: "Lesson is required." }, { status: 400 });

  const provider = providerOf(model);
  const prompt = buildPrompt(topic, lessonTitle, lessonContent, idea);

  try {
    // Interactive HTML can be long — give it more room; JSON mode for Gemini.
    const result = await callModel(model, prompt, { jsonMode: provider === "gemini", maxTokens: 16384 });
    const parsed = extractJson(result.text);
    const html = parsed && typeof parsed.html === "string" ? parsed.html : null;
    if (!html || !/<html|<!doctype/i.test(html)) {
      return Response.json({ ok: false, error: "The model didn't return a usable interactive. Try again or a different model." }, { status: 502 });
    }
    const title = parsed && typeof parsed.title === "string" ? parsed.title : "Interactive practice";
    return Response.json({ ok: true, title, html });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error).message || e) }, { status: 500 });
  }
}
