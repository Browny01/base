"use client";

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { uid, cn } from "@/lib/utils";
import type { WikiPage, WikiBlock, WikiBlockType } from "@/lib/store";
import { TableBlock, BoardBlock, ChartBlock, ExtraBlock } from "@/components/wiki-blocks";
import {
  Type, Heading1, Heading2, Heading3, List, ListOrdered, ListTodo,
  Quote, Code2, Minus, Image as ImageIcon, Plus, GripVertical, Trash2,
  ChevronUp, ChevronDown, ChevronRight, ImagePlus, Bold, Italic, Underline, Strikethrough,
  Baseline, Highlighter, ALargeSmall, Table as TableIcon, SquareKanban, ChartColumn,
  Link2, Eraser, Info, FileSymlink, ListTree, FileText, Pin, PinOff,
  Bookmark, Globe, Video, Music, Paperclip, Images, Columns2, PanelTop, ListCollapse,
  SeparatorHorizontal, Gauge, ListChecks, Hash, Timer, Star, Table2, Tags, Sigma,
  Workflow, Pencil, StickyNote, MousePointerClick, Copy, Check,
} from "lucide-react";

const BLOCK_TYPES: { type: WikiBlockType; label: string; hint: string; Icon: typeof Type }[] = [
  { type: "text",     label: "Text",          hint: "Plain paragraph",      Icon: Type },
  { type: "h1",       label: "Heading 1",     hint: "Big section heading",  Icon: Heading1 },
  { type: "h2",       label: "Heading 2",     hint: "Medium heading",       Icon: Heading2 },
  { type: "h3",       label: "Heading 3",     hint: "Small heading",        Icon: Heading3 },
  { type: "bulleted", label: "Bulleted list", hint: "Simple bullet list",   Icon: List },
  { type: "numbered", label: "Numbered list", hint: "Ordered list",         Icon: ListOrdered },
  { type: "todo",     label: "To-do list",    hint: "Checkbox to-dos",      Icon: ListTodo },
  { type: "toggle",   label: "Toggle list",   hint: "Collapsible section",  Icon: ListTree },
  { type: "callout",  label: "Callout",       hint: "Highlighted note box", Icon: Info },
  { type: "quote",    label: "Quote",         hint: "Capture a quote",      Icon: Quote },
  { type: "code",     label: "Code",          hint: "Monospace block",      Icon: Code2 },
  { type: "divider",  label: "Divider",       hint: "Visual separator",     Icon: Minus },
  { type: "image",    label: "Image",         hint: "Upload a picture",     Icon: ImageIcon },
  { type: "pagelink", label: "Link to page",  hint: "Embed another note",   Icon: FileSymlink },
  { type: "table",    label: "Table",         hint: "Rows and columns",     Icon: TableIcon },
  { type: "board",    label: "Board",         hint: "Kanban columns",       Icon: SquareKanban },
  { type: "chart",    label: "Chart",         hint: "Bar, line or donut",   Icon: ChartColumn },
  { type: "sticky",   label: "Sticky note",   hint: "Coloured note card",   Icon: StickyNote },
  { type: "bookmark", label: "Bookmark",      hint: "Link preview card",    Icon: Bookmark },
  { type: "embed",    label: "Embed",         hint: "YouTube, Spotify, Figma…", Icon: Globe },
  { type: "video",    label: "Video",         hint: "Embed or .mp4 link",   Icon: Video },
  { type: "audio",    label: "Audio",         hint: "Audio player",         Icon: Music },
  { type: "file",     label: "File",          hint: "Attach a file link",   Icon: Paperclip },
  { type: "gallery",  label: "Gallery",       hint: "Grid of images",       Icon: Images },
  { type: "columns",  label: "Columns",       hint: "Side-by-side columns", Icon: Columns2 },
  { type: "tabs",     label: "Tabs",          hint: "Tabbed panels",        Icon: PanelTop },
  { type: "accordion",label: "Accordion / FAQ", hint: "Collapsible items",  Icon: ListCollapse },
  { type: "toc",      label: "Table of contents", hint: "Auto from headings", Icon: ListTree },
  { type: "labeleddivider", label: "Labeled divider", hint: "Section break", Icon: SeparatorHorizontal },
  { type: "synced",   label: "Embed note",    hint: "Live preview of a note", Icon: Link2 },
  { type: "progress", label: "Progress bar",  hint: "% toward a goal",      Icon: Gauge },
  { type: "checklist",label: "Checklist",     hint: "Items with progress %", Icon: ListChecks },
  { type: "counter",  label: "Counter",       hint: "Tally / streak",       Icon: Hash },
  { type: "countdown",label: "Countdown",     hint: "Days until a date",    Icon: Timer },
  { type: "rating",   label: "Rating",        hint: "1–5 stars",            Icon: Star },
  { type: "pageindex",label: "Sub-page index", hint: "List of sub-pages",   Icon: Table2 },
  { type: "properties", label: "Properties",  hint: "Key / value metadata", Icon: Tags },
  { type: "math",     label: "Equation",      hint: "Formula display",      Icon: Sigma },
  { type: "diagram",  label: "Diagram",       hint: "Mermaid source",       Icon: Workflow },
  { type: "sketch",   label: "Sketch",        hint: "Freehand drawing",     Icon: Pencil },
  { type: "button",   label: "Button",        hint: "Link to a page or URL", Icon: MousePointerClick },
];

// Extended blocks rendered by <ExtraBlock> (everything new except the inline "sticky").
const EXTRA_TYPES = new Set<WikiBlockType>([
  "bookmark", "embed", "video", "audio", "file", "gallery", "columns", "tabs", "accordion",
  "toc", "labeleddivider", "synced", "progress", "checklist", "counter", "countdown",
  "rating", "pageindex", "properties", "math", "diagram", "sketch", "button",
]);

// Blocks with no inline-editable text (they render their own UI).
const VOID_TYPES = new Set<WikiBlockType>([
  "divider", "image", "table", "board", "chart", "pagelink",
  "bookmark", "embed", "video", "audio", "file", "gallery", "columns", "tabs", "accordion",
  "toc", "labeleddivider", "synced", "progress", "checklist", "counter", "countdown",
  "rating", "pageindex", "properties", "math", "diagram", "sketch", "button",
]);
const isVoid = (t: WikiBlockType) => VOID_TYPES.has(t);
// Blocks whose main text can receive rich-text formatting (used by ⌘A → format all).
const isFormattable = (t: WikiBlockType) => !isVoid(t);

// Seed default data when converting into a rich block type.
function withTypeDefaults(b: WikiBlock): WikiBlock {
  if (b.type === "table" && !b.table) b.table = { rows: [["Column 1", "Column 2", "Column 3"], ["", "", ""], ["", "", ""]] };
  if (b.type === "board" && !b.board) b.board = [{ id: uid(), title: "To do", cards: [] }, { id: uid(), title: "In progress", cards: [] }, { id: uid(), title: "Done", cards: [] }];
  if (b.type === "chart" && !b.chart) b.chart = { kind: "bar", data: [{ label: "A", value: 8 }, { label: "B", value: 14 }, { label: "C", value: 6 }, { label: "D", value: 11 }] };
  if (b.type === "callout" && !b.emoji) b.emoji = "💡";
  if (b.type === "toggle" && b.body === undefined) b.body = "";
  if (b.type === "sticky" && !b.color) b.color = "#fef9c3";
  if (b.type === "columns" && !b.cols) b.cols = ["", ""];
  if (b.type === "tabs" && !b.panels) b.panels = [{ id: uid(), title: "Tab 1", body: "" }, { id: uid(), title: "Tab 2", body: "" }];
  if (b.type === "accordion" && !b.panels) b.panels = [{ id: uid(), title: "", body: "" }];
  if (b.type === "checklist" && !b.checks) b.checks = [{ id: uid(), text: "", done: false }];
  if (b.type === "properties" && !b.props) b.props = [{ id: uid(), key: "Status", value: "" }];
  if (b.type === "gallery" && !b.images) b.images = [];
  if (b.type === "progress" && b.value === undefined) b.value = 50;
  if (b.type === "rating" && b.value === undefined) b.value = 0;
  if (b.type === "counter" && b.value === undefined) b.value = 0;
  return b;
}

