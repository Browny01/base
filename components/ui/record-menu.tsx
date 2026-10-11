"use client";

import * as ContextMenu from "@radix-ui/react-context-menu";
import type { ReactNode } from "react";

export function RecordMenu({ children, actions, onOpenChange }: { children: ReactNode; actions: {label:string;run:()=>void;danger?:boolean}[]; onOpenChange?:(open:boolean)=>void }) {
  return <ContextMenu.Root onOpenChange={onOpenChange}><ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
    <ContextMenu.Portal><ContextMenu.Content className="base-menu" collisionPadding={8}>
      {actions.map(action=><ContextMenu.Item key={action.label} className="base-menu-item" data-danger={action.danger || undefined} onSelect={action.run}>{action.label}</ContextMenu.Item>)}
    </ContextMenu.Content></ContextMenu.Portal>
  </ContextMenu.Root>;
}
