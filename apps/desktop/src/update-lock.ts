// Updates must not restart the renderer while someone is creating a new edit.
let status: HTMLElement | null = null;
export const updateInProgress = () => status !== null;
export function updateProgress(message: string) { if (status) status.textContent = message; }
export function lockForUpdate() {
  const modal=document.createElement('div');
  modal.className='fixed inset-0 z-[1000] grid place-items-center bg-black/40 p-6';
  modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','base-update-heading');modal.tabIndex=-1;
  const card=document.createElement('div');card.className='w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text)] shadow-xl';
  const heading=document.createElement('h2');heading.id='base-update-heading';heading.className='text-lg font-semibold';heading.textContent='Updating Base';
  status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.className='mt-3 text-sm';status.textContent='Saving your workspace…';
  const detail=document.createElement('p');detail.className='mt-2 text-xs text-[var(--muted)]';detail.textContent='Your saved records and offline edits stay on this device. Base will restart when ready.';
  card.append(heading,status,detail);modal.append(card);
  const previous=new Map<HTMLElement,boolean>();
  const lock=()=>{ for(const node of document.body.children)if(node instanceof HTMLElement&&node!==modal&&!previous.has(node)){previous.set(node,node.inert);node.inert=true;} };
  lock();document.body.append(modal);
  const observer=new MutationObserver(lock);observer.observe(document.body,{childList:true});
  const focus=()=>modal.focus();
  const keepFocus=(event:FocusEvent)=>{if(event.target instanceof Node&&!modal.contains(event.target))focus();};
  const key=(event:KeyboardEvent)=>{event.stopPropagation();if(event.key==='Tab'||event.key==='Escape')event.preventDefault();};
  modal.addEventListener('keydown',key);document.addEventListener('focusin',keepFocus,true);focus();
  return ()=>{observer.disconnect();document.removeEventListener('focusin',keepFocus,true);status=null;modal.remove();for(const [node,inert] of previous)node.inert=inert;};
}
