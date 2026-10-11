"use client";
import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import {useRef} from "react";

/** Shared focus trap, escape/outside dismissal and focus restoration for editors. */
export function EditorDialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  const previous=useRef(typeof document!=="undefined"&&document.activeElement instanceof HTMLElement&&!document.activeElement.matches("body,html")?document.activeElement:null);
  return <Dialog.Root open onOpenChange={open=>{if(!open)onClose();}}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[110] bg-black/40 nx-fade"/>
    <Dialog.Content aria-describedby={undefined} onCloseAutoFocus={event=>{event.preventDefault();const target=previous.current?.isConnected?previous.current:document.querySelector<HTMLElement>('button[aria-label="Create new item"]');target?.focus();}} className="base-editor-dialog fixed left-1/2 top-1/2 z-[111] max-h-[90dvh] w-[min(620px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-pop)] sm:p-6">
      <Dialog.Title className="sr-only">{title}</Dialog.Title>{children}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
