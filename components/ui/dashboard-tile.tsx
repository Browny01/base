"use client";
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { GripHorizontal, MoveDownRight } from "lucide-react";
import { clampWidgetSize, type DashboardWidget, type WidgetSize } from "@/lib/dashboard-widgets";

export function DashboardTile({ id, label, customizing, size, onMove, onResize, children }: { id: DashboardWidget; label: string; customizing: boolean; size?: WidgetSize; onMove: (source: DashboardWidget, target: DashboardWidget) => void; onResize: (size: WidgetSize) => void; children: ReactNode }) {
  const tile=useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const node = tile.current;
    if (!node) return;
    // Each column packs independently: a taller calendar must not leave a gap
    // under both small metrics. Observe actual content, including saved sizes.
    const observer = new ResizeObserver(() => {
      const rows = Math.ceil(node.getBoundingClientRect().height + 16);
      if (node.style.gridRowEnd !== `span ${rows}`) node.style.gridRowEnd = `span ${rows}`;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const gesture=useRef<{ mode:"move"|"resize"; x:number; y:number; left:number; top:number; width:number; height:number; columns:number; target:DashboardWidget; drop:HTMLElement|null; next:WidgetSize|null }|null>(null);
  function start(event: React.PointerEvent<HTMLButtonElement>, mode:"move"|"resize") {
    if(event.button!==0)return;
    event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
    const bounds=tile.current!.getBoundingClientRect();
    gesture.current={mode,x:event.clientX,y:event.clientY,left:bounds.left,top:bounds.top,width:bounds.width,height:bounds.height,columns:size?.columns??2,target:id,drop:null,next:null};
    tile.current!.dataset.gesture=mode;
  }
  function update(event: React.PointerEvent<HTMLButtonElement>) {
    const current=gesture.current,node=tile.current;if(!current||!node)return;
    const dx=event.clientX-current.x,dy=event.clientY-current.y;
    if(current.mode==="resize") {
      const grid=node.parentElement!,columns=getComputedStyle(grid).gridTemplateColumns.split(" ").length;
      const step=(grid.getBoundingClientRect().width+16)/columns;
      const next=clampWidgetSize(id,columns===1?current.columns:current.columns+dx/step,current.height+dy);
      current.next=next;node.style.setProperty("--widget-columns",String(next.columns));node.style.setProperty("--widget-height",`${next.height}px`);
      return;
    }
    let distance=Infinity,target=node;
    // Locate the destination with rectangles rather than HTML drag-and-drop,
    // which is inconsistently supported by native WKWebView.
    for(const candidate of node.parentElement!.querySelectorAll<HTMLElement>("[data-widget-id]")) {
      const rect=candidate.getBoundingClientRect();
      const left=candidate===node?current.left:rect.left,top=candidate===node?current.top:rect.top;
      const delta=Math.hypot(event.clientX-(left+rect.width/2),event.clientY-(top+rect.height/2));
      if(delta<distance){distance=delta;target=candidate;}
    }
    current.drop?.removeAttribute("data-drop-target");target.dataset.dropTarget="true";current.drop=target;current.target=target.dataset.widgetId as DashboardWidget;
    node.style.transform=`translate(${dx}px,${dy}px)`;
  }
  function finish(cancel:boolean) {
    const current=gesture.current,node=tile.current;if(!current||!node)return;
    gesture.current=null;current.drop?.removeAttribute("data-drop-target");delete node.dataset.gesture;node.style.transform="";
    node.style.setProperty("--widget-columns",String(size?.columns??2));node.style.setProperty("--widget-height",size?`${size.height}px`:"auto");
    if(cancel)return;
    if(current.mode==="move")onMove(id,current.target);else if(current.next)onResize(current.next);
  }
  const events={onPointerMove:update,onPointerUp:()=>finish(false),onPointerCancel:()=>finish(true),onLostPointerCapture:()=>finish(true)};
  return <section ref={tile} data-widget-id={id} className={`base-dashboard-widget ${id.endsWith("metric")?"base-dashboard-metric":""} ${customizing?"base-widget-arranging":""}`} aria-label={label} style={{"--widget-columns":size?.columns??2,"--widget-height":size?`${size.height}px`:"auto"} as CSSProperties}>
    {customizing&&<div className="base-widget-editbar"><button className="base-widget-grip" aria-label={`Move ${label}. Use left and right arrows to change order.`} onPointerDown={event=>start(event,"move")} {...events} onKeyDown={event=>{
      if(event.key==="Escape"){finish(true);return;}
      const direction=event.key==="ArrowLeft"||event.key==="ArrowUp"?-1:event.key==="ArrowRight"||event.key==="ArrowDown"?1:0;
      if(!direction)return;event.preventDefault();const nodes=Array.from(tile.current!.parentElement!.querySelectorAll<HTMLElement>("[data-widget-id]")),index=nodes.indexOf(tile.current!),target=nodes[index+direction];if(target)onMove(id,target.dataset.widgetId as DashboardWidget);
    }}><GripHorizontal className="h-4 w-4"/><span>{label}</span></button><span className="text-[10px] text-[var(--faint)]">Drag to arrange</span></div>}
    <div className="base-widget-body">{children}</div>
    {customizing&&<button className="base-widget-resize" aria-label={`Resize ${label}. Left/right changes width, up/down changes height.`} title="Drag to resize" onPointerDown={event=>start(event,"resize")} {...events} onKeyDown={event=>{
      if(event.key==="Escape"){finish(true);return;}
      const dx=event.key==="ArrowLeft"?-1:event.key==="ArrowRight"?1:0,dy=event.key==="ArrowUp"?-16:event.key==="ArrowDown"?16:0;if(!dx&&!dy)return;event.preventDefault();onResize(clampWidgetSize(id,(size?.columns??2)+dx,(size?.height??tile.current!.getBoundingClientRect().height)+dy));
    }}><MoveDownRight className="h-4 w-4"/></button>}
  </section>;
}
