"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useNexus } from "@/lib/hooks";
import { uid, cn } from "@/lib/utils";
import type { ChatThread, ChatMessage, ChatAttachment, ChatFolder } from "@/lib/store";
import { configuredChatModels, DEFAULT_CHAT_SETTINGS, DEFAULT_MODEL, modelLabel, SOURCES_SENTINEL, localProviderOf, providerOf, type PerplexityTool } from "@/lib/chat-models";
import { discoverOllama, discoverBridge, streamOllama, streamBridge, type LocalModel } from "@/lib/local-chat";
import { mdToHtml } from "@/lib/markdown";
import { buildNexusContext } from "@/lib/nexus-context";
import { processFile } from "@/lib/chat-files";
import {
  Sparkles, Send, Plus, Trash2, ChevronDown, ChevronRight, PanelLeftClose, PanelLeft,
  Bot, User, Square, MessageSquare, Check, Pin, PinOff, Pencil, Copy, Paperclip, X,
  Folder, FolderOpen, FolderPlus, Search, MoreHorizontal, RotateCcw, FileText, FolderKanban,
  Database, Puzzle, Lock, LockOpen, Link2, Server, Settings2, Globe,
} from "lucide-react";

const PERP_TOOLS: { id: PerplexityTool; label: string; desc: string }[] = [
  { id: "web_search", label: "Web search", desc: "Search the live web" },
  { id: "fetch_url", label: "Fetch URL", desc: "Read links you paste" },
  { id: "finance_search", label: "Finance search", desc: "Market & finance data" },
];

const splitSources = (s: string): { content: string; sources: string[] } => {
  const i = s.indexOf(SOURCES_SENTINEL);
  if (i < 0) return { content: s, sources: [] };
  let sources: string[] = [];
  try { sources = JSON.parse(s.slice(i + SOURCES_SENTINEL.length)); } catch {}
  return { content: s.slice(0, i).trimEnd(), sources: Array.isArray(sources) ? sources : [] };
};

const SYSTEM_PROMPT =
  "You are a helpful, concise assistant living inside Nexus, the user's personal command-center app. Answer clearly and get to the point.";

