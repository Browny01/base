"use client";

import { createContext, useContext, useState, useCallback, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

interface ToastAction { label: string; onClick: () => void }
interface Toast { id: string; message: string; action?: ToastAction; }

const Ctx = createContext<{ toast: (message: string, opts?: { action?: ToastAction; duration?: number }) => void }>({ toast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const canPortal = useSyncExternalStore(() => () => {}, () => true, () => false);

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const tm = timers.current[id];
    if (tm) { clearTimeout(tm); delete timers.current[id]; }
  }, []);

  const toast = useCallback((message: string, opts?: { action?: ToastAction; duration?: number }) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, message, action: opts?.action }]);
    timers.current[id] = setTimeout(() => dismiss(id), opts?.duration ?? 6000);
  }, [dismiss]);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      {canPortal && createPortal(
        <div className="fixed inset-x-0 z-[120] flex flex-col items-center gap-2 px-4 pointer-events-none bottom-24 md:bottom-6">
          {toasts.map((t) => (
            <div key={t.id} className="pointer-events-auto flex items-center gap-3 max-w-[92vw] rounded-xl border border-[var(--border)] bg-[var(--surface)] elevated px-3.5 py-2.5 nx-slide-up">
              <span className="text-[13px] text-[var(--text)] font-medium">{t.message}</span>
              {t.action && (
                <button
                  onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                  className="text-[12px] font-semibold text-[var(--accent)] hover:opacity-80 shrink-0"
                >
                  {t.action.label}
                </button>
              )}
              <button onClick={() => dismiss(t.id)} className="text-[var(--faint)] hover:text-[var(--text)] shrink-0 text-[16px] leading-none">×</button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
