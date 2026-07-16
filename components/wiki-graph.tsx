"use client";

/* This is a force-directed graph: node positions live in a ref that a
   requestAnimationFrame loop mutates, and render is driven by a forced
   re-render each frame. Reading that ref during render is intentional. */
/* eslint-disable react-hooks/refs */
import { useCallback, useEffect, useMemo, useRef, useReducer, useState } from "react";
import { cn } from "@/lib/utils";
import type { WikiPage, WikiFolder } from "@/lib/store";

type Node = { x: number; y: number; vx: number; vy: number };
type Edge = { s: string; t: string; kind: "child" | "link" };

// Force-sim tuning
const REPULSION = 5200;
const SPRING = 0.045;
const SPRING_LEN = 120;
const CENTER = 0.022;
const DAMP = 0.82;
const FOLDER_PULL = 0.07;   // pulls same-folder pages together into a bubble

export function WikiGraph({
  pages, folders, activeId, onOpen,
}: {
  pages: WikiPage[];
  folders: WikiFolder[];
  activeId: string | null;
  onOpen: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pos = useRef(new Map<string, Node>());
  const [, render] = useReducer((n: number) => n + 1, 0);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<string | null>(null);

  const alpha = useRef(1);
  const running = useRef(false);
  const drag = useRef<{ id: string; moved: boolean } | null>(null);
  const panDrag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  // Edges: parent→child plus [[wikilink]] references between pages.
  const edges = useMemo<Edge[]>(() => {
    const out: Edge[] = [];
    const seen = new Set<string>();
    const byTitle = new Map<string, string>();
    pages.forEach((p) => byTitle.set(p.title.trim().toLowerCase(), p.id));
    const add = (s: string, t: string, kind: Edge["kind"]) => {
      if (s === t) return;
      const key = [s, t].sort().join("|") + kind;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ s, t, kind });
    };
    pages.forEach((p) => {
      if (p.parentId && pages.some((q) => q.id === p.parentId)) add(p.parentId, p.id, "child");
      const text = p.blocks.map((b) => b.text).join(" ");
      for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
        const target = byTitle.get(m[1].trim().toLowerCase());
        if (target) add(p.id, target, "link");
      }
    });
    return out;
  }, [pages]);

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    edges.forEach((e) => { d.set(e.s, (d.get(e.s) ?? 0) + 1); d.set(e.t, (d.get(e.t) ?? 0) + 1); });
    return d;
  }, [edges]);

  // Every page's owning folder = the folderId of its top-level ancestor.
  const pageFolder = useMemo(() => {
    const byId = new Map(pages.map((p) => [p.id, p]));
    const folderIds = new Set(folders.map((f) => f.id));
    const m = new Map<string, string>();
    for (const p of pages) {
      let cur: WikiPage | undefined = p;
      const guard = new Set<string>();
      while (cur && cur.parentId && byId.has(cur.parentId) && !guard.has(cur.id)) { guard.add(cur.id); cur = byId.get(cur.parentId); }
      if (cur?.folderId && folderIds.has(cur.folderId)) m.set(p.id, cur.folderId);
    }
    return m;
  }, [pages, folders]);

  // Track container size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const step = () => {
    const p = pos.current;
    pages.forEach((pg, i) => {
      if (!p.has(pg.id)) {
        const ang = i * 2.399, r = 40 + i * 7;
        p.set(pg.id, { x: Math.cos(ang) * r, y: Math.sin(ang) * r, vx: 0, vy: 0 });
      }
    });
    for (const id of [...p.keys()]) if (!pages.some((pg) => pg.id === id)) p.delete(id);

    const a = alpha.current;
    if (a > 0.005) {
      const arr = pages.map((pg) => p.get(pg.id)!);
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const n1 = arr[i], n2 = arr[j];
          let dx = n1.x - n2.x, dy = n1.y - n2.y;
          let d2 = dx * dx + dy * dy; if (d2 < 0.01) { d2 = 0.01; dx = Math.random(); dy = Math.random(); }
          const d = Math.sqrt(d2);
          const f = (REPULSION / d2) * a;
          n1.vx += (dx / d) * f; n1.vy += (dy / d) * f;
          n2.vx -= (dx / d) * f; n2.vy -= (dy / d) * f;
        }
      }
      for (const e of edges) {
        const n1 = p.get(e.s), n2 = p.get(e.t);
        if (!n1 || !n2) continue;
        const dx = n2.x - n1.x, dy = n2.y - n1.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - SPRING_LEN) * SPRING * a;
        n1.vx += (dx / d) * f; n1.vy += (dy / d) * f;
        n2.vx -= (dx / d) * f; n2.vy -= (dy / d) * f;
      }
      // Folder clustering — pull each foldered page toward its folder centroid.
      if (folders.length) {
        const cen = new Map<string, { x: number; y: number; n: number }>();
        for (const pg of pages) {
          const fid = pageFolder.get(pg.id); if (!fid) continue;
          const n = p.get(pg.id)!; const c = cen.get(fid) ?? { x: 0, y: 0, n: 0 };
          c.x += n.x; c.y += n.y; c.n++; cen.set(fid, c);
        }
        for (const pg of pages) {
          const fid = pageFolder.get(pg.id); if (!fid) continue;
          const c = cen.get(fid); if (!c || c.n === 0) continue;
          const n = p.get(pg.id)!;
          n.vx += ((c.x / c.n) - n.x) * FOLDER_PULL * a;
          n.vy += ((c.y / c.n) - n.y) * FOLDER_PULL * a;
        }
      }
      for (const n of arr) {
        n.vx += -n.x * CENTER * a; n.vy += -n.y * CENTER * a;
        n.vx *= DAMP; n.vy *= DAMP;
      }
      pages.forEach((pg) => {
        if (drag.current?.id === pg.id) return;
        const n = p.get(pg.id)!;
        n.x += n.vx; n.y += n.vy;
      });
      alpha.current = a * 0.965;
    }
    return alpha.current > 0.005;
  };

  // Keep the loop pointed at the freshest step (latest pages/edges) without
  // restarting it.
  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; });

  const ensureRunning = useCallback(() => {
    if (running.current) return;
    running.current = true;
    const loop = () => {
      const active = stepRef.current();
      render();
      if (active || drag.current) requestAnimationFrame(loop);
      else running.current = false;
    };
    requestAnimationFrame(loop);
  }, []);
  const reheat = useCallback((v = 0.6) => { alpha.current = Math.max(alpha.current, v); ensureRunning(); }, [ensureRunning]);

  useEffect(() => { reheat(1); }, [pages.length, edges.length, folders.length, pageFolder, reheat]);

  // Pointer interaction (drag nodes, pan background).
  useEffect(() => {
    const toWorld = (clientX: number, clientY: number) => {
      const r = wrapRef.current!.getBoundingClientRect();
      return {
        x: (clientX - r.left - size.w / 2 - pan.x) / zoom,
        y: (clientY - r.top - size.h / 2 - pan.y) / zoom,
      };
    };
    const onMove = (e: PointerEvent) => {
      if (drag.current) {
        drag.current.moved = true;
        const w = toWorld(e.clientX, e.clientY);
        const n = pos.current.get(drag.current.id);
        if (n) { n.x = w.x; n.y = w.y; n.vx = 0; n.vy = 0; }
        reheat(0.3);
      } else if (panDrag.current) {
        setPan({ x: panDrag.current.ox + (e.clientX - panDrag.current.sx), y: panDrag.current.oy + (e.clientY - panDrag.current.sy) });
      }
    };
    const onUp = (e: PointerEvent) => {
      if (drag.current && !drag.current.moved) onOpen(drag.current.id);
      drag.current = null;
      panDrag.current = null;
      void e;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [size, pan, zoom, onOpen, reheat]);

  const cx = size.w / 2 + pan.x;
  const cy = size.h / 2 + pan.y;

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-full overflow-hidden bg-[var(--surface-2)] select-none"
      style={{ touchAction: "none" }}
      onPointerDown={(e) => { panDrag.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y }; }}
      onWheel={(e) => { const next = Math.min(2.5, Math.max(0.3, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); setZoom(next); }}
    >
      {pages.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-[var(--faint)] text-sm">No pages yet to graph.</div>
      ) : (
        <svg width={size.w} height={size.h} className="block">
          <g transform={`translate(${cx} ${cy}) scale(${zoom})`}>
            {/* Folder bubbles — a soft cluster behind each folder's pages */}
            {folders.map((f) => {
              const members = pages.filter((pg) => pageFolder.get(pg.id) === f.id).map((pg) => pos.current.get(pg.id)).filter(Boolean) as Node[];
              if (members.length === 0) return null;
              const mx = members.reduce((a, n) => a + n.x, 0) / members.length;
              const my = members.reduce((a, n) => a + n.y, 0) / members.length;
              const rad = Math.max(70, ...members.map((n) => Math.hypot(n.x - mx, n.y - my))) + 46;
              return (
                <g key={f.id} className="pointer-events-none">
                  <circle cx={mx} cy={my} r={rad} fill="var(--text)" fillOpacity={0.035} stroke="var(--border-2)" strokeWidth={1} strokeDasharray="5 5" />
                  <text x={mx} y={my - rad + 16} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: "var(--faint)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{f.name}</text>
                </g>
              );
            })}
            {edges.map((e, i) => {
              const a = pos.current.get(e.s), b = pos.current.get(e.t);
              if (!a || !b) return null;
              const lit = hover && (e.s === hover || e.t === hover);
              return (
                <line
                  key={i}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={lit ? "var(--text)" : "var(--border-2)"}
                  strokeWidth={lit ? 1.4 : 1}
                  strokeOpacity={lit ? 0.8 : 0.5}
                  strokeDasharray={e.kind === "link" ? "4 4" : undefined}
                />
              );
            })}
            {pages.map((pg) => {
              const n = pos.current.get(pg.id);
              if (!n) return null;
              const r = 5 + Math.min(8, (degree.get(pg.id) ?? 0) * 1.6);
              const isActive = pg.id === activeId;
              const isHover = pg.id === hover;
              return (
                <g
                  key={pg.id}
                  transform={`translate(${n.x} ${n.y})`}
                  className="cursor-pointer"
                  onPointerDown={(e) => { e.stopPropagation(); drag.current = { id: pg.id, moved: false }; reheat(0.4); }}
                  onPointerEnter={() => setHover(pg.id)}
                  onPointerLeave={() => setHover((h) => (h === pg.id ? null : h))}
                >
                  <circle
                    r={r}
                    fill={isActive ? "var(--text)" : isHover ? "var(--muted)" : "var(--faint)"}
                    stroke="var(--bg)"
                    strokeWidth={2}
                  />
                  <text
                    x={0} y={r + 13}
                    textAnchor="middle"
                    className="pointer-events-none"
                    style={{ fontSize: 11, fill: isActive || isHover ? "var(--text)" : "var(--muted)", fontWeight: isActive ? 600 : 400 }}
                  >
                    {(pg.icon ? pg.icon + " " : "") + (pg.title || "Untitled")}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-sm overflow-hidden">
        <button onClick={() => setZoom((z) => Math.min(2.5, z * 1.2))} className="px-2.5 py-1.5 text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)] text-sm">+</button>
        <div className="h-px bg-[var(--border)]" />
        <button onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))} className="px-2.5 py-1.5 text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)] text-sm">−</button>
        <div className="h-px bg-[var(--border)]" />
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); reheat(0.8); }} className={cn("px-2.5 py-1.5 text-[10px] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]")} title="Reset view">⌖</button>
      </div>
    </div>
  );
}
