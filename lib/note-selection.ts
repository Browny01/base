import type { WikiBlock } from "./store";

export function noteText(node: Node): string {
  if(node.nodeType===3)return node.textContent??"";
  if((node as Element).tagName==="BR")return "\n";
  const children=[...node.childNodes];
  if(children.length===1&&(children[0] as Element).tagName==="BR")return "";
  const block=(child:Node)=>/^(DIV|P|LI|H[1-6])$/.test((child as Element).tagName??"");
  return children.map((child,i)=>(i>0&&(block(child)||block(children[i-1]))?"\n":"")+noteText(child)).join("");
}

export function selectedNoteRange(blocks: WikiBlock[], refs: Map<string, HTMLElement>, range: Range) {
  if (range.collapsed) return null;
  const start=blocks.findIndex(block=>refs.get(block.id)?.contains(range.startContainer));
  const end=blocks.findIndex(block=>refs.get(block.id)?.contains(range.endContainer));
  return start>=0 && end>start ? {start,end} : null;
}

export function noteRangeContent(blocks: WikiBlock[], refs: Map<string, HTMLElement>, range: Range) {
  const first=blocks.findIndex(block=>refs.get(block.id)?.contains(range.startContainer));
  const last=blocks.findIndex(block=>refs.get(block.id)?.contains(range.endContainer));
  if(first<0||last<first)return null;
  const ranges:Range[]=[],html:string[]=[],text:string[]=[];
  for(const block of blocks.slice(first,last+1)) {
    const el=refs.get(block.id);if(!el)continue;
    const part=range.cloneRange();part.selectNodeContents(el);
    if(el.contains(range.startContainer))part.setStart(range.startContainer,range.startOffset);
    if(el.contains(range.endContainer))part.setEnd(range.endContainer,range.endOffset);
    const box=el.ownerDocument.createElement("div");box.append(part.cloneContents());
    ranges.push(part);html.push(`<div>${box.innerHTML}</div>`);text.push(noteText(box));
  }
  return {ranges,html:html.join(""),text:text.join("\n")};
}

/** Preserve boundary formatting; never let native deletion remove React block rows. */
export function replaceNoteRange(blocks: WikiBlock[], refs: Map<string, HTMLElement>, range: Range, html: string) {
  const span=selectedNoteRange(blocks,refs,range);if(!span)return null;
  const first=refs.get(blocks[span.start].id)!,last=refs.get(blocks[span.end].id)!;
  const prefix=range.cloneRange();prefix.selectNodeContents(first);prefix.setEnd(range.startContainer,range.startOffset);
  const suffix=range.cloneRange();suffix.selectNodeContents(last);suffix.setStart(range.endContainer,range.endOffset);
  const box=first.ownerDocument.createElement("div");box.append(prefix.cloneContents());const before=box.innerHTML;
  box.replaceChildren(suffix.cloneContents());const after=box.innerHTML;
  return {id:blocks[span.start].id,html:before+html+after,caretHTML:before+html+'<span id="__caret__"></span>'+after,
    blocks:[...blocks.slice(0,span.start),{...blocks[span.start],text:before+html+after},...blocks.slice(span.end+1)]};
}

/** Editing hosts constrain native dragging; extend the range when crossing hosts. */
export function enableNoteDragSelection(root: HTMLElement, onSelection:(range:Range|null)=>void) {
  type Point={node:Node;offset:number};
  function point(x:number,y:number):Point|null {
    const doc=root.ownerDocument as Document & {caretPositionFromPoint?:(x:number,y:number)=>{offsetNode:Node;offset:number}|null;caretRangeFromPoint?:(x:number,y:number)=>Range|null};
    const position=doc.caretPositionFromPoint?.(x,y);if(position)return {node:position.offsetNode,offset:position.offset};
    const range=doc.caretRangeFromPoint?.(x,y);return range?{node:range.startContainer,offset:range.startOffset}:null;
  }
  const host=(node:Node)=> (node.nodeType===3?node.parentElement:node as HTMLElement)?.closest<HTMLElement>(".nx-block[contenteditable]");
  let anchor:Point|null=null,anchorHost:HTMLElement|null=null,frame=0,crossed=false,apply:(()=>void)|null=null;
  const stop=()=>{anchor=null;anchorHost=null;crossed=false;apply=null;cancelAnimationFrame(frame);document.removeEventListener("mousemove",move);document.removeEventListener("mouseup",up);window.removeEventListener("blur",stop);};
  const up=()=>{apply?.();stop();};
  const move=(event:MouseEvent)=>{
    if(!(event.buttons&1)){stop();return;}
    const end=point(event.clientX,event.clientY),endHost=end&&host(end.node);
    if(!anchor||!end||!endHost||!root.contains(endHost))return;
    crossed ||= endHost!==anchorHost;if(!crossed)return;
    event.preventDefault();cancelAnimationFrame(frame);
    const start=anchor;apply=()=>{
      const range=root.ownerDocument.createRange();range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset);
      if(range.collapsed&&(start.node!==end.node||start.offset!==end.offset)){range.setStart(end.node,end.offset);range.setEnd(start.node,start.offset);}
      // WebKit clips Selection across editing hosts. Keep the full logical Range.
      onSelection(range);root.ownerDocument.getSelection()?.setBaseAndExtent(start.node,start.offset,end.node,end.offset);
      root.ownerDocument.dispatchEvent(new Event("selectionchange"));
    };
    frame=requestAnimationFrame(()=>{apply?.();apply=null;});
  };
  const down=(event:MouseEvent)=>{
    stop();if(event.button!==0||event.shiftKey)return;
    onSelection(null);
    const start=point(event.clientX,event.clientY),el=start&&host(start.node);
    if(!start||!el||!root.contains(el))return;
    anchor=start;anchorHost=el;
    document.addEventListener("mousemove",move);document.addEventListener("mouseup",up);window.addEventListener("blur",stop);
  };
  root.addEventListener("mousedown",down);
  return()=>{stop();root.removeEventListener("mousedown",down);};
}
