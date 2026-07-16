"use client";

import { useEffect, useRef, useState, useCallback, useReducer, type ReactNode } from "react";
import { useNexus } from "@/lib/hooks";
import { getData } from "@/lib/store";
import { uid, cn } from "@/lib/utils";
import type { BoardItem, BoardDrawing, NoteColor, DrawTool, NexusData } from "@/lib/store";
import {
  ImagePlus, StickyNote, Trash2, Pencil, Check, Sparkles, ChevronDown,
  Plus, X, Brush, MousePointer2, Pen, Minus, ArrowUpRight, Square, Circle, Eraser,
  Undo2, Redo2, Music,
} from "lucide-react";

// Slice of state the Vision Board undo/redo history snapshots.
type BoardSnap = Pick<NexusData, "boards" | "boardItems" | "boardDrawings">;

// Canvas dimensions — a generous 2D space you can scroll around like a corkboard.
const CANVAS_W = 2600;
const CANVAS_H = 1800;

type Tool = "select" | DrawTool | "eraser";

const DRAW_TOOLS: { key: Tool; label: string; Icon: typeof Pen }[] = [
  { key: "select",  label: "Select",    Icon: MousePointer2 },
  { key: "pen",     label: "Pen",       Icon: Pen },
  { key: "line",    label: "Line",      Icon: Minus },
  { key: "arrow",   label: "Arrow",     Icon: ArrowUpRight },
  { key: "rect",    label: "Rectangle", Icon: Square },
  { key: "ellipse", label: "Ellipse",   Icon: Circle },
  { key: "eraser",  label: "Eraser",    Icon: Eraser },
];

const DRAW_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#0a0a0a", "#ffffff"];
const DRAW_WIDTHS = [2, 4, 7];