// ════════════════════════════════════════════════════════════════════════════════
export function ChatPage() {
  const { data, mutate, loaded } = useNexus();
  const allThreads = data.chatThreads ?? [];
  const folders = data.chatFolders ?? [];
  const projects = data.projects ?? [];
  const chatSettings = data.chatSettings ?? DEFAULT_CHAT_SETTINGS;
  const models = useMemo(() => configuredChatModels(chatSettings), [chatSettings]);

  const sorted = useMemo(() => [...allThreads].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt.localeCompare(a.updatedAt)), [allThreads]);
  const live = useMemo(() => sorted.filter((t) => !t.deletedAt), [sorted]);
  const trashed = useMemo(() => allThreads.filter((t) => t.deletedAt).sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? "")), [allThreads]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<ChatAttachment[]>([]);   // composer attachments
  const [uploading, setUploading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);          // mobile drawer
  const [collapsed, setCollapsed] = useState(false);              // desktop collapse
  const [modelMenu, setModelMenu] = useState(false);
  const [toolsMenu, setToolsMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [trashOpen, setTrashOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [useData, setUseData] = useState(true);            // give the AI Nexus data access
  const [autoSend, setAutoSend] = useState(false);         // fire once after a dashboard handoff
  const [skillsMenu, setSkillsMenu] = useState(false);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());   // chats unlocked this session
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);   // discovered Ollama / bridge models
  const [localCfg, setLocalCfg] = useState(false);
  const skills = data.chatSkills ?? [];

  // discover local models (Ollama + bridge) running on the user's machine
  useEffect(() => {
    let alive = true;
    (async () => {
      const [oll, br] = await Promise.all([discoverOllama(chatSettings.ollamaUrl), discoverBridge(chatSettings.bridgeUrl, chatSettings.bridgeToken)]);
      if (alive) setLocalModels([...oll, ...br]);
    })();
    return () => { alive = false; };
  }, [chatSettings.ollamaUrl, chatSettings.bridgeUrl, chatSettings.bridgeToken]);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const active = live.find((t) => t.id === activeId) ?? null;

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [active?.messages.length, streamText]);

  // open a chat from the command bar (live event + a localStorage handoff for
  // navigations that mount this page after the event already fired)
  useEffect(() => {
    try { const id = localStorage.getItem("nexus_chat_active"); if (id) { setActiveId(id); localStorage.removeItem("nexus_chat_active"); } } catch {}
    // Handoff from the dashboard "Ask Nexus AI" bar: text + model + files + toggles.
    try {
      const raw = localStorage.getItem("nexus_chat_handoff");
      if (raw) {
        localStorage.removeItem("nexus_chat_handoff");
        const p = JSON.parse(raw);
        setActiveId(null);
        if (typeof p.text === "string") setInput(p.text);
        if (typeof p.model === "string") setModel(p.model);
        if (typeof p.useData === "boolean") setUseData(p.useData);
        if (Array.isArray(p.attachments)) setPending(p.attachments);
        if (p.autoSend) setAutoSend(true); else setTimeout(() => taRef.current?.focus(), 60);
      } else {
        const q = localStorage.getItem("nexus_chat_prefill");
        if (q) { setActiveId(null); setInput(q); localStorage.removeItem("nexus_chat_prefill"); setTimeout(() => taRef.current?.focus(), 60); }
      }
    } catch {}
    const h = (e: Event) => { setActiveId((e as CustomEvent<string>).detail); };
    window.addEventListener("nexus:open-chat", h);
    return () => window.removeEventListener("nexus:open-chat", h);
  }, []);

  // ── mutations ──
  const upsert = (t: ChatThread) => mutate((d) => {
    const list = d.chatThreads ?? [];
    return { ...d, chatThreads: list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [t, ...list] };
  });
  const patch = (id: string, p: Partial<ChatThread>) => mutate((d) => ({ ...d, chatThreads: (d.chatThreads ?? []).map((t) => (t.id === id ? { ...t, ...p } : t)) }));
  const softDelete = (id: string) => { patch(id, { deletedAt: new Date().toISOString(), pinned: false }); if (activeId === id) setActiveId(null); };
  const restore = (id: string) => patch(id, { deletedAt: null });
  const purge = (id: string) => { if (confirm("Permanently delete this chat?")) mutate((d) => ({ ...d, chatThreads: (d.chatThreads ?? []).filter((t) => t.id !== id) })); };
  const rename = (t: ChatThread) => { const name = window.prompt("Rename chat", t.title)?.trim(); if (name) patch(t.id, { title: name }); };
  const newChat = () => { setActiveId(null); setInput(""); setPending([]); setSidebarOpen(false); setTimeout(() => taRef.current?.focus(), 50); };
  const newFolder = () => { const name = window.prompt("Folder name", "New folder")?.trim(); if (name) mutate((d) => ({ ...d, chatFolders: [...(d.chatFolders ?? []), { id: uid(), name, createdAt: new Date().toISOString() }] })); };
  const deleteFolder = (id: string) => { if (!confirm("Delete folder? Chats inside move out.")) return; mutate((d) => ({ ...d, chatFolders: (d.chatFolders ?? []).filter((f) => f.id !== id), chatThreads: (d.chatThreads ?? []).map((t) => (t.folderId === id ? { ...t, folderId: null } : t)) })); };

  // ── skills ──
  const addSkill = () => { const name = window.prompt("Skill name (e.g. \"Concise\", \"Coding buddy\")")?.trim(); if (!name) return; const instructions = window.prompt("Instructions for this skill (how the AI should behave)")?.trim() || ""; mutate((d) => ({ ...d, chatSkills: [...(d.chatSkills ?? []), { id: uid(), name, instructions, enabled: true }] })); };
  const toggleSkill = (id: string) => mutate((d) => ({ ...d, chatSkills: (d.chatSkills ?? []).map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)) }));
  const deleteSkill = (id: string) => mutate((d) => ({ ...d, chatSkills: (d.chatSkills ?? []).filter((s) => s.id !== id) }));

  // ── lock ──
  const lockChat = (t: ChatThread) => { const pass = window.prompt("Set a passcode for this chat")?.trim(); if (!pass) return; patch(t.id, { locked: true, lockPass: pass }); setUnlocked((s) => new Set(s).add(t.id)); };
  const unlockChat = (t: ChatThread) => { patch(t.id, { locked: false, lockPass: undefined }); };
  const gated = !!(active?.locked && !unlocked.has(active.id));

  const perpTools = chatSettings.perplexityTools ?? DEFAULT_CHAT_SETTINGS.perplexityTools;
  const togglePerpTool = (t: PerplexityTool) => mutate((d) => {
    const cur = d.chatSettings?.perplexityTools ?? DEFAULT_CHAT_SETTINGS.perplexityTools;
    const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
    return { ...d, chatSettings: { ...(d.chatSettings ?? DEFAULT_CHAT_SETTINGS), perplexityTools: next } };
  });
  const localWebSearch = chatSettings.localWebSearch ?? true;
  const toggleLocalWeb = () => mutate((d) => ({ ...d, chatSettings: { ...(d.chatSettings ?? DEFAULT_CHAT_SETTINGS), localWebSearch: !(d.chatSettings?.localWebSearch ?? true) } }));

  // ── files ──
  const addFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files);
    if (!arr.length) return;
    setUploading(true);
    const results = await Promise.all(arr.map((f) => processFile(f).catch(() => null)));
    setPending((p) => [...p, ...results.filter(Boolean) as ChatAttachment[]]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const buildSystem = () => {
    let sys = SYSTEM_PROMPT;
    const mem = (chatSettings.chatMemory ?? "").trim();
    if (mem) sys += "\n\n[Memory — persistent facts about the user, remembered across every chat]\n" + mem;
    const on = (data.chatSkills ?? []).filter((s) => s.enabled && s.instructions.trim());
    if (on.length) sys += "\n\n" + on.map((s) => `[Skill: ${s.name}]\n${s.instructions}`).join("\n\n");
    if (useData) sys += "\n\n" + buildNexusContext(data);
    return sys;
  };

  // ── completion ──
  async function runCompletion(threadId: string, msgs: ChatMessage[]) {
    const m = model;
    setStreaming(true); setStreamText("");
    const controller = new AbortController(); abortRef.current = controller;
    let acc = "";
    const onDelta = (t: string) => { acc += t; setStreamText(acc); };
    const local = localProviderOf(m);
    let webSources: string[] = [];
    try {
      let system = buildSystem();
      // Web access for local models: search first (Perplexity) and inject the results.
      if (local && localWebSearch) {
        const q = [...msgs].reverse().find((x) => x.role === "user")?.content?.trim();
        if (q) {
          setStreamText("🔎 Searching the web…");
          try {
            const wr = await fetch("/api/websearch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }), signal: controller.signal });
            const wj = await wr.json();
            if (wj.ok && wj.text) {
              system += `\n\n[LIVE WEB SEARCH RESULTS — current information from the web; use it to answer accurately and mention specifics]\n${wj.text}`;
              webSources = Array.isArray(wj.sources) ? wj.sources : [];
            }
          } catch { /* offline / no key → answer without web */ }
          setStreamText("");
        }
      }
      if (local === "ollama") {
        await streamOllama(chatSettings.ollamaUrl || "http://localhost:11434", m, msgs, system, onDelta, controller.signal);
      } else if (local === "bridge") {
        await streamBridge(chatSettings.bridgeUrl || "", m, msgs, system, onDelta, controller.signal, chatSettings.bridgeToken);
      } else {
        const res = await fetch("/api/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: m, system: buildSystem(), perplexityTools: chatSettings.perplexityTools, messages: msgs.map((x) => ({ role: x.role, content: x.content, attachments: x.attachments })) }),
          signal: controller.signal,
        });
        if (!res.body) { acc = await res.text(); setStreamText(acc); }
        else { const reader = res.body.getReader(); const dec = new TextDecoder(); for (;;) { const { done, value } = await reader.read(); if (done) break; acc += dec.decode(value, { stream: true }); setStreamText(acc); } }
      }
    } catch (e) { if ((e as Error).name !== "AbortError") acc += (acc ? "\n\n" : "") + "⚠️ " + String((e as Error).message || e) + (local ? "\n\n(Is your local server running and reachable? Check the model config ⚙.)" : ""); }
    const { content, sources } = splitSources(acc);
    const allSources = [...new Set([...sources, ...webSources])];
    const assistant: ChatMessage = { id: uid(), role: "assistant", content: content || "(no response)", createdAt: new Date().toISOString(), sources: allSources.length ? allSources : undefined };
    mutate((d) => ({ ...d, chatThreads: (d.chatThreads ?? []).map((t) => (t.id === threadId ? { ...t, messages: [...msgs, assistant], updatedAt: new Date().toISOString() } : t)) }));
    setStreaming(false); setStreamText(""); abortRef.current = null;
  }

  async function send() {
    const text = input.trim();
    if ((!text && pending.length === 0) || streaming) return;
    const now = new Date().toISOString();
    const userMsg: ChatMessage = { id: uid(), role: "user", content: text, createdAt: now, attachments: pending.length ? pending : undefined };

    let thread = active;
    const title = (text || pending[0]?.name || "New chat").slice(0, 48);
    if (!thread) { thread = { id: uid(), title, model, messages: [userMsg], createdAt: now, updatedAt: now }; setActiveId(thread.id); }
    else { thread = { ...thread, title: thread.messages.length === 0 ? title : thread.title, model, messages: [...thread.messages, userMsg], updatedAt: now }; }
    upsert(thread);
    setInput(""); setPending([]);
    if (taRef.current) taRef.current.style.height = "auto";
    await runCompletion(thread.id, thread.messages);
  }

  // Auto-send once a dashboard handoff has populated input/model/attachments —
  // but only after Redis hydration has settled, so the new thread isn't clobbered.
  useEffect(() => {
    if (!autoSend || !loaded || streaming) return;
    if (!input.trim() && pending.length === 0) return;
    setAutoSend(false);
    send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, loaded, input, pending, streaming]);

  function saveEdit(msgId: string) {
    if (!active) return;
    const idx = active.messages.findIndex((m) => m.id === msgId);
    if (idx < 0) return;
    const edited: ChatMessage = { ...active.messages[idx], content: editText.trim() };
    const msgs = [...active.messages.slice(0, idx), edited];
    setEditingId(null);
    patch(active.id, { messages: msgs, updatedAt: new Date().toISOString() });
    runCompletion(active.id, msgs);
  }

  const grow = () => { const el = taRef.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(200, el.scrollHeight) + "px"; } };

  // ── sidebar groupings ──
  const q = search.trim().toLowerCase();
  const matches = (t: ChatThread) => !q || t.title.toLowerCase().includes(q) || t.messages.some((m) => m.content.toLowerCase().includes(q));
  const visible = live.filter(matches);
  const pinnedList = visible.filter((t) => t.pinned);
  const folderChats = (fid: string) => visible.filter((t) => !t.pinned && t.folderId === fid);
  const ungrouped = visible.filter((t) => !t.pinned && (!t.folderId || !folders.some((f) => f.id === t.folderId)));

  const rowProps = { activeId, onOpen: (id: string) => { const t = live.find((x) => x.id === id); setActiveId(id); if (t) setModel(t.model || DEFAULT_MODEL); setSidebarOpen(false); }, menuFor, setMenuFor, onRename: rename, onPin: (t: ChatThread) => patch(t.id, { pinned: !t.pinned }), onDelete: softDelete, onMoveFolder: (id: string, fid: string | null) => patch(id, { folderId: fid }), onLinkProject: (id: string, pid: string | null) => patch(id, { projectId: pid }), onLock: lockChat, onUnlock: unlockChat, folders, projects };

  const enabledModels = models.filter((m) => m.enabled);
  const isPerplexity = providerOf(model) === "perplexity";
  const isLocal = !!localProviderOf(model);
  const selectModel = (id: string) => { setModel(id); if (active) patch(active.id, { model: id }); setModelMenu(false); };

  // The composer (input bar + model/tools dropups) — reused centered for a new
  // chat and pinned to the bottom once a conversation has messages.
  const composer = (
    <div className="w-full">
      {pending.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {pending.map((a) => (
            <div key={a.id} className="group flex items-center gap-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg pl-1.5 pr-1 py-1 max-w-[200px]">
              {a.kind === "image" && a.url ? <img src={a.url} alt="" className="w-6 h-6 rounded object-cover" /> : <FileText className="w-4 h-4 text-[var(--muted)] shrink-0" />}
              <span className="text-[12px] text-[var(--text)] truncate">{a.name}</span>
              <button onClick={() => setPending((p) => p.filter((x) => x.id !== a.id))} className="p-0.5 text-[var(--faint)] hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {uploading && <span className="text-[12px] text-[var(--faint)] self-center px-1">Uploading…</span>}
        </div>
      )}
      <div className="flex items-end gap-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl px-2 py-2 focus-within:border-[var(--border-2)] transition-colors">
        <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.md,.markdown,.txt,.json,.csv,.ts,.tsx,.js,.jsx,.py,.java,.c,.cpp,.h,.cs,.go,.rb,.rs,.php,.html,.css,.scss,.yml,.yaml,.sh,.sql,.xml" className="hidden" onChange={(e) => addFiles(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} title="Attach files" className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)] transition-colors"><Paperclip className="w-[18px] h-[18px]" strokeWidth={1.9} /></button>

        {/* Perplexity web tools — dropup, next to the attach button */}
        {isPerplexity && (
          <div className="relative shrink-0">
            <button onClick={() => setToolsMenu((v) => !v)} title="Web tools" className={cn("w-9 h-9 flex items-center justify-center rounded-xl transition-colors", perpTools.length ? "text-[var(--text)] bg-[var(--chip)]" : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]")}><Globe className="w-[18px] h-[18px]" strokeWidth={1.9} /></button>
            {toolsMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setToolsMenu(false)} />
                <div className="absolute bottom-full mb-2 left-0 z-50 w-60 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-1.5 nx-pop">
                  <p className="px-2 py-1 text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest">Web tools · Perplexity</p>
                  {PERP_TOOLS.map((t) => {
                    const on = perpTools.includes(t.id);
                    return (
                      <button key={t.id} onClick={() => togglePerpTool(t.id)} className="w-full flex items-start gap-2.5 px-2 py-1.5 rounded-lg text-left hover:bg-[var(--surface-2)]">
                        <span className={cn("mt-0.5 w-4 h-4 rounded-[5px] border shrink-0 flex items-center justify-center", on ? "bg-[var(--text)] border-[var(--text)]" : "border-[var(--border-2)]")}>{on && <Check className="w-3 h-3 text-[var(--bg)]" strokeWidth={3} />}</span>
                        <span className="min-w-0"><span className="block text-[13px] text-[var(--text)] font-medium leading-tight">{t.label}</span><span className="block text-[11px] text-[var(--faint)] leading-tight">{t.desc}</span></span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Web access toggle for local models — Perplexity search injected into context */}
        {isLocal && (
          <button onClick={toggleLocalWeb} title={localWebSearch ? "Web access on (Perplexity)" : "Web access off"} className={cn("shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition-colors", localWebSearch ? "text-[var(--text)] bg-[var(--chip)]" : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]")}><Globe className="w-[18px] h-[18px]" strokeWidth={1.9} /></button>
        )}

        {/* Model selector — dropup */}
        <div className="relative shrink-0">
          <button onClick={() => setModelMenu((v) => !v)} className="h-9 flex items-center gap-1 px-2.5 rounded-xl border border-[var(--border)] text-[12px] font-medium text-[var(--text)] hover:bg-[var(--chip)] transition-colors max-w-[120px] sm:max-w-[150px]"><span className="truncate">{modelLabel(model)}</span><ChevronDown className="w-3.5 h-3.5 shrink-0 text-[var(--faint)]" /></button>
          {modelMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setModelMenu(false)} />
              <div className="absolute bottom-full mb-2 left-0 z-50 w-64 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-1.5 nx-pop max-h-[60vh] overflow-y-auto">
                {enabledModels.length === 0 && <p className="px-2.5 py-2 text-[12px] text-[var(--faint)]">No models enabled. Turn some on in Settings.</p>}
                {enabledModels.map((m) => (
                  <button key={m.id} onClick={() => selectModel(m.id)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-[var(--surface-2)] transition-colors">
                    <span className="flex-1 min-w-0"><span className="block text-[13px] text-[var(--text)] font-medium leading-tight">{m.label}</span>{m.note && <span className="block text-[11px] text-[var(--faint)] leading-tight">{m.note}</span>}</span>
                    {model === m.id && <Check className="w-4 h-4 text-[var(--text)]" />}
                  </button>
                ))}
                {localModels.length > 0 && (
                  <>
                    <p className="px-2.5 pt-2 pb-0.5 text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest flex items-center gap-1"><Server className="w-3 h-3" /> On your machine</p>
                    {localModels.map((m) => (
                      <button key={m.id} onClick={() => selectModel(m.id)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-[var(--surface-2)] transition-colors">
                        <span className="flex-1 min-w-0"><span className="block text-[13px] text-[var(--text)] font-medium leading-tight">{m.label}</span>{m.note && <span className="block text-[11px] text-[var(--faint)] leading-tight">{m.note}</span>}</span>
                        {model === m.id && <Check className="w-4 h-4 text-[var(--text)]" />}
                      </button>
                    ))}
                  </>
                )}
                <div className="my-1 border-t border-[var(--border)]" />
                <button onClick={() => { setLocalCfg(true); setModelMenu(false); }} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[13px] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"><Settings2 className="w-3.5 h-3.5" /> Local models…</button>
              </div>
            </>
          )}
        </div>

        <textarea ref={taRef} value={input} rows={1} onChange={(e) => { setInput(e.target.value); grow(); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Message…" className="flex-1 resize-none bg-transparent text-[15px] text-[var(--text)] placeholder-[var(--faint)] focus:outline-none max-h-[200px] py-1.5 min-w-0" />
        {streaming ? (
          <button onClick={() => abortRef.current?.abort()} title="Stop" className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-[var(--text)] text-[var(--bg)] hover:bg-[var(--text-hover)] transition-colors"><Square className="w-4 h-4" fill="currentColor" /></button>
        ) : (
          <button onClick={send} disabled={!input.trim() && pending.length === 0} title="Send" className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-[var(--text)] text-[var(--bg)] hover:bg-[var(--text-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><Send className="w-4 h-4" /></button>
        )}
      </div>
    </div>
  );

  const isEmpty = !gated && !streaming && (!active || active.messages.length === 0);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] bg-[var(--bg)] relative"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}>

      {dragOver && <div className="absolute inset-0 z-[60] bg-[var(--text)]/5 border-2 border-dashed border-[var(--text)]/40 rounded-xl m-2 flex items-center justify-center pointer-events-none"><span className="text-sm font-semibold text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2 shadow-lg">Drop files to attach</span></div>}

      {sidebarOpen && <div className="md:hidden fixed inset-0 top-14 z-40 bg-black/40 backdrop-blur-[2px] nx-fade" onClick={() => setSidebarOpen(false)} />}

      {/* Collapsed rail (desktop) */}
      {collapsed && (
        <div className="hidden md:flex flex-col items-center gap-1 w-12 shrink-0 border-r border-[var(--border)] py-2">
          <button onClick={() => setCollapsed(false)} title="Expand" className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]"><PanelLeft className="w-4 h-4" /></button>
          <button onClick={newChat} title="New chat" className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]"><Plus className="w-4 h-4" /></button>
        </div>
      )}

      {/* Sidebar */}
      <aside className={cn(
        "border-r border-[var(--border)] flex-col bg-[var(--bg)] w-72 md:w-64 shrink-0",
        collapsed ? "flex md:hidden" : "flex",
        "max-md:fixed max-md:top-14 max-md:bottom-0 max-md:left-0 max-md:z-50 max-md:shadow-2xl transition-transform duration-200 ease-out",
        sidebarOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
      )}>
        <div className="flex items-center justify-between h-12 px-3 shrink-0 border-b border-[var(--border)]">
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]"><Sparkles className="w-4 h-4" /> Chat</span>
          <div className="flex items-center gap-0.5">
            <button onClick={newFolder} title="New folder" className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)] transition-colors"><FolderPlus className="w-4 h-4" /></button>
            <button onClick={newChat} title="New chat" className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)] transition-colors"><Plus className="w-4 h-4" /></button>
            <button onClick={() => setCollapsed(true)} title="Collapse" className="hidden md:flex p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)] transition-colors"><PanelLeftClose className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="px-2 py-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-[var(--faint)] shrink-0" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats…" className="flex-1 min-w-0 bg-transparent text-[13px] text-[var(--text)] placeholder-[var(--faint)] focus:outline-none" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-1.5 pb-2 space-y-0.5">
          {pinnedList.length > 0 && (
            <>
              <p className="px-2 pt-1 pb-0.5 text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest flex items-center gap-1"><Pin className="w-3 h-3" /> Pinned</p>
              {pinnedList.map((t) => <ThreadRow key={t.id} t={t} {...rowProps} />)}
            </>
          )}
          {folders.map((f) => (
            <FolderSection key={f.id} folder={f} chats={folderChats(f.id)} onDelete={() => deleteFolder(f.id)} rowProps={rowProps} />
          ))}
          {folders.length > 0 && ungrouped.length > 0 && <p className="px-2 pt-2 pb-0.5 text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest">Chats</p>}
          {ungrouped.map((t) => <ThreadRow key={t.id} t={t} {...rowProps} />)}
          {visible.length === 0 && <p className="px-2 py-3 text-[12.5px] text-[var(--faint)]">{q ? "No chats match." : "No conversations yet."}</p>}
        </div>

        {/* Trash */}
        <div className="shrink-0 border-t border-[var(--border)] px-1.5 py-1.5">
          <button onClick={() => setTrashOpen((v) => !v)} className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[13px] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors">
            {trashOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Trash2 className="w-3.5 h-3.5" /><span className="flex-1 text-left">Trash</span>
            {trashed.length > 0 && <span className="text-[11px] text-[var(--faint)] tabular-nums">{trashed.length}</span>}
          </button>
          {trashOpen && (
            <div className="mt-1 max-h-[26vh] overflow-y-auto">
              {trashed.length === 0 ? <p className="px-2 py-2 text-[12px] text-[var(--faint)]">Empty. Deleted chats are kept 14 days.</p> :
                trashed.map((t) => (
                  <div key={t.id} className="group flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[var(--muted)] hover:bg-[var(--surface-2)]">
                    <MessageSquare className="w-3.5 h-3.5 shrink-0 text-[var(--faint)]" />
                    <span className="flex-1 truncate text-[12.5px]">{t.title || "Untitled"}</span>
                    <button onClick={() => restore(t.id)} title="Restore" className="p-1 rounded text-[var(--faint)] hover:text-[var(--text)] opacity-0 group-hover:opacity-100"><RotateCcw className="w-3.5 h-3.5" /></button>
                    <button onClick={() => purge(t.id)} title="Delete forever" className="p-1 rounded text-[var(--faint)] hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 h-12 px-3 sm:px-4 shrink-0 border-b border-[var(--border)]">
          <button onClick={() => setSidebarOpen(true)} title="Conversations" className="md:hidden p-1.5 -ml-1 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)] transition-colors"><PanelLeft className="w-4 h-4" /></button>
          {/* Nexus data access */}
          <button onClick={() => setUseData((v) => !v)} title="Let the AI read your Nexus data (locked notes excluded)"
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors", useData ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]")}>
            <Database className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Nexus data</span>
          </button>
          {/* Skills */}
          <div className="relative">
            <button onClick={() => setSkillsMenu((v) => !v)} title="Skills — reusable instructions"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[12.5px] font-medium text-[var(--text)] hover:bg-[var(--chip)] transition-colors">
              <Puzzle className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Skills</span>
              {skills.some((s) => s.enabled) && <span className="w-1.5 h-1.5 rounded-full bg-[var(--text)]" />}
            </button>
            {skillsMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSkillsMenu(false)} />
                <div className="absolute left-0 top-full mt-1.5 z-50 w-64 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-1.5 nx-pop max-h-[60vh] overflow-y-auto">
                  <p className="px-2 py-1 text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest">Skills</p>
                  {skills.length === 0 ? <p className="px-2 py-1.5 text-[12px] text-[var(--faint)]">No skills yet. Add reusable instructions the AI follows.</p> :
                    skills.map((s) => (
                      <div key={s.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--surface-2)]">
                        <button onClick={() => toggleSkill(s.id)} className={cn("w-4 h-4 rounded-[5px] border shrink-0 flex items-center justify-center", s.enabled ? "bg-[var(--text)] border-[var(--text)]" : "border-[var(--border-2)]")}>{s.enabled && <Check className="w-3 h-3 text-[var(--bg)]" strokeWidth={3} />}</button>
                        <span className="flex-1 truncate text-[13px] text-[var(--text)]" title={s.instructions}>{s.name}</span>
                        <button onClick={() => deleteSkill(s.id)} className="p-0.5 text-[var(--faint)] hover:text-red-500 opacity-0 group-hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  <button onClick={addSkill} className="w-full flex items-center gap-1.5 px-2 py-1.5 mt-1 rounded-lg text-[12.5px] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"><Plus className="w-3.5 h-3.5" /> New skill</button>
                </div>
              </>
            )}
          </div>
          {active?.projectId && projects.find((p) => p.id === active.projectId) && (
            <span className="hidden md:flex items-center gap-1 text-[11px] text-[var(--muted)] bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-2 py-1"><FolderKanban className="w-3 h-3" /> {projects.find((p) => p.id === active.projectId)?.name}</span>
          )}
          <div className="ml-auto text-[11px] text-[var(--faint)] hidden lg:block truncate max-w-[30%]">{active?.title || "New chat"}</div>
        </div>

        {/* Content: lock screen · centered composer for a new chat · messages + bottom composer */}
        {gated && active ? (
          <div className="flex-1 overflow-y-auto"><ChatLockScreen onUnlock={(pw) => { if (pw === active.lockPass) { setUnlocked((s) => new Set(s).add(active.id)); return true; } return false; }} /></div>
        ) : isEmpty ? (
          <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-4 py-8">
            <div className="text-center max-w-md mb-6">
              <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--chip)] border border-[var(--border)] mx-auto mb-4"><Sparkles className="w-6 h-6 text-[var(--text)]" strokeWidth={1.8} /></span>
              <p className="text-lg font-bold text-[var(--text)] mb-1">Ask anything</p>
              <p className="text-sm text-[var(--faint)]">Pick a model, attach files, or toggle <b>Nexus data</b> to let the AI read your dashboard.</p>
            </div>
            <div className="w-full max-w-2xl">{composer}</div>
            <p className="text-[10.5px] text-[var(--faint)] text-center mt-2">Enter to send · Shift+Enter for a new line · drag &amp; drop or 📎 to attach</p>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-3xl px-3 sm:px-6 py-6 space-y-5">
                {active?.messages.map((m) => (
                  <MessageItem key={m.id} m={m}
                    editing={editingId === m.id} editText={editText} setEditText={setEditText}
                    onEditStart={() => { setEditingId(m.id); setEditText(m.content); }} onEditCancel={() => setEditingId(null)} onEditSave={() => saveEdit(m.id)} />
                ))}
                {streaming && <MessageItem m={{ id: "streaming", role: "assistant", content: splitSources(streamText).content, createdAt: "" }} pending />}
              </div>
            </div>
            <div className="shrink-0 border-t border-[var(--border)] p-3 sm:p-4">
              <div className="mx-auto max-w-3xl">
                {composer}
                <p className="text-[10.5px] text-[var(--faint)] text-center mt-1.5">Enter to send · Shift+Enter for a new line · drag &amp; drop or 📎 to attach</p>
              </div>
            </div>
          </>
        )}
      </div>

      {localCfg && (
        <LocalConfig
          ollama={chatSettings.ollamaUrl ?? "http://localhost:11434"}
          bridge={chatSettings.bridgeUrl ?? ""}
          token={chatSettings.bridgeToken ?? ""}
          ollamaCount={localModels.filter((m) => m.provider === "ollama").length}
          bridgeCount={localModels.filter((m) => m.provider === "bridge").length}
          onSave={(o, b, tk) => { mutate((d) => ({ ...d, chatSettings: { ...(d.chatSettings ?? DEFAULT_CHAT_SETTINGS), ollamaUrl: o, bridgeUrl: b, bridgeToken: tk } })); setLocalCfg(false); }}
          onClose={() => setLocalCfg(false)}
        />
      )}
    </div>
  );
}

// ── local models config (Ollama + Codex/Claude bridge) ──────────────────────────────
function LocalConfig({ ollama, bridge, token, ollamaCount, bridgeCount, onSave, onClose }: {
  ollama: string; bridge: string; token: string; ollamaCount: number; bridgeCount: number;
  onSave: (ollama: string, bridge: string, token: string) => void; onClose: () => void;
}) {
  const [o, setO] = useState(ollama);
  const [b, setB] = useState(bridge);
  const [tk, setTk] = useState(token);
  const inputCls = "w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]";
  const dot = (n: number) => n > 0 ? <span className="text-[11px] text-emerald-500">● {n} model{n !== 1 ? "s" : ""} found</span> : <span className="text-[11px] text-[var(--faint)]">not reachable</span>;
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-2xl nx-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-[var(--chip)]">
          <div className="flex items-center gap-2"><Server className="w-4 h-4 text-[var(--text)]" strokeWidth={1.9} /><p className="text-sm font-bold text-[var(--text)]">Local models</p></div>
          <button onClick={onClose} className="p-1.5 text-[var(--faint)] hover:text-[var(--text)]"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold flex items-center justify-between mb-1.5"><span>Ollama URL</span>{dot(ollamaCount)}</label>
            <input className={inputCls} value={o} onChange={(e) => setO(e.target.value)} placeholder="https://your-host.ts.net:8443/ollama" />
            <p className="text-[11px] text-[var(--faint)] mt-1">Reached through the bridge&apos;s <code className="text-[var(--muted)]">/ollama</code> proxy (HTTPS). Locally you can also use <code className="text-[var(--muted)]">http://localhost:11434</code>.</p>
          </div>
          <div>
            <label className="text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold flex items-center justify-between mb-1.5"><span>Bridge URL (Codex / Claude Code)</span>{dot(bridgeCount)}</label>
            <input className={inputCls} value={b} onChange={(e) => setB(e.target.value)} placeholder="https://your-host.ts.net:8443" />
            <p className="text-[11px] text-[var(--faint)] mt-1">Run the <code className="text-[var(--muted)]">nexus-bridge</code> script on your machine (uses your Claude Pro / ChatGPT plans locally).</p>
          </div>
          <div>
            <label className="text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold mb-1.5 block">Bridge token</label>
            <input className={inputCls} type="password" value={tk} onChange={(e) => setTk(e.target.value)} placeholder="paste the bridge's NEXUS_BRIDGE_TOKEN" />
          </div>
          <p className="text-[11px] text-[var(--faint)] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2">These run entirely on your computer — the browser talks to them directly. Your machine must be on and the server running.</p>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-[var(--border)]">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-[var(--faint)] hover:text-[var(--text)] border border-[var(--border)] rounded-xl transition-colors">Cancel</button>
          <button onClick={() => onSave(o.trim(), b.trim(), tk.trim())} className="flex-1 py-2 text-sm font-semibold text-[var(--bg)] bg-[var(--text)] hover:bg-[var(--text-hover)] rounded-xl transition-colors">Save</button>
        </div>
      </div>
    </div>
  );
}

// ── lock screen ─────────────────────────────────────────────────────────────────────
function ChatLockScreen({ onUnlock }: { onUnlock: (pw: string) => boolean }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const submit = () => { if (!onUnlock(pw)) { setErr(true); setPw(""); } };
  return (
    <div className="h-full flex items-center justify-center px-6">
      <div className="w-full max-w-[320px] text-center">
        <div className="w-14 h-14 rounded-2xl bg-[var(--chip)] flex items-center justify-center mx-auto mb-4"><Lock className="w-6 h-6 text-[var(--muted)]" /></div>
        <h2 className="text-lg font-semibold text-[var(--text)] mb-1 tracking-tight">Chat locked</h2>
        <p className="text-sm text-[var(--muted)] mb-5">Enter the passcode to open this conversation.</p>
        <input autoFocus type="password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(false); }} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="Passcode"
          className={cn("w-full text-center bg-[var(--surface-2)] border rounded-xl px-3 py-2.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none transition-colors tracking-[0.3em]", err ? "border-red-500" : "border-[var(--border)] focus:border-[var(--border-2)]")} />
        {err && <p className="text-xs text-red-500 mt-2">Incorrect passcode</p>}
        <button onClick={submit} className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-sm font-medium rounded-xl transition-colors"><LockOpen className="w-3.5 h-3.5" /> Unlock</button>
      </div>
    </div>
  );
}

// ── thread row (with per-chat menu) ────────────────────────────────────────────────
type RowProps = {
  activeId: string | null; onOpen: (id: string) => void; menuFor: string | null; setMenuFor: (id: string | null) => void;
  onRename: (t: ChatThread) => void; onPin: (t: ChatThread) => void; onDelete: (id: string) => void;
  onMoveFolder: (id: string, fid: string | null) => void; onLinkProject: (id: string, pid: string | null) => void;
  onLock: (t: ChatThread) => void; onUnlock: (t: ChatThread) => void;
  folders: ChatFolder[]; projects: { id: string; name: string }[];
};
function ThreadRow({ t, activeId, onOpen, menuFor, setMenuFor, onRename, onPin, onDelete, onMoveFolder, onLinkProject, onLock, onUnlock, folders, projects }: RowProps & { t: ChatThread }) {
  const open = menuFor === t.id;
  return (
    <div className={cn("group relative flex items-center gap-1.5 rounded-md pr-1 transition-colors", t.id === activeId ? "bg-[var(--chip)] text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)]")}>
      <button onClick={() => onOpen(t.id)} className="flex-1 flex items-center gap-2 py-2 pl-2 min-w-0 text-left">
        {t.locked ? <Lock className="w-3.5 h-3.5 shrink-0 text-[var(--faint)]" /> : t.pinned ? <Pin className="w-3.5 h-3.5 shrink-0 text-[var(--faint)]" /> : <MessageSquare className="w-3.5 h-3.5 shrink-0 text-[var(--faint)]" />}
        <span className="truncate text-[13px]">{t.title || "New chat"}</span>
      </button>
      <button onClick={() => onPin(t)} title={t.pinned ? "Unpin" : "Pin"} className="p-1 rounded text-[var(--faint)] hover:text-[var(--text)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">{t.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}</button>
      <button onClick={() => setMenuFor(open ? null : t.id)} title="More" className="p-1 rounded text-[var(--faint)] hover:text-[var(--text)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"><MoreHorizontal className="w-3.5 h-3.5" /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuFor(null)} />
          <div className="absolute right-1 top-full mt-1 z-50 w-52 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-1.5 nx-pop max-h-[50vh] overflow-y-auto">
            <MenuBtn icon={<Pencil className="w-3.5 h-3.5" />} label="Rename" onClick={() => { onRename(t); setMenuFor(null); }} />
            <MenuBtn icon={t.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />} label={t.pinned ? "Unpin" : "Pin"} onClick={() => { onPin(t); setMenuFor(null); }} />
            <MenuBtn icon={t.locked ? <LockOpen className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />} label={t.locked ? "Remove lock" : "Lock with passcode"} onClick={() => { t.locked ? onUnlock(t) : onLock(t); setMenuFor(null); }} />
            <div className="my-1 border-t border-[var(--border)]" />
            <p className="px-2 py-0.5 text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest">Folder</p>
            <MenuBtn icon={<Folder className="w-3.5 h-3.5" />} label="No folder" active={!t.folderId} onClick={() => { onMoveFolder(t.id, null); setMenuFor(null); }} />
            {folders.map((f) => <MenuBtn key={f.id} icon={<Folder className="w-3.5 h-3.5" />} label={f.name} active={t.folderId === f.id} onClick={() => { onMoveFolder(t.id, f.id); setMenuFor(null); }} />)}
            {projects.length > 0 && <>
              <div className="my-1 border-t border-[var(--border)]" />
              <p className="px-2 py-0.5 text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest">Project</p>
              <MenuBtn icon={<FolderKanban className="w-3.5 h-3.5" />} label="None" active={!t.projectId} onClick={() => { onLinkProject(t.id, null); setMenuFor(null); }} />
              {projects.map((p) => <MenuBtn key={p.id} icon={<FolderKanban className="w-3.5 h-3.5" />} label={p.name} active={t.projectId === p.id} onClick={() => { onLinkProject(t.id, p.id); setMenuFor(null); }} />)}
            </>}
            <div className="my-1 border-t border-[var(--border)]" />
            <MenuBtn icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete" danger onClick={() => { onDelete(t.id); setMenuFor(null); }} />
          </div>
        </>
      )}
    </div>
  );
}
function MenuBtn({ icon, label, onClick, active, danger }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean; danger?: boolean }) {
  return <button onClick={onClick} className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] text-left transition-colors", danger ? "text-[var(--text)] hover:bg-[var(--surface-2)] hover:text-red-500" : "text-[var(--text)] hover:bg-[var(--surface-2)]")}><span className="text-[var(--muted)]">{icon}</span><span className="flex-1 truncate">{label}</span>{active && <Check className="w-3.5 h-3.5" />}</button>;
}

