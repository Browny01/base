import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Cloud, Loader2, Moon, Sun, Monitor } from "lucide-react";
import { useBase } from "@/lib/hooks";
import { BaseImage } from "@/lib/image";
import { ProfileEditor } from "@/components/profile-editor";
import { NewsPreferences, NavigationManager } from "@/components/settings-page";
import { useTheme } from "@/lib/theme-context";
import { useAccent, ACCENTS } from "@/lib/accent-context";
import { useNavMode } from "@/lib/nav-mode-context";
import { detectTimeZone, offsetMinutes } from "@/lib/profile";
import { DEFAULT_NAV_PREFS } from "@/lib/nav-config";
import { readStored, writeStored } from "@/lib/prefs";
import { isTauri } from "./native";
import { WorkspaceSettings } from "./workspace-settings";
import { currentWorkspace, persistEdit, flushLocalWrites } from "./store";
const steps = ["Workspace", "Your profile", "Appearance", "Navigation", "News & integrations"];
const descriptions = ["Choose a home for your data.", "A workspace that feels like yours.", "Find your comfortable view.", "Keep what matters within reach.", "Choose what you want to follow."];
export function Onboarding() {
  const { data, mutate } = useBase(), { preference, setTheme } = useTheme(), { accent, setAccent } = useAccent(), { mode, setMode } = useNavMode();
  const [step, setStep] = useState(() => { const saved = Number(readStored("base_onboarding_step:" + currentWorkspace()?.scope)); return Math.max(isTauri() ? 0 : 1, Math.min(steps.length - 1, Number.isInteger(saved) ? saved : 0)); }), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [profile, setProfile] = useState(() => { const timezone = data.profile.timezone === "UTC" ? detectTimeZone() : data.profile.timezone; return { ...data.profile, timezone, timezoneOffsetMinutes: offsetMinutes(timezone) }; });
  const heading = useRef<HTMLHeadingElement>(null), panel = useRef<HTMLDivElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); panel.current?.scrollTo(0, 0); }, [step]);
  async function next() {
    setBusy(true); setError("");
    try {
      if (step === 0 && !currentWorkspace()?.origin) throw new Error("Start and open your local workspace, connect to a service, or sign in to Base Cloud first.");
      if (step === 1) {
        if (!profile.name.trim()) throw new Error("Tell us your name to continue.");
        await persistEdit(d => ({ ...d, profile: { ...d.profile, name: profile.name.trim(), avatarUrl: profile.avatarUrl, timezone: profile.timezone, timezoneOffsetMinutes: profile.timezoneOffsetMinutes } }));
      }
      await flushLocalWrites();
      if (step === steps.length - 1) await persistEdit(d => ({ ...d, profile: { ...d.profile, onboardedAt: new Date().toISOString() } }));
      else { writeStored("base_onboarding_step:" + currentWorkspace()?.scope, String(step + 1)); setStep(s => s + 1); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return <div className="base-onboarding"><header className="base-setup-header"><div className="base-setup-brand"><BaseImage src="/base-icon-rounded.png" width={28} height={28} alt="" /> Base</div><span>Make room for your day.</span></header>
    <div className="base-setup-layout"><aside><p className="base-setup-kicker">A LITTLE CLARITY STARTS HERE</p><h1>Make Base<br />your own.</h1><ol>{steps.map((label, i) => <li key={label} aria-current={i === step ? "step" : undefined}><span>{i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>{label}</li>)}</ol><p className="base-setup-footnote">You can change these preferences anytime in Settings.</p></aside>
      <section className="base-setup-panel"><div className="base-setup-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>{steps.map((label, i) => <span key={label} data-active={i <= step} />)}</div>
        <div ref={panel} className="base-setup-scroll"><div className="base-setup-page" key={step}><p className="base-setup-kicker">STEP {step + 1} OF {steps.length}</p><h2 ref={heading} tabIndex={-1}>{steps[step]}</h2><p className="base-setup-description">{descriptions[step]}</p>
          {step === 0 && (isTauri() ? <WorkspaceSettings setupOnly /> : <p><Cloud className="h-5 w-5" /> Your browser uses your signed-in Cloud workspace. Local service hosting is available in the desktop app.</p>)}
          {step === 1 && <ProfileEditor value={profile} onChange={setProfile} />}
          {step === 2 && <div className="base-setup-preferences"><h3>Appearance</h3><div className="base-setup-choices">{([{ id: "light", label: "Light", icon: Sun }, { id: "dark", label: "Dark", icon: Moon }, { id: "system", label: "System", icon: Monitor }] as const).map(choice => <button key={choice.id} aria-pressed={preference === choice.id} onClick={() => setTheme(choice.id)}><choice.icon className="h-6 w-6" /><strong>{choice.label}</strong><span>{choice.id === "system" ? "Follow your device" : choice.id === "light" ? "A bright, clear canvas" : "A quieter evening view"}</span></button>)}</div><h3>Accent colour</h3><div className="base-setup-accents">{ACCENTS.map(choice => <button key={choice.key} aria-label={choice.label} aria-pressed={accent === choice.value} style={{ background: choice.value }} onClick={() => setAccent(choice.value)}>{accent === choice.value && <Check className="h-4 w-4" />}</button>)}</div></div>}
          {step === 3 && <><div className="base-setup-choices base-setup-nav-choice">{(["sidebar", "dock"] as const).map(choice => <button key={choice} aria-pressed={mode === choice} onClick={() => setMode(choice)}><strong>{choice === "sidebar" ? "Sidebar" : "Desktop dock"}</strong><span>{choice === "sidebar" ? "A clear view of all your pages" : "A compact row of essentials"}</span></button>)}</div><NavigationManager prefs={data.navPrefs ?? DEFAULT_NAV_PREFS} setPrefs={navPrefs => mutate(d => ({ ...d, navPrefs }))} /></>}
          {step === 4 && <><p className="mb-5 text-sm text-[var(--muted)]">Integrations are optional. Add keys now, or come back when you need them.</p><NewsPreferences /></>}
        </div></div>
        <footer className="base-setup-actions">{error && <p role="alert">{error}</p>}<div><button disabled={busy || step === (isTauri() ? 0 : 1)} className="base-button base-button-secondary" onClick={() => { setError(""); setStep(s => s - 1); }}><ArrowLeft className="h-4 w-4" /> Back</button><button disabled={busy} className="base-button base-button-primary" onClick={() => void next()}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{step === steps.length - 1 ? "Open my workspace" : "Continue"}<ArrowRight className="h-4 w-4" /></button></div></footer>
      </section>
    </div>
  </div>;
}
