"use client";

// First run: the wizard that turns a fresh install into someone's Base.
//
// It's a client component because the sensitive parts happen in the browser with
// Web Crypto: the login password is hashed here (the server stores a verifier it
// can't reverse) and an AI provider key is encrypted here (AES-GCM, keyed off
// that same password).

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { useBase } from "@/lib/hooks";
import { DEFAULT_AI_SETTINGS, PROVIDER_INFO, modelsForProvider, type AiProvider, type AiSettings } from "@/lib/ai-settings";
import { detectTimeZone, initialOf, needsOnboarding, offsetMinutes, timeZoneOptions } from "@/lib/profile";
import { ALL_PAGES, DEFAULT_NAV_PREFS } from "@/lib/nav-config";
import { encryptSecret, makePasswordVerifier, serializeVerifier, setSessionSecret } from "@/lib/vault";
import { cn } from "@/lib/utils";

interface SetupStatus {
  passwordMode: "env" | "saved" | "none";
  canSetPassword: boolean;
}

const STEPS = ["Welcome", "About you", "Security", "Pages", "News briefing"] as const;

export default function OnboardingPage() {
  const { data, mutate } = useBase();
  const router = useRouter();

  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [step, setStep] = useState(0);
  const [skipped, setSkipped] = useState(false);

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(() => detectTimeZone());

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordSkipped, setPasswordSkipped] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [hidden, setHidden] = useState<string[]>(() => data.navPrefs?.hiddenPages ?? DEFAULT_NAV_PREFS.hiddenPages);
  const [order, setOrder] = useState<string[]>(() =>
    data.navPrefs?.sidebarOrder?.length ? data.navPrefs.sidebarOrder : DEFAULT_NAV_PREFS.sidebarOrder,
  );

  const [briefing, setBriefing] = useState<AiSettings>({ ...DEFAULT_AI_SETTINGS });
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const onboarding = needsOnboarding(data.profile);

  useEffect(() => {
    // Someone who's already been through this doesn't need it again.
    if (!onboarding && data.profile?.onboardedAt) router.replace("/");
  }, [onboarding, data.profile?.onboardedAt, router]);

  // The only thing that needs to be fetched: whether this install already has a
  // password. Everything else comes from the store or the browser's own settings.
  useEffect(() => {
    let live = true;
    fetch("/api/setup")
      .then((r) => r.json())
      .then((j: SetupStatus) => { if (live) setStatus(j); })
      .catch(() => { if (live) setStatus({ passwordMode: "none", canSetPassword: false }); });
    return () => { live = false; };
  }, []);

  const models = useMemo(() => modelsForProvider(briefing.provider), [briefing.provider]);
  const zones = useMemo(() => timeZoneOptions(timezone), [timezone]);
  const lastStep = STEPS.length - 1;
  const isLast = step === lastStep;
  const canSetPassword = status?.canSetPassword ?? false;

  function selectZone(value: string) {
    setTimezone(value);
  }

  function skipEverything() {
    setSkipped(true);
    setPasswordSkipped(true);
    setBriefing({ ...DEFAULT_AI_SETTINGS, briefingEnabled: false });
    setStep(lastStep);
  }

  function validatePassword(): boolean {
    if (passwordSkipped) return true;
    if (password.length < 8) {
      setPasswordError("Use at least 8 characters.");
      return false;
    }
    if (password !== confirm) {
      setPasswordError("Those don't match.");
      return false;
    }
    setPasswordError(null);
    return true;
  }

  function next() {
    if (step === 2 && !validatePassword()) return;
    setStep((s) => Math.min(lastStep, s + 1));
  }

  async function finish() {
    setSaving(true);
    setSaveError(null);
    try {
      const profile = {
        name: name.trim(),
        timezone,
        timezoneOffsetMinutes: offsetMinutes(timezone),
        onboardedAt: new Date().toISOString(),
      };

      let ai: AiSettings = { ...briefing };
      const key = apiKey.trim();
      if (key) {
        if (!password) throw new Error("Set a password first so the API key can be encrypted.");
        const { cipher, salt, iterations } = await encryptSecret(key, password);
        ai = { ...ai, keyCipher: cipher, keySalt: salt, keyIterations: iterations };
      }

      mutate((d) => ({
        ...d,
        profile,
        aiSettings: ai,
        navPrefs: { ...d.navPrefs, hiddenPages: hidden, sidebarOrder: order },
      }));

      if (password) {
        const verifier = await makePasswordVerifier(password);
        const res = await fetch("/api/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: serializeVerifier(verifier) }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Couldn't save the password." }));
          // An install that already has a password isn't broken by this — they
          // simply sign in with it.
          if (res.status !== 409) throw new Error(body.error || "Couldn't save the password.");
        } else {
          setSessionSecret(password);
        }
      }

      router.replace("/");
      router.refresh();
    } catch (e) {
      setSaveError((e as Error)?.message || "Couldn't finish setup.");
      setSaving(false);
    }
  }

  if (status === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[var(--bg)] text-[var(--faint)]">
        <Loader2 className="h-5 w-5 animate-spin" />
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-[var(--bg)] px-5 py-10 text-[var(--text)]">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">Welcome to</p>
            <h1 className="text-2xl font-bold">Base</h1>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-[var(--faint)]">Step {step + 1} of {STEPS.length}</p>
            <p className="text-[11px] font-medium text-[var(--muted)]">{STEPS[step]}</p>
          </div>
        </div>

        <div className="mb-6 flex gap-1.5" aria-hidden>
          {STEPS.map((label, i) => (
            <span key={label} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-[var(--text)]" : "bg-[var(--border)]")} />
          ))}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          {step === 0 && (
            <section>
              <h2 className="text-lg font-bold">Let&apos;s set this up.</h2>
              <p className="mt-2 text-[13px] text-[var(--muted)]">
                Four quick things: who you are, a password, which pages you want in the nav, and whether the news
                briefing should use AI. Everything is stored with your data, and any of it can change later in Settings.
              </p>
              <button onClick={() => setStep(1)} className="mt-5 w-full rounded-lg bg-[var(--text)] py-2.5 text-sm font-semibold text-[var(--bg)] hover:bg-[var(--text-hover)]">
                Get started
              </button>
              <button onClick={skipEverything} className="mt-2 w-full rounded-lg py-2 text-[13px] text-[var(--muted)] hover:text-[var(--text)]">
                Skip for now
              </button>
            </section>
          )}

          {step === 1 && (
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">About you</h2>
                <p className="mt-1 text-[13px] text-[var(--muted)]">Your name greets you on the dashboard. Your timezone decides when &ldquo;today&rdquo; rolls over.</p>
              </div>
              <div>
                <label htmlFor="ob-name" className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">Name</label>
                <input
                  id="ob-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="A first name is enough"
                  autoComplete="given-name"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] placeholder-[var(--faint)] focus:border-[var(--border-2)] focus:outline-none"
                />
                {name.trim() && (
                  <p className="mt-1 flex items-center gap-2 text-[11px] text-[var(--faint)]">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] font-semibold">{initialOf({ name })}</span>
                    Your avatar in the top bar.
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="ob-tz" className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">Timezone</label>
                <select
                  id="ob-tz"
                  value={timezone}
                  onChange={(e) => selectZone(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] focus:border-[var(--border-2)] focus:outline-none"
                >
                  {zones.map((z) => (
                    <option key={z.value} value={z.value}>{z.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-[var(--faint)]">
                  Detected {timezone} · UTC{offsetMinutes(timezone) >= 0 ? "+" : ""}{Math.round(offsetMinutes(timezone) / 60)}
                </p>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">Security</h2>
                <p className="mt-1 text-[13px] text-[var(--muted)]">
                  Choose a password for this install. It&apos;s hashed in this browser, so the server only stores a
                  verifier it can&apos;t reverse — and Base can also encrypt your AI key with it.
                </p>
              </div>
              {!canSetPassword && (
                <p className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--muted)]">
                  This install already has a password
                  {status.passwordMode === "env" ? " from its environment" : " saved"}. Use it to sign in.
                </p>
              )}
              {canSetPassword && !passwordSkipped && (
                <>
                  <div className="relative">
                    <label htmlFor="ob-pw" className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">Password</label>
                    <input
                      id="ob-pw"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setPasswordError(null); }}
                      autoComplete="new-password"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 pr-10 text-[13px] focus:border-[var(--border-2)] focus:outline-none"
                    />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-2 top-[30px] text-[var(--faint)] hover:text-[var(--text)]">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div>
                    <label htmlFor="ob-pw2" className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">Confirm</label>
                    <input
                      id="ob-pw2"
                      type={showPassword ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => { setConfirm(e.target.value); setPasswordError(null); }}
                      autoComplete="new-password"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] focus:border-[var(--border-2)] focus:outline-none"
                    />
                  </div>
                  {passwordError && <p className="text-[12px] text-[var(--danger)]">{passwordError}</p>}
                  <button
                    onClick={() => setPasswordSkipped(true)}
                    className="text-[12px] text-[var(--muted)] underline underline-offset-2 hover:text-[var(--text)]"
                  >
                    Skip — I&apos;ll lock this down another way
                  </button>
                </>
              )}
              {passwordSkipped && (
                <p className="text-[12px] text-[var(--muted)]">
                  No password set. {canSetPassword ? "You can add one later from the login page's setup link." : "Sign in with the existing password as usual."}
                </p>
              )}
            </section>
          )}

          {step === 3 && (
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">Your pages</h2>
                <p className="mt-1 text-[13px] text-[var(--muted)]">Everything ships in the nav — switch off what you won&apos;t use, and drag the order you like.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {order.map((key, index) => {
                  const page = ALL_PAGES.find((p) => p.key === key);
                  if (!page) return null;
                  const on = !hidden.includes(key);
                  return (
                    <div key={key} className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2", on ? "border-[var(--border-2)] bg-[var(--surface-2)]" : "border-[var(--border)]")}>
                      <button
                        onClick={() => setHidden((h) => (on ? [...h, key] : h.filter((k) => k !== key)))}
                        aria-pressed={on}
                        aria-label={`${on ? "Hide" : "Show"} ${page.label}`}
                        className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", on ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]" : "border-[var(--border-2)]")}
                      >
                        {on && <Check className="h-3.5 w-3.5" />}
                      </button>
                      <span className={cn("min-w-0 flex-1 truncate text-[13px] font-medium", on ? "text-[var(--text)]" : "text-[var(--muted)]")}>{page.label}</span>
                      <span className="flex flex-col">
                        <button
                          onClick={() => setOrder((o) => { const next = [...o]; const [m] = next.splice(index, 1); next.splice(index - 1, 0, m); return next; })}
                          disabled={index === 0}
                          aria-label={`Move ${page.label} up`}
                          className="text-[var(--faint)] hover:text-[var(--text)] disabled:opacity-30"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setOrder((o) => { const next = [...o]; const [m] = next.splice(index, 1); next.splice(index + 1, 0, m); return next; })}
                          disabled={index === order.length - 1}
                          aria-label={`Move ${page.label} down`}
                          className="text-[var(--faint)] hover:text-[var(--text)] disabled:opacity-30"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {step === 4 && (
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">News briefing</h2>
                <p className="mt-1 text-[13px] text-[var(--muted)]">
                  Optional. It writes an hourly markets/tech briefing at the top of the News page from the same
                  headlines everyone else sees.
                </p>
              </div>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={briefing.briefingEnabled}
                  onChange={(e) => setBriefing({ ...briefing, briefingEnabled: e.target.checked })}
                  className="mt-1 h-4 w-4 accent-[var(--text)]"
                />
                <span className="text-[13px] font-medium">Generate a briefing on the News page</span>
              </label>
              {briefing.briefingEnabled && (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {PROVIDER_INFO.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => setBriefing({ ...briefing, provider: p.value as AiProvider, model: p.defaultModel })}
                        className={cn("rounded-lg border px-3 py-2 text-left text-[13px]", briefing.provider === p.value ? "border-[var(--border-2)] bg-[var(--surface-2)] font-semibold" : "border-[var(--border)]")}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <select
                    value={briefing.model}
                    onChange={(e) => setBriefing({ ...briefing, model: e.target.value })}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] focus:border-[var(--border-2)] focus:outline-none"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>{m.label} · {m.note}</option>
                    ))}
                  </select>
                  <div className="relative">
                    <label htmlFor="ob-key" className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">API key (optional)</label>
                    <input
                      id="ob-key"
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Leave blank to use the server's key"
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 pr-10 text-[13px] placeholder-[var(--faint)] focus:border-[var(--border-2)] focus:outline-none"
                    />
                    <button type="button" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? "Hide key" : "Show key"} className="absolute right-2 top-[30px] text-[var(--faint)] hover:text-[var(--text)]">
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--faint)]">
                    {password
                      ? "Encrypted in this browser with your password before it's saved, and only unlocked here."
                      : "Set a password on the Security step if you want the key encrypted at rest."}
                  </p>
                </>
              )}
            </section>
          )}

          {saveError && <p className="mt-4 text-[12px] text-[var(--danger)]">{saveError}</p>}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || saving}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
          >
            <ArrowLeft className="mr-1 inline h-3.5 w-3.5" /> Back
          </button>
          {isLast ? (
            <button
              onClick={finish}
              disabled={saving}
              className="rounded-lg bg-[var(--text)] px-4 py-2 text-[13px] font-semibold text-[var(--bg)] hover:bg-[var(--text-hover)] disabled:opacity-50"
            >
              {saving ? "Finishing…" : skipped ? "Skip setup" : "Finish setup"}
            </button>
          ) : (
            <button onClick={next} className="rounded-lg bg-[var(--text)] px-4 py-2 text-[13px] font-semibold text-[var(--bg)] hover:bg-[var(--text-hover)]">
              Continue <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </main>
  );
}