/* Sunshine v3.62 — uma única busca de cliente na associação de pagamentos + fallback seguro. */
(function(){
  const VERSION='v3.62';
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const digits=v=>String(v||'').replace(/\D/g,'');
  let scheduled=false;

  function matchesClient(c,q){
    const text=norm(q),num=digits(q);
    if(!text)return false;
    if(norm(c.full_name).includes(text))return true;
    if(norm(c.preferred_name).includes(text))return true;
    if(norm(c.email).includes(text))return true;
    return num.length>=2&&digits(c.phone).includes(num);
  }

  function localSearch(q,limit=15,offset=0){
    const all=[...(state?.clients||[])].filter(c=>matchesClient(c,q)).sort((a,b)=>String(a.full_name||'').localeCompare(String(b.full_name||''),'pt-BR'));
    return all.slice(offset,offset+limit).map(c=>({id:c.id,full_name:c.full_name,preferred_name:c.preferred_name||null,phone:c.phone||null,email:c.email||null,status:c.status||null,birth_date:c.birth_date||null,total_count:all.length}));
  }

  function hardenSearch(){
    if(!db||db.__sunshineSearch362)return;
    db.__sunshineSearch362=true;
    const previous=db.rpc.bind(db);
    db.rpc=async function(fn,args={},options){
      const res=await previous(fn,args,options);
      if(fn!=='search_clients_v349')return res;
      const q=String(args?.p_query||'').trim();
      if(q.length<2)return res;
      const limit=Math.min(Math.max(Number(args?.p_limit||15),1),50);
      const offset=Math.max(Number(args?.p_offset||0),0);
      const filtered=(res?.data||[]).filter(c=>matchesClient(c,q));
      if(!res?.error&&filtered.length)return {...res,data:filtered};
      const fallback=localSearch(q,limit,offset);
      if(fallback.length||res?.error)return {data:fallback,error:null};
      return {...res,data:filtered};
    };
  }

  function styles(){
    if(document.getElementById('sunshineV62Styles'))return;
    const s=document.createElement('style');
    s.id='sunshineV62Styles';
    s.textContent=`
      .asaas-beneficiary47{display:none!important}
      .asaas-simple-status62{grid-column:1/-1;margin-top:7px;padding:9px 11px;border-radius:10px;background:#fff3d7;color:#875100;font-size:12px;font-weight:800;line-height:1.4}
      .asaas-simple-status62.ok{background:#eaf5ef;color:#256044}
      .asaas-payer-details62{grid-column:1/-1;border:1px solid #eadfd8;border-radius:12px;background:#fffaf6;padding:0;overflow:hidden}
      .asaas-payer-details62 summary{cursor:pointer;padding:11px 13px;font-size:12px;font-weight:800;color:#6f5a50;list-style:none}
      .asaas-payer-details62 summary::-webkit-details-marker{display:none}
      .asaas-payer-details62 summary:after{content:'▾';float:right}
      .asaas-payer-details62[open] summary:after{content:'▴'}
      .asaas-payer-fields62{padding:0 12px 12px;display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .asaas-payer-fields62 .span-2{grid-column:1/-1}
      .asaas-payer-note47{display:none!important}
      @media(max-width:720px){.asaas-payer-fields62{grid-template-columns:1fr}.asaas-payer-fields62 .span-2{grid-column:auto}}
    `;
    document.head.appendChild(s);
  }

  function pickerFor(select){
    if(!select)return null;
    const next=select.nextElementSibling;
    if(next?.classList?.contains('client-picker49'))return next;
    return select.parentElement?.querySelector('.client-picker49')||select.closest('form')?.querySelector(`.client-picker49[data-picker-for49="${select.id||''}"]`)||null;
  }

  function setLabelText(label,text){
    if(!label)return;
    const node=[...label.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());
    if(node)node.nodeValue=text+' ';
  }

  function collapsePayerFields(form,select){
    if(form.querySelector('.asaas-payer-details62'))return;
    const prefix=select.id.startsWith('ar')?'ar':'ag';
    const ids=[`${prefix}Name`,`${prefix}Phone`,`${prefix}Email`,`${prefix}Document`,`${prefix}Birth`];
    const labels=ids.map(id=>form.querySelector('#'+id)?.closest('label')).filter(Boolean);
    if(!labels.length)return;
    const divider=[...form.querySelectorAll('.form-divider')].find(x=>/criar|dados do pagador|novo cliente/i.test(x.textContent||''));
    const payerName=form.querySelector('#'+prefix+'Name')?.value?.trim()||'pagador recebido';
    const details=document.createElement('details');
    details.className='asaas-payer-details62';
    details.innerHTML=`<summary>Ver dados do pagador: ${escapeHtml(payerName)}</summary><div class="asaas-payer-fields62"></div>`;
    const fields=details.querySelector('.asaas-payer-fields62');
    (divider||labels[0]).insertAdjacentElement('beforebegin',details);
    labels.forEach(label=>fields.appendChild(label));
    divider?.remove();
  }

  function simplifyForm(form){
    if(!form)return;
    form.querySelectorAll('.asaas-beneficiary47').forEach(el=>el.remove());
    form.querySelectorAll('[data-association-help359],[data-association-help360]').forEach(el=>el.remove());
    form.querySelectorAll('.asaas-payer-note47').forEach(el=>el.remove());

    const select=form.querySelector('#agClient,#arClient');
    if(!select)return;
    const label=select.closest('label');
    setLabelText(label,'Cliente');

    const firstBox=form.querySelector('.soft-box');
    if(firstBox){
      const h3=firstBox.querySelector('h3');
      const p=firstBox.querySelector('p');
      if(h3)h3.textContent='1. Para quem é este pagamento?';
      if(p)p.textContent='Digite o nome, telefone ou e-mail e toque na pessoa correta.';
    }

    collapsePayerFields(form,select);

    const picker=pickerFor(select);
    if(!picker)return;
    const input=picker.querySelector('input[type="search"]');
    if(!input)return;
    input.placeholder='Digite nome, telefone ou e-mail';
    input.setAttribute('aria-label','Buscar cliente por nome, telefone ou e-mail');

    form.querySelectorAll('[data-association-status359],[data-association-status360]').forEach(el=>el.remove());
    let status=picker.parentElement?.querySelector('.asaas-simple-status62');
    if(!status){
      status=document.createElement('div');
      status.className='asaas-simple-status62';
      picker.insertAdjacentElement('afterend',status);
    }
    const sync=()=>{
      const c=(state?.clients||[]).find(x=>x.id===select.value);
      if(c){status.className='asaas-simple-status62 ok';status.textContent=`Cliente selecionado: ${c.full_name}`;}
      else{status.className='asaas-simple-status62';status.textContent='Digite e toque no nome correto para associar o pagamento.';}
    };
    if(!picker.dataset.simple62){
      picker.dataset.simple62='1';
      input.addEventListener('input',sync);
      select.addEventListener('change',sync);
    }
    sync();

    if(!form.dataset.guard62){
      form.dataset.guard62='1';
      form.addEventListener('submit',e=>{
        if(input.value.trim().length>=2&&!select.value){
          e.preventDefault();e.stopImmediatePropagation();
          toast('Selecione a pessoa na lista antes de concluir.','error');
          input.focus();
        }
      },true);
    }
  }

  function pinVersion(){
    document.documentElement.dataset.sunshineVersion=VERSION;
    document.querySelectorAll('.sidebar-version-current').forEach(el=>{el.innerHTML='<span class="dot"></span> Ecossistema Sunshine · v3.62';});
  }

  function run(){
    scheduled=false;
    styles();hardenSearch();pinVersion();
    simplifyForm(document.getElementById('asaasGlobalResolveForm'));
    simplifyForm(document.getElementById('asaasResolveForm'));
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(run);}
  const obs=new MutationObserver(schedule);obs.observe(document.body,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
