"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";

interface ConfirmOptions {
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}
interface ConfirmRequest extends ConfirmOptions {
  resolve: (ok: boolean) => void;
  returnFocus: HTMLElement | null;
}
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
const Ctx = createContext<{ confirm: ConfirmFn }>({
  confirm: async () => false,
});

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  const current = useRef<ConfirmRequest | null>(null);
  const queue = useRef<ConfirmRequest[]>([]);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        const request = {
          ...opts,
          danger: opts.danger ?? true,
          resolve,
          returnFocus:
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null,
        };
        if (current.current) queue.current.push(request);
        else {
          current.current = request;
          setReq(request);
        }
      }),
    [],
  );
  const done = useCallback((ok: boolean) => {
    const request = current.current;
    if (!request) return;
    const next = queue.current.shift() ?? null;
    current.current = next;
    returnFocus.current = request.returnFocus;
    setReq(next);
    request.resolve(ok);
  }, []);
  useEffect(
    () => () => {
      current.current?.resolve(false);
      for (const request of queue.current) request.resolve(false);
      current.current = null;
      queue.current = [];
    },
    [],
  );

  return (
    <Ctx.Provider value={{ confirm }}>
      {children}
      <Dialog.Root
        open={!!req}
        onOpenChange={(open) => {
          if (!open) done(false);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[130] bg-black/40 backdrop-blur-[2px] nx-fade" />
          <Dialog.Content
            role="alertdialog"
            className="fixed left-1/2 top-1/2 z-[131] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] elevated p-5"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              cancelButton.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              returnFocus.current?.focus();
            }}
          >
            <Dialog.Title className="sr-only">Confirm action</Dialog.Title>
            <Dialog.Description className="text-sm text-[var(--text)] leading-relaxed">
              {req?.message}
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={cancelButton}
                onClick={() => done(false)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2 text-sm text-[var(--text)] hover:border-[var(--border-2)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => done(true)}
                className={
                  req?.danger
                    ? "rounded-lg px-3.5 py-2 text-sm font-semibold bg-red-500/90 text-white hover:bg-red-500 transition-colors"
                    : "rounded-lg px-3.5 py-2 text-sm font-semibold bg-[var(--accent)] text-[var(--bg)] hover:opacity-90 transition-colors"
                }
              >
                {req?.confirmLabel ?? "Delete"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Ctx.Provider>
  );
}
export const useConfirm = () => useContext(Ctx).confirm;
