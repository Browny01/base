export const CHUNK_BYTES = 750_000;
export const MAX_STAGED_BYTES = 32_000_000;
export type StagedOperation = { id: string; uploadId: string; parts: number };
import type { Operation } from "./protocol.ts";
export async function prepareBatch(pending: Operation[], workspaceId: string, upload: (chunk: StagedOperation & { workspaceId: string; index: number; chunk: string }) => Promise<void>) {
  const operations: (Operation | StagedOperation)[] = [];
  let bytes = 0, stagedBytes = 0;
  for (const op of pending.slice(0,200)) {
    const raw=new TextEncoder().encode(JSON.stringify(op));
    if(raw.length>MAX_STAGED_BYTES)throw new Error("This edit exceeds the 32 MB operation limit. Export your workspace; the original is retained.");
    if(raw.length>1_000_000) {
      if(stagedBytes+raw.length>MAX_STAGED_BYTES)break;
      const uploadId=[...new Uint8Array(await crypto.subtle.digest("SHA-256",raw))].map(v=>v.toString(16).padStart(2,"0")).join("");
      const reference={id:op.id,uploadId,parts:Math.ceil(raw.length/CHUNK_BYTES)};
      for(let index=0;index<reference.parts;index++) {
        const part=raw.subarray(index*CHUNK_BYTES,(index+1)*CHUNK_BYTES);let binary="";
        for(let i=0;i<part.length;i+=16384)binary+=String.fromCharCode(...part.subarray(i,i+16384));
        await upload({...reference,workspaceId,index,chunk:btoa(binary)});
      }
      operations.push(reference);stagedBytes+=raw.length;
    } else {
      if(bytes+raw.length>1_800_000)break;
      operations.push(op);bytes+=raw.length;
    }
  }
  return operations;
}
