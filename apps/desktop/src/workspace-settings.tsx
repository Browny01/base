import { useEffect, useState, useRef } from "react";
import {
  Cloud,
  Server,
  Play,
  Square,
  ArrowUpRight,
  RefreshCw,
  HardDrive,
  Laptop,
} from "lucide-react";
import { useConfirm } from "@/lib/confirm-context";
import { native, request } from "./native";
import {
  completeCloudSignIn,
  connect,
  connectHosted,
  currentWorkspace,
  useDesktopStatus,
} from "./store";

type Service = {
  running: boolean;
  healthy: boolean;
  initialized: boolean;
  endpoint: string;
  storageBytes: number;
  autostart: boolean;
};
type Device = {
  id: string;
  label?: string;
  enabled?: number;
  last_seen?: number;
};
type Details = {
  mode: string;
  plan: string;
  storageBytes: number;
  storageLimit: number | null;
  account?: { email: string; display_name: string };
  devices: Device[];
  integrations?: { id: string; name: string }[];
  subscriptionStatus?: string;
};
const size = (bytes: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
    bytes / (bytes >= 1e9 ? 1e9 : 1e6),
  ) + (bytes >= 1e9 ? " GB" : " MB");

export function WorkspaceSettings() {
  const status = useDesktopStatus();
  const workspace = currentWorkspace();
  const confirm = useConfirm();
  const [mode, setMode] = useState<"local" | "cloud">(
    workspace?.workspaceId.startsWith("base_cloud_") ||
      workspace?.origin === "https://base.lucasbrown.xyz"
      ? "cloud"
      : "local",
  );
  const [method, setMethod] = useState<"run" | "connect">("run");
  const [origin, setOrigin] = useState(
    workspace?.origin || "https://base.lucasbrown.xyz",
  );
  const [cloudOrigin, setCloudOrigin] = useState(
    workspace?.workspaceId.startsWith("base_cloud_")
      ? workspace.origin
      : "https://base.lucasbrown.xyz",
  );
  const [password, setPassword] = useState("");
  const [service, setService] = useState<Service | null>(null);
  const [detailResult, setDetailResult] = useState<{
    scope: string;
    value: Details | null;
  } | null>(null);
  const details =
    detailResult?.scope === workspace?.scope ? detailResult?.value : null;
  const actionVersion = useRef(0);
  const actionRunning = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const blocked = busy || status.saving || status.hasUnsaved;
  const action = async (fn: () => Promise<unknown>) => {
    actionVersion.current++;
    actionRunning.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (error) {
      setError(String(error).replace(/^Error: /, ""));
    } finally {
      actionRunning.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    let disposed = false;
    const version = actionVersion.current;
    if (!actionRunning.current)
      void native<Service>("workspace_service_status")
        .then((value) => {
          if (!disposed && version === actionVersion.current) setService(value);
        })
        .catch(() => {});
    const scope = workspace?.scope;
    if (scope && workspace.origin) {
      void request(scope, "/api/workspace")
        .then(async (response) =>
          response.ok ? ((await response.json()) as Details) : null,
        )
        .then((value) => {
          if (!disposed) setDetailResult({ scope, value });
        })
        .catch(() => {
          if (!disposed) setDetailResult({ scope, value: null });
        });
    }
    return () => {
      disposed = true;
    };
  }, [workspace?.scope, workspace?.origin, status.lastSync]);
  const switchWorkspace = async (fn: () => Promise<unknown>) => {
    if (
      await confirm({
        message:
          "Open a separate workspace? Your current records, pending edits and conflicts stay saved here. Nothing will be merged or removed. You can import a copy separately.",
        confirmLabel: "Keep separate & connect",
        danger: false,
      })
    )
      await fn();
  };
  const refresh = async () => {
    setService(await native<Service>("workspace_service_status"));
    if (workspace?.origin) {
      const response = await request(workspace.scope, "/api/workspace");
      if (response.ok)
        setDetailResult({
          scope: workspace.scope,
          value: (await response.json()) as Details,
        });
    }
  };
  const billing = async (path: string) => {
    if (!workspace?.origin) return;
    const response = await request(workspace.scope, path, { method: "POST" });
    const value = (await response.json()) as { url?: string; error?: string };
    if (!response.ok || !value.url)
      throw new Error(value.error || "Billing is unavailable");
    const url = new URL(value.url);
    if (
      url.protocol !== "https:" ||
      !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)
    )
      throw new Error("Unexpected billing URL");
    await native("open_external", { url: value.url });
  };
  return (
    <div className="base-workspace-settings">
      <div
        role="group"
        aria-label="Workspace mode"
        className="base-workspace-modes"
      >
        <button
          aria-pressed={mode === "local"}
          onClick={() => setMode("local")}
        >
          <Server className="h-5 w-5" />
          <strong>Local Workspace</strong>
          <span>Own your data. Always free.</span>
        </button>
        <button
          aria-pressed={mode === "cloud"}
          onClick={() => setMode("cloud")}
        >
          <Cloud className="h-5 w-5" />
          <strong>Cloud Workspace</strong>
          <span>Managed sync across devices.</span>
        </button>
      </div>
      {mode === "local" ? (
        <div className="base-workspace-panel">
          <div
            className="base-workspace-tabs"
            role="group"
            aria-label="Local connection method"
          >
            <button
              aria-pressed={method === "run"}
              onClick={() => setMethod("run")}
            >
              Run on this computer
            </button>
            <button
              aria-pressed={method === "connect"}
              onClick={() => setMethod("connect")}
            >
              Connect to a workspace
            </button>
          </div>
          {method === "run" ? (
            <>
              <div className="base-workspace-heading">
                <div>
                  <h3>Your local service</h3>
                  <p>
                    Runs independently of the Base window. Stopping keeps every
                    record.
                  </p>
                </div>
                <span
                  className="base-workspace-status"
                  data-online={service?.running}
                >
                  {service?.running ? "Running" : "Stopped"}
                </span>
              </div>
              <div className="base-workspace-facts">
                <span>
                  <Server className="h-4 w-4" />
                  {service?.endpoint || "http://127.0.0.1:53318"}
                </span>
                <span>
                  <HardDrive className="h-4 w-4" />
                  {size(service?.storageBytes || 0)} · No storage cap
                </span>
              </div>
              <div className="flex flex-wrap gap-2 my-4">
                <button
                  disabled={blocked}
                  className="base-button base-button-secondary"
                  onClick={() =>
                    void action(async () => {
                      setService(
                        await native<Service>(
                          service?.running
                            ? "workspace_service_stop"
                            : "workspace_service_start",
                        ),
                      );
                    })
                  }
                >
                  {service?.running ? (
                    <Square className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {service?.running ? "Stop Workspace" : "Start Workspace"}
                </button>
                <button
                  disabled={blocked || !service?.running}
                  className="base-button base-button-primary"
                  onClick={() =>
                    void action(() => switchWorkspace(connectHosted))
                  }
                >
                  Open local workspace
                </button>
                <button
                  disabled={busy}
                  aria-label="Refresh service status"
                  className="base-icon-button"
                  onClick={() => void action(refresh)}
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={service?.autostart || false}
                  disabled={busy || !service?.initialized}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    void action(async () => {
                      await native("workspace_service_autostart", { enabled });
                      await refresh();
                    });
                  }}
                />
                Start the service when I log in
              </label>
            </>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void action(() =>
                  switchWorkspace(async () => {
                    await connect(origin, password);
                    setPassword("");
                    await refresh();
                  }),
                );
              }}
            >
              <p className="text-xs text-[var(--muted)]">
                Connect to your own Base backend. Remote connections use HTTPS;
                HTTP is allowed on this computer only.
              </p>
              <label className="grid gap-1 text-sm">
                Service URL
                <input
                  type="url"
                  required
                  value={origin}
                  onChange={(event) => setOrigin(event.target.value)}
                  placeholder="https://workspace.example.com"
                />
              </label>
              <label className="grid gap-1 text-sm">
                Workspace password
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button
                disabled={blocked}
                className="base-button base-button-primary"
              >
                Connect securely
              </button>
            </form>
          )}
        </div>
      ) : (
        <div className="base-workspace-panel">
          <div className="base-workspace-heading">
            <div>
              <h3>Base Cloud</h3>
              <p>
                Email, Google or Apple sign-in in your browser. Offline work
                stays on this device.
              </p>
            </div>
            <Cloud className="h-5 w-5 text-[var(--muted)]" />
          </div>
          <div className="base-cloud-plans">
            <div>
              <strong>Free</strong>
              <span>250 MB · 2 devices</span>
              <span>7 days of recovery</span>
            </div>
            <div>
              <strong>
                Plus <small>$3.99 USD/month</small>
              </strong>
              <span>10 GB · Unlimited devices</span>
              <span>90 days of recovery</span>
            </div>
          </div>
          <p className="my-3 text-xs text-[var(--muted)]">
            Every core feature and offline functionality is included in both
            plans.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={blocked}
              className="base-button base-button-primary"
              onClick={() =>
                void action(async () => {
                  await native("cloud_sign_in_start", { origin: cloudOrigin });
                  setSigningIn(true);
                })
              }
            >
              Sign in / create account
              <ArrowUpRight className="h-4 w-4" />
            </button>
            {signingIn && (
              <button
                disabled={blocked}
                className="base-button base-button-secondary"
                onClick={() =>
                  void action(() =>
                    switchWorkspace(async () => {
                      await completeCloudSignIn();
                      setSigningIn(false);
                    }),
                  )
                }
              >
                Complete sign-in
              </button>
            )}
          </div>
          {signingIn && (
            <p role="status" className="mt-3 text-xs text-[var(--muted)]">
              Approve this desktop in your browser, then complete sign-in here.
              This request expires after ten minutes.
            </p>
          )}
          <details className="mt-4 text-xs text-[var(--muted)]">
            <summary>Connect to a staging cloud</summary>
            <label className="grid gap-1 mt-2">
              Cloud service URL
              <input
                type="url"
                value={cloudOrigin}
                onChange={(event) => setCloudOrigin(event.target.value)}
              />
            </label>
          </details>
        </div>
      )}
      {details && workspace?.origin && (
        <div className="base-workspace-panel">
          <div className="base-workspace-heading">
            <div>
              <h3>Connected workspace</h3>
              <p>{details.account?.email || workspace.origin}</p>
            </div>
            <span className="base-workspace-status">
              {details.plan === "local"
                ? "Local"
                : details.plan === "plus"
                  ? "Cloud Plus"
                  : "Cloud Free"}
            </span>
          </div>
          <p className="text-xs text-[var(--muted)]">
            {size(details.storageBytes)}
            {details.storageLimit
              ? ` of ${size(details.storageLimit)}`
              : " stored"}{" "}
            · {status.pending} pending changes
          </p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Last successful sync:{" "}
            {status.lastSync
              ? new Date(status.lastSync).toLocaleString()
              : "No sync in this session"}
          </p>
          {details.storageLimit && (
            <progress
              className="base-storage-progress"
              max={details.storageLimit}
              value={Math.min(details.storageBytes, details.storageLimit)}
              aria-label="Cloud storage used"
            />
          )}
          {details.mode === "cloud" && (
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                disabled={busy}
                className="base-button base-button-secondary"
                onClick={() =>
                  void action(() =>
                    billing(
                      details.plan === "plus" ||
                        details.subscriptionStatus !== "none"
                        ? "/api/billing/portal"
                        : "/api/billing/checkout",
                    ),
                  )
                }
              >
                {details.plan === "plus" ? "Manage billing" : "Upgrade to Plus"}
              </button>
              <button
                disabled={busy}
                className="base-button base-button-secondary"
                onClick={() =>
                  void action(() =>
                    native("open_external", {
                      url: `${workspace.origin}/account`,
                    }),
                  )
                }
              >
                Manage account
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
              <button
                disabled={busy}
                className="base-button base-button-secondary"
                onClick={() => void action(refresh)}
              >
                Refresh plan
              </button>
            </div>
          )}
          <h4 className="text-xs font-medium mt-5 mb-2">Connected devices</h4>
          <div className="grid gap-2">
            {details.devices
              .filter((device) => device.enabled !== 0)
              .map((device) => (
                <div
                  key={device.id}
                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-3 text-xs"
                >
                  <Laptop className="h-4 w-4" />
                  <span className="min-w-0 flex-1 truncate" title={device.id}>
                    {device.label || device.id}
                  </span>
                  <button
                    disabled={busy}
                    className="text-[var(--muted)] hover:text-[var(--text)]"
                    onClick={() =>
                      void action(async () => {
                        if (
                          !(await confirm({
                            message:
                              "Revoke this device's session? Its saved offline data is retained, and it will need to sign in again.",
                            confirmLabel: "Revoke device",
                            danger: true,
                          }))
                        )
                          return;
                        const response = await request(
                          workspace.scope,
                          "/api/devices/revoke",
                          {
                            method: "POST",
                            body: JSON.stringify({ deviceId: device.id }),
                          },
                        );
                        if (!response.ok)
                          throw new Error("Could not revoke device");
                        await refresh();
                      })
                    }
                  >
                    Revoke
                  </button>
                </div>
              ))}
          </div>
          {!!details.integrations?.length && (
            <>
              <h4 className="text-xs font-medium mt-5 mb-2">
                Connected integrations
              </h4>
              <div className="grid gap-2">
                {details.integrations.map((integration) => (
                  <div
                    key={integration.id}
                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-3 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {integration.name}
                    </span>
                    <button
                      disabled={busy}
                      className="base-button base-button-secondary"
                      onClick={() =>
                        void action(async () => {
                          if (
                            !(await confirm({
                              message:
                                "Disconnect this integration? Its access to this workspace will end immediately. Your records are retained.",
                              confirmLabel: "Disconnect integration",
                              danger: true,
                            }))
                          )
                            return;
                          const response = await request(
                            workspace.scope,
                            "/api/workspace/integrations/revoke",
                            {
                              method: "POST",
                              body: JSON.stringify({ id: integration.id }),
                            },
                          );
                          if (!response.ok)
                            throw new Error("Could not disconnect integration");
                          await refresh();
                        })
                      }
                    >
                      Disconnect
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--danger,#ef4444)]">
          {error}
        </p>
      )}
    </div>
  );
}
