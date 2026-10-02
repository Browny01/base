// The news briefing is the only AI feature in Base. Users pick a provider and
// model, and optionally their own API key — the key is encrypted in the browser
// (see lib/vault.ts) and only ever handed back to our own server for the length
// of a single briefing request. Nothing here is chat-specific.

export type AiProvider = "gemini" | "anthropic" | "openai" | "perplexity";

export interface AiModel {
  id: string;
  label: string;
  provider: AiProvider;
  note?: string;
}

export interface ProviderInfo {
  value: AiProvider;
  label: string;
  blurb: string;
  keyHint: string;      // where to create a key
  envKeys: string[];    // server-side fallbacks when the user saved no key
  defaultModel: string;
}

export const PROVIDER_INFO: ProviderInfo[] = [
  {
    value: "gemini",
    label: "Google Gemini",
    blurb: "Fast and cheap. Has a free tier for smaller models.",
    keyHint: "aistudio.google.com/apikey",
    envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    defaultModel: "gemini-3.1-flash-lite",
  },
  {
    value: "openai",
    label: "OpenAI",
    blurb: "GPT models. Strong reasoning, pay per token.",
    keyHint: "platform.openai.com/api-keys",
    envKeys: ["OPENAI_API_KEY"],
    defaultModel: "gpt-5.4-mini",
  },
  {
    value: "anthropic",
    label: "Anthropic",
    blurb: "Claude models. Careful, factual long-form summaries.",
    keyHint: "console.anthropic.com/settings/keys",
    envKeys: ["ANTHROPIC_API_KEY"],
    defaultModel: "claude-haiku-4-5",
  },
  {
    value: "perplexity",
    label: "Perplexity",
    blurb: "Search-grounded answers that cite live sources.",
    keyHint: "perplexity.ai/settings/api",
    envKeys: ["PERPLEXITY_API_KEY"],
    defaultModel: "sonar",
  },
];

export const PROVIDER_BY_VALUE = new Map(PROVIDER_INFO.map((p) => [p.value, p]));

export const BRIEFING_MODELS: AiModel[] = [
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", provider: "gemini", note: "Free tier · fast" },
  { id: "gemini-3.1-flash",      label: "Gemini 3.1 Flash",      provider: "gemini", note: "Free tier" },
  { id: "gemini-3.1-pro",        label: "Gemini 3.1 Pro",        provider: "gemini", note: "Free tier · thorough" },
  { id: "gpt-5.4-mini",          label: "GPT-5.4 Mini",          provider: "openai",   note: "Fast + capable" },
  { id: "gpt-5.4",               label: "GPT-5.4",               provider: "openai",   note: "Most capable" },
  { id: "gpt-5-mini",            label: "GPT-5 Mini",            provider: "openai",   note: "Cheapest" },
  { id: "claude-haiku-4-5",      label: "Claude Haiku 4.5",      provider: "anthropic", note: "Fast + strong" },
  { id: "claude-sonnet-4-6",     label: "Claude Sonnet 4.6",     provider: "anthropic", note: "Most capable" },
  { id: "sonar",                 label: "Sonar",                 provider: "perplexity", note: "Web search · $0.25/M" },
];

export const DEFAULT_BRIEFING_MODEL = "gemini-3.1-flash-lite";

export function modelsForProvider(provider: AiProvider): AiModel[] {
  const models = BRIEFING_MODELS.filter((m) => m.provider === provider);
  return models.length ? models : [BRIEFING_MODELS[0]];
}

export function providerOfModel(model: string): AiProvider {
  const hit = BRIEFING_MODELS.find((m) => m.id === model);
  if (hit) return hit.provider;
  // Ids we don't know about still route sensibly by prefix.
  if (model.startsWith("gemini")) return "gemini";
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gpt-")) return "openai";
  return "perplexity";
}

export function modelLabel(model: string): string {
  return BRIEFING_MODELS.find((m) => m.id === model)?.label ?? model;
}

export function providerLabel(provider: AiProvider): string {
  return PROVIDER_BY_VALUE.get(provider)?.label ?? provider;
}

// ── Saved settings ─────────────────────────────────────────────────────────────
// `keyCipher` is AES-GCM ciphertext produced in the browser, keyed by
// PBKDF2(password). The server can never read it: the password is only in the
// browser, so the key is decrypted there and passed per-request.
export interface SecretBlob {
  iv: string;   // base64
  data: string; // base64
}

export interface AiSettings {
  briefingEnabled: boolean;
  provider: AiProvider;
  model: string;
  keyCipher?: SecretBlob;
  keySalt?: string;         // base64
  keyIterations?: number;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  briefingEnabled: false,
  provider: "gemini",
  model: DEFAULT_BRIEFING_MODEL,
};

// A saved model that no longer exists for the chosen provider would break the
// request, so normalise on read (this runs on every mutation).
export function normalizeAiSettings(settings?: Partial<AiSettings>): AiSettings {
  const provider = settings?.provider && PROVIDER_BY_VALUE.has(settings.provider) ? settings.provider : "gemini";
  const model = modelsForProvider(provider).some((m) => m.id === settings?.model)
    ? settings!.model!
    : PROVIDER_BY_VALUE.get(provider)!.defaultModel;
  return {
    briefingEnabled: settings?.briefingEnabled ?? false,
    provider,
    model,
    keyCipher: settings?.keyCipher,
    keySalt: settings?.keySalt,
    keyIterations: settings?.keyIterations,
  };
}

export const hasSavedKey = (settings?: Partial<AiSettings>): boolean =>
  Boolean(settings?.keyCipher?.data && settings.keySalt);