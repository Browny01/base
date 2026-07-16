"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useBridge } from "@/lib/hooks";
import { processFile } from "@/lib/chat-files";
import { configuredChatModels, DEFAULT_CHAT_SETTINGS, DEFAULT_MODEL, providerOf, localProviderOf, type PerplexityTool } from "@/lib/chat-models";
import { discoverOllama, discoverBridge, type LocalModel } from "@/lib/local-chat";
import type { ChatAttachment } from "@/lib/store";
import { Sparkles, Send, Paperclip, X, FileText, Database, Globe, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// The dashboard "Ask Bridge AI" bar — a compact composer (model, files, Data + Web
// toggles) that hands everything off to the Chat page, which auto-sends it.
export function DashAskBar() {
  const router = useRouter();
  const { data, mutate } = useBridge();
  const chatSettings = data.chatSettings ?? DEFAULT_CHAT_SETTINGS;
  const models = useMemo(() => configuredChatModels(chatSettings).filter((m) => m.enabled), [chatSettings]);

  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [o, b] = await Promise.all([discoverOllama(chatSettings.ollamaUrl), discoverBridge(chatSettings.bridgeUrl, chatSettings.bridgeToken)]);
      if (alive) setLocalModels([...o, ...b]);
    })();
    return () => { alive = false; };
  }, [chatSettings.ollamaUrl, chatSettings.bridgeUrl, chatSettings.bridgeToken]);

  const [ask, setAsk] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [pending, setPending] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [useData, setUseData] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  // keep the selected model valid as settings load
  useEffect(() => {
    if (localProviderOf(model)) return;
    if (models.length && !models.some((m) => m.id === model)) setModel(models[0].id);
  }, [models, model]);

  const provider = providerOf(model);
  const isPerp = provider === "perplexity";
  const isLocal = !!localProviderOf(model);
  const webApplicable = isPerp || isLocal;
  const webOn = isPerp
    ? (chatSettings.perplexityTools ?? DEFAULT_CHAT_SETTINGS.perplexityTools).includes("web_search")
    : isLocal ? (chatSettings.localWebSearch ?? true) : false;

  const toggleWeb = () => mutate((d) => {
    const cs = d.chatSettings ?? DEFAULT_CHAT_SETTINGS;
    if (localProviderOf(model)) return { ...d, chatSettings: { ...cs, localWebSearch: !(cs.localWebSearch ?? true) } };
    const cur = cs.perplexityTools ?? DEFAULT_CHAT_SETTINGS.perplexityTools;
    const next: PerplexityTool[] = cur.includes("web_search") ? cur.filter((x) => x !== "web_search") : [...cur, "web_search"];
    return { ...d, chatSettings: { ...cs, perplexityTools: next } };
  });

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const results = await Promise.all(Array.from(files).map((f) => processFile(f).catch(() => null)));
    setPending((p) => [...p, ...results.filter(Boolean) as ChatAttachment[]]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  function askAI() {
    const text = ask.trim();
    if (!text && pending.length === 0) return;
    try { localStorage.setItem("bridge_chat_handoff", JSON.stringify({ text, model, useData, attachments: pending, autoSend: true })); } catch {}
    router.push("/chat");
  }

  const chip = "flex items-center gap-1.5 h-8 px-2.5 rounded-full border text-[12px] font-medium transition-colors";

  return (
    <div className="mt-5 mx-auto max-w-xl">
      <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.md,.markdown,.txt,.json,.csv,.ts,.tsx,.js,.jsx,.py,.java,.c,.cpp,.h,.cs,.go,.rb,.rs,.php,.html,.css,.scss,.yml,.yaml,.sh,.sql,.xml" className="hidden" onChange={(e) => addFiles(e.target.files)} />

      {(pending.length > 0 || uploading) && (
        <div className="flex flex-wrap justify-center gap-1.5 mb-2">
          {pending.map((a) => (
            <div key={a.id} className="flex items-center gap-1.5 bg-[var(--bg)]/70 border border-[var(--border)] rounded-lg pl-1.5 pr-1 py-1 max-w-[180px]">
              {a.kind === "image" && a.url ? <img src={a.url} alt="" className="w-5 h-5 rounded object-cover" /> : <FileText className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />}
              <span className="text-[11px] text-[var(--text)] truncate">{a.name}</span>
              <button onClick={() => setPending((p) => p.filter((x) => x.id !== a.id))} className="p-0.5 text-[var(--faint)] hover:text-red-500"><X className="w-3 h-3" /></button>
            </div>
          ))}
          {uploading && <span className="text-[11px] text-[var(--faint)] self-center px-1">Uploading…</span>}
        </div>
      )}

      {/* input pill */}
      <div className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg)]/70 backdrop-blur pl-4 pr-1.5 py-1.5 shadow-sm focus-within:border-[var(--accent-border)] transition-colors">
        <Sparkles className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") askAI(); }}
          placeholder="Ask Bridge AI anything…"
          className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none min-w-0"
        />
        <button onClick={askAI} disabled={!ask.trim() && pending.length === 0} title="Ask" className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--text)] text-[var(--bg)] hover:bg-[var(--text-hover)] disabled:opacity-40 transition-colors">
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* controls: model · attach · data · web */}
      <div className="mt-2.5 flex items-center justify-center gap-1.5 flex-wrap">
        {/* model — native select escapes the hero's overflow clipping */}
        <div className="relative">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="appearance-none h-8 pl-2.5 pr-7 rounded-full border border-[var(--border)] bg-[var(--bg)]/70 text-[12px] font-medium text-[var(--text)] focus:outline-none focus:border-[var(--border-2)] cursor-pointer max-w-[190px] truncate"
          >
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            {localModels.length > 0 && (
              <optgroup label="On your machine">
                {localModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </optgroup>
            )}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--faint)]" />
        </div>

        <button onClick={() => fileRef.current?.click()} title="Attach files" className={cn(chip, "border-[var(--border)] bg-[var(--bg)]/70 text-[var(--muted)] hover:text-[var(--text)]")}>
          <Paperclip className="w-3.5 h-3.5" /> Files
        </button>

        <button onClick={() => setUseData((v) => !v)} title="Give the AI access to your Bridge data" className={cn(chip, useData ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] bg-[var(--bg)]/70 text-[var(--muted)] hover:text-[var(--text)]")}>
          <Database className="w-3.5 h-3.5" /> Data
        </button>

        {webApplicable && (
          <button onClick={toggleWeb} title="Web search" className={cn(chip, webOn ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] bg-[var(--bg)]/70 text-[var(--muted)] hover:text-[var(--text)]")}>
            <Globe className="w-3.5 h-3.5" /> Web
          </button>
        )}
      </div>
    </div>
  );
}