const FONT_SIZE_PX: Record<string, string> = { "2": "13px", "3": "15px", "5": "22px", "6": "28px" };

// ── Cross-block formatting helpers (⌘A → bold/underline everything) ───────────────
const wrappedIn = (html: string, tag: string) => {
  const t = html.trim();
  return t.startsWith(`<${tag}>`) && t.endsWith(`</${tag}>`);
};
const wrapTag = (html: string, tag: string) => (wrappedIn(html, tag) ? html : `<${tag}>${html}</${tag}>`);
const unwrapTag = (html: string, tag: string) => {
  const t = html.trim();
  return wrappedIn(t, tag) ? t.slice(tag.length + 2, t.length - (tag.length + 3)) : html;
};

const TEXT_COLORS = ["#737373", "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];
const HIGHLIGHTS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa", "#e9d5ff", "#fecaca", "#e5e7eb"];
const STICKY_COLORS = ["#fef9c3", "#dcfce7", "#dbeafe", "#fce7f3", "#ffedd5", "#ede9fe", "#fee2e2", "#f1f5f9"];

const newBlock = (type: WikiBlockType = "text", text = ""): WikiBlock => ({ id: uid(), type, text });

// ── DOM selection helpers (for splitting / merging contentEditable blocks) ───────
function caretAtStart(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const r = sel.getRangeAt(0);
  if (!r.collapsed) return false;
  const pre = r.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().length === 0;
}
function caretAtEnd(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const r = sel.getRangeAt(0);
  if (!r.collapsed) return false;
  const post = r.cloneRange();
  post.selectNodeContents(el);
  post.setStart(r.endContainer, r.endOffset);
  return post.toString().length === 0;
}
function splitAtCaret(el: HTMLElement): { before: string; after: string } {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { before: el.innerHTML, after: "" };
  const r = sel.getRangeAt(0);
  const bR = r.cloneRange(); bR.selectNodeContents(el); bR.setEnd(r.startContainer, r.startOffset);
  const aR = r.cloneRange(); aR.selectNodeContents(el); aR.setStart(r.endContainer, r.endOffset);
  const d1 = document.createElement("div"); d1.appendChild(bR.cloneContents());
  const d2 = document.createElement("div"); d2.appendChild(aR.cloneContents());
  return { before: d1.innerHTML, after: d2.innerHTML };
}
function placeCaret(el: HTMLElement, where: "start" | "end") {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(where === "start");
  sel.removeAllRanges();
  sel.addRange(r);
}
function placeCaretAtMarker(el: HTMLElement) {
  const m = el.querySelector("#__caret__");
  if (!m) { placeCaret(el, "end"); return; }
  const sel = window.getSelection();
  const r = document.createRange();
  r.setStartBefore(m); r.collapse(true);
  sel?.removeAllRanges(); sel?.addRange(r);
  el.focus();
  m.remove();
}
const normalizeHTML = (h: string) => (h === "<br>" || h === "\n" ? "" : h);
const stripTags = (h: string) => { const d = document.createElement("div"); d.innerHTML = h; return d.textContent || ""; };
// True when the current selection already covers this block's entire text.
function isWholeBlockSelected(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
  const text = el.textContent ?? "";
  if (text.length === 0) return false;
  return sel.toString().length >= text.length && el.contains(sel.anchorNode) && el.contains(sel.focusNode);
}

// ── Image processing (downscale + upload to Vercel Blob, data-URL fallback) ──────
async function processImage(file: File): Promise<string | null> {
  const read = await new Promise<{ blob: Blob | null; dataUrl: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1400;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const ctx = c.getContext("2d"); if (!ctx) return reject(new Error("no ctx"));
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = c.toDataURL("image/jpeg", 0.85);
        c.toBlob((blob) => resolve({ blob, dataUrl }), "image/jpeg", 0.85);
      };
      img.onerror = reject; img.src = reader.result as string;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  }).catch(() => null);
  if (!read) return null;
  if (read.blob) {
    try {
      const res = await fetch(`/api/blob/upload?filename=note-${Date.now()}.jpg`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: read.blob });
      if (res.ok) { const { url } = await res.json(); if (typeof url === "string") return url; }
    } catch { /* fall through */ }
  }
  return read.dataUrl;
}

type FocusReq = { id: string; caret: "start" | "end" } | null;

