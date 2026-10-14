import { noteRangeContent, replaceNoteRange, noteText } from "../lib/note-selection";
import type { WikiBlock } from "../lib/store";

// Run against real DOM Range APIs through the collaborative browser/Vite fixture.
export function runNoteSelectionChecks() {
  const blocks:WikiBlock[]=[{id:"one",type:"text",text:"<b>Alpha</b> tail"},{id:"two",type:"text",text:"Middle"},{id:"three",type:"text",text:"Head <i>Omega</i>"},{id:"four",type:"text",text:"Untouched"}];
  const original=JSON.stringify(blocks),refs=new Map<string,HTMLElement>(),root=document.createElement("div");document.body.append(root);
  const check=(ok:boolean,message:string)=>{if(!ok)throw new Error(message);};
  try {
    for(const block of blocks){const el=document.createElement("div");el.innerHTML=block.text;root.append(el);refs.set(block.id,el);}
    const range=document.createRange();range.setStart(refs.get("one")!.firstChild!.firstChild!,2);range.setEnd(refs.get("three")!.lastChild!.firstChild!,2);
    const content=noteRangeContent(blocks,refs,range)!;
    check(content.text==="pha tail\nMiddle\nHead Om","Cross-block copy lost selected text");
    check(content.ranges.length===3&&content.html.includes("<b>pha</b>")&&content.html.includes("<i>Om</i>"),"Copy lost formatting");
    const edited=replaceNoteRange(blocks,refs,range,"<u>new</u>")!;
    check(edited.blocks.length===2&&edited.blocks[1]===blocks[3],"Replacement removed unselected blocks");
    check(edited.html==="<b>Al</b><u>new</u><i>ega</i>","Replacement lost boundary formatting");
    check(JSON.stringify(blocks)===original,"Replacement mutated the stored snapshot");
    range.collapse(true);check(replaceNoteRange(blocks,refs,range,"")===null,"Collapsed selection must use normal typing");
    const paragraphs=document.createElement("div");paragraphs.innerHTML="First<div><br></div><div>Second</div>";
    check(noteText(paragraphs)==="First\n\nSecond","Blank paragraph missing from copy/export");
    paragraphs.innerHTML="<p>One</p><p><b>Two</b></p>tail";
    check(noteText(paragraphs)==="One\nTwo\ntail","Paragraph boundaries missing from copy/export");
    return {checks:8,passed:true};
  } finally {root.remove();}
}
