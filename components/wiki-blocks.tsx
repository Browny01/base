"use client";

import { useEffect, useRef, useState } from "react";
import { uid, cn } from "@/lib/utils";
import type { WikiTableData, WikiBoardColumn, WikiChartData, ChartKind } from "@/lib/store";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import type { WikiBlock, WikiPage, WikiPanel } from "@/lib/store";
import {
  Plus, X, ChartColumn, ChartLine, ChartPie, Bookmark, Globe, Video, Music, Paperclip,
  ListTree, Link2, Workflow, Pencil, Star, Timer, Hash, MousePointerClick, Table2,
  ChevronRight, ExternalLink, FileText, Download, Eraser,
} from "lucide-react";

// Grayscale donut palette — distinguishable in both light and dark themes.
const DONUT_GRAYS = ["#6b7280", "#9ca3af", "#4b5563", "#cbd5e1", "#374151", "#a1a1aa", "#7c7c7c", "#d1d5db"];

function AutoTextarea({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const grow = () => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } };
  useEffect(grow, [value]);
  return (
    <textarea
      ref={ref} value={value} rows={1} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} onInput={grow}
      className={cn("resize-none bg-transparent focus:outline-none overflow-hidden", className)}
    />
  );
}

// ── Table ────────────────────────────────────────────────────────────────────────
export function TableBlock({ data, onChange }: { data: WikiTableData; onChange: (d: WikiTableData) => void }) {
  const rows = data.rows.length ? data.rows : [["", ""]];
  const cols = rows[0]?.length ?? 0;
  const setCell = (r: number, c: number, v: string) => { const next = rows.map((row) => [...row]); next[r][c] = v; onChange({ rows: next }); };
  const addRow = () => onChange({ rows: [...rows, Array(cols).fill("")] });
  const addCol = () => onChange({ rows: rows.map((row) => [...row, ""]) });
  const delRow = (r: number) => { if (rows.length <= 1) return; onChange({ rows: rows.filter((_, i) => i !== r) }); };
  const delCol = (c: number) => { if (cols <= 1) return; onChange({ rows: rows.map((row) => row.filter((_, i) => i !== c)) }); };

  return (
    <div className="my-2">
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="group/row">
                {row.map((cell, c) => (
                  <td key={c} className="border border-[var(--border)] p-0 relative">
                    {r === 0 && cols > 1 && (
                      <button onClick={() => delCol(c)} title="Delete column" className="absolute -top-5 left-1/2 -translate-x-1/2 w-4 h-4 rounded flex items-center justify-center text-[var(--faint)] hover:text-red-500 opacity-0 group-hover/row:opacity-100 transition-opacity">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    <RichInput
                      html={cell}
                      onChange={(v) => setCell(r, c, v)}
                      placeholder={r === 0 ? "Header" : ""}
                      className={cn("px-2.5 py-1.5 text-[14px] min-w-[130px] w-full text-[var(--text)]", r === 0 && "font-semibold bg-[var(--surface-2)]")}
                    />
                  </td>
                ))}
                <td className="border-0 align-middle pl-1">
                  {rows.length > 1 && (
                    <button onClick={() => delRow(r)} title="Delete row" className="w-4 h-4 rounded flex items-center justify-center text-[var(--faint)] hover:text-red-500 opacity-0 group-hover/row:opacity-100 transition-opacity">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 mt-1.5">
        <button onClick={addRow} className="flex items-center gap-1 text-[12px] text-[var(--muted)] hover:text-[var(--text)] transition-colors"><Plus className="w-3.5 h-3.5" /> Row</button>
        <button onClick={addCol} className="flex items-center gap-1 text-[12px] text-[var(--muted)] hover:text-[var(--text)] transition-colors"><Plus className="w-3.5 h-3.5" /> Column</button>
      </div>
    </div>
  );
}

// ── Board (Kanban) ─────────────────────────────────────────────────────────────
export function BoardBlock({ columns, onChange }: { columns: WikiBoardColumn[]; onChange: (c: WikiBoardColumn[]) => void }) {
  const cols = columns.length ? columns : [{ id: uid(), title: "To do", cards: [] }];
  const addColumn = () => onChange([...cols, { id: uid(), title: "New column", cards: [] }]);
  const setColTitle = (cid: string, title: string) => onChange(cols.map((c) => (c.id === cid ? { ...c, title } : c)));
  const delColumn = (cid: string) => onChange(cols.filter((c) => c.id !== cid));
  const addCard = (cid: string) => onChange(cols.map((c) => (c.id === cid ? { ...c, cards: [...c.cards, { id: uid(), text: "" }] } : c)));
  const setCard = (cid: string, cardId: string, text: string) => onChange(cols.map((c) => (c.id === cid ? { ...c, cards: c.cards.map((cd) => (cd.id === cardId ? { ...cd, text } : cd)) } : c)));
  const delCard = (cid: string, cardId: string) => onChange(cols.map((c) => (c.id === cid ? { ...c, cards: c.cards.filter((cd) => cd.id !== cardId) } : c)));
  const moveCard = (cardId: string, fromCol: string, toCol: string) => {
    if (!cardId || fromCol === toCol) return;
    const card = cols.find((c) => c.id === fromCol)?.cards.find((cd) => cd.id === cardId);
    if (!card) return;
    onChange(cols.map((c) => {
      if (c.id === fromCol) return { ...c, cards: c.cards.filter((cd) => cd.id !== cardId) };
      if (c.id === toCol) return { ...c, cards: [...c.cards, card] };
      return c;
    }));
  };

  return (
    <div className="my-2 flex gap-3 overflow-x-auto pb-2">
      {cols.map((col) => (
        <div
          key={col.id}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); moveCard(e.dataTransfer.getData("cardId"), e.dataTransfer.getData("col"), col.id); }}
          className="w-60 shrink-0 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-2 flex flex-col"
        >
          <div className="flex items-center gap-1 mb-2 px-1">
            <input value={col.title} onChange={(e) => setColTitle(col.id, e.target.value)} className="flex-1 bg-transparent text-[13px] font-semibold text-[var(--text)] focus:outline-none min-w-0" />
            <span className="text-[11px] text-[var(--faint)]">{col.cards.length}</span>
            <button onClick={() => delColumn(col.id)} title="Delete column" className="p-0.5 rounded text-[var(--faint)] hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="space-y-1.5">
            {col.cards.map((card) => (
              <div
                key={card.id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData("cardId", card.id); e.dataTransfer.setData("col", col.id); }}
                className="group/card bg-[var(--surface)] border border-[var(--border)] rounded-md p-2 flex items-start gap-1 cursor-grab active:cursor-grabbing"
              >
                <AutoTextarea value={card.text} onChange={(v) => setCard(col.id, card.id, v)} placeholder="Card…" className="flex-1 text-[13px] text-[var(--text)] placeholder-[var(--faint)]/50 leading-snug" />
                <button onClick={() => delCard(col.id, card.id)} className="opacity-0 group-hover/card:opacity-100 p-0.5 rounded text-[var(--faint)] hover:text-red-500 shrink-0"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
          <button onClick={() => addCard(col.id)} className="mt-1.5 flex items-center gap-1 px-1 py-1 text-[12px] text-[var(--muted)] hover:text-[var(--text)] transition-colors"><Plus className="w-3.5 h-3.5" /> Add card</button>
        </div>
      ))}
      <button onClick={addColumn} className="w-44 shrink-0 h-10 flex items-center justify-center gap-1 border border-dashed border-[var(--border-2)] rounded-lg text-[12px] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--faint)] transition-colors"><Plus className="w-3.5 h-3.5" /> Column</button>
    </div>
  );
}

// ── Chart ────────────────────────────────────────────────────────────────────────
const CHART_KINDS: { kind: ChartKind; label: string; Icon: typeof ChartColumn }[] = [
  { kind: "bar", label: "Bar", Icon: ChartColumn },
  { kind: "line", label: "Line", Icon: ChartLine },
  { kind: "donut", label: "Donut", Icon: ChartPie },
];

export function ChartBlock({ data, onChange }: { data: WikiChartData; onChange: (d: WikiChartData) => void }) {
  const rows = data.data;
  const setKind = (kind: ChartKind) => onChange({ ...data, kind });
  const setRow = (i: number, patch: Partial<{ label: string; value: number }>) => onChange({ ...data, data: rows.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const addRow = () => onChange({ ...data, data: [...rows, { label: "Item", value: 0 }] });
  const delRow = (i: number) => onChange({ ...data, data: rows.filter((_, j) => j !== i) });

  const tip = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text)" };
  const axis = { fill: "var(--faint)", fontSize: 11 };

  return (
    <div className="nx-chart my-2 border border-[var(--border)] rounded-xl p-3">
      <div className="flex items-center gap-1 mb-3">
        {CHART_KINDS.map(({ kind, label, Icon }) => (
          <button
            key={kind}
            onClick={() => setKind(kind)}
            className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors", data.kind === kind ? "bg-[var(--chip)] text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]")}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          {data.kind === "bar" ? (
            <BarChart data={rows}>
              <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={28} />
              <Tooltip contentStyle={tip} cursor={{ fill: "var(--chip)" }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : data.kind === "line" ? (
            <LineChart data={rows}>
              <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={28} />
              <Tooltip contentStyle={tip} />
              <Line type="monotone" dataKey="value" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          ) : (
            <PieChart>
              <Tooltip contentStyle={tip} />
              <Pie data={rows} dataKey="value" nameKey="label" innerRadius={55} outerRadius={95} paddingAngle={2}>
                {rows.map((_, i) => <Cell key={i} fill={DONUT_GRAYS[i % DONUT_GRAYS.length]} stroke="var(--bg)" strokeWidth={2} />)}
              </Pie>
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>

      <div className="mt-2 space-y-1">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2 group/dr">
            <input value={row.label} onChange={(e) => setRow(i, { label: e.target.value })} placeholder="Label" className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-2 py-1 text-[12.5px] text-[var(--text)] placeholder-[var(--faint)]/50 focus:outline-none focus:border-[var(--border-2)]" />
            <input type="number" value={row.value} onChange={(e) => setRow(i, { value: Number(e.target.value) || 0 })} className="w-24 bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-2 py-1 text-[12.5px] text-[var(--text)] tabular-nums focus:outline-none focus:border-[var(--border-2)]" />
            <button onClick={() => delRow(i)} className="p-1 rounded text-[var(--faint)] hover:text-red-500 opacity-0 group-hover/dr:opacity-100"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        <button onClick={addRow} className="flex items-center gap-1 text-[12px] text-[var(--muted)] hover:text-[var(--text)] transition-colors mt-1"><Plus className="w-3.5 h-3.5" /> Add data point</button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Extended blocks — routed here from the editor via <ExtraBlock>.
// ════════════════════════════════════════════════════════════════════════════════

const fieldCls = "w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-[13px] text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]";
const card = "rounded-lg border border-[var(--border)] bg-[var(--surface-2)]";

function plain(html: string): string { const d = document.createElement("div"); d.innerHTML = html || ""; return d.textContent || ""; }

function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, "");
    if (h === "youtube.com" && u.searchParams.get("v")) return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
    if (h === "youtu.be") return `https://www.youtube.com/embed${u.pathname}`;
    if (h === "open.spotify.com") return `https://open.spotify.com/embed${u.pathname}`;
    if (h.endsWith("loom.com") && u.pathname.includes("/share/")) return url.replace("/share/", "/embed/");
    if (h.endsWith("vimeo.com")) return `https://player.vimeo.com/video/${u.pathname.split("/").filter(Boolean).pop()}`;
    return url;
  } catch { return url; }
}

function downscale(file: File, max = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject; img.src = reader.result as string;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

// Rich-text contentEditable used inside tabs / columns / accordion / table cells.
// Carries the .nx-block class so the editor's floating format toolbar appears on
// selection (Bold / Underline / size / colour all work via document.execCommand).
export function RichInput({ html, onChange, placeholder, className }: {
  html: string; onChange: (html: string) => void; placeholder?: string; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const setEl = (el: HTMLDivElement | null) => { ref.current = el; if (el && !mounted.current) { el.innerHTML = html || ""; mounted.current = true; } };
  // Re-sync when the value changes externally (e.g. a table row was deleted) but
  // never while the user is actively typing in this field.
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerHTML !== (html || "")) el.innerHTML = html || "";
  }, [html]);
  return (
    <div
      ref={setEl} contentEditable suppressContentEditableWarning spellCheck
      data-ph={placeholder}
      onInput={(e) => onChange(e.currentTarget.innerHTML)}
      onPaste={(e) => { e.preventDefault(); const tx = e.clipboardData.getData("text/plain"); document.execCommand("insertText", false, tx); }}
      className={cn("nx-block focus:outline-none", className)}
    />
  );
}

// Upload a file (mp3, video, pdf, …) to Vercel Blob; returns the hosted URL.
async function uploadFile(file: File): Promise<string | null> {
  try {
    const ext = file.name.split(".").pop() || "bin";
    const res = await fetch(`/api/blob/upload?filename=note-${Date.now()}.${ext}`, {
      method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file,
    });
    if (!res.ok) return null;
    const { url } = await res.json();
    return typeof url === "string" ? url : null;
  } catch { return null; }
}

function UrlPrompt({ Icon, label, onSet, accept }: { Icon: typeof Globe; label: string; onSet: (url: string, file?: File) => void; accept?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const submit = () => { const v = ref.current?.value.trim(); if (v) onSet(/^https?:|^data:|^mailto:/.test(v) ? v : `https://${v}`); };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    const url = await uploadFile(f);
    setBusy(false);
    if (url) onSet(url, f); else alert("Upload failed — paste a link instead.");
  };
  return (
    <div className={cn("flex flex-wrap items-center gap-2 px-3 py-2.5 my-1", card)}>
      <Icon className="w-4 h-4 text-[var(--faint)] shrink-0" />
      <input ref={ref} placeholder={label} onKeyDown={(e) => e.key === "Enter" && submit()} className="flex-1 min-w-[120px] bg-transparent text-[13px] text-[var(--text)] placeholder-[var(--faint)] focus:outline-none" />
      <button onClick={submit} className="px-2.5 py-1 rounded-md bg-[var(--text)] text-[var(--bg)] text-[12px] font-semibold hover:bg-[var(--text-hover)]">Add</button>
      {accept && (
        <>
          <span className="text-[11px] text-[var(--faint)]">or</span>
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="px-2.5 py-1 rounded-md border border-[var(--border)] text-[12px] font-semibold text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)] disabled:opacity-50">{busy ? "Uploading…" : "Upload"}</button>
          <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        </>
      )}
    </div>
  );
}

function TabsBlock({ panels, onChange }: { panels: WikiPanel[]; onChange: (p: WikiPanel[]) => void }) {
  const [active, setActive] = useState(0);
  const cur = panels[Math.min(active, panels.length - 1)];
  const set = (id: string, patch: Partial<WikiPanel>) => onChange(panels.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  return (
    <div className={cn("my-1 overflow-hidden", card)}>
      <div className="flex items-center gap-1 border-b border-[var(--border)] px-1.5 pt-1.5 overflow-x-auto no-scrollbar">
        {panels.map((p, i) => (
          <button key={p.id} onClick={() => setActive(i)} className={cn("px-2.5 py-1.5 text-[12.5px] rounded-t-md whitespace-nowrap transition-colors", i === active ? "bg-[var(--surface)] text-[var(--text)] font-medium border border-b-0 border-[var(--border)]" : "text-[var(--muted)] hover:text-[var(--text)]")}>
            {p.title || `Tab ${i + 1}`}
          </button>
        ))}
        <button onClick={() => { onChange([...panels, { id: uid(), title: "", body: "" }]); setActive(panels.length); }} className="px-2 py-1.5 text-[var(--faint)] hover:text-[var(--text)]"><Plus className="w-3.5 h-3.5" /></button>
      </div>
      {cur && (
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input value={cur.title} onChange={(e) => set(cur.id, { title: e.target.value })} placeholder="Tab title" className={fieldCls} />
            {panels.length > 1 && <button onClick={() => { onChange(panels.filter((p) => p.id !== cur.id)); setActive(0); }} className="p-1 text-[var(--faint)] hover:text-red-500"><X className="w-4 h-4" /></button>}
          </div>
          <RichInput key={cur.id} html={cur.body} onChange={(v) => set(cur.id, { body: v })} placeholder="Tab content…" className="w-full text-[14px] leading-relaxed text-[var(--text)]" />
        </div>
      )}
    </div>
  );
}

function AccordionBlock({ panels, onChange }: { panels: WikiPanel[]; onChange: (p: WikiPanel[]) => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set(panels[0] ? [panels[0].id] : []));
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const set = (id: string, patch: Partial<WikiPanel>) => onChange(panels.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  return (
    <div className="my-1 space-y-1.5">
      {panels.map((p) => (
        <div key={p.id} className={card}>
          <div className="flex items-center gap-1.5 px-2.5 py-2">
            <button onClick={() => toggle(p.id)} className="text-[var(--muted)] hover:text-[var(--text)] shrink-0"><ChevronRight className={cn("w-4 h-4 transition-transform", open.has(p.id) && "rotate-90")} /></button>
            <input value={p.title} onChange={(e) => set(p.id, { title: e.target.value })} placeholder="Question / heading" className="flex-1 bg-transparent text-[13.5px] font-medium text-[var(--text)] placeholder-[var(--faint)] focus:outline-none" />
            <button onClick={() => onChange(panels.filter((x) => x.id !== p.id))} className="p-1 text-[var(--faint)] hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
          </div>
          {open.has(p.id) && <div className="px-3 pb-3 pl-9"><RichInput key={p.id} html={p.body} onChange={(v) => set(p.id, { body: v })} placeholder="Answer / details…" className="w-full text-[13.5px] leading-relaxed text-[var(--muted)]" /></div>}
        </div>
      ))}
      <button onClick={() => onChange([...panels, { id: uid(), title: "", body: "" }])} className="flex items-center gap-1 text-[12px] text-[var(--muted)] hover:text-[var(--text)]"><Plus className="w-3.5 h-3.5" /> Add item</button>
    </div>
  );
}

function ChecklistBlock({ checks, onChange }: { checks: { id: string; text: string; done: boolean }[]; onChange: (c: { id: string; text: string; done: boolean }[]) => void }) {
  const done = checks.filter((c) => c.done).length;
  const pct = checks.length ? Math.round((done / checks.length) * 100) : 0;
  const set = (id: string, patch: Partial<{ text: string; done: boolean }>) => onChange(checks.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  return (
    <div className={cn("my-1 p-3", card)}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-bold text-[var(--faint)] tabular-nums">{done}/{checks.length}</span>
        <div className="flex-1 h-1.5 bg-[var(--chip)] rounded-full overflow-hidden"><div className="h-full bg-[var(--text)] rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
        <span className="text-[11px] font-bold text-[var(--text)] tabular-nums">{pct}%</span>
      </div>
      <div className="space-y-0.5">
        {checks.map((c) => (
          <div key={c.id} className="group/cl flex items-center gap-2">
            <button onClick={() => set(c.id, { done: !c.done })} className={cn("w-4 h-4 rounded-[5px] border shrink-0 flex items-center justify-center", c.done ? "bg-[var(--text)] border-[var(--text)]" : "border-[var(--border-2)]")}>{c.done && <span className="text-[var(--bg)] text-[10px]">✓</span>}</button>
            <input value={c.text} onChange={(e) => set(c.id, { text: e.target.value })} placeholder="List item" className={cn("flex-1 bg-transparent text-[13.5px] focus:outline-none", c.done ? "line-through text-[var(--faint)]" : "text-[var(--text)]")} />
            <button onClick={() => onChange(checks.filter((x) => x.id !== c.id))} className="p-0.5 text-[var(--faint)] hover:text-red-500 opacity-0 group-hover/cl:opacity-100"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
      <button onClick={() => onChange([...checks, { id: uid(), text: "", done: false }])} className="flex items-center gap-1 text-[12px] text-[var(--muted)] hover:text-[var(--text)] mt-1.5"><Plus className="w-3.5 h-3.5" /> Add item</button>
    </div>
  );
}

function SketchBlock({ src, onChange }: { src?: string; onChange: (src: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  if (src) {
    return (
      <figure className="my-1 group/sk relative inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="sketch" className="max-w-full rounded-lg border border-[var(--border)]" />
        <button onClick={() => onChange("")} className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg)]/80 backdrop-blur border border-[var(--border)] text-[11px] text-[var(--text)] opacity-0 group-hover/sk:opacity-100"><Pencil className="w-3 h-3" /> Redraw</button>
      </figure>
    );
  }
  const pos = (e: React.PointerEvent) => { const r = canvasRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: React.PointerEvent) => { drawing.current = true; const ctx = canvasRef.current!.getContext("2d")!; const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const ctx = canvasRef.current!.getContext("2d")!; const { x, y } = pos(e); ctx.lineTo(x, y); ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--text") || "#000"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke(); };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = canvasRef.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); };
  return (
    <div className={cn("my-1 p-2", card)}>
      <canvas ref={canvasRef} width={760} height={300} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        className="w-full rounded-md bg-[var(--surface)] border border-dashed border-[var(--border-2)] touch-none cursor-crosshair" style={{ touchAction: "none" }} />
      <div className="flex gap-2 mt-2">
        <button onClick={() => onChange(canvasRef.current!.toDataURL("image/png"))} className="px-3 py-1.5 rounded-md bg-[var(--text)] text-[var(--bg)] text-[12px] font-semibold hover:bg-[var(--text-hover)]">Save sketch</button>
        <button onClick={clear} className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-[var(--border)] text-[12px] text-[var(--muted)] hover:text-[var(--text)]"><Eraser className="w-3.5 h-3.5" /> Clear</button>
      </div>
    </div>
  );
}

export function ExtraBlock({ block, onPatch, allPages, currentPageId, pageBlocks, onOpenPage }: {
  block: WikiBlock;
  onPatch: (patch: Partial<WikiBlock>) => void;
  allPages: WikiPage[];
  currentPageId: string;
  pageBlocks: WikiBlock[];
  onOpenPage: (id: string) => void;
}) {
  const t = block.type;

  if (t === "bookmark") {
    if (!block.url) return <UrlPrompt Icon={Bookmark} label="Paste a link to bookmark…" onSet={(url) => onPatch({ url })} />;
    let host = block.url; try { host = new URL(block.url).hostname.replace(/^www\./, ""); } catch {}
    return (
      <a href={block.url} target="_blank" rel="noopener" className={cn("my-1 flex items-stretch overflow-hidden hover:bg-[var(--chip)] transition-colors", card)}>
        <div className="flex-1 min-w-0 p-3">
          <input value={block.text} onClick={(e) => e.preventDefault()} onChange={(e) => onPatch({ text: e.target.value })} placeholder="Title" className="w-full bg-transparent text-[13.5px] font-medium text-[var(--text)] placeholder-[var(--faint)] focus:outline-none" />
          <input value={block.caption ?? ""} onClick={(e) => e.preventDefault()} onChange={(e) => onPatch({ caption: e.target.value })} placeholder="Description" className="w-full bg-transparent text-[12px] text-[var(--muted)] placeholder-[var(--faint)] focus:outline-none mt-0.5" />
          <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[var(--faint)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`} alt="" className="w-3.5 h-3.5 rounded-sm" />
            <span className="truncate">{host}</span><ExternalLink className="w-3 h-3" />
          </div>
        </div>
      </a>
    );
  }

  if (t === "embed" || t === "video" || t === "audio") {
    const Icon = t === "video" ? Video : t === "audio" ? Music : Globe;
    const accept = t === "video" ? "video/*" : t === "audio" ? "audio/*" : undefined;
    if (!block.url) return <UrlPrompt Icon={Icon} label={`Paste a ${t} link…`} accept={accept} onSet={(url) => onPatch({ url })} />;
    if (t === "audio") return <audio controls src={block.url} className="my-1 w-full" />;
    if (t === "video" && /\.(mp4|webm|ogg|mov)(\?|$)/i.test(block.url)) return <video controls src={block.url} className="my-1 w-full rounded-lg border border-[var(--border)]" />;
    return (
      <div className="my-1 relative w-full overflow-hidden rounded-lg border border-[var(--border)] bg-black" style={{ aspectRatio: "16 / 9" }}>
        <iframe src={toEmbedUrl(block.url)} className="absolute inset-0 w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </div>
    );
  }

  if (t === "file") {
    if (!block.url) return <UrlPrompt Icon={Paperclip} label="Paste a file link…" accept="*/*"
      onSet={(url, file) => onPatch({ url, fileName: file?.name || url.split("/").pop()?.split("?")[0] || "File" })} />;
    return (
      <a href={block.url} target="_blank" rel="noopener" className={cn("my-1 flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--chip)] transition-colors", card)}>
        <FileText className="w-5 h-5 text-[var(--muted)] shrink-0" />
        <input value={block.fileName ?? ""} onClick={(e) => e.preventDefault()} onChange={(e) => onPatch({ fileName: e.target.value })} placeholder="File name" className="flex-1 bg-transparent text-[13px] text-[var(--text)] focus:outline-none" />
        <Download className="w-4 h-4 text-[var(--faint)] shrink-0" />
      </a>
    );
  }

  if (t === "gallery") {
    const imgs = block.images ?? [];
    const add = async (files: FileList | null) => {
      if (!files) return;
      const out = [...imgs];
      for (const f of Array.from(files)) { try { out.push(await downscale(f)); } catch {} }
      onPatch({ images: out });
    };
    return (
      <div className="my-1">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {imgs.map((src, i) => (
            <div key={i} className="group/g relative aspect-square overflow-hidden rounded-lg border border-[var(--border)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button onClick={() => onPatch({ images: imgs.filter((_, j) => j !== i) })} className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-md bg-black/60 text-white opacity-0 group-hover/g:opacity-100"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <label className="aspect-square flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer text-[12px]">
            <Plus className="w-5 h-5" /> Add
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => add(e.target.files)} />
          </label>
        </div>
      </div>
    );
  }

  if (t === "columns") {
    const cols = block.cols ?? ["", ""];
    const set = (i: number, v: string) => onPatch({ cols: cols.map((c, j) => (j === i ? v : c)) });
    return (
      <div className="my-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cols.map((c, i) => (
          <div key={i} className={cn("p-3", card)}>
            <RichInput key={i} html={c} onChange={(v) => set(i, v)} placeholder={`Column ${i + 1}…`} className="w-full text-[14px] leading-relaxed text-[var(--text)]" />
          </div>
        ))}
      </div>
    );
  }

  if (t === "tabs") return <TabsBlock panels={block.panels ?? []} onChange={(panels) => onPatch({ panels })} />;
  if (t === "accordion") return <AccordionBlock panels={block.panels ?? []} onChange={(panels) => onPatch({ panels })} />;
  if (t === "checklist") return <ChecklistBlock checks={block.checks ?? []} onChange={(checks) => onPatch({ checks })} />;
  if (t === "sketch") return <SketchBlock src={block.src} onChange={(src) => onPatch({ src })} />;

  if (t === "toc") {
    const heads = pageBlocks.filter((b) => b.type === "h1" || b.type === "h2" || b.type === "h3");
    return (
      <div className={cn("my-1 p-3", card)}>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--faint)] uppercase tracking-widest mb-1.5"><ListTree className="w-3.5 h-3.5" /> Contents</p>
        {heads.length === 0 ? <p className="text-[12.5px] text-[var(--faint)]">Add headings to build a table of contents.</p> : (
          <div className="space-y-0.5">
            {heads.map((h) => (
              <button key={h.id} onClick={() => document.querySelector(`[data-block-id="${h.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="block w-full text-left text-[13px] text-[var(--muted)] hover:text-[var(--text)] truncate" style={{ paddingLeft: h.type === "h2" ? 12 : h.type === "h3" ? 24 : 0 }}>
                {plain(h.text) || "Untitled heading"}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (t === "labeleddivider") {
    return (
      <div className="my-3 flex items-center gap-3">
        <div className="flex-1 h-px bg-[var(--border-2)]" />
        <input value={block.text} onChange={(e) => onPatch({ text: e.target.value })} placeholder="Section" className="bg-transparent text-center text-[12px] font-semibold uppercase tracking-widest text-[var(--faint)] focus:outline-none focus:text-[var(--text)]" style={{ width: `${Math.max(6, (block.text || "Section").length)}ch` }} />
        <div className="flex-1 h-px bg-[var(--border-2)]" />
      </div>
    );
  }

  if (t === "synced") {
    const target = allPages.find((p) => p.id === block.pageId);
    if (!target) {
      return (
        <div className={cn("my-1 p-2", card)}>
          <p className="px-1 py-1 text-[11px] font-semibold text-[var(--faint)] uppercase tracking-widest flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> Embed a note</p>
          <div className="max-h-44 overflow-y-auto">
            {allPages.filter((p) => p.id !== currentPageId).map((p) => (
              <button key={p.id} onClick={() => onPatch({ pageId: p.id })} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[13px] text-[var(--text)] hover:bg-[var(--surface-2)]"><span>{p.icon || "📄"}</span><span className="truncate">{p.title || "Untitled"}</span></button>
            ))}
          </div>
        </div>
      );
    }
    const preview = target.blocks.map((b) => plain(b.text)).filter(Boolean).slice(0, 6).join("\n");
    return (
      <div className={cn("my-1 p-3", card)}>
        <button onClick={() => onOpenPage(target.id)} className="flex items-center gap-1.5 text-[13.5px] font-medium text-[var(--text)] hover:underline"><span>{target.icon || "📄"}</span>{target.title || "Untitled"}<ExternalLink className="w-3.5 h-3.5 text-[var(--faint)]" /></button>
        <p className="mt-1.5 text-[13px] text-[var(--muted)] whitespace-pre-line line-clamp-6">{preview || "Empty note."}</p>
        <button onClick={() => onPatch({ pageId: undefined })} className="mt-2 text-[11px] text-[var(--faint)] hover:text-[var(--text)]">Change note</button>
      </div>
    );
  }

  if (t === "pageindex") {
    const kids = allPages.filter((p) => p.parentId === currentPageId);
    return (
      <div className={cn("my-1 p-3", card)}>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--faint)] uppercase tracking-widest mb-1.5"><Table2 className="w-3.5 h-3.5" /> Sub-pages</p>
        {kids.length === 0 ? <p className="text-[12.5px] text-[var(--faint)]">No sub-pages yet.</p> : (
          <div className="divide-y divide-[var(--border)]">
            {kids.map((p) => (
              <button key={p.id} onClick={() => onOpenPage(p.id)} className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-[var(--surface-2)] rounded px-1">
                <span>{p.icon || "📄"}</span><span className="flex-1 truncate text-[13px] text-[var(--text)]">{p.title || "Untitled"}</span>
                <span className="text-[11px] text-[var(--faint)] shrink-0">{new Date(p.updatedAt).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (t === "properties") {
    const props = block.props ?? [];
    const set = (id: string, patch: Partial<{ key: string; value: string }>) => onPatch({ props: props.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
    return (
      <div className={cn("my-1 p-3 space-y-1.5", card)}>
        {props.map((p) => (
          <div key={p.id} className="group/pr flex items-center gap-2">
            <input value={p.key} onChange={(e) => set(p.id, { key: e.target.value })} placeholder="Property" className="w-28 bg-transparent text-[12.5px] font-medium text-[var(--muted)] focus:outline-none shrink-0" />
            <input value={p.value} onChange={(e) => set(p.id, { value: e.target.value })} placeholder="Value" className="flex-1 bg-transparent text-[13px] text-[var(--text)] focus:outline-none" />
            <button onClick={() => onPatch({ props: props.filter((x) => x.id !== p.id) })} className="p-0.5 text-[var(--faint)] hover:text-red-500 opacity-0 group-hover/pr:opacity-100"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        <button onClick={() => onPatch({ props: [...props, { id: uid(), key: "", value: "" }] })} className="flex items-center gap-1 text-[12px] text-[var(--muted)] hover:text-[var(--text)]"><Plus className="w-3.5 h-3.5" /> Add property</button>
      </div>
    );
  }

  if (t === "progress") {
    const v = block.value ?? 0;
    return (
      <div className={cn("my-1 p-3", card)}>
        <div className="flex items-center gap-2 mb-2">
          <input value={block.text} onChange={(e) => onPatch({ text: e.target.value })} placeholder="Goal label" className="flex-1 bg-transparent text-[13.5px] font-medium text-[var(--text)] focus:outline-none" />
          <span className="text-[13px] font-bold text-[var(--text)] tabular-nums">{v}%</span>
        </div>
        <div className="h-2 bg-[var(--chip)] rounded-full overflow-hidden mb-1.5"><div className="h-full bg-[var(--text)] rounded-full transition-all" style={{ width: `${v}%` }} /></div>
        <input type="range" min={0} max={100} value={v} onChange={(e) => onPatch({ value: parseInt(e.target.value) })} className="w-full accent-[var(--text)]" />
      </div>
    );
  }

  if (t === "counter") {
    const v = block.value ?? 0;
    return (
      <div className={cn("my-1 flex items-center gap-3 px-3 py-2.5", card)}>
        <Hash className="w-4 h-4 text-[var(--faint)] shrink-0" />
        <input value={block.text} onChange={(e) => onPatch({ text: e.target.value })} placeholder="Counter / streak" className="flex-1 bg-transparent text-[13.5px] text-[var(--text)] focus:outline-none" />
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => onPatch({ value: v - 1 })} className="w-7 h-7 rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]">−</button>
          <span className="text-xl font-extrabold text-[var(--text)] tabular-nums w-8 text-center">{v}</span>
          <button onClick={() => onPatch({ value: v + 1 })} className="w-7 h-7 rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]">+</button>
        </div>
      </div>
    );
  }

  if (t === "countdown") {
    const d = block.date;
    let days: number | null = null;
    if (d) { const ms = new Date(d + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime(); days = Math.round(ms / 86400000); }
    return (
      <div className={cn("my-1 flex items-center gap-3 px-3 py-2.5", card)}>
        <Timer className="w-4 h-4 text-[var(--faint)] shrink-0" />
        <input value={block.text} onChange={(e) => onPatch({ text: e.target.value })} placeholder="Event" className="flex-1 bg-transparent text-[13.5px] text-[var(--text)] focus:outline-none" />
        <input type="date" value={d ?? ""} onChange={(e) => onPatch({ date: e.target.value })} className="bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-2 py-1 text-[12px] text-[var(--text)] focus:outline-none shrink-0" />
        {days !== null && <span className="text-[13px] font-bold text-[var(--text)] tabular-nums shrink-0 whitespace-nowrap">{days > 0 ? `${days}d left` : days === 0 ? "Today" : `${-days}d ago`}</span>}
      </div>
    );
  }

  if (t === "rating") {
    const v = block.value ?? 0;
    return (
      <div className={cn("my-1 flex items-center gap-3 px-3 py-2.5", card)}>
        <input value={block.text} onChange={(e) => onPatch({ text: e.target.value })} placeholder="Rating label" className="flex-1 bg-transparent text-[13.5px] text-[var(--text)] focus:outline-none" />
        <div className="flex items-center gap-0.5 shrink-0">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => onPatch({ value: v === n ? n - 1 : n })}><Star className={cn("w-5 h-5 transition-colors", n <= v ? "fill-[var(--text)] text-[var(--text)]" : "text-[var(--border-2)]")} /></button>
          ))}
        </div>
      </div>
    );
  }

  if (t === "math") {
    return (
      <div className={cn("my-1 p-3", card)}>
        <div className="text-center text-[22px] text-[var(--text)] py-2 font-serif italic min-h-[40px] break-words">{block.text || <span className="text-[var(--faint)] text-[13px] not-italic">Enter an expression below…</span>}</div>
        <input value={block.text} onChange={(e) => onPatch({ text: e.target.value })} placeholder="e.g. E = mc^2" className={cn(fieldCls, "font-mono mt-1")} />
      </div>
    );
  }

  if (t === "diagram") {
    return (
      <div className={cn("my-1 p-3", card)}>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--faint)] uppercase tracking-widest mb-1.5"><Workflow className="w-3.5 h-3.5" /> Diagram (Mermaid syntax)</p>
        <AutoTextarea value={block.text} onChange={(v) => onPatch({ text: v })} placeholder={"graph TD\n  A[Start] --> B[Next]"} className="w-full font-mono text-[12.5px] leading-relaxed text-[var(--text)] bg-[var(--surface)] rounded-md p-2 border border-[var(--border)]" />
      </div>
    );
  }

  if (t === "button") {
    return (
      <div className="my-1 space-y-1.5">
        <a href={block.url || undefined} target={block.url ? "_blank" : undefined} rel="noopener"
          onClick={(e) => { if (!block.url && block.pageId) { e.preventDefault(); onOpenPage(block.pageId); } }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--text)] text-[var(--bg)] text-[13.5px] font-semibold hover:bg-[var(--text-hover)] transition-colors cursor-pointer">
          <MousePointerClick className="w-4 h-4" /> {block.text || "Button"}
        </a>
        <div className="flex flex-wrap gap-1.5">
          <input value={block.text} onChange={(e) => onPatch({ text: e.target.value })} placeholder="Button label" className={cn(fieldCls, "max-w-[180px]")} />
          <input value={block.url ?? ""} onChange={(e) => onPatch({ url: e.target.value })} placeholder="Link URL (optional)" className={cn(fieldCls, "max-w-[240px]")} />
        </div>
      </div>
    );
  }

  return null;
}