export function WikiEditor({
  page, onChange, fullWidth, allPages, onOpenPage,
}: {
  page: WikiPage;
  onChange: (patch: Partial<WikiPage>) => void;
  fullWidth: boolean;
  allPages: WikiPage[];
  onOpenPage: (id: string) => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState(page.icon);
  const [description, setDescription] = useState(page.description ?? "");
  const [blocks, setBlocks] = useState<WikiBlock[]>(page.blocks.length ? page.blocks : [newBlock()]);
  const [slash, setSlash] = useState<{ blockId: string; query: string; index: number; viaPlus: boolean } | null>(null);
  const [toolbar, setToolbar] = useState<{ top: number; left: number } | null>(null);
  // ⌘A-twice selects every block at once for a single bulk format action.
  const [selectedAll, setSelectedAll] = useState(false);
  const selectedAllRef = useRef(false);
  useEffect(() => { selectedAllRef.current = selectedAll; }, [selectedAll]);

  const latest = useRef({ title, icon, description, blocks });
  useEffect(() => { latest.current = { title, icon, description, blocks }; });

  const refs = useRef(new Map<string, HTMLDivElement>());
  const [focusReq, setFocusReq] = useState<FocusReq>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(() => {
    onChange({ title: latest.current.title.trim(), icon: latest.current.icon, description: latest.current.description.trim(), blocks: latest.current.blocks, updatedAt: new Date().toISOString() });
  }, [onChange]);
  // Keep a stable ref to the latest persist so effects don't depend on its
  // (per-render) identity — depending on it caused an infinite update loop.
  const persistRef = useRef(persist);
  useEffect(() => { persistRef.current = persist; });
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persistRef.current(), 400);
  }, []);
  // Flush pending edits only on unmount (switching pages).
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); persistRef.current(); }, []);

  useEffect(() => {
    if (!focusReq) return;
    const el = refs.current.get(focusReq.id);
    if (el) placeCaret(el, focusReq.caret);
  }, [focusReq]);

  const commitBlocks = (next: WikiBlock[]) => { setBlocks(next); scheduleSave(); };
  const setType = (id: string, type: WikiBlockType) =>
    commitBlocks(blocks.map((b) => (b.id === id ? withTypeDefaults({ ...b, type, text: type === "divider" ? "" : b.text }) : b)));
  const patchBlock = (id: string, patch: Partial<WikiBlock>) => commitBlocks(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const toggleCheck = (id: string) => commitBlocks(blocks.map((b) => (b.id === id ? { ...b, checked: !b.checked } : b)));
  const setCaption = (id: string, caption: string) => commitBlocks(blocks.map((b) => (b.id === id ? { ...b, caption } : b)));
  const setSrc = (id: string, src: string) => commitBlocks(blocks.map((b) => (b.id === id ? { ...b, src } : b)));

  const removeBlock = (id: string) => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const next = blocks.filter((b) => b.id !== id);
    if (!next.length) next.push(newBlock());
    commitBlocks(next);
    const tgt = next[Math.max(0, idx - 1)];
    if (tgt) setFocusReq({ id: tgt.id, caret: "end" });
  };
  const moveBlock = (id: string, dir: -1 | 1) => {
    const idx = blocks.findIndex((b) => b.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= blocks.length) return;
    const next = [...blocks]; [next[idx], next[j]] = [next[j], next[idx]]; commitBlocks(next);
  };
  const addBlockBelow = (id: string) => {
    const idx = blocks.findIndex((b) => b.id === id);
    const nb = newBlock();
    const next = [...blocks]; next.splice(idx + 1, 0, nb); commitBlocks(next);
    setFocusReq({ id: nb.id, caret: "start" });
  };
  // The "+" gutter button inserts a new block and opens the block picker for it.
  const insertAndPick = (afterId: string) => {
    const idx = blocks.findIndex((b) => b.id === afterId);
    const nb = newBlock();
    const next = [...blocks]; next.splice(idx + 1, 0, nb); commitBlocks(next);
    setFocusReq({ id: nb.id, caret: "start" });
    setSlash({ blockId: nb.id, query: "", index: 0, viaPlus: true });
  };

  // ── Slash menu ─────────────────────────────────────────────────────────────
  const slashResults = slash ? BLOCK_TYPES.filter((t) => t.label.toLowerCase().includes(slash.query.toLowerCase())) : [];
  const pickSlash = (blockId: string, type: WikiBlockType) => {
    setSlash(null);
    const el = refs.current.get(blockId);
    if (el) el.innerHTML = "";
    if (type === "divider") {
      const idx = blocks.findIndex((b) => b.id === blockId);
      const nb = newBlock();
      const next = blocks.map((b) => (b.id === blockId ? { ...b, type, text: "" } : b));
      next.splice(idx + 1, 0, nb); commitBlocks(next);
      setFocusReq({ id: nb.id, caret: "start" });
      return;
    }
    commitBlocks(blocks.map((b) => (b.id === blockId ? withTypeDefaults({ ...b, type, text: "" }) : b)));
    if (!isVoid(type)) setFocusReq({ id: blockId, caret: "start" });
  };

  // ── Input (markdown shortcuts + slash detection + sync) ─────────────────────
  const handleInput = (block: WikiBlock, el: HTMLDivElement) => {
    if (normalizeHTML(el.innerHTML) === "") el.innerHTML = "";
    const tc = el.textContent ?? "";
    const storeText = () => { const html = normalizeHTML(el.innerHTML); setBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, text: html } : b))); scheduleSave(); };

    if (block.type === "text") {
      // Block picker already open for this block → keep filtering by what's typed.
      if (slash && slash.blockId === block.id) {
        if (!slash.viaPlus && !tc.startsWith("/")) setSlash(null);
        else setSlash({ ...slash, query: tc.startsWith("/") ? tc.slice(1) : tc, index: 0 });
        storeText(); return;
      }
      if (tc.startsWith("/")) { setSlash({ blockId: block.id, query: tc.slice(1), index: 0, viaPlus: false }); storeText(); return; }

      const SC: Record<string, WikiBlockType> = {
        "# ": "h1", "## ": "h2", "### ": "h3", "- ": "bulleted", "* ": "bulleted",
        "1. ": "numbered", "[] ": "todo", "[ ] ": "todo", "> ": "quote",
      };
      if (SC[tc]) { el.innerHTML = ""; commitBlocks(blocks.map((b) => (b.id === block.id ? { ...b, type: SC[tc], text: "" } : b))); return; }
      if (tc === "```") { el.innerHTML = ""; setType(block.id, "code"); return; }
      if (tc === "---" || tc === "***") { el.innerHTML = ""; pickSlash(block.id, "divider"); return; }
    }
    storeText();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, block: WikiBlock) => {
    const el = e.currentTarget;
    const mod = e.metaKey || e.ctrlKey;

    // While every block is selected (⌘A twice), format shortcuts hit all blocks.
    if (selectedAllRef.current) {
      const k = e.key.toLowerCase();
      if (mod && (k === "b" || k === "i" || k === "u")) {
        e.preventDefault();
        runFormat(k === "b" ? "bold" : k === "i" ? "italic" : "underline");
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); setSelectedAll(false); return; }
      if (!mod && e.key.length === 1) setSelectedAll(false); // typing cancels the bulk selection
    }
    // ⌘A: first press selects the block; a second press selects every block.
    if (mod && e.key.toLowerCase() === "a") {
      if (isWholeBlockSelected(el)) {
        e.preventDefault();
        window.getSelection()?.removeAllRanges();
        setSelectedAll(true);
        return;
      }
    }

    if (slash && slash.blockId === block.id && slashResults.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlash({ ...slash, index: (slash.index + 1) % slashResults.length }); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSlash({ ...slash, index: (slash.index - 1 + slashResults.length) % slashResults.length }); return; }
      if (e.key === "Enter")     { e.preventDefault(); pickSlash(block.id, slashResults[slash.index].type); return; }
      if (e.key === "Escape")    { e.preventDefault(); setSlash(null); return; }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      if (block.type === "code") { e.preventDefault(); document.execCommand("insertText", false, "\n"); handleInput(block, el); return; }
      e.preventDefault();
      const isList = block.type === "bulleted" || block.type === "numbered" || block.type === "todo";
      if (isList && (el.textContent ?? "").trim() === "") { setType(block.id, "text"); return; }
      const { before, after } = splitAtCaret(el);
      el.innerHTML = before;
      const nb: WikiBlock = { ...newBlock(isList ? block.type : "text", after), checked: false };
      const idx = blocks.findIndex((b) => b.id === block.id);
      const next = blocks.map((b) => (b.id === block.id ? { ...b, text: before } : b));
      next.splice(idx + 1, 0, nb); commitBlocks(next);
      setFocusReq({ id: nb.id, caret: "start" });
      return;
    }

    if (e.key === "Backspace" && caretAtStart(el)) {
      if (block.type !== "text") { e.preventDefault(); setType(block.id, "text"); return; }
      const idx = blocks.findIndex((b) => b.id === block.id);
      if (idx > 0) {
        const prev = blocks[idx - 1];
        e.preventDefault();
        if (isVoid(prev.type)) {
          commitBlocks(blocks.filter((b) => b.id !== prev.id));
          setFocusReq({ id: block.id, caret: "start" });
          return;
        }
        const merged = prev.text + '<span id="__caret__"></span>' + block.text;
        const next = blocks.map((b) => (b.id === prev.id ? { ...b, text: prev.text + block.text } : b)).filter((b) => b.id !== block.id);
        commitBlocks(next);
        requestAnimationFrame(() => { const pe = refs.current.get(prev.id); if (pe) { pe.innerHTML = merged; placeCaretAtMarker(pe); } });
      }
      return;
    }

    if (e.key === "ArrowUp" && caretAtStart(el)) {
      const idx = blocks.findIndex((b) => b.id === block.id);
      if (idx > 0) { e.preventDefault(); setFocusReq({ id: blocks[idx - 1].id, caret: "end" }); }
    }
    if (e.key === "ArrowDown" && caretAtEnd(el)) {
      const idx = blocks.findIndex((b) => b.id === block.id);
      if (idx < blocks.length - 1) { e.preventDefault(); setFocusReq({ id: blocks[idx + 1].id, caret: "start" }); }
    }
  };

  // Paste as plain text so external styling (e.g. stuck underlines) never sticks.
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>, block: WikiBlock) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    handleInput(block, e.currentTarget);
  };

  const onUploadImage = async (id: string, file: File) => { const src = await processImage(file); if (src) setSrc(id, src); };

  // ── Selection toolbar ────────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0;
    const onSel = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setToolbar(null); return; }
        const anchor = sel.anchorNode;
        const host = anchor && (anchor.nodeType === 3 ? anchor.parentElement : (anchor as HTMLElement))?.closest?.(".nx-block");
        if (!host || !rootRef.current?.contains(host)) { setToolbar(null); return; }
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (!rect.width && !rect.height) { setToolbar(null); return; }
        const top = rect.top > 56 ? rect.top - 46 : rect.bottom + 10;
        setToolbar({ top, left: rect.left + rect.width / 2 });
      });
    };
    document.addEventListener("selectionchange", onSel);
    return () => { document.removeEventListener("selectionchange", onSel); cancelAnimationFrame(raf); };
  }, []);

  const syncActiveFromSelection = () => {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    const host = node && (node.nodeType === 3 ? node.parentElement : (node as HTMLElement))?.closest?.("[data-block-id]") as HTMLElement | null;
    if (!host) return;
    const id = host.getAttribute("data-block-id");
    if (!id) return;
    const html = normalizeHTML(host.innerHTML);
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, text: html } : b)));
    scheduleSave();
  };
  const exec = (cmd: string, value?: string) => {
    if (cmd === "foreColor" || cmd === "hiliteColor" || cmd === "fontSize") document.execCommand("styleWithCSS", false, "true");
    document.execCommand(cmd, false, value);
    syncActiveFromSelection();
  };

  // Apply a formatting action to every formattable block at once (bulk ⌘A mode).
  const applyToAllBlocks = (transform: (html: string) => string) => {
    const next = blocks.map((b) => {
      if (!isFormattable(b.type) || stripTags(b.text).trim() === "") return b;
      return { ...b, text: transform(b.text) };
    });
    setBlocks(next);
    scheduleSave();
    requestAnimationFrame(() => next.forEach((b) => { const el = refs.current.get(b.id); if (el && isFormattable(b.type)) el.innerHTML = b.text; }));
  };
  const TAG_FOR: Record<string, string> = { bold: "b", italic: "i", underline: "u", strikeThrough: "s" };
  // Routes a toolbar/shortcut command either to the live selection or to all blocks.
  const runFormat = (cmd: string, value?: string) => {
    if (!selectedAllRef.current) { exec(cmd, value); return; }
    if (cmd === "removeFormat") { applyToAllBlocks((h) => stripTags(h).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")); return; }
    if (cmd === "createLink") return; // links need a precise range; not supported on "all"
    const tag = TAG_FOR[cmd];
    if (tag) {
      const targets = blocks.filter((b) => isFormattable(b.type) && stripTags(b.text).trim() !== "");
      const allOn = targets.length > 0 && targets.every((b) => wrappedIn(b.text, tag));
      applyToAllBlocks((h) => (allOn ? unwrapTag(h, tag) : wrapTag(h, tag)));
      return;
    }
    const style = cmd === "foreColor" ? `color:${value}` : cmd === "hiliteColor" ? `background-color:${value}` : cmd === "fontSize" ? `font-size:${FONT_SIZE_PX[value ?? "3"]}` : "";
    if (style) applyToAllBlocks((h) => `<span style="${style}">${h}</span>`);
  };

  // Clear the bulk selection on any outside click or Escape.
  useEffect(() => {
    if (!selectedAll) return;
    const clear = () => setSelectedAll(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedAll(false); };
    document.addEventListener("mousedown", clear);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", clear); document.removeEventListener("keydown", onKey); };
  }, [selectedAll]);

  const registerRef = (id: string, el: HTMLDivElement | null) => { if (el) refs.current.set(id, el); else refs.current.delete(id); };

  // Numbered-list display numbers (per contiguous run)
  const numbers = new Map<string, number>();
  let run = 0;
  for (const b of blocks) { if (b.type === "numbered") { run += 1; numbers.set(b.id, run); } else run = 0; }

  return (
    <div ref={rootRef} className={cn("relative mx-auto px-6 sm:px-12 py-10", fullWidth ? "max-w-none" : "max-w-[760px]", selectedAll && "nx-allsel")}>
      {/* Icon + title */}
      <div className="mb-5">
        <EmojiButton value={icon} onChange={(e) => { setIcon(e); scheduleSave(); }} />
        <textarea
          value={title}
          onChange={(e) => { setTitle(e.target.value.replace(/\n/g, "")); scheduleSave(); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (blocks[0]) setFocusReq({ id: blocks[0].id, caret: "start" }); } }}
          rows={1}
          placeholder="Untitled"
          className="w-full resize-none bg-transparent text-[40px] leading-tight font-bold text-[var(--text)] placeholder-[var(--faint)]/40 focus:outline-none outline-none overflow-hidden mt-2"
        />
        <textarea
          value={description}
          onChange={(e) => { setDescription(e.target.value.replace(/\n/g, "")); scheduleSave(); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (blocks[0]) setFocusReq({ id: blocks[0].id, caret: "start" }); } }}
          rows={1}
          placeholder="Add a description…"
          className="w-full resize-none bg-transparent text-[15px] leading-snug text-[var(--muted)] placeholder-[var(--faint)]/50 focus:outline-none overflow-hidden mt-1.5"
        />
      </div>

      {/* Blocks */}
      <div className="space-y-0.5">
        {blocks.map((block) => (
          <BlockRow
            key={block.id}
            block={block}
            number={numbers.get(block.id)}
            allPages={allPages}
            currentPageId={page.id}
            pageBlocks={blocks}
            onOpenPage={onOpenPage}
            registerRef={registerRef}
            onInput={(el) => handleInput(block, el)}
            onKeyDown={(e) => handleKeyDown(e, block)}
            onPaste={(e) => handlePaste(e, block)}
            onBlur={() => { if (slash?.blockId === block.id) setSlash(null); }}
            onToggleCheck={() => toggleCheck(block.id)}
            onSetType={(t) => setType(block.id, t)}
            onDelete={() => removeBlock(block.id)}
            onMoveUp={() => moveBlock(block.id, -1)}
            onMoveDown={() => moveBlock(block.id, 1)}
            onAddBelow={() => insertAndPick(block.id)}
            onUploadImage={(f) => onUploadImage(block.id, f)}
            onCaption={(c) => setCaption(block.id, c)}
            onPatch={(patch) => patchBlock(block.id, patch)}
            slashMenu={slash?.blockId === block.id && slashResults.length ? (
              <SlashMenu results={slashResults} index={slash.index} onPick={(t) => pickSlash(block.id, t)} />
            ) : null}
          />
        ))}
      </div>

      <button
        onClick={() => { const last = blocks[blocks.length - 1]; if (last) addBlockBelow(last.id); }}
        className="mt-2 w-full text-left px-1 py-2 text-[15px] text-[var(--faint)]/60 hover:text-[var(--muted)] transition-colors"
      >
        Click here to continue writing…
      </button>

      {/* Floating / pinned images (Vision-style, free-positioned over the page) */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        {blocks.filter((b) => b.type === "image" && b.floating && b.src).map((b) => (
          <FloatingImage
            key={b.id}
            block={b}
            onPatch={(patch) => patchBlock(b.id, patch)}
            onUnpin={() => patchBlock(b.id, { floating: false })}
            onDelete={() => removeBlock(b.id)}
          />
        ))}
      </div>

      {(toolbar || selectedAll) && (
        <FormatToolbar
          pos={selectedAll ? { top: 70, left: (typeof window !== "undefined" ? window.innerWidth / 2 : 400) } : toolbar!}
          exec={runFormat}
          bulk={selectedAll}
        />
      )}
    </div>
  );
}

