// Lightweight, XSS-safe markdown → HTML for chat replies.
// Everything is HTML-escaped first, so only the tags we generate are emitted.

const esc = (s: string) => s
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

// Inline formatting on already-escaped text. Code spans and links are protected
// with placeholders so bold/italic don't reach inside them.
function inline(s: string): string {
  const holds: string[] = [];
  const hold = (html: string) => { holds.push(html); return `${holds.length - 1}`; };

  let t = s
    .replace(/`([^`]+)`/g, (_m, c) => hold(`<code>${c}</code>`))
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, txt, url) => hold(`<a href="${url}" target="_blank" rel="noopener">${txt}</a>`))
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_m, pre, url) => `${pre}${hold(`<a href="${url}" target="_blank" rel="noopener">${url}</a>`)}`);

  t = t
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_([^_\n]+)_/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>");

  return t.replace(/(\d+)/g, (_m, i) => holds[Number(i)]);
}

export function mdToHtml(md: string): string {
  if (!md) return "";
  const escaped = esc(md);

  // pull out fenced code blocks
  const code: string[] = [];
  const text = escaped.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, body) => {
    code.push(`<pre><code>${body.replace(/\n+$/, "")}</code></pre>`);
    return `${code.length - 1}`;
  });

  const lines = text.split("\n");
  const out: string[] = [];
  let para: string[] = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join("<br>"))}</p>`); para = []; } };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const codeOnly = line.match(/^(\d+)$/);
    if (codeOnly) { flushPara(); out.push(code[Number(codeOnly[1])]); i++; continue; }
    if (/^\s*$/.test(line)) { flushPara(); i++; continue; }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { flushPara(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushPara(); out.push("<hr>"); i++; continue; }

    // unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      flushPara(); const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { items.push(`<li>${inline(lines[i].replace(/^\s*[-*+]\s+/, ""))}</li>`); i++; }
      out.push(`<ul>${items.join("")}</ul>`); continue;
    }
    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara(); const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`); i++; }
      out.push(`<ol>${items.join("")}</ol>`); continue;
    }
    // blockquote
    if (/^&gt;\s?/.test(line)) {
      flushPara(); const items: string[] = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) { items.push(inline(lines[i].replace(/^&gt;\s?/, ""))); i++; }
      out.push(`<blockquote>${items.join("<br>")}</blockquote>`); continue;
    }

    para.push(line);
    i++;
  }
  flushPara();
  return out.join("");
}
