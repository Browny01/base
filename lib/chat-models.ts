// Model catalog for the Chat page. `provider` decides which backend the API
// route calls. Gemini runs on Google's free tier; Claude and Perplexity need
// their respective API keys before they can respond.

export type ChatProvider = "gemini" | "anthropic" | "openai" | "perplexity" | "ollama" | "bridge";
export type PerplexityTool = "web_search" | "fetch_url" | "finance_search";

// Local providers stream straight from the browser to a server on the user's own
// machine (Vercel can't reach localhost). Model ids are prefixed so we can route.
export const OLLAMA_PREFIX = "ollama:";
export const BRIDGE_PREFIX = "bridge:";
export const localProviderOf = (id: string): "ollama" | "bridge" | null =>
  id.startsWith(OLLAMA_PREFIX) ? "ollama" : id.startsWith(BRIDGE_PREFIX) ? "bridge" : null;

// Sentinel that separates the reply text from a JSON array of source URLs in the
// streamed body. Kept out of any normal text (null byte).
export const SOURCES_SENTINEL = "<<<SOURCES_JSON>>>";

export interface ChatModel {
  id: string;
  label: string;
  provider: ChatProvider;
  enabled: boolean;   // default UI state before user settings are applied
  note?: string;
}

export interface ChatSettings {
  enabledModelIds: string[];
  hiddenModelIds?: string[]; // lets existing users hide newly added provider models
  perplexityTools: PerplexityTool[];
  ollamaUrl?: string;   // e.g. http://localhost:11434
  bridgeUrl?: string;   // local Codex / Claude-Code bridge, e.g. https://host.ts.net:8443
  bridgeToken?: string; // bearer token the bridge requires
  localWebSearch?: boolean; // give local models web access via Perplexity (/api/websearch)
  chatMemory?: string;      // persistent facts the AI remembers across every chat
}

export const CHAT_MODELS: ChatModel[] = [
  { id: "gemini-2.5-flash",      label: "Gemini 2.5 Flash",      provider: "gemini",    enabled: true,  note: "Free · fast" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", provider: "gemini",    enabled: true,  note: "Free · fastest" },
  { id: "gemini-2.5-pro",        label: "Gemini 2.5 Pro",        provider: "gemini",    enabled: true,  note: "Free tier · smartest" },
  { id: "gemini-2.0-flash",      label: "Gemini 2.0 Flash",      provider: "gemini",    enabled: true,  note: "Free" },
  { id: "perplexity/sonar",      label: "Sonar",                 provider: "perplexity", enabled: true, note: "Web search · $0.25/M" },
  { id: "openai/gpt-5.4-nano",   label: "GPT-5.4 Nano",          provider: "perplexity", enabled: true, note: "Cheapest · $0.20/M" },
  { id: "openai/gpt-5-mini",     label: "GPT-5 Mini",            provider: "perplexity", enabled: true, note: "Fast + cheap · $0.25/M" },
  { id: "openai/gpt-5.4-mini",   label: "GPT-5.4 Mini",          provider: "perplexity", enabled: true, note: "Fast + capable · $0.75/M" },
  { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", provider: "perplexity", enabled: true, note: "Fast + cheap · $0.25/M" },
  { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash", provider: "perplexity", enabled: true, note: "Low-cost · $0.50/M" },
  { id: "xai/grok-4.3",          label: "Grok 4.3",              provider: "perplexity", enabled: true, note: "Powerful + cheap · $1.25/M" },
  { id: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5 (Perplexity)", provider: "perplexity", enabled: true, note: "Fast + strong · $1/M" },
  { id: "claude-sonnet-4-6",     label: "Claude Sonnet 4.6",     provider: "anthropic", enabled: true, note: "Anthropic API key" },
  { id: "claude-opus-4-8",       label: "Claude Opus 4.8",       provider: "anthropic", enabled: true, note: "Anthropic API key" },
  { id: "claude-haiku-4-5",      label: "Claude Haiku 4.5",      provider: "anthropic", enabled: true, note: "Anthropic API key" },
  { id: "gpt-5.4",               label: "GPT-5.4",               provider: "openai",    enabled: true, note: "OpenAI API key" },
  { id: "gpt-5.4-mini",          label: "GPT-5.4 Mini",          provider: "openai",    enabled: true, note: "OpenAI API key" },
  { id: "gpt-5-mini",            label: "GPT-5 Mini",            provider: "openai",    enabled: true, note: "OpenAI API key" },
  { id: "gpt-5.4-nano",          label: "GPT-5.4 Nano",          provider: "openai",    enabled: true, note: "OpenAI API key" },
];

export const DEFAULT_MODEL = "gemini-2.5-flash";
export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  enabledModelIds: CHAT_MODELS.filter((m) => m.enabled).map((m) => m.id),
  perplexityTools: ["web_search", "fetch_url", "finance_search"],
  ollamaUrl: "https://lucas.tail97e0a8.ts.net:8443/ollama",
  bridgeUrl: "",
  bridgeToken: "",
  localWebSearch: true,
};

export const providerOf = (id: string): ChatProvider => {
  const local = localProviderOf(id);
  if (local) return local;
  return CHAT_MODELS.find((m) => m.id === id)?.provider
    ?? (id.startsWith("claude") ? "anthropic" : id.startsWith("gpt-") ? "openai" : id.includes("/") ? "perplexity" : "gemini");
};

export const modelLabel = (id: string): string =>
  CHAT_MODELS.find((m) => m.id === id)?.label
    ?? id.replace(OLLAMA_PREFIX, "").replace(BRIDGE_PREFIX, "");

export const configuredChatModels = (settings?: Partial<ChatSettings>): ChatModel[] => {
  const enabled = new Set(settings?.enabledModelIds ?? DEFAULT_CHAT_SETTINGS.enabledModelIds);
  // Existing installations have a saved enabledModelIds list from before these
  // providers existed. Make the new catalog visible without overriding an
  // explicit hide choice made later in Settings.
  const hidden = new Set(settings?.hiddenModelIds ?? []);
  CHAT_MODELS.filter((model) => model.provider === "anthropic" || model.provider === "openai")
    .forEach((model) => { if (hidden.has(model.id)) enabled.delete(model.id); else enabled.add(model.id); });
  return CHAT_MODELS.map((model) => ({ ...model, enabled: enabled.has(model.id) }));
};