// ── Floating selection toolbar ──────────────────────────────────────────────────
function FormatToolbar({ pos, exec, bulk }: { pos: { top: number; left: number }; exec: (cmd: string, value?: string) => void; bulk?: boolean }) {
  const [popover, setPopover] = useState<"color" | "highlight" | "size" | null>(null);
  const stop = (e: React.MouseEvent) => e.preventDefault(); // keep the text selection alive
  // Don't let clicks bubble to the document handler that cancels the bulk selection.
  const stopAll = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
  const btnCls = "w-8 h-8 flex items-center justify-center rounded-md text-[var(--text)] hover:bg-[var(--chip)] transition-colors";
  return createPortal(
    <div
      className="fixed z-[200] -translate-x-1/2 flex items-center gap-0.5 px-1 py-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-xl nx-pop"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={stopAll}
    >
      {bulk && <span className="px-2 text-[11px] font-medium text-[var(--faint)] whitespace-nowrap">All blocks</span>}
      <button onMouseDown={stop} onClick={() => exec("bold")} title="Bold" className={btnCls}><Bold className="w-4 h-4" /></button>
      <button onMouseDown={stop} onClick={() => exec("italic")} title="Italic" className={btnCls}><Italic className="w-4 h-4" /></button>
      <button onMouseDown={stop} onClick={() => exec("underline")} title="Underline" className={btnCls}><Underline className="w-4 h-4" /></button>
      <button onMouseDown={stop} onClick={() => exec("strikeThrough")} title="Strikethrough" className={btnCls}><Strikethrough className="w-4 h-4" /></button>
      {!bulk && (
        <button
          onMouseDown={stop}
          onClick={() => {
            const sel = window.getSelection();
            const a = (sel?.anchorNode?.nodeType === 3 ? sel?.anchorNode?.parentElement : sel?.anchorNode as HTMLElement)?.closest?.("a") as HTMLAnchorElement | null;
            if (a) { exec("unlink"); return; }
            const url = window.prompt("Link URL (https://…)");
            if (url) exec("createLink", /^(https?:|mailto:|#)/.test(url) ? url : `https://${url}`);
          }}
          title="Add / remove link"
          className={btnCls}
        ><Link2 className="w-4 h-4" /></button>
      )}
      <button onMouseDown={stop} onClick={() => exec("removeFormat")} title="Clear formatting" className={btnCls}><Eraser className="w-4 h-4" /></button>
      <div className="w-px h-5 bg-[var(--border)] mx-0.5" />

      {/* Font size */}
      <Popover open={popover === "size"} onToggle={() => setPopover((p) => (p === "size" ? null : "size"))} icon={<ALargeSmall className="w-4 h-4" />} title="Font size">
        <div className="flex flex-col w-32">
          {([["Small", "2"], ["Normal", "3"], ["Large", "5"], ["Huge", "6"]] as const).map(([label, v]) => (
            <button key={v} onMouseDown={stop} onClick={() => { exec("fontSize", v); setPopover(null); }} className="px-2 py-1.5 rounded-md text-left text-[13px] text-[var(--text)] hover:bg-[var(--chip)]">{label}</button>
          ))}
        </div>
      </Popover>

      {/* Text color */}
      <Popover open={popover === "color"} onToggle={() => setPopover((p) => (p === "color" ? null : "color"))} icon={<Baseline className="w-4 h-4" />} title="Text color">
        <Swatches colors={TEXT_COLORS} ring onPick={(c) => { exec("foreColor", c); setPopover(null); }} stop={stop} />
      </Popover>

      {/* Highlight */}
      <Popover open={popover === "highlight"} onToggle={() => setPopover((p) => (p === "highlight" ? null : "highlight"))} icon={<Highlighter className="w-4 h-4" />} title="Highlight">
        <Swatches colors={HIGHLIGHTS} onPick={(c) => { exec("hiliteColor", c); setPopover(null); }} stop={stop} />
      </Popover>
    </div>,
    document.body,
  );
}

function Popover({ open, onToggle, icon, title, children }: { open: boolean; onToggle: () => void; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="relative">
      <button onMouseDown={(e) => e.preventDefault()} onClick={onToggle} title={title} className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--text)] hover:bg-[var(--chip)] transition-colors">{icon}</button>
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 p-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-xl nx-pop">{children}</div>
      )}
    </div>
  );
}
function Swatches({ colors, onPick, stop, ring }: { colors: string[]; onPick: (c: string) => void; stop: (e: React.MouseEvent) => void; ring?: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-1 w-32">
      {colors.map((c) => (
        <button key={c} onMouseDown={stop} onClick={() => onPick(c)} className="w-6 h-6 rounded-md border border-[var(--border)] hover:scale-110 transition-transform" style={ring ? { color: c, background: "transparent", borderColor: c } : { background: c }}>
          {ring ? <span className="text-[13px] font-bold">A</span> : null}
        </button>
      ))}
    </div>
  );
}

