/* Sunshine v3.64 — cadastro inline do atendido + pagador preservado + múltiplos inscritos. */
(function(){
  const VERSION='v3.64';
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

  function prefixFor(form){return form?.querySelector('#arClient')?'ar':'ag';}

  function selectedClientName(form){
    const select=form?.querySelector('#agClient,#arClient');
    if(select?.value){
      return (state?.clients||[]).find(c=>c.id===select.value)?.full_name||'';
    }
    const prefix=prefixFor(form);
    const newBox=form?.querySelector('.asaas-new-client64');
    if(newBox&&!newBox.hidden)return form.querySelector('#'+prefix+'Name')?.value?.trim()||'';
    return '';
  }

  function collectPeople(box){
    return [...(box?.querySelectorAll('[data-person64]')||[])].map(row=>({
      name:row.querySelector('[data-name64]')?.value.trim()||'',
      birth_date:row.querySelector('[data-birth64]')?.value||null,
      loved_person_name:row.querySelector('[data-loved64]')?.value.trim()||null,
      rival_name:row.querySelector('[data-rival64]')?.value.trim()||null
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

  function payerSnapshot(form){
    if(form.__payer64)return form.__payer64;
    const prefix=prefixFor(form);
    const get=id=>form.querySelector('#'+id)?.value?.trim()||'';
    form.__payer64={
      name:get(prefix+'Name'),
      phone:get(prefix+'Phone'),
      email:get(prefix+'Email'),
      document:get(prefix+'Document'),
      birth:get(prefix+'Birth')
    };
    return form.__payer64;
  }

  async function hardenRpc(){
    if(!db||db.__sunshineFlow364)return;
    db.__sunshineFlow364=true;
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
            const box=configs[i]?.root?.querySelector('.asaas-participants64');
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
          const box=cfg?.root?.querySelector('.asaas-participants64');
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
    if(document.getElementById('sunshineV64Styles'))return;
    const s=document.createElement('style');
    s.id='sunshineV64Styles';
    s.textContent=`
      .asaas-beneficiary47{display:none!important}
      .asaas-simple-status64{grid-column:1/-1;margin-top:7px;padding:9px 11px;border-radius:10px;background:#fff3d7;color:#875100;font-size:12px;font-weight:800;line-height:1.4}
      .asaas-simple-status64.ok{background:#eaf5ef;color:#256044}
      .asaas-client-actions64{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}
      .asaas-client-actions64 button{flex:1;min-width:180px}
      .asaas-new-client64{grid-column:1/-1;border:1px solid #ead7c9;background:#fffaf6;border-radius:14px;padding:12px;display:grid;gap:10px;margin-top:10px}
      .asaas-new-client64[hidden]{display:none!important}
      .asaas-new-client-head64{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
      .asaas-new-client-head64 h4{margin:0 0 3px}.asaas-new-client-head64 p{margin:0;color:#806b62;font-size:12px}
      .asaas-new-fields64{display:grid;grid-template-columns:1fr 1fr;gap:10px}.asaas-new-fields64 .wide64{grid-column:1/-1}
      .asaas-payer-details64{grid-column:1/-1;border:1px solid #eadfd8;border-radius:12px;background:#fffaf6;padding:0;overflow:hidden;margin-top:12px}
      .asaas-payer-details64 summary{cursor:pointer;padding:11px 13px;font-size:12px;font-weight:800;color:#6f5a50;list-style:none}.asaas-payer-details64 summary::-webkit-details-marker{display:none}.asaas-payer-details64 summary:after{content:'▾';float:right}.asaas-payer-details64[open] summary:after{content:'▴'}
      .asaas-payer-grid64{padding:0 12px 12px;display:grid;grid-template-columns:1fr 1fr;gap:8px}.asaas-payer-grid64 div{border:1px solid #eee1d8;border-radius:9px;padding:8px;background:#fff}.asaas-payer-grid64 small{display:block;color:#806b62;margin-bottom:2px}.asaas-payer-grid64 b{font-size:12px;overflow-wrap:anywhere}
      .asaas-payer-note47,.asaas-payer-details62,.asaas-payer-details63{display:none!important}
      .asaas-participants64{grid-column:1/-1;border:1px solid #ead7c9;background:#fffaf6;border-radius:14px;padding:12px;display:grid;gap:10px}.asaas-participants64[hidden]{display:none!important}.asaas-participants-head64{display:flex;gap:10px;align-items:end;justify-content:space-between}.asaas-participants-head64 label{max-width:180px}.asaas-participants-summary64{font-size:12px;font-weight:800;color:#5f4a42;padding-bottom:9px}
      .asaas-people64{display:grid;gap:9px}.asaas-person64{border-top:1px solid #eadfd8;padding-top:9px;display:grid;gap:7px}.asaas-person64>label{font-weight:800}.asaas-person64 details{border:1px solid #eee1d8;border-radius:10px;background:#fff}.asaas-person64 summary{padding:8px 10px;cursor:pointer;font-size:11px;font-weight:800;color:#806b62}.asaas-person-extra64{padding:0 9px 9px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
      @media(max-width:720px){.asaas-new-fields64,.asaas-payer-grid64,.asaas-person-extra64{grid-template-columns:1fr}.asaas-new-fields64 .wide64{grid-column:auto}.asaas-participants-head64{display:grid}.asaas-participants-head64 label{max-width:none}.asaas-client-actions64{display:grid}.asaas-client-actions64 button{min-width:0;width:100%}}
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

  function labelFor(input,text){
    const label=input?.closest('label');
    if(label)setLabelText(label,text);
    return label;
  }

  function createPayerDetails(form,anchor){
    if(form.querySelector('.asaas-payer-details64'))return;
    const payer=payerSnapshot(form);
    const details=document.createElement('details');
    details.className='asaas-payer-details64';
    const fields=[
      ['Nome',payer.name],['Telefone',payer.phone],['E-mail',payer.email],['CPF/CNPJ',payer.document]
    ].filter(x=>x[1]);
    details.innerHTML=`<summary>Ver dados do pagador: ${escapeHtml(payer.name||'não identificado')}</summary><div class="asaas-payer-grid64">${fields.map(([k,v])=>`<div><small>${escapeHtml(k)}</small><b>${escapeHtml(v)}</b></div>`).join('')||'<div><b>Sem dados adicionais do pagador.</b></div>'}</div>`;
    anchor.insertAdjacentElement('afterend',details);
  }

  function setupInlineClient(form,select,picker,input,status){
    if(form.querySelector('.asaas-new-client64'))return form.querySelector('.asaas-new-client64');
    const prefix=prefixFor(form);
    const payer=payerSnapshot(form);
    const inputs={
      name:form.querySelector('#'+prefix+'Name'),
      phone:form.querySelector('#'+prefix+'Phone'),
      email:form.querySelector('#'+prefix+'Email'),
      document:form.querySelector('#'+prefix+'Document'),
      birth:form.querySelector('#'+prefix+'Birth')
    };
    const labels=Object.values(inputs).map(x=>x?.closest('label')).filter(Boolean);
    if(!inputs.name||!labels.length)return null;

    const box=document.createElement('section');
    box.className='asaas-new-client64';
    box.hidden=true;
    box.innerHTML='<div class="asaas-new-client-head64"><div><h4>Cadastrar pessoa sem sair daqui</h4><p>Esses dados são da pessoa atendida. Os dados do pagador ficam salvos separadamente no pagamento.</p></div><button type="button" class="link-btn" data-close-new64>Fechar</button></div><div class="asaas-new-fields64"></div>';
    const fields=box.querySelector('.asaas-new-fields64');
    picker.insertAdjacentElement('afterend',box);

    labels.forEach(label=>fields.appendChild(label));
    labelFor(inputs.name,'Nome da pessoa atendida');
    labelFor(inputs.phone,'Telefone (opcional)');
    labelFor(inputs.email,'E-mail (opcional)');
    labelFor(inputs.document,'CPF/CNPJ (opcional)');
    labelFor(inputs.birth,'Nascimento (opcional)');
    inputs.name.closest('label')?.classList.add('wide64');

    Object.values(inputs).forEach(x=>{if(x)x.value='';});

    let actions=status.parentElement?.querySelector('.asaas-client-actions64');
    if(!actions){
      actions=document.createElement('div');actions.className='asaas-client-actions64';
      actions.innerHTML='<button type="button" class="btn ghost" data-new-attended64>+ Cadastrar nova pessoa</button><button type="button" class="btn ghost" data-use-payer64>O pagador é a pessoa atendida</button>';
      status.insertAdjacentElement('afterend',actions);
    }

    const openNew=(usePayer=false)=>{
      select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));
      box.hidden=false;
      if(usePayer){
        inputs.name.value=payer.name||input.value.trim();
        inputs.phone.value=payer.phone||'';
        inputs.email.value=payer.email||'';
        inputs.document.value=payer.document||'';
        inputs.birth.value=payer.birth||'';
      }else if(!inputs.name.value.trim()){
        inputs.name.value=input.value.trim();
      }
      inputs.name.focus();
      syncParticipantName(form);
    };

    actions.addEventListener('click',e=>{
      if(e.target.closest('[data-new-attended64]'))openNew(false);
      if(e.target.closest('[data-use-payer64]'))openNew(true);
    });
    box.addEventListener('click',e=>{if(e.target.closest('[data-close-new64]'))box.hidden=true;});
    inputs.name.addEventListener('input',()=>syncParticipantName(form));
    select.addEventListener('change',()=>{if(select.value)box.hidden=true;});

    const divider=[...form.querySelectorAll('.form-divider')].find(x=>/criar|dados do pagador|novo cliente/i.test(x.textContent||''));
    divider?.remove();
    createPayerDetails(form,box);
    return box;
  }

  function personHtml(i,data={}){
    return `<div class="asaas-person64" data-person64><label>Pessoa ${i+1}<input data-name64 value="${escapeHtml(data.name||'')}" placeholder="Nome do inscrito" required></label><details><summary>Dados opcionais desta pessoa</summary><div class="asaas-person-extra64"><label>Nascimento<input type="date" data-birth64 value="${escapeHtml(data.birth_date||'')}"></label><label>Pessoa amada<input data-loved64 value="${escapeHtml(data.loved_person_name||'')}"></label><label>Rival<input data-rival64 value="${escapeHtml(data.rival_name||'')}"></label></div></details></div>`;
  }

  function renderPeople(box,qty,clientName){
    const list=box.querySelector('.asaas-people64');
    const old=collectPeople(box);
    const autoFirst=box.dataset.autoFirst64!=='0';
    list.innerHTML=Array.from({length:qty},(_,i)=>personHtml(i,old[i]||{name:i===0&&autoFirst?clientName:''})).join('');
    const first=list.querySelector('[data-name64]');
    if(first){
      if(!old[0]?.name&&clientName){first.value=clientName;box.dataset.autoFirst64='1';}
      first.addEventListener('input',()=>{box.dataset.autoFirst64='0';},{once:true});
    }
  }

  function syncParticipantName(form){
    const name=selectedClientName(form);
    form.querySelectorAll('.asaas-participants64').forEach(box=>{
      const first=box.querySelector('[data-name64]');
      if(first&&(box.dataset.autoFirst64!=='0'||!first.value.trim())){
        first.value=name;box.dataset.autoFirst64='1';
      }
    });
  }

  function decoratePart(form,cfg){
    if(!cfg?.work||!cfg?.amount||!cfg.root)return;
    let box=cfg.root.querySelector(':scope > .asaas-participants64');
    if(!box){
      box=document.createElement('div');
      box.className='asaas-participants64';
      box.hidden=true;
      box.innerHTML='<div class="asaas-participants-head64"><label>Quantas pessoas?<input class="asaas-qty64" type="number" min="1" step="1" value="1"></label><div class="asaas-participants-summary64"></div></div><div class="asaas-people64"></div>';
      (cfg.amount.closest('label')||cfg.root.lastElementChild)?.insertAdjacentElement('afterend',box);
    }
    const qty=box.querySelector('.asaas-qty64');
    const summary=box.querySelector('.asaas-participants-summary64');
    const oldLovedLabel=cfg.loved?.closest('label'),oldRivalLabel=cfg.rival?.closest('label');

    const sync=(allowGuess=false)=>{
      const work=(state?.works||[]).find(w=>w.id===cfg.work.value);
      const isWork=Boolean(work);
      box.hidden=!isWork;
      if(oldLovedLabel)oldLovedLabel.hidden=isWork;
      if(oldRivalLabel)oldRivalLabel.hidden=isWork;
      if(!isWork)return;
      const unit=Number(work.unit_price||0),received=Number(String(cfg.amount.value||0).replace(',','.'));
      if(allowGuess&&box.dataset.qtyTouched64!=='1'&&unit>0&&received>0){
        const ratio=received/unit,rounded=Math.round(ratio);
        if(rounded>=1&&Math.abs(ratio-rounded)<0.001)qty.value=String(rounded);
      }
      const n=Math.max(1,Math.floor(Number(qty.value||1)));
      qty.value=String(n);
      const current=box.querySelectorAll('[data-person64]').length;
      if(current!==n)renderPeople(box,n,selectedClientName(form));
      const expected=unit*n,saldo=Math.max(expected-received,0);
      const summaryText=unit>0?`${n} × ${money(unit)} = ${money(expected)} · recebido ${money(received)}${saldo>0?` · falta ${money(saldo)}`:' · quitado'}`:`${n} pessoa(s) · recebido ${money(received)}`;
      if(summary.textContent!==summaryText)summary.textContent=summaryText;
    };

    if(box.dataset.bound64!=='1'){
      box.dataset.bound64='1';
      qty.addEventListener('input',()=>{box.dataset.qtyTouched64='1';sync(false)});
      cfg.work.addEventListener('change',()=>{if(cfg.work.value&&cfg.service)cfg.service.value='';box.dataset.qtyTouched64='0';sync(true)});
      cfg.service?.addEventListener('change',()=>{if(cfg.service.value&&cfg.work.value){cfg.work.value='';sync(false)}});
      cfg.amount.addEventListener('input',()=>sync(true));
      form.querySelector('#agClient,#arClient')?.addEventListener('change',()=>syncParticipantName(form));
    }
    sync(true);
  }

  function simplifyForm(form){
    if(!form)return;
    form.querySelectorAll('.asaas-beneficiary47').forEach(el=>el.remove());
    form.querySelectorAll('[data-association-help359],[data-association-help360]').forEach(el=>el.remove());
    form.querySelectorAll('.asaas-payer-note47,[data-association-status359],[data-association-status360],.asaas-simple-status62,.asaas-simple-status63').forEach(el=>el.remove());

    const select=form.querySelector('#agClient,#arClient');
    if(!select)return;
    setLabelText(select.closest('label'),'Cliente');
    const firstBox=form.querySelector('.soft-box');
    if(firstBox){
      const h3=firstBox.querySelector('h3'),p=firstBox.querySelector('p');
      if(h3&&h3.textContent!=='1. De quem é este pagamento?')h3.textContent='1. De quem é este pagamento?';
      if(p&&p.textContent!=='Busque a pessoa atendida. Se ela ainda não existe, cadastre aqui sem sair da tela.')p.textContent='Busque a pessoa atendida. Se ela ainda não existe, cadastre aqui sem sair da tela.';
    }

    const picker=pickerFor(select);
    const input=picker?.querySelector('input[type="search"]');
    if(input){
      input.placeholder='Digite nome, telefone ou e-mail';
      input.setAttribute('aria-label','Buscar cliente por nome, telefone ou e-mail');
      let status=picker.parentElement?.querySelector('.asaas-simple-status64');
      if(!status){status=document.createElement('div');status.className='asaas-simple-status64';picker.insertAdjacentElement('afterend',status);}
      const newBox=setupInlineClient(form,select,picker,input,status);
      const syncClient=()=>{
        const c=(state?.clients||[]).find(x=>x.id===select.value);
        const creating=newBox&&!newBox.hidden&&form.querySelector('#'+prefixFor(form)+'Name')?.value.trim();
        const cls=c||creating?'asaas-simple-status64 ok':'asaas-simple-status64';
        const txt=c?`Cliente selecionado: ${c.full_name}`:creating?`Nova pessoa: ${form.querySelector('#'+prefixFor(form)+'Name').value.trim()} · será cadastrada ao concluir`:'Procure a pessoa. Se não existir, toque em “Cadastrar nova pessoa”.';
        if(status.className!==cls)status.className=cls;if(status.textContent!==txt)status.textContent=txt;
      };
      if(!picker.dataset.simple64){
        picker.dataset.simple64='1';
        input.addEventListener('input',syncClient);
        select.addEventListener('change',syncClient);
        newBox?.addEventListener('input',syncClient);
      }
      syncClient();
      if(!form.dataset.guard64){
        form.dataset.guard64='1';
        form.addEventListener('submit',e=>{
          const prefix=prefixFor(form),box=form.querySelector('.asaas-new-client64'),newName=form.querySelector('#'+prefix+'Name')?.value.trim()||'';
          if(!select.value&&(box?.hidden||!newName)){
            e.preventDefault();e.stopImmediatePropagation();toast('Selecione uma pessoa existente ou cadastre a pessoa atendida aqui mesmo.','error');input.focus();
          }
        },true);
      }
    }

    partConfigs(form).forEach(cfg=>decoratePart(form,cfg));
  }

  function pinVersion(){
    document.documentElement.dataset.sunshineVersion=VERSION;
    document.querySelectorAll('.sidebar-version-current').forEach(el=>{if(!el.textContent.includes(VERSION))el.innerHTML='<span class="dot"></span> Ecossistema Sunshine · v3.64';});
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
