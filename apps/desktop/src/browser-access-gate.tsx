import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Loader2, ShieldCheck } from "lucide-react";
import { BaseImage } from "@/lib/image";
import { browserAccess, mountBrowserAuth } from "./browser-native";
import { completeCloudSignIn, sync, useWorkspaceScope } from "./store";
export function BrowserAccessGate({ children }: { children: ReactNode }) {
  const scope = useWorkspaceScope(), root = useRef<HTMLDivElement>(null), connecting = useRef(false);
  const [signedIn, setSignedIn] = useState(false);
  const [access, setAccess] = useState<"checking" | "login" | "allowed">("checking"), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const check = () => { void browserAccess().then(allowed => { if (active) setAccess(allowed ? "allowed" : "login"); }).catch(e => { if (active) { setError(e.message); setAccess("login"); } }); };
    check(); window.addEventListener("online", check); window.addEventListener("focus", check);
    return () => { active = false; window.removeEventListener("online", check); window.removeEventListener("focus", check); };
  }, [scope, attempt]);
  useEffect(() => {
    if (access !== "login" || !root.current) return;
    let active = true, cleanup: (() => void) | undefined;
    void mountBrowserAuth(root.current, () => { if (active) setSignedIn(true); }).then(dispose => { if (active) cleanup = dispose; else dispose(); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; cleanup?.(); };
  }, [access, attempt]);
  async function connect() {
    if (connecting.current) return;
    connecting.current = true; setError("");
    try { await completeCloudSignIn(); setAccess("allowed"); await sync(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { connecting.current = false; }
  }
  if (access === "allowed") return children;
  return <div className="base-auth-screen"><a className="base-auth-brand" href={location.origin + "/"}><BaseImage src="/base-icon-rounded.png" width={28} height={28} alt="" /> Base</a>
    <main className="base-auth-layout"><div className="base-auth-intro"><p className="base-setup-kicker">YOUR PERSONAL COMMAND CENTER</p><h1>A familiar place.<br />Wherever you are.</h1><p>Sign in to your Base workspace. Your tasks, notes and plans stay together across your devices.</p><div className="base-auth-trust"><ShieldCheck className="h-4 w-4" /> Your cached records and offline edits stay separate and safe.</div><a href={location.origin + "/#desktop"}>Prefer a local workspace? Use Base for Mac or Linux <ArrowUpRight className="h-4 w-4" /></a></div>
      <section className="base-auth-card"><h2>Welcome to Base</h2><p>Sign in or create your account to continue.</p>
        {access === "checking" ? <div role="status" className="base-auth-loading"><Loader2 className="h-5 w-5 animate-spin" /> Checking your workspace…</div> : <div ref={root} className="base-clerk-root" />}
        {access === "login" && signedIn && <div className="base-auth-continue"><p>You’re signed in. Open your Cloud workspace to continue.</p><button className="base-button base-button-primary" onClick={() => void connect()}>Continue to my workspace <ArrowUpRight className="h-4 w-4" /></button></div>}
        {error && <div role="alert" className="base-auth-error"><p>{error}</p><button className="base-button base-button-secondary mt-3" onClick={() => { setError(""); setAttempt(n => n + 1); }}>Try again</button></div>}
      </section>
    </main>
  </div>;
}