// ── Floating / pinned image (drag + resize, Vision-style) ────────────────────────
function FloatingImage({ block, onPatch, onUnpin, onDelete }: {
  block: WikiBlock;
  onPatch: (patch: Partial<WikiBlock>) => void;
  onUnpin: () => void;
  onDelete: () => void;
}) {
  const x = block.x ?? 40, y = block.y ?? 40, w = block.w ?? 280;

  // Drag the whole image around the canvas.
  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).dataset.handle) return; // resize handle has its own logic
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, ox = x, oy = y;
    const move = (ev: PointerEvent) => onPatch({ x: Math.max(0, ox + ev.clientX - sx), y: Math.max(0, oy + ev.clientY - sy) });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  // Resize from the bottom-right corner.
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, ow = w;
    const move = (ev: PointerEvent) => onPatch({ w: Math.max(90, Math.min(900, ow + ev.clientX - sx)) });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  return (
    <div
      className="group/float absolute pointer-events-auto select-none"
      style={{ left: x, top: y, width: w, touchAction: "none" }}
      onPointerDown={startDrag}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={block.src} alt={block.caption || ""} draggable={false}
        className="w-full h-auto rounded-lg border border-[var(--border)] shadow-lg cursor-grab active:cursor-grabbing" />
      {block.caption && <p className="mt-1 text-[11px] text-[var(--muted)] truncate">{block.caption}</p>}

      {/* controls */}
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover/float:opacity-100 transition-opacity">
        <button onClick={onUnpin} title="Unpin" className="w-7 h-7 flex items-center justify-center rounded-md bg-[var(--bg)]/85 backdrop-blur border border-[var(--border)] text-[var(--text)] hover:bg-[var(--chip)]"><PinOff className="w-3.5 h-3.5" /></button>
        <button onClick={onDelete} title="Delete" className="w-7 h-7 flex items-center justify-center rounded-md bg-[var(--bg)]/85 backdrop-blur border border-[var(--border)] text-[var(--text)] hover:text-red-500 hover:bg-[var(--chip)]"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      {/* resize handle */}
      <div
        data-handle="resize"
        onPointerDown={startResize}
        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[var(--text)] border-2 border-[var(--bg)] cursor-se-resize opacity-0 group-hover/float:opacity-100 transition-opacity"
        style={{ touchAction: "none" }}
      />
    </div>
  );
}

