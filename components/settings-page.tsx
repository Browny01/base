"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Bot, Check, Layers, MonitorCog, Moon, PanelLeft, PanelBottom, PanelLeftClose, PanelLeftOpen, Play, Plus, Radio, Rss, Search, Settings, Sun, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/lib/sidebar-context";
import { useNavMode } from "@/lib/nav-mode-context";
import { useTheme } from "@/lib/theme-context";
import { useAccent, ACCENTS } from "@/lib/accent-context";
import { useBridge } from "@/lib/hooks";
import { CHAT_MODELS, configuredChatModels, DEFAULT_CHAT_SETTINGS, type ChatSettings } from "@/lib/chat-models";
import {
  CATEGORY_LABEL,
  DEFAULT_NEWS_PREFS,
  uid,
  type CreatorPlatform,
  type NewsPrefs,
  type YoutubeChannel,
} from "@/lib/news-prefs";
import {
  ALL_PAGES,
  SETTINGS_PAGE,
  DEFAULT_NAV_PREFS,
  orderedKeys,
  type NavPrefs,
} from "@/lib/nav-config";

function SourceManager({ prefs, setPrefs }: { prefs: NewsPrefs; setPrefs: (prefs: NewsPrefs) => void }) {
  const [youtubeName, setYoutubeName] = useState("");
  const [youtubeId, setYoutubeId] = useState("");
  const [youtubeCategory, setYoutubeCategory] = useState<YoutubeChannel["category"]>("general");
  const [redditInput, setRedditInput] = useState("");
  const [xInput, setXInput] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [creatorHandle, setCreatorHandle] = useState("");
  const [creatorPlatform, setCreatorPlatform] = useState<CreatorPlatform>("twitch");

  function update(next: NewsPrefs) {
    setPrefs(next);
  }

  function addYoutube() {
    if (!youtubeName.trim() || !youtubeId.trim()) return;
    update({
      ...prefs,
      youtube: [...prefs.youtube, { id: uid(), name: youtubeName.trim(), channelId: youtubeId.trim(), category: youtubeCategory }],
    });
    setYoutubeName("");
    setYoutubeId("");
  }

  function addReddit() {
    if (!redditInput.trim()) return;
    update({ ...prefs, reddit: [...new Set([...prefs.reddit, redditInput.trim().replace(/^r\//, "")])] });
    setRedditInput("");
  }

  function addX() {
    if (!xInput.trim()) return;
    update({ ...prefs, x: [...new Set([...prefs.x, xInput.trim().replace(/^@/, "")])] });
    setXInput("");
  }

  function addCreator() {
    if (!creatorName.trim() || !creatorHandle.trim()) return;
    update({
      ...prefs,
      creators: [...prefs.creators, { id: uid(), name: creatorName.trim(), handle: creatorHandle.trim().replace(/^@/, ""), platform: creatorPlatform }],
    });
    setCreatorName("");
    setCreatorHandle("");
  }

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 lg:col-span-2">
      <div className="flex items-center gap-2 mb-5">
        <Rss className="w-4 h-4 text-[var(--text)]" strokeWidth={1.9} />
        <h2 className="text-sm font-bold text-[var(--text)]">News Sources</h2>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Play className="h-4 w-4 text-[var(--text)]" />
            <p className="text-sm font-bold text-[var(--text)]">YouTube</p>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_1.25fr_130px_36px]">
            <input value={youtubeName} onChange={(e) => setYoutubeName(e.target.value)} placeholder="Channel name" className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] outline-none" />
            <input value={youtubeId} onChange={(e) => setYoutubeId(e.target.value)} placeholder="Channel ID (UC...)" className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] outline-none" />
            <select value={youtubeCategory} onChange={(e) => setYoutubeCategory(e.target.value as YoutubeChannel["category"])} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm text-[var(--text)] outline-none">
              {(["crypto", "ai", "irl", "gaming", "general"] as const).map((item) => <option key={item} value={item}>{CATEGORY_LABEL[item]}</option>)}
            </select>
            <button onClick={addYoutube} className="flex h-9 items-center justify-center rounded-lg bg-[var(--text)] text-[var(--bg)]"><Plus className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {prefs.youtube.map((channel) => (
              <button key={channel.id} onClick={() => update({ ...prefs, youtube: prefs.youtube.filter((item) => item.id !== channel.id) })} className="flex items-center gap-1 rounded-full bg-[var(--chip)] px-2 py-1 text-[11px] text-[var(--muted)] hover:text-[var(--text)]">
                {channel.name} · {CATEGORY_LABEL[channel.category]}
                <Trash2 className="h-3 w-3" />
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Rss className="h-4 w-4 text-[var(--text)]" />
              <p className="text-sm font-bold text-[var(--text)]">Reddit</p>
            </div>
            <div className="flex gap-2">
              <input value={redditInput} onChange={(e) => setRedditInput(e.target.value)} placeholder="subreddit" className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] outline-none" />
              <button onClick={addReddit} className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--text)] text-[var(--bg)]"><Plus className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {prefs.reddit.map((sub) => (
                <button key={sub} onClick={() => update({ ...prefs, reddit: prefs.reddit.filter((item) => item !== sub) })} className="rounded-full bg-[var(--chip)] px-2 py-1 text-[11px] text-[var(--muted)] hover:text-[var(--text)]">r/{sub}</button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Search className="h-4 w-4 text-[var(--text)]" />
              <p className="text-sm font-bold text-[var(--text)]">X Accounts</p>
            </div>
            <div className="flex gap-2">
              <input value={xInput} onChange={(e) => setXInput(e.target.value)} placeholder="@handle" className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] outline-none" />
              <button onClick={addX} className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--text)] text-[var(--bg)]"><Plus className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {prefs.x.map((handle) => (
                <button key={handle} onClick={() => update({ ...prefs, x: prefs.x.filter((item) => item !== handle) })} className="rounded-full bg-[var(--chip)] px-2 py-1 text-[11px] text-[var(--muted)] hover:text-[var(--text)]">@{handle}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 xl:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <Radio className="h-4 w-4 text-[var(--text)]" />
            <p className="text-sm font-bold text-[var(--text)]">Twitch / Kick</p>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_110px_36px]">
            <input value={creatorName} onChange={(e) => setCreatorName(e.target.value)} placeholder="Creator name" className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] outline-none" />
            <input value={creatorHandle} onChange={(e) => setCreatorHandle(e.target.value)} placeholder="handle" className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] outline-none" />
            <select value={creatorPlatform} onChange={(e) => setCreatorPlatform(e.target.value as CreatorPlatform)} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm text-[var(--text)] outline-none">
              <option value="twitch">Twitch</option>
              <option value="kick">Kick</option>
            </select>
            <button onClick={addCreator} className="flex h-9 items-center justify-center rounded-lg bg-[var(--text)] text-[var(--bg)]"><Plus className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {prefs.creators.map((creator) => (
              <button key={creator.id} onClick={() => update({ ...prefs, creators: prefs.creators.filter((item) => item.id !== creator.id) })} className="flex items-center gap-1 rounded-full bg-[var(--chip)] px-2 py-1 text-[11px] text-[var(--muted)] hover:text-[var(--text)]">
                {creator.name} · {creator.platform}
                <Trash2 className="h-3 w-3" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ChatModelManager({ settings, setSettings }: { settings: ChatSettings; setSettings: (settings: ChatSettings) => void }) {
  const enabled = new Set(settings.enabledModelIds);
  const hidden = new Set(settings.hiddenModelIds ?? []);
  const visible = new Map(configuredChatModels(settings).map((model) => [model.id, model.enabled]));

  function toggleModel(id: string) {
    const model = CHAT_MODELS.find((item) => item.id === id);
    const automaticallyVisible = model?.provider === "anthropic" || model?.provider === "openai";
    if (automaticallyVisible) {
      const nextHidden = new Set(hidden);
      if (nextHidden.has(id)) nextHidden.delete(id); else nextHidden.add(id);
      setSettings({ ...settings, hiddenModelIds: [...nextHidden] });
      return;
    }
    const next = new Set(enabled);
    if (next.has(id)) {
      if (next.size <= 1) return;
      next.delete(id);
    } else {
      next.add(id);
    }
    setSettings({ ...settings, enabledModelIds: [...next] });
  }

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 lg:col-span-2">
      <div className="flex items-center gap-2 mb-5">
        <Bot className="w-4 h-4 text-[var(--text)]" strokeWidth={1.9} />
        <h2 className="text-sm font-bold text-[var(--text)]">AI Chat</h2>
      </div>

      <div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
          <p className="mb-1 text-sm font-bold text-[var(--text)]">Models</p>
          <p className="mb-3 text-[11px] text-[var(--faint)]">Only enabled models appear in the chat &amp; learning model pickers. Web-search / tools now live on the Chat page.</p>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {CHAT_MODELS.map((model) => {
              const active = visible.get(model.id) ?? false;
              return (
                <button
                  key={model.id}
                  onClick={() => toggleModel(model.id)}
                  className={cn(
                    "flex min-h-16 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                    active
                      ? "border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text)]"
                      : "border-[var(--border)] bg-transparent text-[var(--muted)] hover:text-[var(--text)]"
                  )}
                >
                  <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", active ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]" : "border-[var(--border-2)]")}>
                    {active && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight">{model.label}</span>
                    <span className="block text-[11px] text-[var(--faint)]">{model.note ?? model.provider}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
          <p className="mb-1 text-sm font-bold text-[var(--text)]">Memory</p>
          <p className="mb-2 text-[11px] text-[var(--faint)]">Persistent facts the AI remembers in every chat — who you are, preferences, ongoing context.</p>
          <textarea
            value={settings.chatMemory ?? ""}
            onChange={(e) => setSettings({ ...settings, chatMemory: e.target.value })}
            rows={4}
            placeholder="e.g. My name is Lucas. I run Systemly (WA lead-gen). Prefer concise answers. Building Base in Next.js…"
            className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]"
          />
        </div>
      </div>
    </section>
  );
}

function moveKey(arr: string[], key: string, dir: -1 | 1): string[] {
  const idx = arr.indexOf(key);
  const target = idx + dir;
  if (idx < 0 || target < 0 || target >= arr.length) return arr;
  const next = [...arr];
  const [moved] = next.splice(idx, 1);
  next.splice(target, 0, moved);
  return next;
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full transition-colors",
        on ? "bg-[var(--text)]" : "bg-[var(--chip)] border border-[var(--border-2)]"
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-all",
          on ? "left-[22px]" : "left-[3px] bg-[var(--muted)]"
        )}
        style={{ width: 18, height: 18 }}
      />
    </button>
  );
}

function NavigationManager({ prefs, setPrefs }: { prefs: NavPrefs; setPrefs: (prefs: NavPrefs) => void }) {
  const hidden = new Set(prefs.hiddenPages);
  const order = orderedKeys(prefs);
  const tabs = prefs.bottomTabs?.length ? prefs.bottomTabs : DEFAULT_NAV_PREFS.bottomTabs;

  function toggleHidden(key: string) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key); else next.add(key);
    setPrefs({ ...prefs, hiddenPages: [...next] });
  }

  function moveKeyIn(key: string, dir: -1 | 1) {
    setPrefs({ ...prefs, sidebarOrder: moveKey(order, key, dir) });
  }

  function toggleTab(key: string) {
    setPrefs({
      ...prefs,
      bottomTabs: tabs.includes(key) ? tabs.filter((k) => k !== key) : [...tabs, key],
    });
  }

  function moveTab(key: string, dir: -1 | 1) {
    setPrefs({ ...prefs, bottomTabs: moveKey(tabs, key, dir) });
  }

  const pageFor = (key: string) => ALL_PAGES.find((p) => p.key === key);

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 lg:col-span-2">
      <div className="flex items-center gap-2 mb-5">
        <Layers className="w-4 h-4 text-[var(--text)]" strokeWidth={1.9} />
        <h2 className="text-sm font-bold text-[var(--text)]">Pages &amp; Navigation</h2>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Page visibility */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
          <p className="mb-1 text-sm font-bold text-[var(--text)]">Pages</p>
          <p className="mb-3 text-[11px] text-[var(--faint)]">Switch a page off to remove it from the sidebar, dock and command bar. The page itself still works if you open it directly.</p>
          <div className="space-y-1">
            {ALL_PAGES.map((page) => (
              <div key={page.key} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-[var(--chip)] transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <page.icon className="w-4 h-4 text-[var(--muted)] shrink-0" strokeWidth={1.9} />
                  <span className="text-[13px] text-[var(--text)] truncate">{page.label}</span>
                </div>
                <Toggle on={!hidden.has(page.key)} onClick={() => toggleHidden(page.key)} />
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 bg-[var(--chip)]">
              <div className="flex items-center gap-2.5 min-w-0">
                <Settings className="w-4 h-4 text-[var(--muted)] shrink-0" strokeWidth={1.9} />
                <span className="text-[13px] text-[var(--text)] truncate">{SETTINGS_PAGE.label}</span>
              </div>
              <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--faint)]">Always on</span>
            </div>
          </div>
        </div>

        <div className="grid gap-6">
          {/* Sidebar order */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
            <p className="text-sm font-bold text-[var(--text)]">Sidebar order</p>
            <p className="mb-3 text-[11px] text-[var(--faint)]">Reorders the sidebar on desktop and the "All pages" sheets.</p>
            <div className="space-y-1">
              {order.map((key, i) => {
                const page = pageFor(key);
                if (!page) return null;
                return (
                  <div key={key} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-[var(--chip)] transition-colors">
                    <page.icon className="w-4 h-4 text-[var(--muted)] shrink-0" strokeWidth={1.9} />
                    <span className="flex-1 min-w-0 truncate text-[13px] text-[var(--text)]">{page.label}</span>
                    <button onClick={() => moveKeyIn(key, -1)} disabled={i === 0} className="text-[var(--faint)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:text-[var(--faint)] transition-colors" title="Move up">
                      <ArrowUp className="w-4 h-4" strokeWidth={1.9} />
                    </button>
                    <button onClick={() => moveKeyIn(key, 1)} disabled={i === order.length - 1} className="text-[var(--faint)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:text-[var(--faint)] transition-colors" title="Move down">
                      <ArrowDown className="w-4 h-4" strokeWidth={1.9} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile dock tabs */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
            <p className="text-sm font-bold text-[var(--text)]">Mobile dock tabs</p>
            <p className="mb-3 text-[11px] text-[var(--faint)]">These fixed tabs always sit in the bottom bar. Everything else is reachable through "More".</p>
            <div className="space-y-1">
              {tabs.map((key, i) => {
                const page = pageFor(key);
                if (!page) return null;
                return (
                  <div key={key} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-[var(--chip)] transition-colors">
                    <page.icon className="w-4 h-4 text-[var(--muted)] shrink-0" strokeWidth={1.9} />
                    <span className="flex-1 min-w-0 truncate text-[13px] text-[var(--text)]">{page.label}</span>
                    <button onClick={() => moveTab(key, -1)} disabled={i === 0} className="text-[var(--faint)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:text-[var(--faint)] transition-colors" title="Move left">
                      <ArrowUp className="w-4 h-4" strokeWidth={1.9} />
                    </button>
                    <button onClick={() => moveTab(key, 1)} disabled={i === tabs.length - 1} className="text-[var(--faint)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:text-[var(--faint)] transition-colors" title="Move right">
                      <ArrowDown className="w-4 h-4" strokeWidth={1.9} />
                    </button>
                    <button onClick={() => toggleTab(key)} className="text-[var(--faint)] hover:text-[var(--c-red)] transition-colors" title={`Remove ${page.label}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">Add a tab</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ALL_PAGES.filter((p) => !tabs.includes(p.key)).map((page) => (
                <button
                  key={page.key}
                  onClick={() => toggleTab(page.key)}
                  className="flex items-center gap-1 rounded-full bg-[var(--chip)] px-2 py-1 text-[11px] text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                >
                  <page.icon className="w-3 h-3" strokeWidth={2} />
                  {page.label}
                  <Plus className="w-3 h-3" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();
  const { collapsed, toggle } = useSidebar();
  const { mode, setMode } = useNavMode();
  const { data, mutate } = useBridge();
  const newsPrefs = data.newsPrefs ?? DEFAULT_NEWS_PREFS;
  const chatSettings = data.chatSettings ?? DEFAULT_CHAT_SETTINGS;
  const navPrefs = data.navPrefs ?? DEFAULT_NAV_PREFS;
  const setNewsPrefs = (prefs: NewsPrefs) => mutate((d) => ({ ...d, newsPrefs: prefs }));
  const setChatSettings = (settings: ChatSettings) => mutate((d) => ({ ...d, chatSettings: settings }));
  const setNavPrefs = (prefs: NavPrefs) => mutate((d) => ({ ...d, navPrefs: prefs }));

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--chip)] flex items-center justify-center">
            <Settings className="w-4 h-4 text-[var(--text)]" strokeWidth={1.9} />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Settings</h1>
        </div>
        <p className="text-sm text-[var(--muted)]">Preferences for the Base workspace.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <MonitorCog className="w-4 h-4 text-[var(--text)]" strokeWidth={1.9} />
            <h2 className="text-sm font-bold text-[var(--text)]">Appearance</h2>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">Theme</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTheme("light")}
                className={cn(
                  "flex items-center justify-center gap-2 h-10 rounded-lg border text-sm font-medium transition-colors",
                  theme === "light"
                    ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]"
                    : "bg-[var(--surface-2)] text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)]"
                )}
              >
                <Sun className="w-4 h-4" strokeWidth={1.9} />
                Light
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={cn(
                  "flex items-center justify-center gap-2 h-10 rounded-lg border text-sm font-medium transition-colors",
                  theme === "dark"
                    ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]"
                    : "bg-[var(--surface-2)] text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)]"
                )}
              >
                <Moon className="w-4 h-4" strokeWidth={1.9} />
                Dark
              </button>
            </div>

            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)] pt-2">Accent colour</p>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((a) => (
                <button
                  key={a.key}
                  onClick={() => setAccent(a.value)}
                  title={a.label}
                  aria-label={a.label}
                  className={cn(
                    "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
                    accent === a.value ? "border-[var(--text)]" : "border-transparent"
                  )}
                  style={{ background: a.value }}
                >
                  {accent === a.value && <Check className="w-4 h-4 text-white mx-auto" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-5">
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4 text-[var(--text)]" strokeWidth={1.9} />
            ) : (
              <PanelLeftClose className="w-4 h-4 text-[var(--text)]" strokeWidth={1.9} />
            )}
            <h2 className="text-sm font-bold text-[var(--text)]">Navigation</h2>
          </div>

          {/* Nav style — classic sidebar vs macOS-style dock */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">Style</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode("sidebar")}
                className={cn(
                  "flex items-center justify-center gap-2 h-10 rounded-lg border text-sm font-medium transition-colors",
                  mode === "sidebar" ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]" : "bg-[var(--surface-2)] text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)]"
                )}
              >
                <PanelLeft className="w-4 h-4" strokeWidth={1.9} /> Sidebar
              </button>
              <button
                onClick={() => setMode("dock")}
                className={cn(
                  "flex items-center justify-center gap-2 h-10 rounded-lg border text-sm font-medium transition-colors",
                  mode === "dock" ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]" : "bg-[var(--surface-2)] text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)]"
                )}
              >
                <PanelBottom className="w-4 h-4" strokeWidth={1.9} /> Dock
              </button>
            </div>
            <p className="text-[11px] text-[var(--faint)]">The dock is a floating macOS-style bar (desktop only). Mobile always uses the bottom bar.</p>
          </div>

          {mode === "sidebar" && (
            <div className="mt-4 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-4">
              <div>
                <p className="text-sm font-medium text-[var(--text)]">Sidebar</p>
                <p className="text-xs text-[var(--muted)] mt-1">{collapsed ? "Collapsed" : "Expanded"}</p>
              </div>
              <button
                onClick={toggle}
                className="flex items-center justify-center gap-2 h-9 px-3 rounded-lg bg-[var(--text)] text-[var(--bg)] text-sm font-medium hover:bg-[var(--text-hover)] transition-colors"
              >
                {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                {collapsed ? "Expand" : "Collapse"}
              </button>
            </div>
          )}
        </section>

        <SourceManager prefs={newsPrefs} setPrefs={setNewsPrefs} />
        <ChatModelManager settings={chatSettings} setSettings={setChatSettings} />
        <NavigationManager prefs={navPrefs} setPrefs={setNavPrefs} />
      </div>
    </div>
  );
}