function FolderSection({ folder, chats, onDelete, rowProps }: { folder: ChatFolder; chats: ChatThread[]; onDelete: () => void; rowProps: RowProps }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-0.5">
      <div className="group flex items-center gap-0.5 rounded-md pr-1 text-[var(--muted)] hover:bg-[var(--surface-2)]">
        <button onClick={() => setOpen((v) => !v)} className="p-0.5 rounded shrink-0 text-[var(--faint)] hover:text-[var(--text)]">{open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</button>
        <button onClick={() => setOpen((v) => !v)} className="flex-1 flex items-center gap-1.5 py-1.5 min-w-0 text-left text-[13px] font-medium">{open ? <FolderOpen className="w-4 h-4 shrink-0 text-[var(--faint)]" /> : <Folder className="w-4 h-4 shrink-0 text-[var(--faint)]" />}<span className="truncate">{folder.name}</span><span className="text-[11px] text-[var(--faint)]">{chats.length}</span></button>
        <button onClick={onDelete} title="Delete folder" className="p-1 rounded text-[var(--faint)] hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      {open && <div className="ml-2 pl-1 border-l border-[var(--border)]">{chats.length === 0 ? <p className="px-2 py-1 text-[11.5px] text-[var(--faint)]">Empty</p> : chats.map((t) => <ThreadRow key={t.id} t={t} {...rowProps} />)}</div>}
    </div>
  );
}

