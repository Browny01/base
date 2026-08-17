"use client";

import { createContext, useContext, useState, useCallback, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

interface ConfirmRequest {
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface ConfirmOptions {
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<{ confirm: ConfirmFn }>({ confirm: async () => false });

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  const canPortal = useSyncExternalStore(() => () => {}, () => true, () => false);

  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        setReq({ message: opts.message, confirmLabel: opts.confirmLabel, danger: opts.danger ?? true, resolve });
      }),
    []
  );

  const done = useCallback((ok: boolean) => {
    setReq((r) => {
      r?.resolve(ok);
      return null;
    });
  }, []);

  // Close on Escape; ignore while another confirm is already visible.
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") done(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req, done]);

  return (
    <Ctx.Provider value={{ confirm }}>
      {children}
      {canPortal && req && createPortal(
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 backdrop-blur-[2px] nx-fade p-4"
          onClick={() => done(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] elevated p-5 nx-slide-up"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
          >
            <p className="text-sm text-[var(--text)] leading-relaxed">{req.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => done(false)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2 text-sm text-[var(--text)] hover:border-[var(--border-2)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => done(true)}
                className={
                  req.danger
                    ? "rounded-lg px-3.5 py-2 text-sm font-semibold bg-red-500/90 text-white hover:bg-red-500 transition-colors"
                    : "rounded-lg px-3.5 py-2 text-sm font-semibold bg-[var(--accent)] text-[var(--bg)] hover:opacity-90 transition-colors"
                }
              >
                {req.confirmLabel ?? "Delete"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx).confirm;
