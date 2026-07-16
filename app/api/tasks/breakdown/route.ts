import { callModel, extractJson } from "@/lib/ai-generate";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = "gemini-2.5-flash";

// Break a task into a short, concrete checklist of subtasks.
export async function POST(req: Request) {
  let title = "";
  try { title = String(((await req.json()) as { title?: string }).title ?? "").trim(); } catch { /* ignore */ }
  if (!title) return Response.json({ ok: false, error: "No task given." }, { status: 400 });

  const prompt = `Break this task into 3-6 concrete, actionable subtasks. Keep each subtask short (a few words), specific, and in a sensible order. Return ONLY JSON: {"subtasks": ["...", "..."]}.\n\nTask: "${title}"`;
  try {
    const r = await callModel(MODEL, prompt, { jsonMode: true, maxTokens: 600, thinkingBudget: 0 });
    const parsed = extractJson(r.text) as { subtasks?: unknown } | null;
    const subtasks = Array.isArray(parsed?.subtasks) ? parsed!.subtasks.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 8) : [];
    if (!subtasks.length) return Response.json({ ok: false, error: "Couldn't break that down. Try rephrasing." }, { status: 502 });
    return Response.json({ ok: true, subtasks });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error).message || e) }, { status: 500 });
  }
}