// ── message bubble (attachments, copy, edit) ────────────────────────────────────────
function MessageItem({ m, pending, editing, editText, setEditText, onEditStart, onEditCancel, onEditSave }: {
  m: ChatMessage; pending?: boolean; editing?: boolean; editText?: string; setEditText?: (v: string) => void;
  onEditStart?: () => void; onEditCancel?: () => void; onEditSave?: () => void;
}) {
  const isUser = m.role === "user";
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(m.content); setCopied(true); setTimeout(() => setCopied(false), 1200); };
  return (
    <div className={cn("group flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <span className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border", isUser ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]" : "bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]")}>{isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}</span>
      <div className={cn("min-w-0 max-w-[85%] flex flex-col", isUser ? "items-end" : "items-start")}>
        {m.attachments && m.attachments.length > 0 && (
          <div className={cn("flex flex-wrap gap-1.5 mb-1.5", isUser ? "justify-end" : "justify-start")}>
            {m.attachments.map((a) => a.kind === "image" && a.url
              ? <a key={a.id} href={a.url} target="_blank" rel="noopener"><img src={a.url} alt={a.name} className="max-h-40 rounded-lg border border-[var(--border)]" /></a>
              : <span key={a.id} className="flex items-center gap-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1 text-[12px] text-[var(--text)]"><FileText className="w-3.5 h-3.5 text-[var(--muted)]" /> {a.name}</span>)}
          </div>
        )}
        {editing ? (
          <div className="w-full min-w-[260px]">
            <textarea autoFocus value={editText} onChange={(e) => setEditText?.(e.target.value)} rows={3} className="w-full resize-none bg-[var(--surface-2)] border border-[var(--border-2)] rounded-xl px-3 py-2 text-[14.5px] text-[var(--text)] focus:outline-none" />
            <div className="flex justify-end gap-1.5 mt-1.5"><button onClick={onEditCancel} className="px-2.5 py-1 text-[12px] text-[var(--faint)] hover:text-[var(--text)] border border-[var(--border)] rounded-md">Cancel</button><button onClick={onEditSave} className="px-2.5 py-1 text-[12px] font-semibold text-[var(--bg)] bg-[var(--text)] rounded-md hover:bg-[var(--text-hover)]">Save &amp; resend</button></div>
          </div>
        ) : (m.content || pending) ? (
          <div className={cn("rounded-2xl px-3.5 py-2.5 break-words", isUser ? "bg-[var(--chip)] text-[var(--text)] text-[14.5px] leading-relaxed whitespace-pre-wrap" : "bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]")}>
            {isUser ? m.content
              : m.content ? <div className="nx-md" dangerouslySetInnerHTML={{ __html: mdToHtml(m.content) }} />
              : (pending ? <span className="inline-flex gap-1 items-center text-[var(--faint)]"><Dot /><Dot delay={0.15} /><Dot delay={0.3} /></span> : "")}
          </div>
        ) : null}
        {!isUser && m.sources && m.sources.length > 0 && <Sources urls={m.sources} />}
        {!pending && !editing && (m.content || m.attachments?.length) && (
          <div className={cn("flex gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity", isUser ? "flex-row-reverse" : "")}>
            <button onClick={copy} title="Copy" className="p-1 rounded text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--chip)]">{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}</button>
            {isUser && onEditStart && <button onClick={onEditStart} title="Edit" className="p-1 rounded text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--chip)]"><Pencil className="w-3.5 h-3.5" /></button>}
          </div>
        )}
      </div>
    </div>
  );
}
function Sources({ urls }: { urls: string[] }) {
  const [open, setOpen] = useState(false);
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  return (
    <div className="mt-1.5 w-full max-w-full">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors">
        <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-90")} />
        <Link2 className="w-3.5 h-3.5" /> Sources <span className="text-[var(--faint)]">({urls.length})</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 border-l border-[var(--border)] pl-3 ml-1.5">
          {urls.map((u, i) => (
            <a key={i} href={u} target="_blank" rel="noopener" className="flex items-center gap-2 text-[12.5px] text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              <img src={`https://www.google.com/s2/favicons?domain=${host(u)}&sz=32`} alt="" className="w-3.5 h-3.5 rounded-sm shrink-0" />
              <span className="truncate">{host(u)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
function Dot({ delay = 0 }: { delay?: number }) { return <span className="w-1.5 h-1.5 rounded-full bg-current inline-block animate-pulse" style={{ animationDelay: `${delay}s` }} />; }
