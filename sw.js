/* SRP Site Visit — offline cache */
const V='srp-visit-v3';
const SHELL=['./','index.html','style.css','app.js','manifest.webmanifest','assets/fonts.css','assets/fonts/sora-latin-1.woff2','assets/fonts/sora-latin-ext-0.woff2','assets/vendor/jspdf.umd.min.js','assets/logo.png','assets/bg/bg2.jpg','assets/icons/icon-192.png','assets/icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  // Network first (so updates arrive), cache as backup when there is no signal
  e.respondWith(fetch(e.request).then(r=>{ const cp=r.clone(); if(r.ok) caches.open(V).then(c=>c.put(e.request,cp)); return r; })
    .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('index.html'))));
});
