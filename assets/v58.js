/* Sunshine v3.63 — fluxo único de associação + múltiplos inscritos no Asaas. */
(function(){
  const VERSION='v3.63';
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const digits=v=>String(v||'').replace(/\D/g,'');
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
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

  function selectedClientName(form){
    const select=form?.querySelector('#agClient,#arClient');
    if(!select?.value)return '';
    return (state?.clients||[]).find(c=>c.id===select.value)?.full_name||'';
  }

  function collectPeople(box){
    return [...(box?.querySelectorAll('[data-person63]')||[])].map(row=>({
      name:row.querySelector('[data-name63]')?.value.trim()||'',
      birth_date:row.querySelector('[data-birth63]')?.value||null,
      loved_person_name:row.querySelector('[data-loved63]')?.value.trim()||null,
      rival_name:row.querySelector('[data-rival63]')?.value.trim()||null
    }));
  }

  function partConfigs(form){
    if(!form)return [];
    if(form.id==='asaasResolveForm'){
      return [{root:form,work:form.querySelector('#arWork'),service:form.querySelector('#arService'),amount:[...form.querySelectorAll('input')].find(x=>x.disabled&&/^\d+[.,]?\d*$/.test(String(x.value||''))),loved:form.querySelector('#arLoved'),rival:form.querySelector('#arRival')}];
    }
    const first={root:form,work:form.querySelector('#agWork'),service:form.querySelector('#agService'),amount:form.querySelector('#agAmount0'),loved:form.querySelector('#agLoved'),rival:form.querySelector('#agRival')};
    const extras=[...form.querySelectorAll('.asaas-extra-item27')].map(root=>({root,work:root.querySelector('.agExtraWork27'),service:root.querySelector('.agExtraService27'),amount:root.querySelector('.agExtraAmount27'),loved:root.querySelector('.agExtraLoved27'),rival:root.querySelector('.agExtraRival27')}));
    return [first,...extras];
  }

  async function hardenRpc(){
    if(!db||db.__sunshineFlow363)return;
    db.__sunshineFlow363=true;
    const previous=db.rpc.bind(db);
    db.rpc=async function(fn,args={},options){
      if(fn==='search_clients_v349'){
        const res=await previous(fn,args,options);
        const q=String(args?.p_query||'').trim();
        if(q.length<2)return res;
        const limit=Math.min(Math.max(Number(args?.p_limit||15),1),50);
        const offset=Math.max(Number(args?.p_offset||0),0);
        const filtered=(res?.data||[]).filter(c=>matchesClient(c,q));
        if(!res?.error&&filtered.length)return {...res,data:filtered};
        const fallback=localSearch(q,limit,offset);
        if(fallback.length||res?.error)return {data:fallback,error:null};
        return {...res,data:filtered};
      }

      if(fn==='resolve_asaas_entry_multi'){
        const form=document.getElementById('asaasGlobalResolveForm');
        if(form&&Array.isArray(args?.p_items)){
          const configs=partConfigs(form);
          const items=args.p_items.map((item,i)=>{
            if(!item?.work_id)return item;
            const box=configs[i]?.root?.querySelector('.asaas-participants63');
            const participants=collectPeople(box);
            return {...item,quantity:participants.length||1,participants};
          });
          const missing=items.some(item=>item?.work_id&&(!item.participants?.length||item.participants.some(p=>!p.name)));
          if(missing)return {data:null,error:{message:'Informe o nome de todas as pessoas inscritas.'}};
          return previous(fn,{...args,p_items:items},options);
        }
      }

      if(fn==='resolve_asaas_entry'){
        const form=document.getElementById('asaasResolveForm');
        if(form&&args?.p_entry_id){
          const cfg=partConfigs(form)[0];
          const workId=args.p_work_id||null;
          const box=cfg?.root?.querySelector('.asaas-participants63');
          const participants=workId?collectPeople(box):[];
          if(workId&&(!participants.length||participants.some(p=>!p.name)))return {data:null,error:{message:'Informe o nome de todas as pessoas inscritas.'}};
          let amount=Number(String(cfg?.amount?.value||'').replace(',','.'));
          if(!(amount>0)){
            const q=await db.from('asaas_incoming_payments').select('gross_amount').eq('id',args.p_entry_id).maybeSingle();
            amount=Number(q.data?.gross_amount||0);
          }
          return previous('resolve_asaas_entry_multi',{
            p_entry_id:args.p_entry_id,
            p_client_id:args.p_client_id||null,
            p_client_name:args.p_client_name||null,
            p_client_phone:args.p_client_phone||null,
            p_client_email:args.p_client_email||null,
            p_client_birth_date:args.p_client_birth_date||null,
            p_document_number:args.p_document_number||null,
            p_items:[{
              service_id:args.p_service_id||null,
              work_id:workId,
              responsible_member_id:args.p_responsible_member_id||null,
              amount,
              quantity:participants.length||1,
              participants,
              loved_person_name:args.p_loved_person_name||null,
              rival_name:args.p_rival_name||null,
              notes:args.p_notes||null
            }],
            p_notes:args.p_notes||null
          },options);
        }
      }
      return previous(fn,args,options);
    };
  }

  function styles(){
    if(document.getElementById('sunshineV63Styles'))return;
    const s=document.createElement('style');
    s.id='sunshineV63Styles';
    s.textContent=`
      .asaas-beneficiary47{display:none!important}
      .asaas-simple-status63{grid-column:1/-1;margin-top:7px;padding:9px 11px;border-radius:10px;background:#fff3d7;color:#875100;font-size:12px;font-weight:800;line-height:1.4}
      .asaas-simple-status63.ok{background:#eaf5ef;color:#256044}
      .asaas-payer-details63{grid-column:1/-1;border:1px solid #eadfd8;border-radius:12px;background:#fffaf6;padding:0;overflow:hidden}
      .asaas-payer-details63 summary{cursor:pointer;padding:11px 13px;font-size:12px;font-weight:800;color:#6f5a50;list-style:none}
      .asaas-payer-details63 summary::-webkit-details-marker{display:none}.asaas-payer-details63 summary:after{content:'▾';float:right}.asaas-payer-details63[open] summary:after{content:'▴'}
      .asaas-payer-fields63{padding:0 12px 12px;display:grid;grid-template-columns:1fr 1fr;gap:10px}.asaas-payer-fields63 .span-2{grid-column:1/-1}
      .asaas-payer-note47{display:none!important}
      .asaas-participants63{grid-column:1/-1;border:1px solid #ead7c9;background:#fffaf6;border-radius:14px;padding:12px;display:grid;gap:10px}
      .asaas-participants63[hidden]{display:none!important}.asaas-participants-head63{display:flex;gap:10px;align-items:end;justify-content:space-between}.asaas-participants-head63 label{max-width:180px}.asaas-participants-summary63{font-size:12px;font-weight:800;color:#5f4a42;padding-bottom:9px}
      .asaas-people63{display:grid;gap:9px}.asaas-person63{border-top:1px solid #eadfd8;padding-top:9px;display:grid;gap:7px}.asaas-person63>label{font-weight:800}.asaas-person63 details{border:1px solid #eee1d8;border-radius:10px;background:#fff}.asaas-person63 summary{padding:8px 10px;cursor:pointer;font-size:11px;font-weight:800;color:#806b62}.asaas-person-extra63{padding:0 9px 9px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
      @media(max-width:720px){.asaas-payer-fields63,.asaas-person-extra63{grid-template-columns:1fr}.asaas-payer-fields63 .span-2{grid-column:auto}.asaas-participants-head63{display:grid}.asaas-participants-head63 label{max-width:none}}
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
    if(form.querySelector('.asaas-payer-details63'))return;
    form.querySelector('.asaas-payer-details62')?.remove();
    const prefix=select.id.startsWith('ar')?'ar':'ag';
    const ids=[`${prefix}Name`,`${prefix}Phone`,`${prefix}Email`,`${prefix}Document`,`${prefix}Birth`];
    const labels=ids.map(id=>form.querySelector('#'+id)?.closest('label')).filter(Boolean);
    if(!labels.length)return;
    const divider=[...form.querySelectorAll('.form-divider')].find(x=>/criar|dados do pagador|novo cliente/i.test(x.textContent||''));
    const payerName=form.querySelector('#'+prefix+'Name')?.value?.trim()||'pagador recebido';
    const details=document.createElement('details');
    details.className='asaas-payer-details63';
    details.innerHTML=`<summary>Ver dados do pagador: ${escapeHtml(payerName)}</summary><div class="asaas-payer-fields63"></div>`;
    const fields=details.querySelector('.asaas-payer-fields63');
    (divider||labels[0]).insertAdjacentElement('beforebegin',details);
    labels.forEach(label=>fields.appendChild(label));
    divider?.remove();
  }

  function personHtml(i,data={}){
    return `<div class="asaas-person63" data-person63><label>Pessoa ${i+1}<input data-name63 value="${escapeHtml(data.name||'')}" placeholder="Nome do inscrito" required></label><details><summary>Dados opcionais desta pessoa</summary><div class="asaas-person-extra63"><label>Nascimento<input type="date" data-birth63 value="${escapeHtml(data.birth_date||'')}"></label><label>Pessoa amada<input data-loved63 value="${escapeHtml(data.loved_person_name||'')}"></label><label>Rival<input data-rival63 value="${escapeHtml(data.rival_name||'')}"></label></div></details></div>`;
  }

  function renderPeople(box,qty,clientName){
    const list=box.querySelector('.asaas-people63');
    const old=collectPeople(box);
    const autoFirst=box.dataset.autoFirst63!=='0';
    list.innerHTML=Array.from({length:qty},(_,i)=>personHtml(i,old[i]||{name:i===0&&autoFirst?clientName:''})).join('');
    const first=list.querySelector('[data-name63]');
    if(first){
      if(!old[0]?.name&&clientName){first.value=clientName;box.dataset.autoFirst63='1';}
      first.addEventListener('input',()=>{box.dataset.autoFirst63='0';},{once:true});
    }
  }

  function decoratePart(form,cfg){
    if(!cfg?.work||!cfg?.amount||!cfg.root)return;
    let box=cfg.root.querySelector(':scope > .asaas-participants63');
    if(!box){
      box=document.createElement('div');
      box.className='asaas-participants63';
      box.hidden=true;
      box.innerHTML='<div class="asaas-participants-head63"><label>Quantas pessoas?<input class="asaas-qty63" type="number" min="1" step="1" value="1"></label><div class="asaas-participants-summary63"></div></div><div class="asaas-people63"></div>';
      (cfg.amount.closest('label')||cfg.root.lastElementChild)?.insertAdjacentElement('afterend',box);
    }
    const qty=box.querySelector('.asaas-qty63');
    const summary=box.querySelector('.asaas-participants-summary63');
    const oldLovedLabel=cfg.loved?.closest('label'),oldRivalLabel=cfg.rival?.closest('label');

    const sync=(allowGuess=false)=>{
      const work=(state?.works||[]).find(w=>w.id===cfg.work.value);
      const isWork=Boolean(work);
      box.hidden=!isWork;
      if(oldLovedLabel)oldLovedLabel.hidden=isWork;
      if(oldRivalLabel)oldRivalLabel.hidden=isWork;
      if(!isWork)return;
      const unit=Number(work.unit_price||0),received=Number(String(cfg.amount.value||0).replace(',','.'));
      if(allowGuess&&box.dataset.qtyTouched63!=='1'&&unit>0&&received>0){
        const ratio=received/unit;
        const rounded=Math.round(ratio);
        if(rounded>=1&&Math.abs(ratio-rounded)<0.001)qty.value=String(rounded);
      }
      const n=Math.max(1,Math.floor(Number(qty.value||1)));
      qty.value=String(n);
      const current=box.querySelectorAll('[data-person63]').length;
      if(current!==n)renderPeople(box,n,selectedClientName(form));
      const expected=unit*n;
      const saldo=Math.max(expected-received,0);
      const summaryText=unit>0?`${n} × ${money(unit)} = ${money(expected)} · recebido ${money(received)}${saldo>0?` · falta ${money(saldo)}`:' · quitado'}`:`${n} pessoa(s) · recebido ${money(received)}`;if(summary.textContent!==summaryText)summary.textContent=summaryText;
    };

    if(box.dataset.bound63!=='1'){
      box.dataset.bound63='1';
      qty.addEventListener('input',()=>{box.dataset.qtyTouched63='1';sync(false)});
      cfg.work.addEventListener('change',()=>{
        if(cfg.work.value&&cfg.service)cfg.service.value='';
        box.dataset.qtyTouched63='0';sync(true);
      });
      cfg.service?.addEventListener('change',()=>{if(cfg.service.value&&cfg.work.value){cfg.work.value='';sync(false)}});
      cfg.amount.addEventListener('input',()=>sync(true));
      form.querySelector('#agClient,#arClient')?.addEventListener('change',()=>{
        const first=box.querySelector('[data-name63]');
        if(first&&(box.dataset.autoFirst63!=='0'||!first.value.trim())){first.value=selectedClientName(form);box.dataset.autoFirst63='1';}
      });
    }
    sync(true);
  }

  function simplifyForm(form){
    if(!form)return;
    form.querySelectorAll('.asaas-beneficiary47').forEach(el=>el.remove());
    form.querySelectorAll('[data-association-help359],[data-association-help360]').forEach(el=>el.remove());
    form.querySelectorAll('.asaas-payer-note47,[data-association-status359],[data-association-status360],.asaas-simple-status62').forEach(el=>el.remove());

    const select=form.querySelector('#agClient,#arClient');
    if(!select)return;
    setLabelText(select.closest('label'),'Cliente');
    const firstBox=form.querySelector('.soft-box');
    if(firstBox){
      const h3=firstBox.querySelector('h3'),p=firstBox.querySelector('p');
      if(h3&&h3.textContent!=='1. De quem é este pagamento?')h3.textContent='1. De quem é este pagamento?';
      if(p&&p.textContent!=='Busque a pessoa atendida. O pagador pode ser outra pessoa ou empresa.')p.textContent='Busque a pessoa atendida. O pagador pode ser outra pessoa ou empresa.';
    }
    collapsePayerFields(form,select);

    const picker=pickerFor(select);
    const input=picker?.querySelector('input[type="search"]');
    if(input){
      input.placeholder='Digite nome, telefone ou e-mail';
      input.setAttribute('aria-label','Buscar cliente por nome, telefone ou e-mail');
      let status=picker.parentElement?.querySelector('.asaas-simple-status63');
      if(!status){status=document.createElement('div');status.className='asaas-simple-status63';picker.insertAdjacentElement('afterend',status);}
      const syncClient=()=>{const c=(state?.clients||[]).find(x=>x.id===select.value);const cls=c?'asaas-simple-status63 ok':'asaas-simple-status63',txt=c?`Cliente selecionado: ${c.full_name}`:'Digite e toque no nome correto para associar.';if(status.className!==cls)status.className=cls;if(status.textContent!==txt)status.textContent=txt;};
      if(!picker.dataset.simple63){picker.dataset.simple63='1';input.addEventListener('input',syncClient);select.addEventListener('change',syncClient);}
      syncClient();
      if(!form.dataset.guard63){form.dataset.guard63='1';form.addEventListener('submit',e=>{if(input.value.trim().length>=2&&!select.value){e.preventDefault();e.stopImmediatePropagation();toast('Selecione a pessoa na lista antes de concluir.','error');input.focus();}},true);}
    }

    partConfigs(form).forEach(cfg=>decoratePart(form,cfg));
  }

  function pinVersion(){
    document.documentElement.dataset.sunshineVersion=VERSION;
    document.querySelectorAll('.sidebar-version-current').forEach(el=>{if(!el.textContent.includes(VERSION))el.innerHTML='<span class="dot"></span> Ecossistema Sunshine · v3.63';});
  }

  function run(){
    scheduled=false;
    styles();hardenRpc();pinVersion();
    simplifyForm(document.getElementById('asaasGlobalResolveForm'));
    simplifyForm(document.getElementById('asaasResolveForm'));
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(run);}
  const obs=new MutationObserver(schedule);obs.observe(document.body,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
