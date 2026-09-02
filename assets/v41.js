/* Sunshine v3.41 — selecionar pagamentos do Asaas e associar a uma única venda */
(function(){
  let cache41=[];
  let busy41=false;
  let timer41=null;

  const digits41=v=>String(v||'').replace(/\D/g,'');
  const last1141=v=>digits41(v).slice(-11);
  const installment41=e=>e?.payment_snapshot?.installment||'';
  const payerKey41=e=>{
    if(e?.asaas_customer_id)return `asaas:${e.asaas_customer_id}`;
    const doc=digits41(e?.customer_document);if(doc)return `doc:${doc}`;
    const mail=String(e?.customer_email||'').trim().toLowerCase();if(mail)return `mail:${mail}`;
    const phone=last1141(e?.customer_mobile_phone||e?.customer_phone);if(phone.length>=8)return `phone:${phone}`;
    return `name:${String(e?.customer_name||'').trim().toLowerCase()}`;
  };

  function styles41(){
    if(document.getElementById('v41style'))return;
    const s=document.createElement('style');s.id='v41style';s.textContent=`
      .asaas-flag-row41{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 9px}.asaas-flag41{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:800;color:#5b2e20;cursor:pointer}.asaas-flag41 input{width:18px;height:18px;accent-color:#c00}.asaas-queue-card.selected41{outline:2px solid #c00;outline-offset:-2px;background:#fffaf8}.asaas-installment41{display:inline-flex;align-items:center;border-radius:999px;padding:5px 8px;background:#fff3d7;color:#745600;font-size:10px;font-weight:800}
      .asaas-group-bar41{border:1px solid #e6d5cb;background:#fffaf6;border-radius:14px;padding:12px 14px;margin:12px 0;display:grid;gap:10px}.asaas-group-main41{display:flex;align-items:center;justify-content:space-between;gap:12px}.asaas-group-main41 b{display:block;color:#4b281d}.asaas-group-main41 span{display:block;color:#806b62;font-size:12px;margin-top:3px}.asaas-group-main41 .btn{white-space:nowrap}.asaas-detected41{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid #eadfd8;padding-top:10px}.asaas-detected41 b{font-size:12px}.asaas-detected41 span{font-size:11px;color:#806b62}.asaas-detected41 button{border:0;background:#fff3d7;color:#745600;border-radius:999px;padding:7px 10px;font-weight:800;cursor:pointer}
      .asaas-group-form41{display:grid;gap:14px}.asaas-group-receipts41{display:grid;gap:7px}.asaas-group-receipt41{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #eadfd8;border-radius:10px;padding:9px 11px;background:#fff}.asaas-group-receipt41 small{display:block;color:#806b62;margin-top:2px}.asaas-group-summary41{border:1px solid #ead7c9;background:#fffaf6;border-radius:12px;padding:11px 12px;color:#705d55;font-size:12px;line-height:1.45}.asaas-group-summary41 b{color:#3c2017}
      @media(max-width:720px){.asaas-group-main41,.asaas-detected41{display:grid}.asaas-group-main41 .btn,.asaas-detected41 button{width:100%}}
    `;document.head.appendChild(s);
  }

  async function loadPending41(){
    if(!db||state.demo||!state.session)return [];
    const q=await db.from('asaas_incoming_payments').select('*').in('classification_status',['PENDING','REVIEW']).order('received_at',{ascending:false}).limit(250);
    if(q.error)throw q.error;cache41=q.data||[];return cache41;
  }

  function matchClient41(e){
    if(e?.matched_client_id)return byId(state.clients||[],e.matched_client_id)||null;
    const doc=digits41(e?.customer_document),mail=String(e?.customer_email||'').trim().toLowerCase(),phone=last1141(e?.customer_mobile_phone||e?.customer_phone);
    return (state.clients||[]).find(c=>e?.asaas_customer_id&&c.asaas_customer_id===e.asaas_customer_id)
      ||(state.clients||[]).find(c=>doc&&digits41(c.document_number)===doc)
      ||(state.clients||[]).find(c=>mail&&String(c.email||'').trim().toLowerCase()===mail)
      ||(state.clients||[]).find(c=>phone&&last1141(c.phone)===phone)
      ||null;
  }

  function selected41(){
    const ids=[...document.querySelectorAll('#asaasGlobalOverlay [data-group-entry41]:checked')].map(x=>x.dataset.groupEntry41);
    return ids.map(id=>cache41.find(e=>e.id===id)).filter(Boolean);
  }

  function syncBar41(){
    const bar=document.getElementById('asaasGroupBar41');if(!bar)return;
    const rows=selected41(),total=rows.reduce((s,x)=>s+Number(x.gross_amount||0),0),same=rows.length<2||new Set(rows.map(payerKey41)).size===1;
    const copy=bar.querySelector('[data-group-copy41]'),btn=bar.querySelector('[data-group-submit41]');
    if(copy)copy.innerHTML=rows.length?`<b>${rows.length} pagamento${rows.length===1?'':'s'} selecionado${rows.length===1?'':'s'} · ${fmtMoney(total)}</b><span>${rows.length<2?'Marque pelo menos 2 para associar juntos.':same?'Eles serão ligados a uma única venda/serviço.':'Os pagamentos marcados parecem ser de pessoas diferentes.'}</span>`:'<b>Nenhum pagamento selecionado</b><span>Marque as caixinhas dos pagamentos que pertencem ao mesmo serviço.</span>';
    if(btn){btn.disabled=rows.length<2||!same;btn.textContent=rows.length>=2?'Associar selecionados a um único serviço':'Selecione pelo menos 2';}
    document.querySelectorAll('#asaasGlobalOverlay .asaas-queue-card').forEach(card=>{const c=card.querySelector('[data-group-entry41]');card.classList.toggle('selected41',Boolean(c?.checked));});
  }

  function detectedHtml41(entries){
    const groups={};entries.forEach(e=>{const k=installment41(e);if(k)(groups[k]||(groups[k]=[])).push(e);});
    return Object.entries(groups).filter(([,arr])=>arr.length>1).map(([k,arr])=>{
      const total=arr.reduce((s,x)=>s+Number(x.gross_amount||0),0),name=arr[0]?.customer_name||'Cliente';
      return `<div class="asaas-detected41"><div><b>Parcelamento identificado automaticamente</b><span>${escapeHtml(name)} · ${arr.length} parcelas · ${fmtMoney(total)}</span></div><button type="button" data-select-installment41="${escapeHtml(k)}">Selecionar ${arr.length} parcelas</button></div>`;
    }).join('');
  }

  async function decorate41(){
    const overlay=document.getElementById('asaasGlobalOverlay'),list=overlay?.querySelector('.asaas-queue-list');
    if(!overlay||!list||overlay.querySelector('#asaasGroupForm41')||busy41)return;
    const cards=[...list.querySelectorAll('.asaas-queue-card')];if(!cards.length)return;
    busy41=true;
    try{
      await loadPending41();
      cards.forEach(card=>{
        if(card.querySelector('[data-group-entry41]'))return;
        const resolve=card.querySelector('[data-asaas-resolve-global]');if(!resolve)return;
        const id=resolve.dataset.asaasResolveGlobal,e=cache41.find(x=>x.id===id);if(!e)return;
        const row=document.createElement('div');row.className='asaas-flag-row41';
        const inst=installment41(e);row.innerHTML=`<label class="asaas-flag41"><input type="checkbox" data-group-entry41="${id}"><span>Selecionar</span></label>${inst?'<span class="asaas-installment41">PARCELA DO MESMO CARTÃO</span>':''}`;
        card.prepend(row);
      });
      let bar=overlay.querySelector('#asaasGroupBar41');
      if(!bar){
        bar=document.createElement('div');bar.id='asaasGroupBar41';bar.className='asaas-group-bar41';
        bar.innerHTML=`<div class="asaas-group-main41"><div data-group-copy41></div><button class="btn" type="button" data-group-submit41 disabled>Selecione pelo menos 2</button></div>${detectedHtml41(cache41)}`;
        const summary=overlay.querySelector('.asaas-queue-summary');summary?.insertAdjacentElement('afterend',bar);
      }
      syncBar41();
    }catch(e){console.error('v41',e);}finally{busy41=false;}
  }

  function setFormTotal41(form,force=false){
    const total=form.querySelector('#g41SaleTotal');if(!total||(!force&&total.dataset.touched41==='1'))return;
    const service=byId(state.services||[],form.querySelector('#g41Service')?.value),work=byId(state.works||[],form.querySelector('#g41Work')?.value);
    const received=Number(form.dataset.received41||0),normal=Number(work?.unit_price||service?.default_price||received);total.value=normal.toFixed(2);
    syncFormSummary41(form);
  }
  function syncFormSummary41(form){
    const received=Number(form.dataset.received41||0),sale=Number(form.querySelector('#g41SaleTotal')?.value||0),balance=Math.max(sale-received,0),excess=Math.max(received-sale,0),box=form.querySelector('#g41Summary');
    if(box)box.innerHTML=`Valor contratado: <b>${fmtMoney(sale)}</b> · Recebido nas parcelas: <b>${fmtMoney(received)}</b> · ${balance>0?`Saldo a receber: <b>${fmtMoney(balance)}</b>`:excess>0?`Diferença recebida: <b>${fmtMoney(excess)}</b> · não gera crédito`:'<b>Quitado</b>'}.`;
  }

  async function openGroup41(ids){
    if(ids.length<2)return;
    const q=await db.from('asaas_incoming_payments').select('*').in('id',ids).in('classification_status',['PENDING','REVIEW']);
    if(q.error){toast(q.error.message,'error');return;}const entries=q.data||[];
    if(entries.length!==ids.length){toast('Uma das parcelas já foi associada. Reabra a fila e tente novamente.','error');return;}
    if(new Set(entries.map(payerKey41)).size!==1){toast('Selecione somente pagamentos da mesma pessoa.','error');return;}
    const first=entries[0],match=matchClient41(first),total=entries.reduce((s,x)=>s+Number(x.gross_amount||0),0),sheet=document.querySelector('#asaasGlobalOverlay .asaas-global-sheet');
    if(!sheet)return;
    const receipts=entries.sort((a,b)=>Number(a.payment_snapshot?.installmentNumber||0)-Number(b.payment_snapshot?.installmentNumber||0)).map((e,i)=>`<div class="asaas-group-receipt41"><div><b>Recebimento ${e.payment_snapshot?.installmentNumber?`· parcela ${escapeHtml(e.payment_snapshot.installmentNumber)}`:`${i+1}`}</b><small>${fmtDateTime(e.payment_date||e.received_at)} · ${escapeHtml(e.billing_type||'Pagamento')}</small></div><b>${fmtMoney(e.gross_amount)}</b></div>`).join('');
    sheet.innerHTML=`<div class="asaas-sheet-head"><div><span class="eyebrow">Pagamentos selecionados</span><h2>Associar a um único serviço</h2><p><b>${entries.length} pagamentos · ${fmtMoney(total)}</b></p></div><button class="icon-btn" type="button" data-asaas-back-queue aria-label="Voltar">←</button></div>
      <form id="asaasGroupForm41" class="form-grid asaas-group-form41" data-received41="${total}">
        <div class="span-2 soft-box"><h3>1. Quem pagou?</h3><p>Os pagamentos selecionados pertencem à mesma pessoa. Confirme o Cliente 360 uma única vez.</p></div>
        <label class="span-2">Cliente existente<select id="g41Client">${optionList(state.clients,'full_name',match?.id||'')}</select></label>
        <label class="span-2">Nome<input id="g41Name" value="${escapeHtml(first.customer_name||'')}"></label>
        <label>Telefone<input id="g41Phone" value="${escapeHtml(first.customer_mobile_phone||first.customer_phone||'')}"></label><label>E-mail<input id="g41Email" type="email" value="${escapeHtml(first.customer_email||'')}"></label>
        <label>CPF/CNPJ<input id="g41Document" value="${escapeHtml(first.customer_document||'')}"></label><label>Nascimento<input id="g41Birth" type="date"></label>
        <div class="span-2 soft-box"><h3>2. Um único serviço / trabalho</h3><p>O sistema criará uma única venda e manterá cada pagamento como um recebimento separado dentro dela.</p></div>
        <label>Serviço<select id="g41Service">${optionList(state.services,'name')}</select></label><label>Trabalho<select id="g41Work">${optionList(state.works,'title')}</select></label>
        <label>Responsável<select id="g41Responsible" required>${optionList(state.team.filter(x=>x.is_practitioner),'full_name')}</select></label><label>Valor contratado<input id="g41SaleTotal" type="number" min="0.01" step="0.01" value="${total.toFixed(2)}" required></label>
        <label>Pessoa amada<input id="g41Loved" placeholder="Se aplicável"></label><label>Rival<input id="g41Rival" placeholder="Se aplicável"></label>
        <div id="g41Summary" class="span-2 asaas-group-summary41"></div>
        <div class="span-2"><h3>Recebimentos que serão ligados à venda</h3><div class="asaas-group-receipts41">${receipts}</div></div>
        <label class="span-2">Observações<textarea id="g41Notes" rows="2" placeholder="Opcional"></textarea></label>
        <div class="span-2 asaas-resolve-actions"><button type="button" class="btn ghost" data-asaas-back-queue>Voltar</button><button type="submit" class="btn">Associar ${entries.length} pagamentos a um serviço</button></div>
      </form>`;
    const form=sheet.querySelector('#asaasGroupForm41'),client=form.querySelector('#g41Client'),saleTotal=form.querySelector('#g41SaleTotal');
    const toggleClient=()=>{const existing=Boolean(client.value);['g41Name','g41Phone','g41Email','g41Document','g41Birth'].forEach(id=>{const el=form.querySelector('#'+id);if(el)el.disabled=existing;});};client.addEventListener('change',toggleClient);toggleClient();
    form.querySelector('#g41Service').addEventListener('change',()=>{if(form.querySelector('#g41Service').value)form.querySelector('#g41Work').value='';saleTotal.dataset.touched41='0';setFormTotal41(form,true);});
    form.querySelector('#g41Work').addEventListener('change',()=>{if(form.querySelector('#g41Work').value)form.querySelector('#g41Service').value='';saleTotal.dataset.touched41='0';setFormTotal41(form,true);});
    saleTotal.addEventListener('input',()=>{saleTotal.dataset.touched41='1';syncFormSummary41(form);});syncFormSummary41(form);
    form.addEventListener('submit',async ev=>{
      ev.preventDefault();if(!requireReal())return;
      const existing=client.value||null,name=form.querySelector('#g41Name').value.trim(),phone=form.querySelector('#g41Phone').value.trim(),service=form.querySelector('#g41Service').value||null,work=form.querySelector('#g41Work').value||null,responsible=form.querySelector('#g41Responsible').value||null,saleValue=Number(saleTotal.value||0);
      if(!existing&&!name){toast('Confirme o nome do cliente.','error');return;}if(!existing&&digits41(phone).length<8){toast('Informe o telefone do novo cliente.','error');return;}if(!service&&!work){toast('Selecione o serviço ou trabalho pago.','error');return;}if(!responsible){toast('Defina o responsável para calcular as comissões.','error');return;}if(!(saleValue>0)){toast('Informe o valor contratado.','error');return;}
      const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Associando pagamentos…';
      const {data,error}=await db.rpc('resolve_asaas_selected_entries',{p_entry_ids:ids,p_client_id:existing,p_client_name:name||null,p_client_phone:phone||null,p_client_email:form.querySelector('#g41Email').value.trim()||null,p_client_birth_date:form.querySelector('#g41Birth').value||null,p_document_number:form.querySelector('#g41Document').value.trim()||null,p_service_id:service,p_work_id:work,p_responsible_member_id:responsible,p_sale_total:saleValue,p_loved_person_name:form.querySelector('#g41Loved').value.trim()||null,p_rival_name:form.querySelector('#g41Rival').value.trim()||null,p_notes:form.querySelector('#g41Notes').value.trim()||null});
      btn.disabled=false;btn.textContent=`Associar ${entries.length} pagamentos a um serviço`;
      if(error){toast(error.message,'error');return;}
      await loadReferenceData();document.getElementById('asaasGlobalOverlay')?.remove();
      toast(`${Number(data?.payment_count||entries.length)} pagamentos associados a uma única venda · ${fmtMoney(data?.received_total||total)} recebido.`);
      if(window.refreshAsaasBell)await window.refreshAsaasBell();if(state.view==='financeiro')await render();
    });
  }

  document.addEventListener('change',e=>{if(e.target.matches('[data-group-entry41]'))syncBar41();},true);
  document.addEventListener('click',e=>{
    const select=e.target.closest('[data-select-installment41]');if(select){e.preventDefault();const id=select.dataset.selectInstallment41;document.querySelectorAll('#asaasGlobalOverlay [data-group-entry41]').forEach(c=>{const row=cache41.find(x=>x.id===c.dataset.groupEntry41);c.checked=installment41(row)===id;});syncBar41();return;}
    const go=e.target.closest('[data-group-submit41]');if(go){e.preventDefault();const rows=selected41();if(rows.length>=2&&new Set(rows.map(payerKey41)).size===1)openGroup41(rows.map(x=>x.id));}
  },true);

  function schedule41(){clearTimeout(timer41);timer41=setTimeout(decorate41,120);}
  const obs=new MutationObserver(schedule41);obs.observe(document.body,{childList:true,subtree:true});
  styles41();const foot=document.querySelector('.sidebar-foot');if(foot)foot.innerHTML='<span class="dot"></span> Ecossistema Sunshine · v3.41';schedule41();
})();
