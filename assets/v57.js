/* Sunshine v3.60 — associação definitiva de clientes existentes em pagamentos Asaas. */
(function(){
  const VERSION='v3.60';
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const digits=v=>String(v||'').replace(/\D/g,'');

  function matchesClient(c,q){
    const text=norm(q), num=digits(q);
    if(!text)return false;
    if(norm(c.full_name).includes(text))return true;
    if(norm(c.preferred_name).includes(text))return true;
    if(norm(c.email).includes(text))return true;
    return num.length>=2 && digits(c.phone).includes(num);
  }

  function localSearch(q,limit=15,offset=0){
    const all=[...(state.clients||[])].filter(c=>matchesClient(c,q)).sort((a,b)=>String(a.full_name||'').localeCompare(String(b.full_name||''),'pt-BR'));
    return all.slice(offset,offset+limit).map(c=>({
      id:c.id,full_name:c.full_name,preferred_name:c.preferred_name||null,phone:c.phone||null,email:c.email||null,
      status:c.status||null,birth_date:c.birth_date||null,total_count:all.length
    }));
  }

  function patchSearchRpc(){
    if(!db||db.__sunshineSearch360)return;
    db.__sunshineSearch360=true;
    const original=db.rpc.bind(db);
    db.rpc=async function(fn,args={},options){
      if(fn!=='search_clients_v349')return original(fn,args,options);
      const q=String(args?.p_query||'').trim();
      if(q.length<2)return original(fn,args,options);
      const limit=Math.min(Math.max(Number(args?.p_limit||15),1),50);
      const offset=Math.max(Number(args?.p_offset||0),0);
      try{
        const res=await original(fn,args,options);
        if(res?.error)return res;
        const filtered=(res?.data||[]).filter(c=>matchesClient(c,q));
        if(filtered.length)return {...res,data:filtered};
        const fallback=localSearch(q,limit,offset);
        if(fallback.length || (res?.data||[]).length)return {...res,data:fallback};
        return res;
      }catch(e){
        const fallback=localSearch(q,limit,offset);
        if(fallback.length)return {data:fallback,error:null};
        throw e;
      }
    };
  }

  function findPicker(select){
    const next=select?.nextElementSibling;
    if(next?.classList?.contains('client-picker49'))return next;
    return select?.parentElement?.querySelector('.client-picker49')||select?.closest('form')?.querySelector(`.client-picker49[data-picker-for49="${select?.id||''}"]`)||null;
  }

  function decorateAsaasForm(form){
    if(!form)return;
    const select=form.querySelector('#agClient,#arClient');
    if(!select)return;

    form.querySelectorAll('.asaas-beneficiary47').forEach(el=>{el.hidden=true;el.style.display='none';});
    const picker=findPicker(select);
    if(!picker)return;
    const input=picker.querySelector('input[type="search"]');
    if(!input)return;

    if(!picker.querySelector('[data-association-help360]')){
      const help=document.createElement('div');
      help.dataset.associationHelp359='1';
      help.style.gridColumn='1/-1';
      help.style.fontSize='12px';
      help.style.lineHeight='1.45';
      help.style.color='#6f5a50';
      help.style.marginTop='2px';
      help.innerHTML='<b>Cliente já cadastrado:</b> digite nome, nome preferido, telefone ou e-mail e toque na pessoa correta. O cadastro do pagador não substitui o cadastro da cliente.';
      picker.appendChild(help);
    }

    let status=picker.parentElement?.querySelector('[data-association-status360]');
    if(!status){
      status=document.createElement('div');
      status.dataset.associationStatus359='1';
      status.style.marginTop='8px';
      status.style.padding='9px 11px';
      status.style.borderRadius='10px';
      status.style.fontSize='12px';
      status.style.fontWeight='800';
      picker.insertAdjacentElement('afterend',status);
    }

    const sync=()=>{
      const c=(state.clients||[]).find(x=>x.id===select.value);
      if(c){
        status.textContent=`Associar a: ${c.full_name}`;
        status.style.background='#eaf5ef';status.style.color='#256044';
      }else if(input.value.trim().length>=2){
        status.textContent='Nome digitado, mas nenhuma cliente foi selecionada. Toque no resultado correto antes de concluir.';
        status.style.background='#fff3d7';status.style.color='#875100';
      }else{
        status.textContent='Pesquise e selecione a cliente que receberá este pagamento.';
        status.style.background='#fff3d7';status.style.color='#875100';
      }
    };
    if(!picker.dataset.sync360){
      picker.dataset.sync360='1';
      input.addEventListener('input',sync);
      select.addEventListener('change',sync);
    }
    sync();

    if(!form.dataset.guard360){
      form.dataset.guard360='1';
      form.addEventListener('submit',e=>{
        const typed=input.value.trim();
        if(typed.length>=2 && !select.value){
          e.preventDefault();
          e.stopImmediatePropagation();
          toast('Selecione a cliente na lista antes de concluir. O sistema não vai criar outro cadastro a partir apenas do nome digitado.','error');
          input.focus();
        }
      },true);
    }
  }

  function run(){
    patchSearchRpc();
    decorateAsaasForm(document.getElementById('asaasGlobalResolveForm'));
    decorateAsaasForm(document.getElementById('asaasResolveForm'));
  }

  function pinVersion(){
    document.documentElement.dataset.sunshineVersion=VERSION;
    document.querySelectorAll('.sidebar-version-current').forEach(el=>{el.innerHTML='<span class="dot"></span> Ecossistema Sunshine · v3.60';});
  }

  const obs=new MutationObserver(()=>{run();pinVersion();});
  obs.observe(document.body,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{run();pinVersion();});else{run();pinVersion();}
})();