// ── A single block row ──────────────────────────────────────────────────────────
function BlockRow({
  block, number, allPages, currentPageId, pageBlocks, onOpenPage, registerRef, onInput, onKeyDown, onPaste, onBlur, onToggleCheck, onSetType,
  onDelete, onMoveUp, onMoveDown, onAddBelow, onUploadImage, onCaption, onPatch, slashMenu,
}: {
  block: WikiBlock;
  number?: number;
  allPages: WikiPage[];
  currentPageId: string;
  pageBlocks: WikiBlock[];
  onOpenPage: (id: string) => void;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  onInput: (el: HTMLDivElement) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onBlur: () => void;
  onToggleCheck: () => void;
  onSetType: (t: WikiBlockType) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddBelow: () => void;
  onUploadImage: (f: File) => void;
  onCaption: (c: string) => void;
  onPatch: (patch: Partial<WikiBlock>) => void;
  slashMenu: ReactNode;
}) {
  const ceRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Initialize the contentEditable's HTML once (uncontrolled to preserve caret).
  const mounted = useRef(false);
  const setCe = (el: HTMLDivElement | null) => {
    ceRef.current = el;
    registerRef(block.id, el);
    if (el && !mounted.current) { el.innerHTML = block.text || ""; mounted.current = true; }
  };

  const TEXT_STYLES: Partial<Record<WikiBlockType, string>> = {
    text: "text-[15px] leading-relaxed text-[var(--text)]",
    h1: "text-[30px] font-bold leading-tight text-[var(--text)] mt-3",
    h2: "text-[24px] font-bold leading-tight text-[var(--text)] mt-2",
    h3: "text-[19px] font-semibold leading-snug text-[var(--text)] mt-1",
    bulleted: "text-[15px] leading-relaxed text-[var(--text)]",
    numbered: "text-[15px] leading-relaxed text-[var(--text)]",
    todo: "text-[15px] leading-relaxed text-[var(--text)]",
    quote: "text-[15px] leading-relaxed text-[var(--text)] italic",
    code: "text-[13.5px] leading-relaxed font-mono",
    toggle: "text-[15px] leading-relaxed text-[var(--text)] font-medium",
    callout: "text-[15px] leading-relaxed text-[var(--text)]",
    sticky: "text-[14.5px] leading-relaxed",
  };
  const placeholder =
    block.type === "h1" ? "Heading 1" : block.type === "h2" ? "Heading 2" : block.type === "h3" ? "Heading 3" :
    block.type === "quote" ? "Quote" : block.type === "code" ? "Code" :
    block.type === "toggle" ? "Toggle" : block.type === "callout" ? "Type something…" :
    "";   // blank lines stay blank — no "/" ghost hint

  // Open links on click (contentEditable normally just places the caret).
  const onEditableClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest?.("a") as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (href.startsWith("#wiki:")) { e.preventDefault(); onOpenPage(href.slice(6)); return; }
    if (/^(https?:|mailto:)/.test(href)) { e.preventDefault(); window.open(href, "_blank", "noopener"); }
  };

  const editable = (
    <div
      ref={setCe}
      data-block-id={block.id}
      data-ph={placeholder}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onInput={(e) => onInput(e.currentTarget)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onClick={onEditableClick}
      className={cn(
        "nx-block flex-1 min-w-0 focus:outline-none",
        TEXT_STYLES[block.type],
        block.type === "todo" && block.checked && "line-through opacity-50",
      )}
    />
  );

  return (
    <div className="group relative flex items-start">
      {/* Left gutter controls */}
      <div className="flex items-center gap-0.5 shrink-0 -ml-12 w-12 pt-1 pr-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onAddBelow} title="Add block below" className="p-0.5 rounded text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--chip)]"><Plus className="w-4 h-4" /></button>
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} title="Options" className="p-0.5 rounded text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--chip)] cursor-grab"><GripVertical className="w-4 h-4" /></button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 w-52 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-1.5 nx-pop">
                <p className="px-2 py-1 text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest">Turn into</p>
                <div className="max-h-[240px] overflow-y-auto">
                  {BLOCK_TYPES.map(({ type, label, Icon }) => (
                    <button key={type} onClick={() => { onSetType(type); setMenuOpen(false); }} className={cn("w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[13px] text-left transition-colors", block.type === type ? "bg-[var(--chip)] text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]")}>
                      <Icon className="w-4 h-4 shrink-0" /> {label}
                    </button>
                  ))}
                </div>
                <div className="border-t border-[var(--border)] mt-1 pt-1 flex">
                  <button onClick={() => { onMoveUp(); setMenuOpen(false); }} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"><ChevronUp className="w-3.5 h-3.5" /> Up</button>
                  <button onClick={() => { onMoveDown(); setMenuOpen(false); }} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"><ChevronDown className="w-3.5 h-3.5" /> Down</button>
                  <button onClick={() => { onDelete(); setMenuOpen(false); }} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Block content */}
      <div className="flex-1 min-w-0 py-0.5">
        {EXTRA_TYPES.has(block.type) ? (
          <ExtraBlock block={block} onPatch={onPatch} allPages={allPages} currentPageId={currentPageId} pageBlocks={pageBlocks} onOpenPage={onOpenPage} />
        ) : block.type === "sticky" ? (
          <div className="my-1 rounded-lg px-3.5 py-3 border border-black/10 shadow-sm" style={{ background: block.color || "#fef9c3" }}>
            <div className="flex items-center gap-1 mb-2">
              {STICKY_COLORS.map((c) => (
                <button key={c} onClick={() => onPatch({ color: c })} className={cn("w-3.5 h-3.5 rounded-full border border-black/15 transition-transform hover:scale-110", block.color === c && "ring-1 ring-black/40")} style={{ background: c }} />
              ))}
            </div>
            <div className="[&_*]:!text-[#1a1a1a]">{editable}</div>
          </div>
        ) : block.type === "code" ? (
          <div className="my-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)]">
              <input value={block.lang ?? ""} onChange={(e) => onPatch({ lang: e.target.value })} placeholder="language" className="bg-transparent text-[11px] text-[var(--muted)] placeholder-[var(--faint)] focus:outline-none w-28" />
              <button onClick={() => { navigator.clipboard?.writeText(ceRef.current?.textContent || ""); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="flex items-center gap-1 text-[11px] text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
              </button>
            </div>
            <div className="px-3 py-2.5">{editable}</div>
          </div>
        ) : block.type === "divider" ? (
          <hr className="my-3 border-t border-[var(--border-2)]" />
        ) : block.type === "image" ? (
          <div className="my-1">
            {block.src && block.floating ? (
              // pinned: shown in the floating overlay; leave a compact chip in the flow
              <button
                onClick={() => onPatch({ floating: false })}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[var(--border-2)] bg-[var(--surface-2)] text-[12.5px] text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                title="Unpin — return image to the page flow"
              >
                <Pin className="w-3.5 h-3.5" /> Pinned image{block.caption ? ` · ${block.caption}` : ""} <span className="text-[var(--faint)]">(tap to unpin)</span>
              </button>
            ) : block.src ? (
              <figure className="group/img relative inline-block max-w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={block.src} alt={block.caption || ""} className="max-w-full rounded-lg border border-[var(--border)]" />
                <button
                  onClick={() => onPatch({ floating: true, x: block.x ?? 40, y: block.y ?? 40, w: block.w ?? 280 })}
                  title="Pin / move anywhere on the page"
                  className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg)]/80 backdrop-blur border border-[var(--border)] text-[11px] font-medium text-[var(--text)] opacity-0 group-hover/img:opacity-100 transition-opacity"
                >
                  <Pin className="w-3 h-3" /> Pin
                </button>
                <input value={block.caption ?? ""} onChange={(e) => onCaption(e.target.value)} placeholder="Add a caption…" className="w-full mt-1.5 bg-transparent text-[12.5px] text-[var(--muted)] placeholder-[var(--faint)]/50 focus:outline-none" />
              </figure>
            ) : (
              <>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadImage(f); }} />
                <button onClick={() => fileRef.current?.click()} className="w-full flex items-center gap-2.5 px-4 py-4 rounded-lg border border-dashed border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--faint)] transition-colors text-[13.5px]">
                  <ImagePlus className="w-4 h-4" /> Add an image
                </button>
              </>
            )}
          </div>
        ) : block.type === "table" ? (
          <TableBlock data={block.table ?? { rows: [["", ""]] }} onChange={(table) => onPatch({ table })} />
        ) : block.type === "board" ? (
          <BoardBlock columns={block.board ?? []} onChange={(board) => onPatch({ board })} />
        ) : block.type === "chart" ? (
          <ChartBlock data={block.chart ?? { kind: "bar", data: [] }} onChange={(chart) => onPatch({ chart })} />
        ) : block.type === "pagelink" ? (
          <PageLinkBlock block={block} allPages={allPages} onOpenPage={onOpenPage} onPatch={onPatch} />
        ) : block.type === "callout" ? (
          <div className="nx-callout my-1 flex items-start gap-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3.5 py-3">
            <CalloutEmoji value={block.emoji || "💡"} onChange={(emoji) => onPatch({ emoji })} />
            {editable}
          </div>
        ) : block.type === "toggle" ? (
          <div className="my-0.5">
            <div className="nx-toggle-row flex items-start gap-1">
              <button
                onClick={() => onPatch({ collapsed: !block.collapsed })}
                title={block.collapsed ? "Expand" : "Collapse"}
                className="mt-[3px] p-0.5 rounded text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)] shrink-0"
              >
                <ChevronRight className={cn("w-4 h-4 transition-transform", !block.collapsed && "rotate-90")} />
              </button>
              {editable}
            </div>
            {!block.collapsed && (
              <ToggleBody value={block.body ?? ""} onChange={(body) => onPatch({ body })} />
            )}
          </div>
        ) : (
          <div className={cn(
            "flex items-start gap-2.5",
            block.type === "quote" && "gap-0 border-l-[3px] border-[var(--border-2)] pl-3.5",
          )}>
            {block.type === "bulleted" ? (
              <span className="mt-[11px] w-1.5 h-1.5 rounded-full bg-[var(--text)] shrink-0" />
            ) : block.type === "numbered" ? (
              <span className="mt-[3px] text-[15px] text-[var(--muted)] tabular-nums shrink-0 min-w-[18px]">{number}.</span>
            ) : block.type === "todo" ? (
              <button onClick={onToggleCheck} className={cn("mt-[4px] w-[18px] h-[18px] rounded-[5px] border shrink-0 flex items-center justify-center transition-colors", block.checked ? "bg-[var(--text)] border-[var(--text)] text-[var(--bg)]" : "border-[var(--border-2)] hover:border-[var(--faint)]")}>
                {block.checked && <span className="text-[11px] leading-none">✓</span>}
              </button>
            ) : null}
            {editable}
          </div>
        )}
        {slashMenu}
      </div>
    </div>
  );
}

