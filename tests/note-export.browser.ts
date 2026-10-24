import { pageClipboard } from "../lib/note-export";
export function runNoteExportChecks() {
  const page = { title: "A & B", blocks: [{ id: "a", type: "text" as const, text: '<b>First</b><div><br></div><div>Second &amp; third</div>' }, { id: "b", type: "h2" as const, text: "Heading" }, { id: "c", type: "table" as const, text: "", table: { rows: [["One", "Two"], ["Three", "Four"]] } }, { id: "d", type: "text" as const, text: 'Last <span style="color:#ff0000" onclick="alert(1)">line</span>' }] };
  const copy = pageClipboard(page);
  if (!copy.text.includes("First\n\nSecond & third\n## Heading\nOne | Two\nThree | Four\nLast line")) throw new Error("Page copy lost a block or paragraph boundary");
  if (!copy.html.includes("<b>First</b>") || !copy.html.includes("<h2>Heading</h2>") || !copy.html.includes("color") || copy.html.includes("onclick")) throw new Error("Page copy lost formatting or retained executable markup");
  const numbered = pageClipboard({ title: "List", blocks: [{ id: "n1", type: "numbered", text: "One" }, { id: "n2", type: "numbered", text: "Two" }] });
  if (!numbered.html.includes("<ol><li>One</li><li>Two</li></ol>") || !numbered.text.includes("1. One\n2. Two")) throw new Error("Page copy restarted numbering between blocks");
  const unsafe = pageClipboard({ title: "Safe", blocks: [{ id: "unsafe", type: "text", text: '<script>bad()</script><img src="/never-fetch-from-copy" onerror="bad()"><b>Keep this</b>' }] });
  if (unsafe.text !== "Safe\n\nKeep this" || /script|onerror|<img/.test(unsafe.html)) throw new Error("Page export retained active content");
  return { checks: 4, passed: true };
}
