const CACHE_NAME='sunshine-push-v1';

self.addEventListener('install',event=>{ self.skipWaiting(); });
self.addEventListener('activate',event=>{ event.waitUntil(self.clients.claim()); });

self.addEventListener('push',event=>{
  let data={};
  try{ data=event.data?event.data.json():{}; }catch{ data={title:'Sunshine Oráculos',body:event.data?.text()||'Nova notificação'}; }
  const title=data.title||'Sunshine Oráculos';
  const options={
    body:data.body||'',
    icon:'/assets/sunshine-app-icon.svg',
    badge:'/assets/sunshine-app-icon.svg',
    tag:data.tag||'sunshine-notification',
    renotify:true,
    requireInteraction:false,
    vibrate:[180,80,180],
    data:{url:data.url||'/?view=financeiro',notificationId:data.notificationId||null}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'/?view=financeiro',self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if(new URL(client.url).origin===self.location.origin){
        await client.focus();
        client.postMessage({type:'OPEN_FINANCEIRO_ASAAS'});
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