// ── Page-link block (embed / link to another note) ──────────────────────────────
function PageLinkBlock({
  block, allPages, onOpenPage, onPatch,
}: {
  block: WikiBlock;
  allPages: WikiPage[];
  onOpenPage: (id: string) => void;
  onPatch: (patch: Partial<WikiBlock>) => void;
}) {
  const [q, setQ] = useState("");
  const target = allPages.find((p) => p.id === block.pageId);

  if (target) {
    return (
      <div className="my-1 flex items-center gap-1">
        <button
          onClick={() => onOpenPage(target.id)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--chip)] transition-colors min-w-0"
        >
          <span className="text-[15px] shrink-0">{target.icon || "📄"}</span>
          <span className="text-[14px] text-[var(--text)] font-medium underline underline-offset-2 truncate">{target.title || "Untitled"}</span>
        </button>
        <button onClick={() => onPatch({ pageId: undefined })} title="Change page" className="p-1 rounded text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--chip)]">
          <FileText className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const list = allPages.filter((p) => (p.title || "Untitled").toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="my-1 rounded-lg border border-dashed border-[var(--border-2)] bg-[var(--surface-2)] p-2">
      <div className="flex items-center gap-2 px-1 pb-1.5 text-[13px] text-[var(--muted)]"><FileSymlink className="w-4 h-4" /> Link to a page</div>
      <input
        autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages…"
        className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-[13px] text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]"
      />
      <div className="max-h-[200px] overflow-y-auto mt-1.5">
        {list.length === 0 ? (
          <p className="px-2 py-2 text-[12.5px] text-[var(--faint)]">No pages found</p>
        ) : list.map((p) => (
          <button key={p.id} onClick={() => onPatch({ pageId: p.id })} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[13.5px] text-[var(--text)] hover:bg-[var(--chip)]">
            <span className="shrink-0">{p.icon || "📄"}</span><span className="truncate">{p.title || "Untitled"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Compact emoji chooser for callout blocks ─────────────────────────────────────
function CalloutEmoji({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  const choices = ["💡","ℹ️","⚠️","✅","❌","🔥","⭐","📌","❤️","🎯","🚀","🧠","📝","🔔","✨","💬","👉","🙏"];
  return (
    <div className="relative shrink-0">
      <button onClick={() => setOpen((v) => !v)} title="Change icon" className="text-[18px] leading-none mt-[1px] hover:bg-[var(--chip)] rounded px-0.5 transition-colors">{value}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 w-[212px] bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-2 nx-pop grid grid-cols-6 gap-0.5">
            {choices.map((e, i) => (
              <button key={e + i} onClick={() => { onChange(e); setOpen(false); }} className="w-7 h-7 flex items-center justify-center rounded-md text-lg hover:bg-[var(--chip)] transition-colors">{e}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Collapsible body for toggle blocks ───────────────────────────────────────────
function ToggleBody({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const mounted = useRef(false);
  const setEl = (el: HTMLDivElement | null) => { if (el && !mounted.current) { el.innerHTML = value || ""; mounted.current = true; } };
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
    onChange(normalizeHTML(e.currentTarget.innerHTML));
  };
  return (
    <div
      ref={setEl}
      contentEditable
      suppressContentEditableWarning
      data-ph="Empty toggle. Add content…"
      onInput={(e) => onChange(normalizeHTML(e.currentTarget.innerHTML))}
      onPaste={onPaste}
      className="nx-block ml-6 mt-1 min-h-[1.5em] border-l-2 border-[var(--border)] pl-3 text-[15px] leading-relaxed text-[var(--text)] focus:outline-none"
    />
  );
}

// ── Slash command menu ──────────────────────────────────────────────────────────
function SlashMenu({ results, index, onPick }: { results: typeof BLOCK_TYPES; index: number; onPick: (t: WikiBlockType) => void }) {
  return (
    <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-1.5 nx-pop">
      <p className="px-2 py-1 text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest">Blocks</p>
      <div className="max-h-[260px] overflow-y-auto">
        {results.map((t, i) => (
          <button key={t.type} onMouseDown={(e) => { e.preventDefault(); onPick(t.type); }} className={cn("w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors", i === index ? "bg-[var(--chip)]" : "hover:bg-[var(--surface-2)]")}>
            <span className="w-8 h-8 rounded-md border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center shrink-0"><t.Icon className="w-4 h-4 text-[var(--text)]" /></span>
            <span className="min-w-0">
              <span className="block text-[13.5px] text-[var(--text)] font-medium leading-tight">{t.label}</span>
              <span className="block text-[11.5px] text-[var(--faint)] leading-tight">{t.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Emoji button ────────────────────────────────────────────────────────────────
const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  { label: "Suggested", emojis: ["📄","📝","📔","⭐","🔥","💡","🎯","🚀","🧠","✅","📊","🗂️","📌","🔗","❤️","🌱"] },
  { label: "Documents & work", emojis: ["📄","📝","📋","📒","📓","📔","📕","📗","📘","📙","📚","📖","🗒️","🗓️","📅","📆","🗂️","📁","📂","🗃️","🗄️","📦","📌","📍","📎","🖇️","🔖","🏷️","✂️","📐","📏","🖊️","🖋️","✏️","🖌️","🖍️","🧮","📈","📉","📊","💼","🗳️","📤","📥","📨","✉️","📧","🧾","🧷"] },
  { label: "Tech & devices", emojis: ["💻","🖥️","⌨️","🖱️","🖨️","📱","📲","☎️","📞","📟","💾","💿","📀","🔋","🔌","🛰️","📡","🎛️","🎚️","🕹️","💡","🔦","🔭","🔬","⚙️","🛠️","🔧","🔨","🪛","🧰","🧲","⚡","🔑","🗝️","🔒","🔓","🛡️","🧪","🧫","🧬"] },
  { label: "Symbols & flags", emojis: ["⭐","🌟","✨","⚡","🔥","💥","💫","💯","✅","☑️","✔️","❌","⛔","❗","❓","‼️","⁉️","♻️","🔆","🔅","🔱","⚜️","🏁","🚩","🎌","🏳️","🏴","🟢","🟡","🔴","🔵","🟣","🟠","⚫","⚪","🟥","🟧","🟨","🟩","🟦","🟪","🔆"] },
  { label: "Hearts & faces", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💖","💗","💓","💞","💕","😀","😄","😁","😎","🤓","🧐","🤔","😴","🥳","🤩","😇","🫡","🙂","😉","😤","🥶","🤯","🫶","👍","👏","🙌","🙏","💪","👀","🤝","👋"] },
  { label: "Nature & weather", emojis: ["🌱","🌿","🍀","🍃","🌳","🌲","🌴","🌵","🌷","🌹","🌻","🌼","🌸","💐","🍁","🍂","🌾","🌍","🌎","🌏","🌙","⭐","☀️","🌤️","⛅","☁️","🌧️","⛈️","🌈","❄️","☃️","💧","🌊","🔮","🌋","⛰️","🏔️","🪐","🌟","🦋","🐝","🌺"] },
  { label: "Activities & objects", emojis: ["🎯","🏆","🥇","🥈","🥉","🏅","🎖️","⚽","🏀","🏈","⚾","🎾","🏐","🎱","🏓","🏸","🥊","🎮","🎲","♟️","🧩","🎨","🎬","🎤","🎧","🎵","🎶","🎸","🎹","🥁","🎺","🎻","🏃","🚴","🧗","🧘","🏋️","🚀","✈️","🚗","🚲","🗺️","🧭","🏖️","🏕️","🗽","🏰","🏠","🏢","💰","💵","💳","🪙","🎁","🎀","🕯️","🛎️","🔔"] },
  { label: "Food & drink", emojis: ["🍎","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🥝","🥑","🍅","🥦","🥕","🌽","🍞","🥐","🧀","🥚","🍔","🍟","🍕","🌭","🌮","🌯","🥗","🍣","🍜","🍲","🍙","🍱","🍩","🍪","🎂","🍰","🧁","🍫","🍬","🍿","🥤","☕","🍵","🧃","🍺","🍷","🥂","🍸"] },
];

function EmojiButton({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  // When searching, match by category label; otherwise show every category.
  const cats = ql ? EMOJI_CATEGORIES.filter((c) => c.label.toLowerCase().includes(ql)) : EMOJI_CATEGORIES;
  const flat = ql ? [...new Set(EMOJI_CATEGORIES.flatMap((c) => c.emojis))] : [];

  return (
    <div className="relative inline-block">
      <button onClick={() => { setOpen((v) => !v); setQ(""); }} className="text-[44px] leading-none hover:bg-[var(--chip)] rounded-lg px-1 -ml-1 transition-colors" title="Change icon">{value || "📄"}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 w-[332px] bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-2 nx-pop">
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Filter categories…"
              className="w-full mb-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]"
            />
            <div className="max-h-[300px] overflow-y-auto pr-0.5">
              {ql && cats.length === 0 ? (
                <div className="grid grid-cols-9 gap-0.5">
                  {flat.map((e, i) => (
                    <button key={e + i} onClick={() => { onChange(e); setOpen(false); }} className="w-8 h-8 flex items-center justify-center rounded-md text-xl hover:bg-[var(--chip)] transition-colors">{e}</button>
                  ))}
                </div>
              ) : (
                cats.map((cat) => (
                  <div key={cat.label} className="mb-2 last:mb-0">
                    <p className="px-1 pb-1 text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest">{cat.label}</p>
                    <div className="grid grid-cols-9 gap-0.5">
                      {cat.emojis.map((e, i) => (
                        <button key={e + i} onClick={() => { onChange(e); setOpen(false); }} className="w-8 h-8 flex items-center justify-center rounded-md text-xl hover:bg-[var(--chip)] transition-colors">{e}</button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Plain-text export of a page's blocks (used by the page options menu).
export function blocksToText(blocks: WikiBlock[]): string {
  return blocks.map((b) => {
    const t = stripTags(b.text);
    switch (b.type) {
      case "h1": return `# ${t}`;
      case "h2": return `## ${t}`;
      case "h3": return `### ${t}`;
      case "bulleted": return `• ${t}`;
      case "numbered": return `1. ${t}`;
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
