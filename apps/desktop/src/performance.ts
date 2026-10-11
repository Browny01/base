import {native} from "./native";

/** Opt-in release profiling against the real bundled WebKit UI; no record mutations. */
export async function profileTaskScrolling() {
  location.hash="/tasks";
  let list:HTMLElement|null=null;
  for(let attempt=0;attempt<100;attempt++) {
    list=document.querySelector<HTMLElement>(".base-virtual-list");
    if(list)break;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  if(!list)return;
  const target=list;
  let previous=performance.now();
  const samples:number[]=[];
  await new Promise<void>(resolve=>{
    let frame=0;
    const tick=(now:number)=>{
      samples.push(now-previous);previous=now;
      target.scrollTop=Math.min(++frame*250,target.scrollHeight-target.clientHeight);
      if(frame<120)requestAnimationFrame(tick);else resolve();
    };
    requestAnimationFrame(tick);
  });
  const ordered=samples.slice(1).sort((a,b)=>a-b);
  await native("record_scroll_sample",{frames:ordered.length,p50Ms:ordered[Math.floor(ordered.length*.5)],p95Ms:ordered[Math.floor(ordered.length*.95)],maxMs:ordered.at(-1),rows:target.querySelectorAll('[role="listitem"]').length});
  target.scrollTop=0;
}
