import { useEffect, useState } from "react";
import { ArrowUpRight, Cloud, Laptop, RefreshCw } from "lucide-react";
import { useConfirm } from "@/lib/confirm-context";
import { currentWorkspace, sync, useWorkspaceScope } from "./store";
import { native, request } from "./native";
type Details = { account?: { email: string; display_name: string }; plan: string; storageBytes: number; storageLimit: number; devices: { id: string; enabled: number; label: string }[] };
export function BrowserAccountSettings() {
  const scope = useWorkspaceScope(), workspace = currentWorkspace(), confirm = useConfirm();
  const [result, setResult] = useState<{ scope: string; value: Details } | null>(null), [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const details = result?.scope === scope ? result.value : null;
  useEffect(() => {
    let active = true;
    void request(scope, "/api/workspace").then(async r => { const value = await r.json(); if (!r.ok) throw new Error(value.error); if (active) setResult({ scope, value }); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [scope, refresh]);
  async function action(work: () => Promise<void>) {
    setBusy(true); setError("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  async function billing(path: string) {
    const r = await request(scope, path, { method: "POST" }), value = await r.json();
    if (!r.ok) throw new Error(value.error);
    const url = new URL(value.url);
    if (url.protocol !== "https:" || !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)) throw new Error("Unexpected billing link");
    await native("open_external", { url: value.url });
  }
  return <div className="base-workspace-settings"><div className="base-workspace-panel">
    <div className="base-workspace-heading"><div><h3 className="flex items-center gap-2"><Cloud className="h-5 w-5" /> Base Cloud</h3><p>{details?.account?.email || "Your workspace is connected."}</p></div><span className="base-workspace-status">Connected</span></div>
    {details && <><div className="base-browser-plan"><strong>{details.plan === "plus" ? "Base Cloud Plus" : "Base Cloud Free"}</strong><span>{(details.storageBytes / 1000000).toFixed(1)} MB of {details.storageLimit >= 1e9 ? "10 GB" : "250 MB"} used</span><progress aria-label="Cloud storage used" value={details.storageBytes} max={details.storageLimit} /></div>
      <div className="flex flex-wrap gap-2 mt-4"><button className="base-button base-button-secondary" disabled={busy} onClick={() => void action(() => billing(details.plan === "plus" ? "/api/billing/portal" : "/api/billing/checkout"))}>{details.plan === "plus" ? "Manage billing" : "Upgrade to Plus · $3.99/month"}</button><button className="base-button base-button-secondary" disabled={busy} onClick={() => void action(async () => { await sync(); setRefresh(n => n + 1); })}><RefreshCw className="h-4 w-4" /> Refresh account</button></div>
      <div className="base-browser-devices"><h4>Connected devices</h4>{details.devices.filter(device => device.enabled).map(device => <div key={device.id}><Laptop className="h-4 w-4" /><span>{device.label || "Base device"}</span><button disabled={busy} onClick={() => void action(async () => {
        if (!await confirm({ message: "Disconnect this device? Its cached data and offline edits remain on that device.", confirmLabel: "Disconnect device" })) return;
        const r = await request(scope, "/api/devices/revoke", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: device.id }) });
        if (!r.ok) throw new Error("This device could not be disconnected.");
        setRefresh(n => n + 1); window.dispatchEvent(new Event("focus"));
      })}>Disconnect</button></div>)}</div></>}
    <button className="base-button base-button-secondary mt-4" onClick={() => void action(async () => { await native("open_external", { url: (workspace?.origin || location.origin) + "/account" }); })}>Manage account <ArrowUpRight className="h-4 w-4" /></button>
    {error && <p role="alert" className="mt-3 text-sm text-[var(--c-rose)]">{error}</p>}
  </div></div>;
}
