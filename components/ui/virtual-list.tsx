"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";

const RetainContext = createContext<((id: string, retain: boolean) => void) | null>(null);
export function useRetainVirtualRow(id: string, retain: boolean) {
  const update = useContext(RetainContext);
  useEffect(() => { if (!update || !retain) return; update(id,true); return () => update(id,false); },[id,retain,update]);
}

/** Variable-height rows retain their own editing state and measure expanded content. */
export function VirtualList<T extends { id: string }>({ items, children, label }: { items: T[]; children: (item: T, index: number) => ReactNode; label: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [retained, setRetained] = useState<Set<string>>(()=>new Set());
  const [focused,setFocused] = useState<string|null>(null);
  const retain = useCallback((id: string, keep: boolean) => setRetained(previous => { if (previous.has(id)===keep) return previous; const next=new Set(previous); if(keep)next.add(id);else next.delete(id);return next; }),[]);
  const indices=useMemo(()=>new Map(items.map((item,index)=>[item.id,index])),[items]);
  const extract=useCallback((range: Parameters<typeof defaultRangeExtractor>[0])=>[...new Set([...defaultRangeExtractor(range),...[...retained,...(focused?[focused]:[])].flatMap(id=>indices.has(id)?[indices.get(id)!]:[])])].sort((a,b)=>a-b),[retained,focused,indices]);
  const itemKey=useCallback((index:number)=>items[index].id,[items]);
  const virtual = useVirtualizer({ count: items.length, getScrollElement: () => scrollRef.current, estimateSize: () => 60, overscan: 8, getItemKey: itemKey,
    rangeExtractor: extract,
  });
  return <RetainContext.Provider value={retain}><div ref={scrollRef} className="base-virtual-list" role="list" aria-label={label} tabIndex={0}>
    <div style={{ height: virtual.getTotalSize(), position: "relative", width: "100%" }}>
      {virtual.getVirtualItems().map(row=><div key={row.key} data-index={row.index} ref={virtual.measureElement} onFocusCapture={()=>setFocused(items[row.index].id)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setFocused(null);}} role="listitem" aria-setsize={items.length} aria-posinset={row.index+1} style={{ position:"absolute",top:0,left:0,width:"100%",transform:`translateY(${row.start}px)` }}>
        {children(items[row.index],row.index)}
      </div>)}
    </div>
  </div></RetainContext.Provider>;
}
