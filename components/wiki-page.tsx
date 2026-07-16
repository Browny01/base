"use client";

import { useState, useEffect } from "react";
import { useBridge } from "@/lib/hooks";
import { useToast } from "@/lib/toast-context";
import { uid, cn } from "@/lib/utils";
import type { WikiPage as WikiPageT, WikiBlock, WikiFolder } from "@/lib/store";
import { WikiEditor, blocksToText } from "@/components/wiki-editor";
import { WikiGraph } from "@/components/wiki-graph";
import {
  Plus, FileText, Network, ChevronRight, Trash2, NotebookText, ChevronDown,
  Ellipsis, MoveHorizontal, Copy, CopyPlus, FileDown, Check, Lock, LockOpen,
  RotateCcw, LayoutTemplate, Trash, Folder, FolderPlus, FolderOpen, PanelLeft, Pencil,
} from "lucide-react";

const LOCK_PASSWORD = "151715";

// ── Page templates (offered when creating a new page) ───────────────────────────
type TemplateDef = { id: string; name: string; icon: string; desc: string; build: () => { icon: string; title: string; blocks: WikiBlock[] } };
const tb = (type: WikiBlock["type"], text = "", extra: Partial<WikiBlock> = {}): WikiBlock => ({ id: uid(), type, text, ...extra });
const TEMPLATES: TemplateDef[] = [
  { id: "blank", name: "Blank page", icon: "📄", desc: "Start from scratch",
    build: () => ({ icon: "📄", title: "", blocks: [tb("text")] }) },
  { id: "meeting", name: "Meeting notes", icon: "🗓️", desc: "Agenda, notes, action items",
    build: () => ({ icon: "🗓️", title: "Meeting notes", blocks: [
      tb("callout", "Date · Attendees · Purpose", { emoji: "🗓️" }),
      tb("h2", "Agenda"), tb("bulleted", ""),
      tb("h2", "Discussion"), tb("text", ""),
      tb("h2", "Action items"), tb("todo", "", { checked: false }),
    ] }) },
  { id: "daily", name: "Daily journal", icon: "📔", desc: "Gratitude, focus, reflection",
    build: () => ({ icon: "📔", title: "Daily journal", blocks: [
      tb("callout", "How am I feeling today?", { emoji: "🌤️" }),
      tb("h2", "Top 3 priorities"), tb("todo", "", { checked: false }), tb("todo", "", { checked: false }), tb("todo", "", { checked: false }),
      tb("h2", "Gratitude"), tb("bulleted", ""),
      tb("h2", "Notes"), tb("text", ""),
    ] }) },
  { id: "project", name: "Project plan", icon: "🚀", desc: "Overview, goals, milestones",
    build: () => ({ icon: "🚀", title: "Project plan", blocks: [
      tb("h2", "Overview"), tb("text", ""),
      tb("h2", "Goals"), tb("bulleted", ""),
      tb("h2", "Milestones"), tb("board", "", { board: [
        { id: uid(), title: "To do", cards: [] }, { id: uid(), title: "In progress", cards: [] }, { id: uid(), title: "Done", cards: [] },
      ] }),
      tb("h2", "Notes"), tb("text", ""),
    ] }) },
  { id: "reading", name: "Reading notes", icon: "📚", desc: "Summary, highlights, takeaways",
    build: () => ({ icon: "📚", title: "Reading notes", blocks: [
      tb("callout", "Title · Author · Date finished", { emoji: "📖" }),
      tb("h2", "Summary"), tb("text", ""),
      tb("h2", "Highlights"), tb("bulleted", ""),
      tb("h2", "Key takeaways"), tb("numbered", ""),
    ] }) },
  { id: "todo", name: "To-do list", icon: "✅", desc: "A simple checklist",
    build: () => ({ icon: "✅", title: "To-do list", blocks: [
      tb("todo", "", { checked: false }), tb("todo", "", { checked: false }), tb("todo", "", { checked: false }),
    ] }) },
];

