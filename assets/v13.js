/* Sunshine v3.13 — push notifications + realtime Asaas alerts */
(function(){
  let realtimeChannel=null;
  let pushRegistration=null;
  let pushChecked=false;

  function pushSupported(){
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  function b64urlToUint8Array(base64String){
    const padding='='.repeat((4-base64String.length%4)%4);
    const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
    const rawData=atob(base64);
    return Uint8Array.from([...rawData].map(c=>c.charCodeAt(0)));
  }

  async function ensureServiceWorker(){
    if(!pushSupported()) return null;
    if(pushRegistration) return pushRegistration;
    try{
      pushRegistration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
      await navigator.serviceWorker.ready;
      return pushRegistration;
    }catch(err){ console.error('service_worker_error',err); return null; }
  }

  async function currentSubscription(){
    const reg=await ensureServiceWorker();
    if(!reg) return null;
    return await reg.pushManager.getSubscription();
  }

  async function isPushEnabled(){
    if(!pushSupported() || Notification.permission!=='granted') return false;
    return Boolean(await currentSubscription());
  }

  function ensurePushStyles(){
    if(document.getElementById('pushAlertStyles')) return;
    const style=document.createElement('style');
    style.id='pushAlertStyles';
    style.textContent=`
      .push-alert-banner{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;margin-bottom:14px;border:1px solid #F0D5B4;border-radius:16px;background:#FFF8EF}
      .push-alert-banner strong{display:block;color:#5B2E20;margin-bottom:3px}
      .push-alert-banner span{font-size:13px;color:#7A6258}
      .push-alert-banner .btn{white-space:nowrap}
      @media(max-width:720px){.push-alert-banner{align-items:flex-start;flex-direction:column}.push-alert-banner .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  async function renderPushBanner(){
    if(state.demo || state.view!=='home' || !state.session) return;
    ensurePushStyles();
    const content=document.getElementById('content');
    if(!content) return;
    content.querySelector('#pushAlertBanner')?.remove();
    if(!pushSupported()) return;
    const enabled=await isPushEnabled();
    if(enabled) return;
    const denied=Notification.permission==='denied';
    const banner=document.createElement('div');
    banner.id='pushAlertBanner';
    banner.className='push-alert-banner';
    banner.innerHTML=`<div><strong>${denied?'Notificações bloqueadas no navegador':'Receber pagamentos do Asaas no celular'}</strong><span>${denied?'Ative as notificações nas permissões do navegador para receber os alertas.':'Quando um pagamento chegar, a Sunshine avisa mesmo com o aplicativo fechado.'}</span></div>${denied?'':'<button class="btn" type="button" id="enablePushBtn">Ativar notificações</button>'}`;
    content.prepend(banner);
    banner.querySelector('#enablePushBtn')?.addEventListener('click',enablePushNotifications);
  }

  async function enablePushNotifications(){
    if(!requireReal()) return;
    if(!pushSupported()){ toast('Este navegador não suporta notificações push.','error'); return; }
    const permission=await Notification.requestPermission();
    if(permission!=='granted'){
      toast('Permissão de notificações não concedida.','error');
      await renderPushBanner();
      return;
    }
    const reg=await ensureServiceWorker();
    if(!reg){ toast('Não foi possível ativar o serviço de notificações.','error'); return; }
    try{
      const {data:config,error:configError}=await db.functions.invoke('push-config',{body:{}});
      if(configError || !config?.publicKey) throw configError || new Error('Chave pública de push indisponível.');
      let subscription=await reg.pushManager.getSubscription();
      if(!subscription){
        subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64urlToUint8Array(config.publicKey)});
      }
      const json=subscription.toJSON();
      const {error}=await db.from('push_subscriptions').upsert({
        auth_user_id:state.session.user.id,
        endpoint:subscription.endpoint,
        p256dh:json.keys?.p256dh,
        auth:json.keys?.auth,
        user_agent:navigator.userAgent,
        active:true,
        failure_count:0,
        updated_at:new Date().toISOString()
      },{onConflict:'endpoint'});
      if(error) throw error;
      toast('Notificações de pagamentos do Asaas ativadas.');
      await renderPushBanner();
    }catch(err){
      console.error('push_enable_error',err);
      toast(err?.message||'Não foi possível ativar as notificações.','error');
    }
  }

  function startRealtimeNotifications(){
    if(!db || !state.session || realtimeChannel) return;
    realtimeChannel=db.channel('sunshine-app-notifications')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'app_notifications'},payload=>{
        const n=payload.new||{};
        if(n.notification_type==='ASAAS_PAYMENT_RECEIVED'){
          toast(n.body||'Novo pagamento recebido pelo Asaas.');
          if(typeof refreshAsaasBell==='function') refreshAsaasBell();
        }
      })
      .subscribe();
  }

  async function initPushAfterAuth(){
    if(!state.session || state.demo) return;
    await ensureServiceWorker();
    startRealtimeNotifications();
    await renderPushBanner();
    const params=new URLSearchParams(location.search);
    if(params.get('view')==='financeiro'){
      setTimeout(()=>navigate('financeiro'),100);
      history.replaceState({},'',location.pathname);
    }
  }

  const previousBindViewActions=bindViewActions;
  bindViewActions=function(){
    previousBindViewActions();
    setTimeout(renderPushBanner,0);
  };

  navigator.serviceWorker?.addEventListener('message',event=>{
    if(event.data?.type==='OPEN_FINANCEIRO_ASAAS') navigate('financeiro');
  });

  const poll=setInterval(()=>{
    if(state.session && !pushChecked){
      pushChecked=true;
      clearInterval(poll);
      initPushAfterAuth();
    }
  },400);
  setTimeout(()=>clearInterval(poll),20000);
})();
