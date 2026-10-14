import { verifyReleaseSignature } from "./verify-release-signature.mjs";
// Publish only signed binaries. Source archives and credentials never enter this feed.
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
const config=JSON.parse(readFileSync(resolve(root,'apps/desktop/src-tauri/tauri.conf.json'),'utf8'));
const entries=process.argv.slice(2).map(value=>{const split=value.indexOf('=');return [value.slice(0,split),resolve(value.slice(split+1))];});
if(!entries.length || entries.some(([platform,file])=>! /^(linux|darwin|windows)-(x86_64|aarch64)$/.test(platform)||!/^Base[\w.-]+(?:\.AppImage|\.tar\.gz|\.nsis\.zip|\.exe)$/.test(basename(file))))throw Error('Supply platform=path pairs for signed Tauri binaries. Publish all platforms of a release together.');
const endpoint=new URL(config.plugins.updater.endpoints[0]);
const manifest={version:config.version,notes:'Base '+config.version,pub_date:new Date().toISOString(),platforms:{}};
const files=entries.map(([platform,file])=>{const signature=readFileSync(file+'.sig','utf8').trim();if(!/^[A-Za-z0-9+/=\r\n]+$/.test(signature)||signature.length<100)throw Error('Missing/invalid artifact signature.');verifyReleaseSignature(readFileSync(file), signature, config.plugins.updater.pubkey);const key=`desktop-releases/${config.version}/${platform}/${basename(file)}`;manifest.platforms[platform]={url:endpoint.origin+'/api/desktop/download/'+config.version+'/'+platform+'/'+basename(file),signature};return {file,key};});
const temp=mkdtempSync(resolve(tmpdir(),'base-release-'));
const cli=resolve(root,'node_modules/wrangler/bin/wrangler.js');
const bucket=JSON.parse(readFileSync(resolve(root,'apps/cloud/wrangler.json'),'utf8')).r2_buckets.find(b=>b.binding==='RELEASES').bucket_name;
try {
for (const {file,key} of files) {
 const url = endpoint.origin + '/api/desktop/download/' + key.slice('desktop-releases/'.length);
 const head = await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(10000)});
 if (head.status === 404) continue;
 if (!head.ok) throw Error('Release preflight failed: HTTP '+head.status);
 const existing = await fetch(url,{signal:AbortSignal.timeout(120000)});
 if (!existing.ok || createHash('sha256').update(Buffer.from(await existing.arrayBuffer())).digest('hex') !== createHash('sha256').update(readFileSync(file)).digest('hex')) throw Error('A different artifact already uses this release version. Bump the version before publishing.');
}
for(const {file,key} of files)execFileSync(process.execPath,[cli,'r2','object','put',bucket+'/'+key,'--file',file,'--remote'],{cwd:resolve(root,'apps/cloud'),stdio:'inherit'});
writeFileSync(resolve(temp,'latest.json'),JSON.stringify(manifest));
execFileSync(process.execPath,[cli,'r2','object','put',bucket+'/desktop-releases/latest.json','--file',resolve(temp,'latest.json'),'--content-type','application/json','--remote'],{cwd:resolve(root,'apps/cloud'),stdio:'inherit'});
console.log('Published Base '+config.version+' for '+entries.map(([p])=>p).join(', '));
} finally {rmSync(temp,{recursive:true,force:true});}
