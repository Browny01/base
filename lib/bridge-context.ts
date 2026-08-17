// Builds a compact, sanitized snapshot of the user's Base data to give the chat
// AI site-wide context. Locked and trashed notes are never included — same rule
// as the MCP server. Client-safe (no server-only imports).

import type { BridgeData, WikiBlock, WikiPage } from "@/lib/store";

const MAX_CHARS = 60000;

const strip = (html: string) =>
  (html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();

function blockText(b: WikiBlock): string {
  const t = strip(b.text);
  switch (b.type) {
    case "h1": case "h2": case "h3": return t;
    case "bulleted": return `- ${t}`;
    case "numbered": return `• ${t}`;
    case "todo": return `[${b.checked ? "x" : " "}] ${t}`;
    case "quote": return `> ${t}`;
    case "callout": return `${b.emoji || "💡"} ${t}`;
    case "toggle": return `${t}${b.body ? " — " + strip(b.body) : ""}`;
    case "checklist": return (b.checks ?? []).map((c) => `[${c.done ? "x" : " "}] ${c.text}`).join("\n");
    case "columns": return (b.cols ?? []).map(strip).join(" | ");
    case "tabs": case "accordion": return (b.panels ?? []).map((p) => `${p.title}: ${strip(p.body)}`).join("\n");
    case "table": return (b.table?.rows ?? []).map((r) => r.map(strip).join(" | ")).join("\n");
    case "properties": return (b.props ?? []).map((p) => `${p.key}: ${p.value}`).join("\n");
    case "image": case "divider": case "labeleddivider": return "";
    default: return t;
  }
}
const noteText = (p: WikiPage) => (p.blocks ?? []).map(blockText).filter(Boolean).join("\n");

export function buildBridgeContext(d: BridgeData): string {
  const parts: string[] = [];
  const push = (s: string) => parts.push(s);

  push("=== BRIDGE PERSONAL DASHBOARD DATA (the user's own data — use it to answer questions about their tasks, notes, finances, goals, etc. Locked/private notes are excluded.) ===");

  const tasks = d.tasks ?? [];
  if (tasks.length) push(`\n## Tasks (${tasks.filter((t) => !t.done).length} open)\n` + tasks.slice(0, 60).map((t) => `- [${t.done ? "x" : " "}] ${t.title} (${t.priority}, ${t.tag}${t.dueDate ? `, due ${t.dueDate}` : ""})`).join("\n"));

  const goals = d.goals ?? [];
  if (goals.length) push(`\n## Goals\n` + goals.map((g) => `- (${g.period}) [${g.done ? "x" : " "}] ${g.text}`).join("\n"));

  const inc = d.incomeEntries ?? [];
  if (inc.length || (d.subscriptions ?? []).length) {
    const income = inc.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
    const spent = inc.filter((e) => e.type === "spent").reduce((s, e) => s + e.amount, 0);
    push(`\n## Finance\nIncome: ${income} · Spent: ${spent} · Net: ${income - spent}` +
      ((d.subscriptions ?? []).length ? `\nSubscriptions:\n` + (d.subscriptions ?? []).filter((s) => s.active).map((s) => `- ${s.name}: ${s.amount} ${s.frequency} (next ${s.dueDate})`).join("\n") : ""));
  }

  const projects = d.projects ?? [];
  if (projects.length) push(`\n## Projects\n` + projects.map((p) => `- ${p.name} [${p.status}]${p.description ? ` — ${p.description}` : ""}`).join("\n"));

  const workouts = d.workouts ?? [];
  if (workouts.length) push(`\n## Recent workouts\n` + [...workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((w) => `- ${w.date} ${w.name} (${w.exercises.length} exercises)`).join("\n"));

  const skills = d.playerSkills ?? [];
  if (skills.length) push(`\n## Self-improvement skills\n` + skills.slice(0, 40).map((s) => `- ${s.name} (${s.domain}): ${s.currentScore}/10 → ${s.targetScore}`).join("\n"));

  const exams = d.exams ?? [];
  if (exams.length) push(`\n## Exams\n` + exams.map((e) => `- ${e.subject} on ${e.date}${e.time ? ` ${e.time}` : ""}`).join("\n"));

  // Notes — exclude locked + trashed
  const notes = (d.wikiPages ?? []).filter((p) => !p.locked && !p.deletedAt);
  if (notes.length) {
    push(`\n## Notes (${notes.length} pages; locked pages omitted)`);
    for (const p of notes) {
      const body = noteText(p).slice(0, 4000);
      push(`\n### ${p.title || "Untitled"}\n${body}`);
      if (parts.join("\n").length > MAX_CHARS) { push("\n…(more notes omitted for length)"); break; }
    }
  }

  let ctx = parts.join("\n");
  if (ctx.length > MAX_CHARS) ctx = ctx.slice(0, MAX_CHARS) + "\n…(truncated)";
  return ctx;
}
