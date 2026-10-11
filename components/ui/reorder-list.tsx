"use client";
import { useRef, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";

export function ReorderList({ items, onChange, label }: { items: { id: string; label: string; icon: ReactNode; action?: ReactNode }[]; onChange: (ids: string[]) => void; label: string }) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; start: number; row: HTMLElement; target: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  function move(source: string, target: string) {
    if(source===target)return;
    const next=items.map(item=>item.id).filter(id=>id!==source);
    next.splice(items.findIndex(item=>item.id===target),0,source);
    onChange(next);setAnnouncement(`${items.find(item=>item.id===source)?.label} moved to position ${next.indexOf(source)+1}`);
  }
  function finish(cancel: boolean) {
    const current=drag.current;if(!current)return;
    current.row.style.transform="";current.row.style.zIndex="";current.row.removeAttribute("data-dragging");
    drag.current=null;setOver(null);
    if(!cancel)move(current.id,current.target);
  }
  return <div ref={root} role="list" aria-label={label} className="base-reorder-list">
    {items.map((item,index)=><div key={item.id} role="listitem" data-order-id={item.id} data-drop-target={over===item.id} className="base-reorder-row">
      <button type="button" aria-label={`Drag ${item.label} to reorder. Use up and down arrows with keyboard.`} className="base-drag-handle" onKeyDown={event=>{
        if(event.key==="Escape"){finish(true);return;}
        const target=event.key==="ArrowUp"?index-1:event.key==="ArrowDown"?index+1:-1;
        if(target<0||target>=items.length)return;
        event.preventDefault();move(item.id,items[target].id);
      }} onPointerDown={event=>{
        if(event.button!==0)return;
        const row=event.currentTarget.closest<HTMLElement>("[data-order-id]")!;
        drag.current={id:item.id,start:event.clientY,row,target:item.id};
        row.setAttribute("data-dragging","true");row.style.zIndex="2";
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={event=>{
        const current=drag.current;if(!current)return;
        let nearest=current.id,distance=Infinity;
        for(const row of root.current!.querySelectorAll<HTMLElement>("[data-order-id]")) {
          const rect=row.getBoundingClientRect();
          const center=rect.top+rect.height/2-(row===current.row?event.clientY-current.start:0);
          const delta=Math.abs(event.clientY-center);if(delta<distance){distance=delta;nearest=row.dataset.orderId!;}
        }
        current.row.style.transform=`translateY(${event.clientY-current.start}px)`;
        if(current.target!==nearest){current.target=nearest;setOver(nearest);}
      }} onPointerUp={()=>finish(false)} onPointerCancel={()=>finish(true)} onLostPointerCapture={()=>finish(true)}><GripVertical className="h-4 w-4"/></button>
      {item.icon}<span className="min-w-0 flex-1 truncate text-[13px]">{item.label}</span>{item.action}
    </div>)}
    <span className="sr-only" role="status">{announcement}</span>
  </div>;
}