const NOTE_COLORS: Record<NoteColor, { bg: string; border: string; text: string; dot: string }> = {
  yellow: { bg: "#fef9c3", border: "#fde047", text: "#713f12", dot: "#facc15" },
  pink:   { bg: "#fce7f3", border: "#f9a8d4", text: "#831843", dot: "#ec4899" },
  blue:   { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a", dot: "#3b82f6" },
  green:  { bg: "#dcfce7", border: "#86efac", text: "#14532d", dot: "#22c55e" },
  purple: { bg: "#ede9fe", border: "#c4b5fd", text: "#4c1d95", dot: "#8b5cf6" },
  gray:   { bg: "#f1f5f9", border: "#cbd5e1", text: "#1e293b", dot: "#64748b" },
};
const COLOR_KEYS = Object.keys(NOTE_COLORS) as NoteColor[];

// Downscale an uploaded image, returning both a Blob (for upload) and a data
// URL (inline fallback) plus the final dimensions.
function fileToImage(file: File): Promise<{ blob: Blob | null; dataUrl: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1100;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no ctx"));
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        canvas.toBlob((blob) => resolve({ blob, dataUrl, w, h }), "image/jpeg", 0.82);
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Upload the downscaled image to Vercel Blob; returns the public URL, or null
// if Blob isn't configured / the upload fails (caller keeps the data URL).
async function uploadToBlob(blob: Blob): Promise<string | null> {
  try {
    const res = await fetch(`/api/blob/upload?filename=photo-${Date.now()}.jpg`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: blob,
    });
    if (!res.ok) return null;
    const { url } = await res.json();
    return typeof url === "string" ? url : null;
  } catch {
    return null;
  }
}

// Upload an arbitrary media file (mp3, …) to Vercel Blob; returns the hosted URL.
async function uploadMediaToBlob(file: File): Promise<string | null> {
  try {
    const ext = file.name.split(".").pop() || "bin";
    const res = await fetch(`/api/blob/upload?filename=media-${Date.now()}.${ext}`, {
      method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file,
    });
    if (!res.ok) return null;
    const { url } = await res.json();
    return typeof url === "string" ? url : null;
  } catch { return null; }
}

type DragState = {
  id: string; mode: "move" | "resize";
  startX: number; startY: number;
  origX: number; origY: number; origW: number; origH: number;
  moved: boolean;
};

export function VisionBoardPage() {
  const { data, mutate } = useNexus();
  const boards = data.boards ?? [];

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const musicRef = useRef<HTMLInputElement>(null);

  // ── Active board ───────────────────────────────────────────────────────────
  const [activeBoardId, setActiveBoardId] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem("nexus_vision_active") || "" : "");
  const activeId = boards.some((b) => b.id === activeBoardId) ? activeBoardId : (boards[0]?.id ?? "");
  const activeBoard = boards.find((b) => b.id === activeId);

  function selectBoard(id: string) {
    setActiveBoardId(id);
    if (typeof window !== "undefined") localStorage.setItem("nexus_vision_active", id);
  }

  // Open a specific board when navigated here from the command bar.
  useEffect(() => {
    const h = (e: Event) => selectBoard((e as CustomEvent<string>).detail);
    window.addEventListener("nexus:open-vision", h);
    return () => window.removeEventListener("nexus:open-vision", h);
  }, []);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [drawMenuOpen, setDrawMenuOpen] = useState(false);
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const [drawWidth, setDrawWidth] = useState(4);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BoardItem | null>(null); // live item position/size
  const dragRef = useRef<DragState | null>(null);
  const draftRef = useRef<BoardItem | null>(null);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  const [draftDrawing, setDraftDrawing] = useState<BoardDrawing | null>(null);
  const draftDrawingRef = useRef<BoardDrawing | null>(null); // managed synchronously by the draw handlers

  // Selecting / moving an existing drawing (works across sessions, unlike undo).
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const drawDragRef = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);
  const [drawOffset, setDrawOffset] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const drawOffsetRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  useEffect(() => { drawOffsetRef.current = drawOffset; }, [drawOffset]);

  // ── Undo / redo history ──────────────────────────────────────────────────────
  const past = useRef<BoardSnap[]>([]);
  const future = useRef<BoardSnap[]>([]);
  const [, forceHist] = useReducer((n: number) => n + 1, 0); // re-render for button enabled state

  const snapshot = useCallback((): BoardSnap => {
    const d = getData();
    return { boards: d.boards, boardItems: d.boardItems, boardDrawings: d.boardDrawings };
  }, []);

  // History-recording mutation: snapshot the board slice, then apply.
  const commit = useCallback((updater: (d: NexusData) => NexusData) => {
    past.current.push(snapshot());
    if (past.current.length > 80) past.current.shift();
    future.current = [];
    forceHist();
    mutate(updater);
  }, [mutate, snapshot]);

  const undo = useCallback(() => {
    if (!past.current.length) return;
    const prev = past.current.pop()!;
    future.current.push(snapshot());
    forceHist();
    mutate((d) => ({ ...d, ...prev }));
  }, [mutate, snapshot]);

  const redo = useCallback(() => {
    if (!future.current.length) return;
    const next = future.current.pop()!;
    past.current.push(snapshot());
    forceHist();
    mutate((d) => ({ ...d, ...next }));
  }, [mutate, snapshot]);

  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;

  const items = (data.boardItems ?? []).filter((it) => it.boardId === activeId);
  const drawings = (data.boardDrawings ?? []).filter((d) => d.boardId === activeId);
  const maxZ = items.reduce((m, it) => Math.max(m, it.z), 0);

  // Escape resets to the select tool and closes menus.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setTool("select"); setDrawMenuOpen(false); setBoardMenuOpen(false); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ⌘Z / ⌘⇧Z (and Ctrl+Y) undo/redo — ignored while editing text.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return; // let native text undo win
      const k = e.key.toLowerCase();
      if (k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (k === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [undo, redo]);

  // ── Board CRUD ─────────────────────────────────────────────────────────────
  function createBoard() {
    const id = uid();
    commit((d) => ({
      ...d,
      boards: [...(d.boards ?? []), { id, name: `Board ${(d.boards?.length ?? 0) + 1}`, createdAt: new Date().toISOString() }],
    }));
    selectBoard(id);
    setRenamingBoardId(id);
  }
  function renameBoard(id: string, name: string) {
    const clean = name.trim();
    if (clean) commit((d) => ({ ...d, boards: (d.boards ?? []).map((b) => (b.id === id ? { ...b, name: clean } : b)) }));
    setRenamingBoardId(null);
  }
  function deleteBoard(id: string) {
    if (boards.length <= 1) return; // always keep at least one board
    const remaining = boards.filter((b) => b.id !== id);
    commit((d) => ({
      ...d,
      boards: (d.boards ?? []).filter((b) => b.id !== id),
      boardItems: (d.boardItems ?? []).filter((it) => it.boardId !== id),
      boardDrawings: (d.boardDrawings ?? []).filter((dr) => dr.boardId !== id),
    }));
    if (id === activeId) selectBoard(remaining[0].id);
  }

  // ── Item helpers ───────────────────────────────────────────────────────────
  const dropPoint = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return { x: 200, y: 160 };
    const jitter = () => Math.round((Math.random() - 0.5) * 80);
    return {
      x: Math.min(CANVAS_W - 280, el.scrollLeft + el.clientWidth / 2 - 120 + jitter()),
      y: Math.min(CANVAS_H - 220, el.scrollTop + el.clientHeight / 2 - 90 + jitter()),
    };
  }, []);

  function patchItem(id: string, patch: Partial<BoardItem>) {
    commit((d) => ({ ...d, boardItems: (d.boardItems ?? []).map((it) => (it.id === id ? { ...it, ...patch } : it)) }));
  }
  // A z-order bump on grab shouldn't create its own undo step.
  function bumpToFront(id: string, z: number) {
    mutate((d) => ({ ...d, boardItems: (d.boardItems ?? []).map((it) => (it.id === id ? { ...it, z } : it)) }));
  }
  function removeItem(id: string) {
    // Note: we intentionally keep the underlying Blob so the deletion stays
    // undoable — the restored item keeps a working image URL.
    commit((d) => ({ ...d, boardItems: (d.boardItems ?? []).filter((it) => it.id !== id) }));
    if (editingId === id) setEditingId(null);
  }
  function addNote() {
    if (!activeId) return;
    const { x, y } = dropPoint();
    const note: BoardItem = {
      id: uid(), boardId: activeId, type: "note", x, y, width: 200, height: 180,
      z: maxZ + 1, rotation: Math.round((Math.random() - 0.5) * 6),
      text: "", color: COLOR_KEYS[Math.floor(Math.random() * 3)], createdAt: new Date().toISOString(),
    };
    commit((d) => ({ ...d, boardItems: [...(d.boardItems ?? []), note] }));
    setEditingId(note.id);
  }
  async function onFiles(files: FileList | null) {
    if (!files || !files.length || !activeId) return;
    const base = dropPoint();
    const newItems: BoardItem[] = [];
    let i = 0;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const { blob, dataUrl, w, h } = await fileToImage(file);
        const hosted = blob ? await uploadToBlob(blob) : null;
        const src = hosted ?? dataUrl;
        const displayW = 240;
        const displayH = Math.round((h / w) * displayW);
        newItems.push({
          id: uid(), boardId: activeId, type: "photo",
          x: base.x + i * 26, y: base.y + i * 26, width: displayW, height: displayH,
          z: maxZ + 1 + i, rotation: Math.round((Math.random() - 0.5) * 5),
          src, caption: "", createdAt: new Date().toISOString(),
        });
        i++;
      } catch { /* skip bad image */ }
    }
    if (newItems.length) commit((d) => ({ ...d, boardItems: [...(d.boardItems ?? []), ...newItems] }));
    if (fileRef.current) fileRef.current.value = "";
  }
  async function addMusic(files: FileList | null) {
    const file = files?.[0];
    if (!file || !activeId) return;
    const url = await uploadMediaToBlob(file);
    if (musicRef.current) musicRef.current.value = "";
    if (!url) { alert("Couldn't upload that audio file."); return; }
    const { x, y } = dropPoint();
    const item: BoardItem = {
      id: uid(), boardId: activeId, type: "music", x, y, width: 230, height: 116,
      z: maxZ + 1, rotation: Math.round((Math.random() - 0.5) * 4),
      audioSrc: url, title: file.name.replace(/\.[^.]+$/, ""), artist: "", src: "", createdAt: new Date().toISOString(),
    };
    commit((d) => ({ ...d, boardItems: [...(d.boardItems ?? []), item] }));
    setEditingId(item.id);
  }

  // ── Item dragging / resizing ───────────────────────────────────────────────
  function startDrag(e: React.PointerEvent, item: BoardItem, mode: "move" | "resize") {
    if (tool !== "select" || editingId === item.id) return;
    e.stopPropagation();
    if (item.z < maxZ) bumpToFront(item.id, maxZ + 1);
    dragRef.current = {
      id: item.id, mode, startX: e.clientX, startY: e.clientY,
      origX: item.x, origY: item.y, origW: item.width, origH: item.height, moved: false,
    };
    setDraft({ ...item, z: maxZ + 1 });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true;
      setDraft((prev) => {
        if (!prev || prev.id !== d.id) return prev;
        if (d.mode === "move") {
          return {
            ...prev,
            x: Math.max(0, Math.min(CANVAS_W - prev.width, d.origX + dx)),
            y: Math.max(0, Math.min(CANVAS_H - prev.height, d.origY + dy)),
          };
        }
        const ratio = d.origH / d.origW;
        const w = Math.max(120, Math.min(640, d.origW + dx));
        return { ...prev, width: w, height: prev.type === "photo" ? Math.round(w * ratio) : Math.max(prev.type === "music" ? 96 : 120, d.origH + dy) };
      });
    }
    function onUp() {
      const d = dragRef.current;
      const draftNow = draftRef.current;
      if (d && draftNow && draftNow.id === d.id) {
        patchItem(d.id, { x: draftNow.x, y: draftNow.y, width: draftNow.width, height: draftNow.height });
      }
      dragRef.current = null;
      setDraft(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxZ]);

  const renderItem = (item: BoardItem) => (draft && draft.id === item.id ? draft : item);

  // ── Drawing ────────────────────────────────────────────────────────────────
  function coords(e: React.PointerEvent) {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  }
  function startDraw(e: React.PointerEvent) {
    if (tool === "select" || tool === "eraser") return;
    e.preventDefault();
    const p = coords(e);
    const base = { id: uid(), boardId: activeId, color: drawColor, width: drawWidth, createdAt: new Date().toISOString() };
    const next: BoardDrawing = tool === "pen"
      ? { ...base, tool: "pen", points: [p] }
      : { ...base, tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    draftDrawingRef.current = next; // synchronous so the first move isn't dropped
    setDraftDrawing(next);
    svgRef.current?.setPointerCapture(e.pointerId);
  }
  function moveDraw(e: React.PointerEvent) {
    const cur = draftDrawingRef.current;
    if (!cur) return;
    const p = coords(e);
    const next: BoardDrawing = cur.tool === "pen"
      ? { ...cur, points: [...(cur.points ?? []), p] }
      : { ...cur, x2: p.x, y2: p.y };
    draftDrawingRef.current = next;
    setDraftDrawing(next);
  }
  function endDraw() {
    const d = draftDrawingRef.current;
    if (d) {
      const meaningful = d.tool === "pen"
        ? (d.points?.length ?? 0) > 1
        : Math.hypot((d.x2 ?? 0) - (d.x1 ?? 0), (d.y2 ?? 0) - (d.y1 ?? 0)) > 4;
      if (meaningful) commit((data2) => ({ ...data2, boardDrawings: [...(data2.boardDrawings ?? []), d] }));
    }
    draftDrawingRef.current = null;
    setDraftDrawing(null);
  }
  function eraseDrawing(id: string) {
    commit((d) => ({ ...d, boardDrawings: (d.boardDrawings ?? []).filter((dr) => dr.id !== id) }));
    if (selectedDrawingId === id) setSelectedDrawingId(null);
  }

  // Begin selecting / dragging an existing drawing (select mode only).
  function startDrawingDrag(e: React.PointerEvent, d: BoardDrawing) {
    e.stopPropagation();
    setSelectedDrawingId(d.id);
    drawDragRef.current = { id: d.id, startX: e.clientX, startY: e.clientY, moved: false };
    setDrawOffset({ id: d.id, dx: 0, dy: 0 });
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const dd = drawDragRef.current;
      if (!dd) return;
      const dx = e.clientX - dd.startX, dy = e.clientY - dd.startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dd.moved = true;
      const off = { id: dd.id, dx, dy };
      drawOffsetRef.current = off;
      setDrawOffset(off);
    }
    function onUp() {
      const dd = drawDragRef.current;
      const off = drawOffsetRef.current;
      if (dd && dd.moved && off && off.id === dd.id && (off.dx || off.dy)) {
        commit((d) => ({ ...d, boardDrawings: (d.boardDrawings ?? []).map((dr) => (dr.id === dd.id ? translateDrawing(dr, off.dx, off.dy) : dr)) }));
      }
      drawDragRef.current = null;
      setDrawOffset(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Delete the selected drawing with Delete / Backspace.
  useEffect(() => {
    if (!selectedDrawingId) return;
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
      e.preventDefault();
      eraseDrawing(selectedDrawingId);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDrawingId]);

  function pickTool(t: Tool) {
    setTool(t);
    setDrawMenuOpen(false);
    if (t !== "select") setSelectedDrawingId(null);
  }

  const drawing = tool !== "select";
  const isDrawTool = tool !== "select" && tool !== "eraser";
  const selectedDrawing = drawings.find((d) => d.id === selectedDrawingId) ?? null;

  return (
    <div className="relative w-full h-[calc(100dvh-3.5rem)] overflow-hidden bg-[var(--surface-2)]">
      {/* Canvas viewport */}
      <div
        ref={scrollRef}
        className="absolute inset-0 isolate overflow-auto"
        style={{
          backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div
          ref={canvasRef}
          className="relative"
          style={{ width: CANVAS_W, height: CANVAS_H }}
          onPointerDown={() => { if (tool === "select") setSelectedDrawingId(null); }}
        >
          {items.length === 0 && drawings.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-[var(--faint)]">
                <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">This board is empty.</p>
                <p className="text-xs mt-1">Add a photo or note, draw on it, then drag things anywhere.</p>
              </div>
            </div>
          )}

          {items.map((raw) => {
            const it = renderItem(raw);
            const isEditing = editingId === it.id;
            const dragging = draft?.id === it.id;
            return (
              <div
                key={it.id}
                onPointerDown={(e) => startDrag(e, it, "move")}
                className={cn(
                  "absolute group touch-none",
                  isDrawTool ? "pointer-events-none" : "select-none",
                  isEditing ? "cursor-text" : isDrawTool ? "" : "cursor-grab active:cursor-grabbing",
                )}
                style={{
                  left: it.x, top: it.y, width: it.width,
                  height: it.type === "note" || it.type === "music" ? it.height : undefined,
                  zIndex: dragging ? 9999 : it.z,
                  transform: `rotate(${it.rotation}deg)`,
                  transition: dragging ? "none" : "transform .12s ease",
                }}
              >
                {it.type === "photo"
                  ? <PhotoCard item={it} editing={isEditing}
                      onEdit={() => setEditingId(it.id)} onDone={() => setEditingId(null)}
                      onCaption={(caption) => patchItem(it.id, { caption })}
                      onDelete={() => removeItem(it.id)}
                      onResizeStart={(e) => startDrag(e, it, "resize")} />
                  : it.type === "music"
                  ? <MusicCard item={it} editing={isEditing}
                      onEdit={() => setEditingId(it.id)} onDone={() => setEditingId(null)}
                      onPatch={(patch) => patchItem(it.id, patch)}
                      onDelete={() => removeItem(it.id)}
                      onResizeStart={(e) => startDrag(e, it, "resize")} />
                  : <NoteCard item={it} editing={isEditing}
                      onEdit={() => setEditingId(it.id)} onDone={() => setEditingId(null)}
                      onText={(text) => patchItem(it.id, { text })}
                      onColor={(color) => patchItem(it.id, { color })}
                      onDelete={() => removeItem(it.id)}
                      onResizeStart={(e) => startDrag(e, it, "resize")} />}
              </div>
            );
          })}

          {/* Drawing layer — always on top; only captures pointers while a tool is active. */}
          <svg
            ref={svgRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="absolute inset-0"
            style={{
              zIndex: 99998,
              pointerEvents: isDrawTool ? "auto" : "none",
              cursor: tool === "eraser" ? "cell" : isDrawTool ? "crosshair" : "default",
              touchAction: "none",
            }}
            onPointerDown={startDraw}
            onPointerMove={moveDraw}
            onPointerUp={endDraw}
          >
            {drawings.map((d) => (
              <DrawShape
                key={d.id}
                d={d}
                mode={tool === "eraser" ? "erase" : tool === "select" ? "select" : "none"}
                selected={tool === "select" && d.id === selectedDrawingId}
                transform={drawOffset?.id === d.id ? `translate(${drawOffset.dx} ${drawOffset.dy})` : undefined}
                onErase={eraseDrawing}
                onSelectDown={startDrawingDrag}
              />
            ))}
            {draftDrawing && <DrawShape d={draftDrawing} mode="none" />}
          </svg>

          {/* Delete button for the selected drawing */}
          {tool === "select" && selectedDrawing && (() => {
            const bb = drawingBBox(selectedDrawing);
            const ox = drawOffset?.id === selectedDrawing.id ? drawOffset.dx : 0;
            const oy = drawOffset?.id === selectedDrawing.id ? drawOffset.dy : 0;
            return (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => eraseDrawing(selectedDrawing.id)}
                title="Delete drawing"
                className="absolute flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--surface)] border border-[var(--border)] shadow-md text-[var(--muted)] hover:text-red-500 hover:border-[var(--border-2)] transition-colors"
                style={{ left: bb.x + bb.w + 8 + ox, top: Math.max(0, bb.y - 4 + oy), zIndex: 99999 }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            );
          })()}
        </div>
      </div>

      {/* ── Floating: board selector (top-left) ─────────────────────────────── */}
      {(boardMenuOpen || drawMenuOpen) && (
        <div className="fixed inset-0 z-40" onClick={() => { setBoardMenuOpen(false); setDrawMenuOpen(false); }} />
      )}

      <div className="absolute top-3 left-3 z-50 flex items-center gap-2">
        <div className="relative">
        <button
          onClick={() => { setBoardMenuOpen((v) => !v); setDrawMenuOpen(false); }}
          className="flex items-center gap-2 pl-3 pr-2.5 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-sm hover:border-[var(--border-2)] transition-colors max-w-[240px]"
        >
          <span className="text-sm font-medium text-[var(--text)] truncate">{activeBoard?.name ?? "Board"}</span>
          <ChevronDown className={cn("w-4 h-4 text-[var(--faint)] transition-transform", boardMenuOpen && "rotate-180")} />
        </button>

        {boardMenuOpen && (
          <div className="absolute top-full left-0 mt-1.5 w-64 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-1.5 nx-pop">
            <p className="px-2 py-1.5 text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest">Boards</p>
            <div className="max-h-[280px] overflow-y-auto">
              {boards.map((b) => (
                <div
                  key={b.id}
                  className={cn(
                    "group/row flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors",
                    b.id === activeId ? "bg-[var(--chip)] text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                  )}
                >
                  {renamingBoardId === b.id ? (
                    <input
                      autoFocus
                      defaultValue={b.name}
                      onBlur={(e) => renameBoard(b.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className="flex-1 bg-transparent border-b border-[var(--border-2)] text-sm text-[var(--text)] focus:outline-none px-0.5"
                    />
                  ) : (
                    <button onClick={() => { selectBoard(b.id); setBoardMenuOpen(false); }} className="flex-1 text-left truncate">
                      {b.name}
                    </button>
                  )}
                  <button
                    onClick={() => setRenamingBoardId(b.id)}
                    className="p-1 rounded-md text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--chip)] opacity-0 group-hover/row:opacity-100 transition-opacity"
                    title="Rename"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {boards.length > 1 && (
                    <button
                      onClick={() => deleteBoard(b.id)}
                      className="p-1 rounded-md text-[var(--faint)] hover:text-red-500 hover:bg-[var(--chip)] opacity-0 group-hover/row:opacity-100 transition-opacity"
                      title="Delete board"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={createBoard}
              className="mt-1 w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors border-t border-[var(--border)] pt-2"
            >
              <Plus className="w-4 h-4" /> New board
            </button>
          </div>
        )}
        </div>

        {/* Undo / redo */}
        <div className="flex items-center bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm">
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (⌘Z)"
            className={cn(
              "p-2 rounded-l-xl transition-colors",
              canUndo ? "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]" : "text-[var(--faint)] opacity-40 cursor-not-allowed",
            )}
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-[var(--border)]" />
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (⌘⇧Z)"
            className={cn(
              "p-2 rounded-r-xl transition-colors",
              canRedo ? "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]" : "text-[var(--faint)] opacity-40 cursor-not-allowed",
            )}
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Floating: tools (top-right) ─────────────────────────────────────── */}
      <div className="absolute top-3 right-3 z-50 flex items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />

        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-2)] text-[var(--text)] text-xs font-medium rounded-xl shadow-sm transition-colors"
        >
          <ImagePlus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Add Photo</span>
        </button>

        <button
          onClick={addNote}
          className="flex items-center gap-1.5 px-3 py-2 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-2)] text-[var(--text)] text-xs font-medium rounded-xl shadow-sm transition-colors"
        >
          <StickyNote className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Add Note</span>
        </button>

        <input ref={musicRef} type="file" accept="audio/*,.mp3" className="hidden" onChange={(e) => addMusic(e.target.files)} />
        <button
          onClick={() => musicRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-2)] text-[var(--text)] text-xs font-medium rounded-xl shadow-sm transition-colors"
        >
          <Music className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Add Music</span>
        </button>

        {/* Draw */}
        <div className="relative">
          <button
            onClick={() => { setDrawMenuOpen((v) => !v); setBoardMenuOpen(false); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl shadow-sm transition-colors border",
              drawing
                ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]"
                : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--border-2)] text-[var(--text)]",
            )}
          >
            <Brush className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Draw</span>
            {drawing && <span className="w-2.5 h-2.5 rounded-full ring-1 ring-white/50" style={{ background: drawColor }} />}
          </button>

          {drawMenuOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-60 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-2.5 nx-pop">
              {/* Tools */}
              <div className="grid grid-cols-7 gap-0.5">
                {DRAW_TOOLS.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => pickTool(key)}
                    title={label}
                    className={cn(
                      "aspect-square flex items-center justify-center rounded-lg transition-colors",
                      tool === key ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]",
                    )}
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.9} />
                  </button>
                ))}
              </div>

              {/* Colors */}
              <p className="px-0.5 pt-3 pb-1.5 text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest">Color</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {DRAW_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setDrawColor(c)}
                    className={cn(
                      "w-6 h-6 rounded-full border transition-transform hover:scale-110",
                      drawColor === c ? "ring-2 ring-offset-1 ring-offset-[var(--surface)] ring-[var(--text)] border-transparent" : "border-[var(--border-2)]",
                    )}
                    style={{ background: c }}
                    title={c}
                  />
                ))}
              </div>

              {/* Stroke width */}
              <p className="px-0.5 pt-3 pb-1.5 text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest">Stroke</p>
              <div className="flex items-center gap-1.5">
                {DRAW_WIDTHS.map((w) => (
                  <button
                    key={w}
                    onClick={() => setDrawWidth(w)}
                    className={cn(
                      "flex-1 h-8 flex items-center justify-center rounded-lg border transition-colors",
                      drawWidth === w ? "border-[var(--text)] bg-[var(--chip)]" : "border-[var(--border)] hover:border-[var(--border-2)]",
                    )}
                    title={`${w}px`}
                  >
                    <span className="rounded-full" style={{ width: w + 2, height: w + 2, background: "var(--text)" }} />
                  </button>
                ))}
              </div>

              {tool !== "select" && (
                <button
                  onClick={() => pickTool("select")}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Stop drawing
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Drawing shape renderer ──────────────────────────────────────────────────────
function arrowHead(x1: number, y1: number, x2: number, y2: number, size: number): string {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const lx = x2 - size * Math.cos(ang - Math.PI / 7);
  const ly = y2 - size * Math.sin(ang - Math.PI / 7);
  const rx = x2 - size * Math.cos(ang + Math.PI / 7);
  const ry = y2 - size * Math.sin(ang + Math.PI / 7);
  return `M${lx},${ly} L${x2},${y2} L${rx},${ry}`;
}

function drawingBBox(d: BoardDrawing): { x: number; y: number; w: number; h: number } {
  if (d.tool === "pen" && d.points?.length) {
    const xs = d.points.map((p) => p.x), ys = d.points.map((p) => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
  }
  const minX = Math.min(d.x1 ?? 0, d.x2 ?? 0), minY = Math.min(d.y1 ?? 0, d.y2 ?? 0);
  return { x: minX, y: minY, w: Math.abs((d.x2 ?? 0) - (d.x1 ?? 0)), h: Math.abs((d.y2 ?? 0) - (d.y1 ?? 0)) };
}
function translateDrawing(d: BoardDrawing, dx: number, dy: number): BoardDrawing {
  if (d.tool === "pen" && d.points) return { ...d, points: d.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  return { ...d, x1: (d.x1 ?? 0) + dx, y1: (d.y1 ?? 0) + dy, x2: (d.x2 ?? 0) + dx, y2: (d.y2 ?? 0) + dy };
}

function DrawShape({ d, mode, selected, transform, onErase, onSelectDown }: {
  d: BoardDrawing;
  mode: "none" | "erase" | "select";
  selected?: boolean;
  transform?: string;
  onErase?: (id: string) => void;
  onSelectDown?: (e: React.PointerEvent, d: BoardDrawing) => void;
}) {
  const common = {
    stroke: d.color, strokeWidth: d.width, fill: "none",
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    style: { pointerEvents: "none" as const },
  };
  const hit = mode !== "none"
    ? {
        stroke: "transparent", strokeWidth: Math.max(d.width + 16, 20), fill: "none",
        style: { cursor: mode === "erase" ? "pointer" : "move", pointerEvents: "stroke" as const } as React.CSSProperties,
        onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); if (mode === "erase") onErase?.(d.id); else onSelectDown?.(e, d); },
      }
    : null;

  let shape: ReactNode = null;
  let hitShape: ReactNode = null;

  if (d.tool === "pen" && d.points?.length) {
    const pts = d.points.map((p) => `${p.x},${p.y}`).join(" ");
    shape = <polyline points={pts} {...common} />;
    if (hit) hitShape = <polyline points={pts} {...hit} />;
  } else if (d.tool === "rect") {
    const x = Math.min(d.x1!, d.x2!), y = Math.min(d.y1!, d.y2!);
    const w = Math.abs(d.x2! - d.x1!), h = Math.abs(d.y2! - d.y1!);
    shape = <rect x={x} y={y} width={w} height={h} rx={4} {...common} />;
    if (hit) hitShape = <rect x={x} y={y} width={w} height={h} rx={4} {...hit} />;
  } else if (d.tool === "ellipse") {
    const cx = (d.x1! + d.x2!) / 2, cy = (d.y1! + d.y2!) / 2;
    const rx = Math.abs(d.x2! - d.x1!) / 2, ry = Math.abs(d.y2! - d.y1!) / 2;
    shape = <ellipse cx={cx} cy={cy} rx={rx} ry={ry} {...common} />;
    if (hit) hitShape = <ellipse cx={cx} cy={cy} rx={rx} ry={ry} {...hit} />;
  } else if (d.x1 != null) {
    shape = (
      <>
        <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} {...common} />
        {d.tool === "arrow" && <path d={arrowHead(d.x1!, d.y1!, d.x2!, d.y2!, 9 + d.width * 1.5)} {...common} />}
      </>
    );
    if (hit) hitShape = <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} {...hit} />;
  }

  let selBox: ReactNode = null;
  if (selected) {
    const bb = drawingBBox(d);
    selBox = <rect x={bb.x - 6} y={bb.y - 6} width={bb.w + 12} height={bb.h + 12} rx={6} fill="none" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="5 4" style={{ pointerEvents: "none" }} />;
  }

  return <g transform={transform}>{shape}{hitShape}{selBox}</g>;
}

// ── Photo ─────────────────────────────────────────────────────────────────────
function PhotoCard({
  item, editing, onEdit, onDone, onCaption, onDelete, onResizeStart,
}: {
  item: BoardItem; editing: boolean;
  onEdit: () => void; onDone: () => void;
  onCaption: (c: string) => void; onDelete: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
}) {
  return (
    <div className="relative w-full h-full">
      <div className="bg-white rounded-[6px] shadow-[0_6px_20px_rgba(0,0,0,0.18)] p-2 pb-1 w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.src}
          alt={item.caption || "photo"}
          draggable={false}
          className="w-full rounded-[3px] object-cover block pointer-events-none"
          style={{ aspectRatio: `${item.width} / ${item.height}` }}
        />
        {editing ? (
          <input
            autoFocus
            defaultValue={item.caption}
            placeholder="Caption…"
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => { if (e.target.value !== (item.caption ?? "")) onCaption(e.target.value); onDone(); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="w-full mt-1 px-1 py-0.5 text-[12px] text-center text-neutral-700 bg-transparent border-b border-neutral-200 focus:outline-none focus:border-neutral-400"
          />
        ) : (
          <p className="mt-1 px-1 min-h-[18px] text-[12px] text-center text-neutral-600 truncate">
            {item.caption || <span className="text-neutral-300">—</span>}
          </p>
        )}
      </div>

      <Controls editing={editing} onEdit={onEdit} onDone={onDone} onDelete={onDelete} />

      <div
        onPointerDown={onResizeStart}
        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[var(--text)] border-2 border-white shadow cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity"
        title="Drag to resize"
      />
    </div>
  );
}

// ── Music player ────────────────────────────────────────────────────────────────
function MusicCard({
  item, editing, onEdit, onDone, onPatch, onDelete, onResizeStart,
}: {
  item: BoardItem; editing: boolean;
  onEdit: () => void; onDone: () => void;
  onPatch: (patch: Partial<BoardItem>) => void; onDelete: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
}) {
  const coverRef = useRef<HTMLInputElement>(null);
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  const setCover = async (f?: File) => {
    if (!f) return;
    const { blob, dataUrl } = await fileToImage(f);
    const hosted = blob ? await uploadToBlob(blob) : null;
    onPatch({ src: hosted ?? dataUrl });
  };
  return (
    <div className="relative w-full h-full rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-[0_6px_18px_rgba(0,0,0,0.18)] overflow-hidden flex flex-col">
      <div className="flex items-stretch gap-2.5 p-2.5 flex-1 min-h-0" onDoubleClick={onEdit}>
        <button
          onPointerDown={stop}
          onClick={() => editing && coverRef.current?.click()}
          className="relative w-14 h-14 shrink-0 rounded-md overflow-hidden bg-[var(--chip)] border border-[var(--border)] flex items-center justify-center"
          title={editing ? "Change cover" : undefined}
        >
          {item.src
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={item.src} alt="" draggable={false} className="w-full h-full object-cover" />
            : <Music className="w-5 h-5 text-[var(--faint)]" />}
          {editing && <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-[9px] font-medium">Cover</span>}
        </button>
        <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={(e) => setCover(e.target.files?.[0])} />

        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          {editing ? (
            <>
              <input value={item.title ?? ""} onPointerDown={stop} onChange={(e) => onPatch({ title: e.target.value })} placeholder="Song title"
                className="w-full bg-transparent text-[13px] font-semibold text-[var(--text)] placeholder-[var(--faint)] focus:outline-none border-b border-[var(--border)] pb-0.5" />
              <input value={item.artist ?? ""} onPointerDown={stop} onChange={(e) => onPatch({ artist: e.target.value })} placeholder="Artist"
                className="w-full bg-transparent text-[11.5px] text-[var(--muted)] placeholder-[var(--faint)] focus:outline-none" />
            </>
          ) : (
            <>
              <p className="text-[13px] font-semibold text-[var(--text)] truncate">{item.title || "Untitled"}</p>
              <p className="text-[11.5px] text-[var(--muted)] truncate">{item.artist || "Unknown artist"}</p>
            </>
          )}
        </div>
      </div>

      <audio controls src={item.audioSrc} onPointerDown={stop} className="w-full h-9 px-1.5 pb-1.5" style={{ touchAction: "auto" }} />

      <Controls editing={editing} onEdit={onEdit} onDone={onDone} onDelete={onDelete} />
      <div
        onPointerDown={onResizeStart}
        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[var(--text)] border-2 border-white shadow cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity"
        title="Drag to resize"
      />
    </div>
  );
}

// ── Sticky note ─────────────────────────────────────────────────────────────────
function NoteCard({
  item, editing, onEdit, onDone, onText, onColor, onDelete, onResizeStart,
}: {
  item: BoardItem; editing: boolean;
  onEdit: () => void; onDone: () => void;
  onText: (t: string) => void; onColor: (c: NoteColor) => void; onDelete: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
}) {
  const c = NOTE_COLORS[item.color ?? "yellow"];
  return (
    <div className="relative w-full h-full rounded-[3px] shadow-[0_6px_18px_rgba(0,0,0,0.16)]" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-12 h-4 bg-white/50 border border-black/5 rounded-[1px] rotate-[-2deg]" />

      <div className="w-full h-full p-3 pt-4">
        {editing ? (
          <textarea
            autoFocus
            defaultValue={item.text}
            placeholder="Write something…"
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => { if (e.target.value !== (item.text ?? "")) onText(e.target.value); onDone(); }}
            className="w-full h-full resize-none bg-transparent text-[14px] leading-snug focus:outline-none placeholder:opacity-40"
            style={{ color: c.text }}
          />
        ) : (
          <p
            onDoubleClick={onEdit}
            className="w-full h-full overflow-hidden text-[14px] leading-snug whitespace-pre-wrap break-words"
            style={{ color: c.text }}
          >
            {item.text || <span className="opacity-40">Double-click to edit…</span>}
          </p>
        )}
      </div>

      <Controls editing={editing} onEdit={onEdit} onDone={onDone} onDelete={onDelete} colors={{ active: item.color ?? "yellow", onColor }} />

      <div
        onPointerDown={onResizeStart}
        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-black/60 border-2 border-white shadow cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity"
        title="Drag to resize"
      />
    </div>
  );
}

// ── Shared hover controls ───────────────────────────────────────────────────────
function Controls({
  editing, onEdit, onDone, onDelete, colors,
}: {
  editing: boolean;
  onEdit: () => void; onDone: () => void; onDelete: () => void;
  colors?: { active: NoteColor; onColor: (c: NoteColor) => void };
}) {
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  return (
    <div
      onPointerDown={stop}
      className={cn(
        "absolute -top-3 right-1 flex items-center gap-1 px-1 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] shadow-md transition-opacity",
        editing ? "opacity-100" : "opacity-0 group-hover:opacity-100",
      )}
    >
      {colors && !editing && (
        <div className="flex items-center gap-0.5 pr-1 mr-0.5 border-r border-[var(--border)]">
          {COLOR_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => colors.onColor(k)}
              className={cn("w-3.5 h-3.5 rounded-full border transition-transform hover:scale-110", colors.active === k ? "border-[var(--text)]" : "border-transparent")}
              style={{ background: NOTE_COLORS[k].dot }}
              title={k}
            />
          ))}
        </div>
      )}
      {editing ? (
        <button onClick={onDone} className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]" title="Done">
          <Check className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button onClick={onEdit} className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]" title="Edit">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
      <button onClick={onDelete} className="p-1 rounded-md text-[var(--muted)] hover:text-red-500 hover:bg-[var(--chip)]" title="Delete">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
