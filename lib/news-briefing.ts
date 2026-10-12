import { apiFetch, hasCustomApiTransport } from "@/lib/api-client";
import {
  hasSavedKey,
  normalizeAiSettings,
  type AiSettings,
} from "@/lib/ai-settings";
import { decryptSecret, sessionSecret } from "@/lib/vault";
export type BriefingState = {
  loading: boolean;
  summary?: string;
  generatedAt?: string;
  error?: string;
};
export async function loadNewsBriefing(
  input: AiSettings,
  signal?: AbortSignal,
): Promise<BriefingState> {
  const settings = normalizeAiSettings(input);
  if (!settings.briefingEnabled)
    return { loading: false, error: "News briefing is disabled in Settings." };
  try {
    let apiKey: string | undefined;
    if (hasSavedKey(settings)) {
      const password = sessionSecret();
      if (!password)
        return {
          loading: false,
          error:
            "Your briefing key is locked. Unlock it in Settings → News briefing.",
        };
      apiKey =
        (await decryptSecret(
          settings.keyCipher!,
          settings.keySalt!,
          password,
        )) ?? undefined;
      if (!apiKey)
        return {
          loading: false,
          error:
            "The briefing key could not be unlocked. Check your password in Settings.",
        };
    } else if (hasCustomApiTransport())
      return {
        loading: false,
        error:
          "Add your provider key in Settings → News briefing to generate a summary.",
      };
    const response = await apiFetch("/api/news/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: settings.model, apiKey }),
      signal,
    });
    const value = await response.json();
    return value.ok
      ? {
          loading: false,
          summary: value.summary,
          generatedAt: value.generatedAt,
        }
      : {
          loading: false,
          error: value.error || "The briefing could not refresh.",
        };
  } catch (e) {
    return {
      loading: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
