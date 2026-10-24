import type { WikiBlock, WikiPage } from "./store";
import { noteText } from "./note-selection";
import { safeClipboardHTML } from "./note-paste";
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function pageClipboard(page: Pick<WikiPage, "title" | "blocks">) {
  const html = page.blocks.map((block, index) => {
    const content = safeClipboardHTML(block.text || "");
    if (/^h[1-3]$/.test(block.type)) return `<${block.type}>${content}</${block.type}>`;
    if (block.type === "code") return `<pre><code>${escape(stripTags(block.text))}</code></pre>`;
    if (block.type === "bulleted" || block.type === "numbered") {
      const tag = block.type === "bulleted" ? "ul" : "ol";
      const before = page.blocks[index - 1]?.type === block.type ? "" : `<${tag}>`;
      const after = page.blocks[index + 1]?.type === block.type ? "" : `</${tag}>`;
      return `${before}<li>${content}</li>${after}`;
    }
    if (block.type === "quote") return `<blockquote>${content}</blockquote>`;
    if (block.type === "text" || block.type === "sticky") return `<div>${content || "<br>"}</div>`;
    return `<div>${escape(blocksToText([block])).replace(/\n/g, "<br>")}</div>`;
  }).join("");
  return { text: `${page.title || "Untitled"}\n\n${blocksToText(page.blocks)}`, html: `<h1>${escape(page.title || "Untitled")}</h1>${html}` };
}

export async function copyNotePage(page: Pick<WikiPage, "title" | "blocks">) {
  const contents = pageClipboard(page);
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([contents.text], { type: "text/plain" }), "text/html": new Blob([contents.html], { type: "text/html" }) })]);
      return;
    } catch { /* Older WebKit may allow text but not rich clipboard writes. */ }
  }
  await navigator.clipboard.writeText(contents.text);
}
const stripTags = (html: string) => {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script,style,iframe,object,embed").forEach(node => node.remove());
  return noteText(template.content);
};

// Plain-text export of a page's blocks (used by the page options menu).
export function blocksToText(blocks: WikiBlock[]): string {
  let number = 0;
  return blocks.map((b) => {
    number = b.type === "numbered" ? number + 1 : 0;
    const t = stripTags(b.text);
    switch (b.type) {
      case "h1": return `# ${t}`;
      case "h2": return `## ${t}`;
      case "h3": return `### ${t}`;
      case "bulleted": return `• ${t}`;
      case "numbered": return `${number}. ${t}`;
      case "todo": return `${b.checked ? "[x]" : "[ ]"} ${t}`;
      case "quote": return `> ${t}`;
      case "code": return "```\n" + t + "\n```";
      case "callout": return `${b.emoji || "💡"} ${t}`;
      case "toggle": return `▸ ${t}${b.body ? "\n  " + stripTags(b.body) : ""}`;
      case "pagelink": return "↪ [linked page]";
      case "divider": return "---";
      case "image": return b.caption ? `[image: ${b.caption}]` : "[image]";
      case "table": return (b.table?.rows ?? []).map((r) => r.map((c) => stripTags(c)).join(" | ")).join("\n");
      case "board": return (b.board ?? []).map((col) => `${col.title}:\n` + col.cards.map((c) => `  - ${c.text}`).join("\n")).join("\n");
      case "chart": return `[${b.chart?.kind ?? "bar"} chart] ` + (b.chart?.data ?? []).map((d) => `${d.label}: ${d.value}`).join(", ");
      case "sticky": return `📝 ${t}`;
      case "bookmark": return `🔖 ${t || ""} ${b.url ?? ""}`.trim();
      case "embed": case "video": case "audio": case "file": return `[${b.type}] ${b.fileName ?? b.url ?? ""}`.trim();
      case "gallery": return `[gallery: ${(b.images ?? []).length} images]`;
      case "columns": return (b.cols ?? []).map((c) => stripTags(c)).join("\n\n");
      case "tabs": case "accordion": return (b.panels ?? []).map((p) => `${p.title}\n${stripTags(p.body)}`).join("\n");
      case "toc": return "[table of contents]";
      case "labeleddivider": return `--- ${t} ---`;
      case "synced": return "↪ [embedded note]";
      case "progress": return `${t}: ${b.value ?? 0}%`;
      case "checklist": return (b.checks ?? []).map((c) => `${c.done ? "[x]" : "[ ]"} ${c.text}`).join("\n");
      case "counter": return `${t}: ${b.value ?? 0}`;
      case "countdown": return `${t} — ${b.date ?? ""}`;
      case "rating": return `${t}: ${b.value ?? 0}/5`;
      case "pageindex": return "[sub-page index]";
      case "properties": return (b.props ?? []).map((p) => `${p.key}: ${p.value}`).join("\n");
      case "math": return `$ ${t} $`;
      case "diagram": return "```mermaid\n" + t + "\n```";
      case "sketch": return "[sketch]";
      case "button": return `[${t || "Button"}]`;
      default: return t;
    }
  }).join("\n");
}
