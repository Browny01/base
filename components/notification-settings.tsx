"use client";
import { useEffect, useState } from "react";
import { Bell, Check, Loader2 } from "lucide-react";
import {
  enableNotifications,
  notificationPermission,
} from "@/lib/notifications";
import { useToast } from "@/lib/toast-context";
export function NotificationSettings() {
  const [permission, setPermission] =
      useState<NotificationPermission>("default"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { toast } = useToast();
  useEffect(() => {
    let active = true;
    void notificationPermission()
      .then((v) => {
        if (active) setPermission(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="my-4 rounded-xl border border-[var(--border)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Bell className="h-4 w-4" />
            Notifications
            {permission === "granted" && (
              <Check className="h-4 w-4 text-[var(--c-emerald)]" />
            )}
          </h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {permission === "granted"
              ? "Focus alerts use your system notification settings while Base is running."
              : "Get an alert when a focus session finishes."}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          className="base-button base-button-secondary"
          onClick={() => {
            setBusy(true);
            setError("");
            void enableNotifications()
              .then((v) => {
                setPermission(v);
                toast(
                  "Test alert requested. If it does not appear, allow Base in your system notification settings.",
                );
              })
              .catch((e) =>
                setError(e instanceof Error ? e.message : String(e)),
              )
              .finally(() => setBusy(false));
          }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {permission === "granted"
            ? "Send test notification"
            : "Enable notifications"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--c-rose)]">
          {error}
        </p>
      )}
    </div>
  );
}
