import { callModel } from "@/lib/ai-generate";

export const runtime = "nodejs";
export const maxDuration = 45;

// Turns a compact weekly-stats object (sent by the client) into a coaching retro.
export async function POST(req: Request) {
  let stats: unknown = {};
  try { stats = (await req.json()).stats ?? {}; } catch { /* ignore */ }

  const prompt = `You are a sharp, honest personal-performance coach reviewing the user's past 7 days for their Bridge dashboard. Write a concise WEEKLY REVIEW in markdown with exactly these sections:

## Wins
## Misses
## Focus next week

Rules:
- 2-4 tight bullets per section (skip a section only if truly nothing applies).
- Be specific — cite the numbers. Encouraging but not fluffy; name what slipped.
- No preamble, no closing note.

Data (JSON):
${JSON.stringify(stats)}`;

  try {
    const r = await callModel("gemini-2.5-flash", prompt, { maxTokens: 1200, thinkingBudget: 0 });
    const review = r.text.trim();
    if (!review) return Response.json({ ok: false, error: "Empty review." }, { status: 502 });
    return Response.json({ ok: true, review });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error).message || e) }, { status: 500 });
  }
}
