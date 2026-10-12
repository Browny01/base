import { useEffect, useRef, useState } from "react";
import { Cloud, ArrowUpRight, RefreshCw } from "lucide-react";
import { mountBrowserSignIn } from "./browser-native";
import {
  completeCloudSignIn,
  currentWorkspace,
  sync,
  useWorkspaceScope,
} from "./store";
import { request, native } from "./native";
import { useConfirm } from "@/lib/confirm-context";
type Details = {
  account?: { email: string };
  plan: string;
  storageBytes: number;
  storageLimit: number;
  devices: { id: string; enabled: number; label: string }[];
};
export function BrowserAccountSettings() {
  const scope = useWorkspaceScope(),
    workspace = currentWorkspace();
  const confirm = useConfirm();
  const root = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false),
    [signedIn, setSignedIn] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [detailResult, setDetails] = useState<{scope:string;value:Details|null} | null>(null);
  const details = detailResult?.scope === scope ? detailResult.value : null;
  useEffect(() => {
    const show = () => setShow(true);
    window.addEventListener("base:browser-sign-in", show);
    return () => window.removeEventListener("base:browser-sign-in", show);
  }, []);
  useEffect(() => {
    let active = true;
    if (show && root.current)
      void mountBrowserSignIn(root.current)
        .then((v) => {
          if (active) setSignedIn(v);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [show]);
  useEffect(() => {
    let active = true;
    if (workspace?.origin)
      void request(scope, "/api/workspace")
        .then((r) => (r.ok ? r.json() : null))
        .then((v) => {
          if (active) setDetails({scope,value:v});
        });
    return () => {
      active = false;
    };
  }, [scope, workspace?.origin]);
  async function connect() {
    setBusy(true);
    setError("");
    try {
      if (
        await confirm({
          message:
            "Connect a separate cloud workspace? Your current browser records and offline edits remain saved here. Nothing is merged or deleted.",
          confirmLabel: "Keep separate & connect",
        })
      ) {
        await completeCloudSignIn();
        await sync();
        setShow(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function billing(path: string) {
    setBusy(true);
    setError("");
    try {
      const r = await request(scope, path, { method: "POST" });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      const url = new URL(v.url);
      if (
        url.protocol !== "https:" ||
        !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)
      )
        throw new Error("Unexpected billing link");
      await native("open_external", { url: v.url });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="base-workspace-settings">
      <div className="base-workspace-panel">
        <div className="base-workspace-heading">
          <div>
            <h3 className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Base Cloud on the web
            </h3>
            <p>
              Use the same account and workspace as your desktop. Offline edits
              stay in this browser.
            </p>
          </div>
          <span className="base-workspace-status">
            {workspace?.origin ? "Connected" : "Local browser"}
          </span>
        </div>
        {details && (
          <div className="my-4">
            <p className="text-sm font-medium">{details.account?.email}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {details.plan === "plus" ? "Base Cloud Plus" : "Base Cloud Free"}{" "}
              · {(details.storageBytes / 1000000).toFixed(1)} MB used ·{" "}
              {details.devices.filter((d) => d.enabled).length} devices
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                disabled={busy}
                className="base-button base-button-secondary"
                onClick={() => void billing(details.plan === "plus" ? "/api/billing/portal" : "/api/billing/checkout")}
              >
                {details.plan === "plus"
                  ? "Manage billing"
                  : "Upgrade to Plus · $3.99/month"}
              </button>
              <button
                disabled={busy}
                className="base-button base-button-secondary"
                onClick={() => void sync()}
              >
                <RefreshCw className="h-4 w-4" />
                Sync now
              </button>
            </div>
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <button
            className="base-button base-button-primary"
            disabled={busy}
            onClick={() => {
              setError("");
              setShow(true);
            }}
          >
            Sign in / switch account
            <ArrowUpRight className="h-4 w-4" />
          </button>
          {show && signedIn && (
            <button
              disabled={busy}
              className="base-button base-button-secondary"
              onClick={() => void connect()}
            >
              Connect this account
            </button>
          )}
        </div>
        {show && <div ref={root} className="mt-5" />}
        {error && (
          <p role="alert" className="mt-3 text-sm text-[var(--c-rose)]">
            {error}
          </p>
        )}
        <p className="mt-4 text-xs text-[var(--muted)]">
          Free includes 250 MB and two devices. Plus includes 10 GB and
          unlimited devices. To host a local service, use the installed Mac or
          Linux app.
        </p>
      </div>
    </div>
  );
}