// Friendly date + time for the page-info footer.
function fmtStamp(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) + " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Build a standalone printable HTML document for a page (used for PDF export).
function pageToPrintDoc(page: WikiPageT): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const strip = (h: string) => { const d = document.createElement("div"); d.innerHTML = h; return d.textContent || ""; };
  const body = (page.blocks as WikiBlock[]).map((b) => {
    switch (b.type) {
      case "h1": return `<h1>${b.text}</h1>`;
      case "h2": return `<h2>${b.text}</h2>`;
      case "h3": return `<h3>${b.text}</h3>`;
      case "bulleted": return `<ul><li>${b.text}</li></ul>`;
      case "numbered": return `<ol><li>${b.text}</li></ol>`;
      case "todo": return `<p>${b.checked ? "☑" : "☐"} ${b.text}</p>`;
      case "quote": return `<blockquote>${b.text}</blockquote>`;
      case "code": return `<pre><code>${esc(strip(b.text))}</code></pre>`;
      case "callout": return `<div class="callout">${b.emoji || "💡"} ${b.text}</div>`;
      case "toggle": return `<details open><summary>${b.text}</summary>${b.body ? `<div>${b.body}</div>` : ""}</details>`;
      case "pagelink": return `<p>↪ <em>linked page</em></p>`;
      case "divider": return `<hr/>`;
      case "image": return b.src ? `<figure><img src="${b.src}"/>${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>` : "";
      case "table": {
        const rows = b.table?.rows ?? [];
        return `<table>${rows.map((r, ri) => `<tr>${r.map((c) => (ri === 0 ? `<th>${c}</th>` : `<td>${c}</td>`)).join("")}</tr>`).join("")}</table>`;
      }
      case "board": return (b.board ?? []).map((col) => `<h3>${esc(col.title)}</h3><ul>${col.cards.map((c) => `<li>${esc(c.text)}</li>`).join("")}</ul>`).join("");
      case "chart": {
        const rows = b.chart?.data ?? [];
        return `<p><em>${b.chart?.kind ?? "bar"} chart</em></p><table><tr><th>Label</th><th>Value</th></tr>${rows.map((d) => `<tr><td>${esc(d.label)}</td><td>${d.value}</td></tr>`).join("")}</table>`;
      }
      default: return `<p>${b.text || "<br/>"}</p>`;
    }
  }).join("\n");
  const title = esc(page.title || "Untitled");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
    *{box-sizing:border-box} body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;color:#111;max-width:720px;margin:40px auto;padding:0 24px;line-height:1.6}
    h1{font-size:32px;margin:.6em 0 .3em} h2{font-size:24px;margin:.6em 0 .3em} h3{font-size:19px;margin:.5em 0 .3em}
    p{margin:.4em 0} ul,ol{margin:.3em 0 .3em 1.2em} blockquote{border-left:3px solid #ccc;margin:.5em 0;padding:.2em 0 .2em 14px;color:#444;font-style:italic}
    pre{background:#f5f5f5;border:1px solid #e5e5e5;border-radius:8px;padding:12px;overflow:auto;font-size:13px} hr{border:none;border-top:1px solid #ddd;margin:1.2em 0}
    table{border-collapse:collapse;margin:.6em 0} th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:14px} th{background:#f5f5f5}
    img{max-width:100%;border-radius:8px} figcaption{font-size:12px;color:#666;margin-top:4px} .pg-title{font-size:38px;font-weight:800;margin-bottom:.4em}
    .callout{background:#f5f5f5;border:1px solid #e5e5e5;border-radius:8px;padding:10px 14px;margin:.5em 0} details{margin:.4em 0} summary{font-weight:600;cursor:pointer}
  </style></head><body><div class="pg-title">${page.icon || "📄"} ${title}</div>${body}</body></html>`;
}

export function WikiPage() {
  const { data, mutate } = useBridge();
  const { toast } = useToast();
  const allWiki = data.wikiPages ?? [];
  const pages = allWiki.filter((p) => !p.deletedAt);          // live pages
  const deletedPages = allWiki.filter((p) => p.deletedAt);    // in Trash
  const folders = data.wikiFolders ?? [];

  const [rawActive, setRawActive] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem("bridge_wiki_active") || "" : "");
  const [view, setView] = useState<"editor" | "graph">("editor");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);     // mobile drawer
  // Pages unlocked this session (cleared on reload, so the password is needed again).
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());

  const activeId = pages.some((p) => p.id === rawActive) ? rawActive : (pages[0]?.id ?? "");
  const activePage = pages.find((p) => p.id === activeId) ?? null;
  // A locked page is "gated" until its password is entered this session.
  const gated = !!(activePage?.locked && !unlocked.has(activePage.id));

  function selectPage(id: string) {
    setRawActive(id);
    setSidebarOpen(false);   // close the mobile drawer on selection
    if (typeof window !== "undefined") localStorage.setItem("bridge_wiki_active", id);
  }
  function toggleExpand(id: string) {
    setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleFolder(id: string) {
    setCollapsedFolders((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  // Open a specific page when navigated here from the command bar.
  useEffect(() => {
    const h = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setRawActive(id);
      try { localStorage.setItem("bridge_wiki_active", id); } catch {}
      setView("editor");
    };
    window.addEventListener("bridge:open-wiki", h);
    return () => window.removeEventListener("bridge:open-wiki", h);
  }, []);

  function createPage(parentId: string | null = null, seed?: { icon: string; title: string; blocks: WikiBlock[] }, folderId: string | null = null): string {
    const id = uid();
    const now = new Date().toISOString();
    const pg: WikiPageT = {
      id, parentId, folderId: parentId ? null : folderId,
      title: seed?.title ?? "",
      icon: seed?.icon ?? "📄",
      blocks: seed?.blocks?.length ? seed.blocks : [{ id: uid(), type: "text", text: "" }],
      createdAt: now, updatedAt: now,
    };
    mutate((d) => ({ ...d, wikiPages: [...(d.wikiPages ?? []), pg] }));
    if (parentId) setExpanded((s) => new Set(s).add(parentId));
    if (folderId) setCollapsedFolders((s) => { const n = new Set(s); n.delete(folderId); return n; });
    selectPage(id);
    setView("editor");
    return id;
  }
  function createFromTemplate(tpl: TemplateDef) {
    setNewMenuOpen(false);
    createPage(null, tpl.build());
  }

  // ── Folders ────────────────────────────────────────────────────────────────
  function createFolder() {
    const name = (typeof window !== "undefined" ? window.prompt("Folder name", "New folder") : "New folder")?.trim();
    if (!name) return;
    const folder: WikiFolder = { id: uid(), name, createdAt: new Date().toISOString() };
    mutate((d) => ({ ...d, wikiFolders: [...(d.wikiFolders ?? []), folder] }));
  }
  function renameFolder(id: string) {
    const cur = folders.find((f) => f.id === id);
    const name = (typeof window !== "undefined" ? window.prompt("Rename folder", cur?.name ?? "") : null)?.trim();
    if (!name) return;
    mutate((d) => ({ ...d, wikiFolders: (d.wikiFolders ?? []).map((f) => (f.id === id ? { ...f, name } : f)) }));
  }
  function deleteFolder(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Delete this folder? Its pages move out to the top level (pages are kept).")) return;
    mutate((d) => ({
      ...d,
      wikiFolders: (d.wikiFolders ?? []).filter((f) => f.id !== id),
      wikiPages: (d.wikiPages ?? []).map((p) => (p.folderId === id ? { ...p, folderId: null } : p)),
    }));
  }
  // Move a page into a folder (or to top level). Promotes sub-pages to a root.
  function moveToFolder(pageId: string, folderId: string | null) {
    mutate((d) => ({ ...d, wikiPages: (d.wikiPages ?? []).map((p) => (p.id === pageId ? { ...p, folderId, parentId: null } : p)) }));
    if (folderId) setCollapsedFolders((s) => { const n = new Set(s); n.delete(folderId); return n; });
    setOptionsOpen(false);
  }

  function updatePage(id: string, patch: Partial<WikiPageT>) {
    mutate((d) => ({ ...d, wikiPages: (d.wikiPages ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  }

  // Collect a page id + all of its descendants (within the live tree).
  function subtreeIds(id: string, src: WikiPageT[]): Set<string> {
    const ids = new Set<string>();
    const walk = (pid: string) => { ids.add(pid); src.filter((p) => p.parentId === pid).forEach((c) => walk(c.id)); };
    walk(id);
    return ids;
  }

  // Soft-delete: move the page (and its sub-pages) to Trash. Auto-purged after 14 days.
  function deletePage(id: string) {
    const ids = subtreeIds(id, pages);
    const now = new Date().toISOString();
    mutate((d) => ({ ...d, wikiPages: (d.wikiPages ?? []).map((p) => (ids.has(p.id) ? { ...p, deletedAt: now } : p)) }));
    if (ids.has(activeId)) selectPage(pages.find((p) => !ids.has(p.id))?.id ?? "");
    toast(ids.size > 1 ? `${ids.size} pages moved to Trash` : "Page moved to Trash", { action: { label: "Undo", onClick: () => mutate((d) => ({ ...d, wikiPages: (d.wikiPages ?? []).map((p) => (ids.has(p.id) ? { ...p, deletedAt: null } : p)) })) } });
  }

  // Restore a trashed page and its sub-pages; reparent to root if its parent is gone.
  function restorePage(id: string) {
    const ids = subtreeIds(id, allWiki);
    mutate((d) => ({
      ...d,
      wikiPages: (d.wikiPages ?? []).map((p) => {
        if (!ids.has(p.id)) return p;
        const parentLost = p.id === id && p.parentId && !((d.wikiPages ?? []).some((q) => q.id === p.parentId && !q.deletedAt) || ids.has(p.parentId));
        return { ...p, deletedAt: null, parentId: parentLost ? null : p.parentId };
      }),
    }));
    selectPage(id);
    setView("editor");
  }

  // Permanently delete a trashed page (the "delete a second time" action).
  function purgePage(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Permanently delete this page? This cannot be undone.")) return;
    const ids = subtreeIds(id, allWiki);
    mutate((d) => ({ ...d, wikiPages: (d.wikiPages ?? []).filter((p) => !ids.has(p.id)) }));
  }

  // ── Page options (3-dot menu) ──────────────────────────────────────────────
  function duplicatePage(id: string) {
    const subtree: WikiPageT[] = [];
    const collect = (pid: string) => { const p = pages.find((x) => x.id === pid); if (!p) return; subtree.push(p); pages.filter((x) => x.parentId === pid).forEach((c) => collect(c.id)); };
    collect(id);
    const idMap = new Map(subtree.map((p) => [p.id, uid()]));
    const now = new Date().toISOString();
    const root = pages.find((x) => x.id === id);
    const copies: WikiPageT[] = subtree.map((p) => ({
      ...p,
      id: idMap.get(p.id)!,
      parentId: p.id === id ? (root?.parentId ?? null) : (idMap.get(p.parentId ?? "") ?? null),
      title: p.id === id ? `${p.title || "Untitled"} (copy)` : p.title,
      blocks: p.blocks.map((b) => ({ ...b, id: uid() })),
      createdAt: now, updatedAt: now,
    }));
    mutate((d) => ({ ...d, wikiPages: [...(d.wikiPages ?? []), ...copies] }));
    selectPage(idMap.get(id)!);
    setView("editor");
  }

  async function copyContents(page: WikiPageT) {
    const text = `${page.title || "Untitled"}\n\n${blocksToText(page.blocks)}`;
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be blocked */ }
  }

  function downloadPdf(page: WikiPageT) {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(pageToPrintDoc(page));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350); // let images/layout settle
  }

  // Breadcrumb trail from root → active.
  const trail: WikiPageT[] = [];
  {
    let cur = activePage;
    const guard = new Set<string>();
    while (cur && !guard.has(cur.id)) { trail.unshift(cur); guard.add(cur.id); cur = pages.find((p) => p.id === cur!.parentId) ?? null; }
  }

  const roots = pages.filter((p) => !p.parentId || !pages.some((q) => q.id === p.parentId));
  const ungrouped = roots.filter((p) => !p.folderId || !folders.some((f) => f.id === p.folderId));

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] bg-[var(--bg)] relative">
      {/* mobile drawer backdrop */}
      {sidebarOpen && <div className="md:hidden fixed inset-0 top-14 z-40 bg-black/40 backdrop-blur-[2px] nx-fade" onClick={() => setSidebarOpen(false)} />}

      {/* ── Page tree ─────────────────────────────────────────────────────── */}
      <aside className={cn(
        "border-r border-[var(--border)] flex flex-col bg-[var(--bg)] w-72 md:w-60 shrink-0",
        "max-md:fixed max-md:top-14 max-md:bottom-0 max-md:left-0 max-md:z-50 max-md:shadow-2xl transition-transform duration-200 ease-out",
        sidebarOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
      )}>
        <div className="flex items-center justify-between h-12 px-3 shrink-0 border-b border-[var(--border)]">
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <NotebookText className="w-4 h-4" /> Notes
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={createFolder}
              title="New folder"
              className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)] transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
            <div className="relative">
            <button
              onClick={() => setNewMenuOpen((v) => !v)}
              title="New page"
              className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)] transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
            {newMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNewMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-50 w-60 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-1.5 nx-pop">
                  <p className="px-2 py-1 text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest flex items-center gap-1.5"><LayoutTemplate className="w-3 h-3" /> Templates</p>
                  {TEMPLATES.map((t) => (
                    <button key={t.id} onClick={() => createFromTemplate(t)} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left hover:bg-[var(--surface-2)] transition-colors">
                      <span className="w-7 h-7 rounded-md border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center shrink-0 text-[15px]">{t.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-[13px] text-[var(--text)] font-medium leading-tight">{t.name}</span>
                        <span className="block text-[11px] text-[var(--faint)] leading-tight truncate">{t.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-1.5">
          {roots.length === 0 && folders.length === 0 ? (
            <button
              onClick={() => createPage(null)}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[13px] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <Plus className="w-4 h-4" /> New page
            </button>
          ) : (
            <>
              {/* Folders */}
              {folders.map((f) => (
                <FolderSection
                  key={f.id}
                  folder={f}
                  pages={pages}
                  folderRoots={roots.filter((p) => (p.folderId ?? null) === f.id)}
                  open={!collapsedFolders.has(f.id)}
                  activeId={activeId}
                  expanded={expanded}
                  onToggleFolder={() => toggleFolder(f.id)}
                  onRename={() => renameFolder(f.id)}
                  onDeleteFolder={() => deleteFolder(f.id)}
                  onAddPage={() => createPage(null, undefined, f.id)}
                  onSelect={selectPage}
                  onToggle={toggleExpand}
                  onAddChild={(pid) => createPage(pid)}
                  onDelete={deletePage}
                />
              ))}

              {/* Ungrouped pages */}
              {folders.length > 0 && ungrouped.length > 0 && (
                <p className="px-2 pt-2 pb-1 text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest">No folder</p>
              )}
              {ungrouped.map((p) => (
                <TreeNode
                  key={p.id}
                  page={p}
                  pages={pages}
                  depth={0}
                  activeId={activeId}
                  expanded={expanded}
                  onSelect={selectPage}
                  onToggle={toggleExpand}
                  onAddChild={(pid) => createPage(pid)}
                  onDelete={deletePage}
                />
              ))}
            </>
          )}
        </div>

        {/* ── Trash ──────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-[var(--border)] px-1.5 py-1.5">
          <button
            onClick={() => setTrashOpen((v) => !v)}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[13px] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
          >
            {trashOpen ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
            <Trash className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 text-left">Trash</span>
            {deletedPages.length > 0 && <span className="text-[11px] text-[var(--faint)] tabular-nums">{deletedPages.length}</span>}
          </button>
          {trashOpen && (
            <div className="mt-1 max-h-[30vh] overflow-y-auto">
              {deletedPages.length === 0 ? (
                <p className="px-2 py-2 text-[12px] text-[var(--faint)]">Trash is empty. Deleted pages are kept here for 14 days.</p>
              ) : (
                deletedPages
                  .slice()
                  .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""))
                  .map((p) => (
                    <div key={p.id} className="group flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[var(--muted)] hover:bg-[var(--surface-2)]">
                      <span className="shrink-0 text-[13px]">{p.icon || "📄"}</span>
                      <span className="flex-1 truncate text-[12.5px]">{p.title || "Untitled"}</span>
                      <button onClick={() => restorePage(p.id)} title="Restore" className="p-1 rounded text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--chip)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => purgePage(p.id)} title="Delete permanently" className="p-1 rounded text-[var(--faint)] hover:text-red-500 hover:bg-[var(--chip)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ── Main column ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between h-12 px-3 sm:px-4 shrink-0 border-b border-[var(--border)] gap-1">
          <button
            onClick={() => setSidebarOpen(true)}
            title="Notes menu"
            className="md:hidden shrink-0 p-1.5 -ml-1 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)] transition-colors"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1 min-w-0 text-[13px] text-[var(--muted)] flex-1">
            {trail.length === 0 ? (
              <span className="text-[var(--faint)]">No page selected</span>
            ) : (
              trail.map((p, i) => (
                <span key={p.id} className="flex items-center gap-1 min-w-0">
                  {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-[var(--faint)] shrink-0" />}
                  <button
                    onClick={() => { selectPage(p.id); setView("editor"); }}
                    className={cn("truncate hover:text-[var(--text)] transition-colors", i === trail.length - 1 && "text-[var(--text)] font-medium")}
                  >
                    {p.icon} {p.title || "Untitled"}
                  </button>
                </span>
              ))
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-0.5">
              <ViewBtn active={view === "editor"} onClick={() => setView("editor")} icon={<FileText className="w-3.5 h-3.5" />} label="Page" />
              <ViewBtn active={view === "graph"} onClick={() => setView("graph")} icon={<Network className="w-3.5 h-3.5" />} label="Graph" />
            </div>

            {activePage && !gated && (
              <div className="relative">
                <button
                  onClick={() => setOptionsOpen((v) => !v)}
                  title="Page options"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)] transition-colors"
                >
                  <Ellipsis className="w-4 h-4" />
                </button>
                {optionsOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setOptionsOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-56 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-1.5 nx-pop">
                      <button
                        onClick={() => { updatePage(activePage.id, { fullWidth: !activePage.fullWidth }); setOptionsOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
                      >
                        <MoveHorizontal className="w-4 h-4 text-[var(--muted)]" />
                        <span className="flex-1 text-left">Full width</span>
                        {activePage.fullWidth && <Check className="w-4 h-4" />}
                      </button>
                      <button onClick={() => { copyContents(activePage); setOptionsOpen(false); }} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors">
                        <Copy className="w-4 h-4 text-[var(--muted)]" /> Copy page contents
                      </button>
                      <button onClick={() => { duplicatePage(activePage.id); setOptionsOpen(false); }} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors">
                        <CopyPlus className="w-4 h-4 text-[var(--muted)]" /> Duplicate page
                      </button>
                      <button onClick={() => { downloadPdf(activePage); setOptionsOpen(false); }} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors">
                        <FileDown className="w-4 h-4 text-[var(--muted)]" /> Download as PDF
                      </button>

                      {/* Move to folder */}
                      <div className="my-1 border-t border-[var(--border)]" />
                      <p className="px-2.5 py-1 text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest">Move to folder</p>
                      <div className="max-h-[160px] overflow-y-auto">
                        <button onClick={() => moveToFolder(activePage.id, null)} className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors">
                          <FileText className="w-4 h-4 text-[var(--muted)]" /> <span className="flex-1 text-left">No folder</span>
                          {!activePage.folderId && <Check className="w-4 h-4" />}
                        </button>
                        {folders.map((f) => (
                          <button key={f.id} onClick={() => moveToFolder(activePage.id, f.id)} className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors">
                            <Folder className="w-4 h-4 text-[var(--muted)]" /> <span className="flex-1 text-left truncate">{f.name}</span>
                            {activePage.folderId === f.id && <Check className="w-4 h-4" />}
                          </button>
                        ))}
                        {folders.length === 0 && <p className="px-2.5 py-1.5 text-[12px] text-[var(--faint)]">No folders yet. Use the folder+ button in the sidebar.</p>}
                      </div>

                      <div className="my-1 border-t border-[var(--border)]" />
                      <button
                        onClick={() => {
                          if (activePage.locked) {
                            updatePage(activePage.id, { locked: false });
                          } else {
                            updatePage(activePage.id, { locked: true });
                            setUnlocked((s) => new Set(s).add(activePage.id)); // keep viewing after locking
                          }
                          setOptionsOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
                      >
                        {activePage.locked
                          ? <><LockOpen className="w-4 h-4 text-[var(--muted)]" /> Unlock page</>
                          : <><Lock className="w-4 h-4 text-[var(--muted)]" /> Lock page</>}
                      </button>

                      {/* Created / updated timestamps */}
                      <div className="my-1 border-t border-[var(--border)]" />
                      <div className="px-2.5 py-1.5 space-y-0.5">
                        <p className="text-[11px] text-[var(--faint)]">Created {fmtStamp(activePage.createdAt)}</p>
                        <p className="text-[11px] text-[var(--faint)]">Updated {fmtStamp(activePage.updatedAt)}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0">
          {view === "graph" ? (
            <WikiGraph pages={pages} folders={folders} activeId={activeId} onOpen={(id) => { selectPage(id); setView("editor"); }} />
          ) : gated && activePage ? (
            <LockScreen
              key={activePage.id}
              onUnlock={(pw) => {
                if (pw === LOCK_PASSWORD) { setUnlocked((s) => new Set(s).add(activePage.id)); return true; }
                return false;
              }}
            />
          ) : activePage ? (
            <div className="h-full overflow-y-auto">
              <WikiEditor
                key={activePage.id}
                page={activePage}
                fullWidth={!!activePage.fullWidth}
                allPages={pages}
                onOpenPage={(id) => { selectPage(id); setView("editor"); }}
                onChange={(patch) => updatePage(activePage.id, patch)}
              />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <NotebookText className="w-10 h-10 mx-auto mb-4 text-[var(--faint)] opacity-30" />
                <p className="text-sm text-[var(--muted)] mb-4">No pages yet.</p>
                <button
                  onClick={() => createPage(null)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-sm font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" /> Create your first page
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LockScreen({ onUnlock }: { onUnlock: (pw: string) => boolean }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const submit = () => { if (!onUnlock(pw)) { setErr(true); setPw(""); } };
  return (
    <div className="h-full flex items-center justify-center px-6">
      <div className="w-full max-w-[320px] text-center">
        <div className="w-14 h-14 rounded-2xl bg-[var(--chip)] flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6 text-[var(--muted)]" />
        </div>
        <h2 className="text-lg font-semibold text-[var(--text)] mb-1 tracking-tight">Page locked</h2>
        <p className="text-sm text-[var(--muted)] mb-5">Enter the password to view this page.</p>
        <input
          autoFocus
          type="password"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setErr(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Password"
          className={cn(
            "w-full text-center bg-[var(--surface-2)] border rounded-xl px-3 py-2.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none transition-colors tracking-[0.3em]",
            err ? "border-red-500" : "border-[var(--border)] focus:border-[var(--border-2)]",
          )}
        />
        {err && <p className="text-xs text-red-500 mt-2">Incorrect password</p>}
        <button
          onClick={submit}
          className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-sm font-medium rounded-xl transition-colors"
        >
          <LockOpen className="w-3.5 h-3.5" /> Unlock
        </button>
      </div>
    </div>
  );
}

function ViewBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12.5px] font-medium transition-colors",
        active ? "bg-[var(--surface)] text-[var(--text)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]",
      )}
    >
      {icon} {label}
    </button>
  );
}

function FolderSection({
  folder, pages, folderRoots, open, activeId, expanded,
  onToggleFolder, onRename, onDeleteFolder, onAddPage, onSelect, onToggle, onAddChild, onDelete,
}: {
  folder: WikiFolder;
  pages: WikiPageT[];
  folderRoots: WikiPageT[];
  open: boolean;
  activeId: string;
  expanded: Set<string>;
  onToggleFolder: () => void;
  onRename: () => void;
  onDeleteFolder: () => void;
  onAddPage: () => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="mb-0.5">
      <div className="group flex items-center gap-0.5 rounded-md pr-1 text-[var(--muted)] hover:bg-[var(--surface-2)] transition-colors">
        <button onClick={onToggleFolder} className="p-0.5 rounded shrink-0 text-[var(--faint)] hover:text-[var(--text)]">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <button onClick={onToggleFolder} className="flex-1 flex items-center gap-1.5 py-1.5 min-w-0 text-left text-[13px] font-medium">
          {open ? <FolderOpen className="w-4 h-4 shrink-0 text-[var(--faint)]" /> : <Folder className="w-4 h-4 shrink-0 text-[var(--faint)]" />}
          <span className="truncate">{folder.name}</span>
          <span className="text-[11px] text-[var(--faint)] tabular-nums">{folderRoots.length}</span>
        </button>
        <button onClick={onAddPage} title="New page in folder" className="p-1 rounded text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--chip)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"><Plus className="w-3.5 h-3.5" /></button>
        <button onClick={onRename} title="Rename folder" className="p-1 rounded text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--chip)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"><Pencil className="w-3.5 h-3.5" /></button>
        <button onClick={onDeleteFolder} title="Delete folder" className="p-1 rounded text-[var(--faint)] hover:text-red-500 hover:bg-[var(--chip)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      {open && (
        <div className="ml-2 pl-1 border-l border-[var(--border)]">
          {folderRoots.length === 0 ? (
            <button onClick={onAddPage} className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[12.5px] text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add a page
            </button>
          ) : folderRoots.map((p) => (
            <TreeNode key={p.id} page={p} pages={pages} depth={0} activeId={activeId} expanded={expanded}
              onSelect={onSelect} onToggle={onToggle} onAddChild={onAddChild} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeNode({
  page, pages, depth, activeId, expanded, onSelect, onToggle, onAddChild, onDelete,
}: {
  page: WikiPageT;
  pages: WikiPageT[];
  depth: number;
  activeId: string;
  expanded: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
}) {
  const children = pages.filter((p) => p.parentId === page.id);
  const isOpen = expanded.has(page.id);
  const isActive = page.id === activeId;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-0.5 rounded-md pr-1 transition-colors",
          isActive ? "bg-[var(--chip)] text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)]",
        )}
        style={{ paddingLeft: depth * 14 }}
      >
        <button
          onClick={() => children.length && onToggle(page.id)}
          className={cn("p-0.5 rounded shrink-0", children.length ? "text-[var(--faint)] hover:text-[var(--text)]" : "opacity-0 pointer-events-none")}
        >
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => onSelect(page.id)} className="flex-1 flex items-center gap-1.5 py-1.5 min-w-0 text-left text-[13px]">
          <span className="shrink-0 text-[13px]">{page.icon || "📄"}</span>
          <span className="truncate">{page.title || "Untitled"}</span>
          {page.locked && <Lock className="w-3 h-3 shrink-0 text-[var(--faint)]" />}
        </button>
        <button
          onClick={() => onAddChild(page.id)}
          title="Add sub-page"
          className="p-1 rounded text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--chip)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(page.id)}
          title="Delete page"
          className="p-1 rounded text-[var(--faint)] hover:text-red-500 hover:bg-[var(--chip)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {isOpen && children.map((c) => (
        <TreeNode
          key={c.id}
          page={c}
          pages={pages}
          depth={depth + 1}
          activeId={activeId}
          expanded={expanded}
          onSelect={onSelect}
          onToggle={onToggle}
          onAddChild={onAddChild}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
