const CACHE_NAME='sunshine-v3.50';

self.addEventListener('install',event=>{ self.skipWaiting(); });
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.mode==='navigate' || new URL(req.url).pathname==='/' || new URL(req.url).pathname.endsWith('/index.html')){
    event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match(req)));
  }
});

self.addEventListener('push',event=>{
  let data={};
  try{ data=event.data?event.data.json():{}; }catch{ data={title:'Sunshine Oráculos',body:event.data?.text()||'Nova notificação'}; }
  const title=data.title||'Sunshine Oráculos';
  const uniqueTag=data.tag||data.notificationId||`sunshine-${Date.now()}`;
  const options={body:data.body||'',icon:'/assets/sunshine-app-icon.svg',badge:'/assets/sunshine-app-icon.svg',tag:uniqueTag,renotify:true,requireInteraction:true,vibrate:[180,80,180,80,220],timestamp:Date.now(),data:{url:data.url||'/?view=financeiro&asaas=pending',notificationId:data.notificationId||null}};
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'/?view=financeiro&asaas=pending',self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.focus();client.postMessage({type:'OPEN_FINANCEIRO_ASAAS'});return;}}
    await self.clients.openWindow(target);
  })());
});
