"use client";
import { useEffect, useState } from "react";
import { KeyRound, Check, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { apiFetch, hasCustomApiTransport } from "@/lib/api-client";
import { INTEGRATION_PROVIDERS } from "@/packages/core/src/providers";
import { useToast } from "@/lib/toast-context";
export type CredentialActions = {
  status: () => Promise<{ providers: { id: string; configured: boolean }[] }>;
  save: (provider: string, key: string | null) => Promise<void>;
};
let actions: CredentialActions | null = null;
export function installCredentialActions(next: CredentialActions) {
  actions = next;
}
const remote: CredentialActions = {
  async status() {
    const r = await apiFetch("/api/workspace/credentials");
    const v = await r.json();
    if (!r.ok)
      throw new Error(
        v.error || "Connect a workspace to manage integration keys.",
      );
    return v;
  },
  async save(provider, key) {
    const r = await apiFetch("/api/workspace/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, key }),
    });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error || "Could not save the key");
  },
};
export function IntegrationSettings() {
  const supported = actions !== null || hasCustomApiTransport();
  const [configured, setConfigured] = useState<string[]>([]),
    [drafts, setDrafts] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const { toast } = useToast();
  const refresh = async () => {
    const value = await (actions ?? remote).status();
    setConfigured(value.providers.filter((p) => p.configured).map((p) => p.id));
  };
  useEffect(() => {
    if (!supported) return;
    let active = true;
    void (actions ?? remote)
      .status()
      .then((v) => {
        if (active)
          setConfigured(
            v.providers.filter((p) => p.configured).map((p) => p.id),
          );
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [supported]);
  const save = async (provider: string, key: string | null) => {
    setBusy(provider);
    setError("");
    try {
      await (actions ?? remote).save(provider, key);
      setDrafts((d) => ({ ...d, [provider]: "" }));
      await refresh();
      toast(key ? "Integration key saved securely." : "Integration disconnected.");
      window.dispatchEvent(new Event("base:integrations-changed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };
  if (!supported) return (
    <section className="base-settings-card">
      <h2>Your integrations</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Manage personal integration keys in the installed Base app or Base Cloud.
        This legacy website keeps its existing server integrations.
      </p>
    </section>
  );
  return (
    <section className="base-settings-card">
      <div className="base-settings-card-heading">
        <KeyRound className="h-5 w-5" />
        <div>
          <h2>Your integrations</h2>
          <p>
            Connect your own accounts. Keys stay outside your synced notes and
            records.
          </p>
        </div>
      </div>
      <div className="base-provider-list">
        {INTEGRATION_PROVIDERS.map((provider) => (
          <form
            key={provider.id}
            className="base-provider-row"
            onSubmit={(e) => {
              e.preventDefault();
              void save(provider.id, drafts[provider.id]);
            }}
          >
            <div>
              <div className="flex items-center gap-2">
                <h3>{provider.name}</h3>
                {configured.includes(provider.id) && (
                  <span className="base-connected-label">
                    <Check className="h-3 w-3" />
                    Key saved
                  </span>
                )}
              </div>
              <p>{provider.description}</p>
              <a
                href={provider.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs"
              >
                Get a key
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="base-provider-controls">
              <label className="sr-only" htmlFor={`key-${provider.id}`}>
                {provider.name} {provider.keyLabel}
              </label>
              <input
                id={`key-${provider.id}`}
                type="password"
                autoComplete="off"
                value={drafts[provider.id] ?? ""}
                placeholder={
                  configured.includes(provider.id)
                    ? "Replace key"
                    : provider.keyLabel
                }
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [provider.id]: e.target.value }))
                }
              />
              <button
                className="base-button base-button-secondary"
                disabled={!!busy || !drafts[provider.id]?.trim()}
              >
                {busy === provider.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save"
                )}
              </button>
              {configured.includes(provider.id) && (
                <button
                  type="button"
                  className="base-icon-button"
                  aria-label={`Disconnect ${provider.name}`}
                  disabled={!!busy}
                  onClick={() => void save(provider.id, null)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </form>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--c-rose)]">
          {error}
        </p>
      )}
      <p className="mt-4 text-xs text-[var(--muted)]">
        YouTube, Reddit and market feeds do not require a key. AI briefing keys
        are managed below. Google Calendar and other calendar connections will
        be added separately.
      </p>
    </section>
  );
}
