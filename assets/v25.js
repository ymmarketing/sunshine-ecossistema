/* Sunshine v3.25 — pendências Asaas globais e associação em qualquer tela */
(function(){
  const initialAsaasDeepLink=new URLSearchParams(location.search).get('asaas')==='pending';
  let pendingCache25=[];
  let overlay25=null;
  let observer25=null;
  let realtime25=null;

  const digits25=v=>String(v||'').replace(/\D/g,'');
  const statusPt25=v=>({RECEIVED:'Recebido',CONFIRMED:'Confirmado',PENDING:'Pendente',OVERDUE:'Vencido',REFUNDED:'Estornado',PIX:'PIX',CREDIT_CARD:'Cartão',BOLETO:'Boleto'}[v]||v||'—');

  function matchClient25(e){
    if(e.matched_client_id) return byId(state.clients,e.matched_client_id)||null;
    const doc=digits25(e.customer_document);
    const email=String(e.customer_email||'').trim().toLowerCase();
    const phone=digits25(e.customer_mobile_phone||e.customer_phone);
    return state.clients.find(c=>doc&&digits25(c.document_number)===doc)
      ||state.clients.find(c=>email&&String(c.email||'').trim().toLowerCase()===email)
      ||state.clients.find(c=>phone&&digits25(c.phone)===phone)
      ||null;
  }

  async function fetchPending25(){
    if(state.demo||!state.session||!db){ pendingCache25=[]; return pendingCache25; }
    const {data,error}=await db.from('asaas_incoming_payments')
      .select('*')
      .in('classification_status',['PENDING','REVIEW'])
      .order('received_at',{ascending:false})
      .limit(100);
    if(error){ console.error('asaas_pending_global',error); return pendingCache25; }
    pendingCache25=data||[];
    return pendingCache25;
  }

  function removeLegacyHomeBanner25(){
    const content=document.getElementById('content');
    if(!content)return;
    Array.from(content.querySelectorAll('.asaas-banner')).forEach(el=>{
      const txt=(el.textContent||'').toLowerCase();
      if(txt.includes('aguardando registro')&&txt.includes('asaas')) el.remove();
    });
  }

  function ensureGlobalBar25(entries){
    const main=document.querySelector('main');
    const content=document.getElementById('content');
    if(!main||!content)return;
    let bar=document.getElementById('globalAsaasPendingBar');
    if(!entries.length){ bar?.remove(); return; }
    if(!bar){
      bar=document.createElement('section');
      bar.id='globalAsaasPendingBar';
      bar.className='asaas-global-bar';
      main.insertBefore(bar,content);
    }
    const total=entries.reduce((s,e)=>s+Number(e.gross_amount||0),0);
    const first=entries[0];
    bar.innerHTML=`<div class="asaas-global-bar-copy">
      <span class="asaas-global-kicker">PAGAMENTO RECEBIDO · FALTA ASSOCIAR</span>
      <strong>${entries.length===1?escapeHtml(first.customer_name||'Cliente não identificado'):`${entries.length} pagamentos aguardando associação`}</strong>
      <span>${entries.length===1?`${fmtMoney(first.gross_amount)} · ${escapeHtml(statusPt25(first.billing_type))}`:`Total pendente de classificação: ${fmtMoney(total)}`}. Associe a uma pessoa e ao serviço/trabalho correto.</span>
    </div><button type="button" class="btn" data-asaas-open-queue>Associar agora</button>`;
  }

  function updateBell25(entries){
    const bell=document.getElementById('asaasBell');
    const count=document.getElementById('asaasBellCount');
    if(!bell||!count)return;
    count.textContent=String(entries.length);
    count.hidden=!entries.length;
    bell.classList.toggle('has-pending',entries.length>0);
    bell.title=entries.length?`${entries.length} pagamento(s) do Asaas aguardando associação`:'Nenhum pagamento do Asaas aguardando associação';
  }

  function injectOpportunityInModal25(entries){
    const root=document.getElementById('modalRoot');
    const body=root?.querySelector('.modal-body');
    if(!body)return;
    const existingBox=body.querySelector('.asaas-modal-opportunity');
    if(!entries.length){ existingBox?.remove(); return; }
    if(existingBox)return;
    const title=(root.querySelector('.modal-head')?.textContent||'').toLowerCase();
    if(title.includes('asaas')||title.includes('registrar entrada recebida'))return;
    const total=entries.reduce((s,e)=>s+Number(e.gross_amount||0),0);
    const box=document.createElement('div');
    box.className='asaas-modal-opportunity';
    box.innerHTML=`<div><b>${entries.length} pagamento${entries.length===1?'':'s'} do Asaas sem associação</b><span>${fmtMoney(total)} aguardando cliente + serviço/trabalho. Você pode resolver sem sair desta tela.</span></div><button type="button" class="btn secondary" data-asaas-open-queue>Associar pagamento</button>`;
    body.prepend(box);
  }

  async function refreshGlobalAsaas25(){
    const entries=await fetchPending25();
    updateBell25(entries);
    ensureGlobalBar25(entries);
    removeLegacyHomeBanner25();
    injectOpportunityInModal25(entries);
    if(!entries.length) closeOverlay25();
    return entries;
  }
  window.refreshAsaasBell=refreshGlobalAsaas25;

  function overlayShell25(inner){
    closeOverlay25();
    overlay25=document.createElement('div');
    overlay25.id='asaasGlobalOverlay';
    overlay25.className='asaas-global-overlay';
    overlay25.innerHTML=`<div class="asaas-global-sheet" role="dialog" aria-modal="true">${inner}</div>`;
    document.body.appendChild(overlay25);
    overlay25.addEventListener('click',e=>{ if(e.target===overlay25) closeOverlay25(); });
    return overlay25.querySelector('.asaas-global-sheet');
  }
  function closeOverlay25(){ overlay25?.remove(); overlay25=null; }

  async function openQueue25(){
    const entries=await fetchPending25();
    if(!entries.length){ toast('Não há pagamentos do Asaas aguardando associação.'); await refreshGlobalAsaas25(); return; }
    const total=entries.reduce((s,e)=>s+Number(e.gross_amount||0),0);
    const cards=entries.map(e=>{
      const match=matchClient25(e);
      const contact=[e.customer_email,e.customer_mobile_phone||e.customer_phone,e.customer_document].filter(Boolean).join(' · ');
      return `<article class="asaas-queue-card">
        <div class="asaas-queue-top"><div><b>${escapeHtml(e.customer_name||'Cliente não identificado')}</b><span>${escapeHtml(contact||'Dados cadastrais serão confirmados na associação')}</span></div><strong>${fmtMoney(e.gross_amount)}</strong></div>
        <div class="asaas-queue-meta"><span>${fmtDateTime(e.payment_date||e.received_at)}</span><span>${escapeHtml(statusPt25(e.billing_type))}</span><span>${escapeHtml(statusPt25(e.asaas_status))}</span>${match?`<span class="pill gold">Possível cliente: ${escapeHtml(match.full_name)}</span>`:'<span class="pill red">Cliente a confirmar</span>'}</div>
        <button type="button" class="btn" data-asaas-resolve-global="${e.id}">Associar cliente e serviço</button>
      </article>`;
    }).join('');
    overlayShell25(`<div class="asaas-sheet-head"><div><span class="eyebrow">Entradas do Asaas</span><h2>Pagamentos a associar</h2><p>O dinheiro já entrou. Nenhuma entrada sai desta fila sem cliente e serviço/trabalho.</p></div><button class="icon-btn" type="button" data-asaas-overlay-close aria-label="Fechar">×</button></div><div class="asaas-queue-summary"><div><span>Pendências</span><b>${entries.length}</b></div><div><span>Valor</span><b>${fmtMoney(total)}</b></div></div><div class="asaas-queue-list">${cards}</div>`);
  }

  function saleType25(service,workId){
    if(workId)return 'TRABALHO';
    if(service?.category==='CONSULTA')return 'CONSULTA';
    if(service?.category==='PERGUNTA')return 'PERGUNTA';
    if(service?.category==='MENSALIDADE')return 'MENSALIDADE';
    if(String(service?.category||'').startsWith('TRABALHO_'))return 'TRABALHO';
    return 'OUTRO';
  }

  function setSelectClient25(clientId){
    if(!clientId)return;
    const client=byId(state.clients,clientId);
    ['aClient','fmClient','q6Client'].forEach(id=>{
      const sel=document.getElementById(id);
      if(!sel)return;
      if(!Array.from(sel.options).some(o=>o.value===clientId)){
        const o=document.createElement('option');o.value=clientId;o.textContent=client?.full_name||'Cliente associado';sel.appendChild(o);
      }
      if(id==='aClient'&&document.getElementById('aCancelNewClient')&&!document.getElementById('aNewClientBox')?.hidden){
        document.getElementById('aCancelNewClient').click();
      }
      sel.disabled=false; sel.value=clientId; sel.dispatchEvent(new Event('change',{bubbles:true}));
    });
  }

  async function openResolve25(id){
    const e=pendingCache25.find(x=>x.id===id)||(await fetchPending25()).find(x=>x.id===id);
    if(!e){ toast('Esta pendência não está mais disponível.','error'); await refreshGlobalAsaas25(); return; }
    const match=matchClient25(e);
    const preClient=match?.id||'';
    const sheet=overlayShell25(`<div class="asaas-sheet-head"><div><span class="eyebrow">Pagamento recebido</span><h2>${escapeHtml(e.customer_name||'Cliente')}</h2><p><b>${fmtMoney(e.gross_amount)}</b> · ${escapeHtml(statusPt25(e.billing_type))} · ${fmtDateTime(e.payment_date||e.received_at)}</p></div><button class="icon-btn" type="button" data-asaas-back-queue aria-label="Voltar">←</button></div>
      <form id="asaasGlobalResolveForm" class="form-grid asaas-global-form">
        <div class="span-2 soft-box"><h3>1. Quem pagou?</h3><p>Selecione um cliente existente ou confirme os dados abaixo para criar o Cliente 360 com o que veio do Asaas.</p></div>
        <label class="span-2">Cliente existente<select id="agClient">${optionList(state.clients,'full_name',preClient)}</select></label>
        <div class="span-2 form-divider">ou criar/completar cliente com os dados recebidos</div>
        <label class="span-2">Nome<input id="agName" value="${escapeHtml(e.customer_name||'')}"></label>
        <label>Telefone<input id="agPhone" value="${escapeHtml(e.customer_mobile_phone||e.customer_phone||'')}"></label>
        <label>E-mail<input id="agEmail" type="email" value="${escapeHtml(e.customer_email||'')}"></label>
        <label>CPF/CNPJ<input id="agDocument" value="${escapeHtml(e.customer_document||'')}"></label>
        <label>Nascimento<input id="agBirth" type="date"></label>
        <div class="span-2 soft-box"><h3>2. O que foi pago?</h3><p>Obrigatório classificar como serviço ou trabalho. O pagamento não pode ficar solto.</p></div>
        <label>Serviço<select id="agService">${optionList(state.services,'name')}</select></label>
        <label>Trabalho<select id="agWork">${optionList(state.works,'title')}</select></label>
        <label>Responsável<select id="agResponsible">${optionList(state.team.filter(x=>x.is_practitioner),'full_name')}</select></label>
        <label>Valor recebido<input value="${Number(e.gross_amount||0).toFixed(2)}" disabled></label>
        <label>Pessoa amada<input id="agLoved" placeholder="Se aplicável"></label>
        <label>Rival<input id="agRival" placeholder="Se aplicável"></label>
        <label class="span-2">Observações<textarea id="agNotes" rows="3" placeholder="Ex.: Agrado coletivo, consulta, mensalidade…"></textarea></label>
        <div class="span-2 asaas-resolve-actions"><button type="button" class="btn ghost" data-asaas-back-queue>Voltar</button><button type="submit" class="btn">Associar e concluir</button></div>
      </form>`);
    const form=sheet.querySelector('#asaasGlobalResolveForm');
    const clientSel=sheet.querySelector('#agClient');
    const toggle=()=>{
      const existing=Boolean(clientSel.value);
      ['agName','agPhone','agEmail','agDocument','agBirth'].forEach(k=>{const el=sheet.querySelector('#'+k);if(el)el.disabled=existing;});
    };
    clientSel.addEventListener('change',toggle);toggle();
    form.addEventListener('submit',async ev=>{
      ev.preventDefault();
      if(!requireReal())return;
      const existing=clientSel.value||null;
      const name=sheet.querySelector('#agName').value.trim();
      const serviceId=sheet.querySelector('#agService').value||null;
      const workId=sheet.querySelector('#agWork').value||null;
      if(!existing&&!name){toast('Confirme o nome do cliente.','error');return;}
      if(!serviceId&&!workId){toast('Selecione o serviço ou trabalho pago.','error');return;}
      const service=byId(state.services,serviceId);
      const submit=form.querySelector('button[type=submit]');
      submit.disabled=true;submit.textContent='Associando…';
      const {data,error}=await db.rpc('resolve_asaas_entry',{
        p_entry_id:id,
        p_client_id:existing,
        p_client_name:name||null,
        p_client_phone:sheet.querySelector('#agPhone').value.trim()||null,
        p_client_email:sheet.querySelector('#agEmail').value.trim()||null,
        p_client_birth_date:sheet.querySelector('#agBirth').value||null,
        p_document_number:sheet.querySelector('#agDocument').value.trim()||null,
        p_service_id:serviceId,
        p_work_id:workId,
        p_responsible_member_id:sheet.querySelector('#agResponsible').value||null,
        p_sale_type:saleType25(service,workId),
        p_loved_person_name:sheet.querySelector('#agLoved').value.trim()||null,
        p_rival_name:sheet.querySelector('#agRival').value.trim()||null,
        p_notes:sheet.querySelector('#agNotes').value.trim()||null
      });
      submit.disabled=false;submit.textContent='Associar e concluir';
      if(error){toast(error.message,'error');return;}
      await loadReferenceData();
      setSelectClient25(data?.client_id);
      closeOverlay25();
      toast(workId?'Pagamento associado e inscrição criada.':'Pagamento do Asaas associado ao cliente e serviço.');
      await refreshGlobalAsaas25();
      if(state.view==='financeiro') await render();
    });
  }

  function bindGlobalClicks25(){
    document.addEventListener('click',e=>{
      if(e.target.closest('#asaasBell')){
        e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openQueue25();return;
      }
      const open=e.target.closest('[data-asaas-open-queue]');
      if(open){e.preventDefault();e.stopPropagation();openQueue25();return;}
      const resolve=e.target.closest('[data-asaas-resolve-global]');
      if(resolve){e.preventDefault();e.stopPropagation();openResolve25(resolve.dataset.asaasResolveGlobal);return;}
      if(e.target.closest('[data-asaas-overlay-close]')){e.preventDefault();closeOverlay25();return;}
      if(e.target.closest('[data-asaas-back-queue]')){e.preventDefault();openQueue25();return;}
    },true);
  }

  function watchModals25(){
    if(observer25)return;
    const root=document.getElementById('modalRoot');
    if(!root)return;
    observer25=new MutationObserver(()=>{ if(pendingCache25.length) setTimeout(()=>injectOpportunityInModal25(pendingCache25),0); });
    observer25.observe(root,{childList:true,subtree:true});
  }

  function startRealtime25(){
    if(realtime25||!db||!state.session)return;
    realtime25=db.channel('sunshine-asaas-global-pending')
      .on('postgres_changes',{event:'*',schema:'public',table:'asaas_incoming_payments'},async payload=>{
        await refreshGlobalAsaas25();
        const n=payload.new||{};
        if(n.classification_status==='PENDING'&&payload.eventType==='INSERT'){
          const bar=document.getElementById('globalAsaasPendingBar');
          bar?.classList.add('pulse');setTimeout(()=>bar?.classList.remove('pulse'),1600);
        }
      }).subscribe();
  }

  const previousBind25=bindViewActions;
  bindViewActions=function(){
    previousBind25();
    setTimeout(refreshGlobalAsaas25,0);
  };

  bindGlobalClicks25();
  watchModals25();

  navigator.serviceWorker?.addEventListener('message',event=>{
    if(event.data?.type==='OPEN_FINANCEIRO_ASAAS') setTimeout(openQueue25,250);
  });

  const authPoll25=setInterval(async()=>{
    if(state.session&&!state.demo){
      clearInterval(authPoll25);
      startRealtime25();
      await refreshGlobalAsaas25();
      if(initialAsaasDeepLink) setTimeout(openQueue25,300);
    }
  },300);
  setTimeout(()=>clearInterval(authPoll25),20000);
})();
