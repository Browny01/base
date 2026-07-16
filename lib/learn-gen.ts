// Shared course-generation helpers used by BOTH the server route (/api/learn, for
// cloud models) and the client (components/learn-page.tsx, for local Ollama/bridge
// models that the server can't reach). Keep this free of server-only imports.

export type Level = "beginner" | "intermediate" | "advanced";

export function buildLearnPrompt(topic: string, specifics: string, level: Level, webContext?: string): string {
  const research = webContext
    ? `\nUse the following up-to-date web research to keep the course accurate and current:\n"""\n${webContext}\n"""\n`
    : "";
  return `You are an expert curriculum designer and researcher. Research the topic thoroughly (use web search if you have it) and design a rigorous, self-paced INTERACTIVE course.
${research}
Topic: ${topic}
Learner focus / specifics: ${specifics || "general foundations plus practical, real-world mastery"}
Target level: ${level}

Return ONLY valid JSON (no markdown fences, no prose before or after) with EXACTLY this shape:
{
  "overview": "markdown string: what the course covers, who it's for, prerequisites, and how to use it",
  "modules": [
    {
      "title": "string",
      "summary": "one concise sentence",
      "lessons": [
        {
          "title": "string",
          "content": "markdown lesson body, 150-350 words, concrete and specific, with examples; use headings, lists and bold where useful",
          "keyPoints": ["3-5 short takeaways"],
          "quiz": [ { "q": "question text", "options": ["opt A","opt B","opt C","opt D"], "answer": 0, "explanation": "why the correct answer is right" } ],
          "interactiveIdea": "optional one-line description of a hands-on interactive widget/simulation/game that would help the learner PRACTICE this specific lesson (e.g. 'an interactive poker hand equity trainer', 'a draggable supply-and-demand graph'), or omit if not useful"
        }
      ]
    }
  ]
}
Rules:
- 4-6 modules; 3-5 lessons each; 2-3 quiz questions per lesson.
- "answer" is the 0-based index of the correct option.
- Progress logically from fundamentals to advanced/practical application.
- Be accurate and grounded; prefer current, real information.
- Output JSON ONLY.`;
}

export function extractCourseJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const start = t.indexOf("{"); const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) { try { return JSON.parse(t.slice(start, end + 1)); } catch { /* noop */ } }
  return null;
}

interface RawLesson { title?: string; content?: string; keyPoints?: unknown; quiz?: unknown; interactiveIdea?: unknown }
interface RawModule { title?: string; summary?: string; lessons?: RawLesson[] }

const rid = () => globalThis.crypto.randomUUID();

export function normalizeCourse(parsed: Record<string, unknown>) {
  const modulesIn = Array.isArray(parsed.modules) ? (parsed.modules as RawModule[]) : [];
  const modules = modulesIn.slice(0, 8).map((m) => ({
    id: rid(),
    title: String(m.title ?? "Module"),
    summary: m.summary ? String(m.summary) : undefined,
    lessons: (Array.isArray(m.lessons) ? m.lessons : []).slice(0, 8).map((l) => ({
      id: rid(),
      title: String(l.title ?? "Lesson"),
      content: String(l.content ?? ""),
      keyPoints: Array.isArray(l.keyPoints) ? l.keyPoints.map(String).slice(0, 8) : undefined,
      quiz: Array.isArray(l.quiz) ? (l.quiz as Record<string, unknown>[]).slice(0, 6).map((qz) => ({
        id: rid(),
        q: String(qz.q ?? ""),
        options: Array.isArray(qz.options) ? qz.options.map(String).slice(0, 6) : [],
        answer: Math.max(0, Math.min(Number(qz.answer) || 0, (Array.isArray(qz.options) ? qz.options.length : 1) - 1)),
        explanation: qz.explanation ? String(qz.explanation) : undefined,
      })).filter((q) => q.q && q.options.length >= 2) : undefined,
      interactiveIdea: l.interactiveIdea ? String(l.interactiveIdea).slice(0, 200) : undefined,
      done: false,
    })).filter((l) => l.title || l.content),
  })).filter((m) => m.lessons.length > 0);
  return { overview: String(parsed.overview ?? ""), modules };
}
