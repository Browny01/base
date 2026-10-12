const CACHE=CACHE_VALUE,FILES=FILES_VALUE;
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("base-ui-")&&key!==CACHE).map(key=>caches.delete(key)))));});
self.addEventListener("fetch",event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=="GET"||url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return;
 if(event.request.mode==="navigate"){event.respondWith(fetch(event.request).catch(()=>caches.match("/app/index.html")));return;}
 if(FILES.includes(url.pathname))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))??fetch(event.request)));
});
