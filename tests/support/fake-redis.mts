import type { Redis } from "@upstash/redis";
export class FakeRedis {
  values=new Map<string,unknown>(); hashes=new Map<string,Map<string,unknown>>(); writes=0;
  onContention?:()=>void;
  async get(key:string){return this.values.get(key)??null;}
  async set(key:string,value:unknown,options?:{nx?:boolean}){if(!options?.nx||!this.values.has(key))this.values.set(key,value);}
  async mget(...keys:string[]){return keys.map(key=>this.values.get(key)??null);}
  async hmget(key:string,...fields:string[]){return Object.fromEntries(fields.map(f=>[f,this.hashes.get(key)?.get(f)??null]));}
  async eval(_script:string,keys:string[],args:string[]){
    if(this.onContention){const callback=this.onContention;this.onContention=undefined;callback();return 0;}
    if(String(this.values.get(keys[1])??0)!==args[0])return 0;
    const revision=Number(args[0])+1;
    this.values.set(keys[0],JSON.parse(args[1]));this.values.set(keys[1],String(revision));
    const receipts=this.hashes.get(keys[2])??new Map();
    for(const [id,value] of JSON.parse(args[2]))receipts.set(id,value);
    this.hashes.set(keys[2],receipts);
    const tombstones=this.hashes.get(keys[3])??new Map();
    for(const path of JSON.parse(args[3]))tombstones.set(path,revision);
    this.hashes.set(keys[3],tombstones);this.writes++;return revision;
  }
  redis(){return this as unknown as Redis;}
}
