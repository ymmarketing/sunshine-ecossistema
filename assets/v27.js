/* Sunshine v3.27 — Cliente 360 contextual + KPIs Filhos da Casa + Asaas com múltiplos serviços */
(function(){
  const norm27=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  let lastAsaasEntry27=null;

  function ensureStyles27(){
    if(document.getElementById('sunshineV27Styles'))return;
    const s=document.createElement('style');s.id='sunshineV27Styles';s.textContent=`
      .inline-edit-client27{margin-left:8px;border:0;background:#fff2ed;color:#9d2f19;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap}
      .context-edit-wrap27{display:flex;align-items:center;gap:8px;margin-top:7px}.context-edit-wrap27 .link-btn{font-size:11px}
      .client-context-overlay27{position:fixed;inset:0;background:rgba(36,17,11,.28);z-index:5000;display:flex;align-items:center;justify-content:center;padding:18px}
      .client-context-sheet27{width:min(760px,100%);max-height:calc(100dvh - 28px);overflow:auto;background:#fffdfb;border:1px solid #eadbd1;border-radius:20px;box-shadow:0 22px 70px rgba(63,31,20,.22)}
      .client-context-head27{display:flex;justify-content:space-between;gap:15px;padding:18px 20px;border-bottom:1px solid #eee1d8}.client-context-head27 h2{margin:2px 0 0}.client-context-body27{padding:18px 20px}
      .asaas-multi-tools27{border:1px solid #ead7c9;background:#fffaf5;border-radius:14px;padding:12px;display:grid;gap:8px}.asaas-multi-tools27 .button-row{justify-content:space-between;align-items:center}.asaas-total27{font-size:12px;color:#705d55}.asaas-total27 b{color:#3c2017}.asaas-total27.bad{color:#a40000}.asaas-total27.ok{color:#256044}
      .asaas-extra-list27{display:grid;gap:12px}.asaas-extra-item27{border:1px solid #e7dbd3;border-radius:14px;padding:12px;background:#fff;display:grid;grid-template-columns:1fr 1fr;gap:10px}.asaas-extra-item27 .span-2{grid-column:1/-1}.asaas-extra-head27{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center}.asaas-extra-head27 b{font-size:13px}.asaas-extra-head27 button{border:0;background:#fff0ed;color:#9d2f19;border-radius:999px;padding:5px 9px;font-weight:800;cursor:pointer}
      @media(max-width:720px){.client-context-overlay27{padding:6px;align-items:flex-end}.client-context-sheet27{border-radius:18px 18px 0 0;max-height:calc(100dvh - 6px)}.asaas-extra-item27{grid-template-columns:1fr}.asaas-extra-item27 .span-2{grid-column:auto}.inline-edit-client27{padding:5px 9px}}
    `;document.head.appendChild(s);
  }

  async function openClientContextEditor27(clientId){
    if(!clientId||state.demo)return;
    ensureStyles27();
    let c=byId(state.clients,clientId);
    if(!c){const q=await safeQuery(db.from('clients').select('*').eq('id',clientId).maybeSingle());c=q.data;}
    if(!c){toast('Cliente não encontrado.','error');return;}
    document.getElementById('clientContextOverlay27')?.remove();
    const ov=document.createElement('div');ov.id='clientContextOverlay27';ov.className='client-context-overlay27';
    ov.innerHTML=`<div class="client-context-sheet27" role="dialog" aria-modal="true"><div class="client-context-head27"><div><span class="eyebrow">Cliente 360</span><h2>${escapeHtml(c.full_name)}</h2></div><button type="button" class="icon-btn" data-close-client27>×</button></div><div class="client-context-body27"><form id="clientContextForm27" class="form-grid">
      <label class="span-2">Nome completo<input id="c27Name" required value="${escapeHtml(c.full_name||'')}"></label>
      <label>Nome preferido<input id="c27Preferred" value="${escapeHtml(c.preferred_name||'')}"></label>
      <label>Telefone<input id="c27Phone" value="${escapeHtml(c.phone||'')}"></label>
      <label>E-mail<input id="c27Email" type="email" value="${escapeHtml(c.email||'')}"></label>
      <label>Nascimento<input id="c27Birth" type="date" value="${c.birth_date||''}"></label>
      <label>Cidade<input id="c27City" value="${escapeHtml(c.city||'')}"></label>
      <label>Estado<input id="c27State" maxlength="2" value="${escapeHtml(c.state||'')}"></label>
      <label>Status<select id="c27Status"><option value="ACTIVE" ${c.status==='ACTIVE'?'selected':''}>Ativo</option><option value="INACTIVE" ${c.status==='INACTIVE'?'selected':''}>Inativo</option><option value="BLOCKED" ${c.status==='BLOCKED'?'selected':''}>Bloqueado</option></select></label>
      <label class="span-2">Observações<textarea id="c27Notes" rows="3">${escapeHtml(c.notes||'')}</textarea></label>
      <div class="span-2 form-actions"><button type="button" class="btn ghost" data-close-client27>Cancelar</button><button type="submit" class="btn">Salvar Cliente 360</button></div>
    </form></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click',e=>{if(e.target===ov||e.target.closest('[data-close-client27]'))ov.remove();});
    ov.querySelector('#clientContextForm27').addEventListener('submit',async e=>{
      e.preventDefault();if(!requireReal())return;
      const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Salvando…';
      const payload={full_name:ov.querySelector('#c27Name').value.trim(),preferred_name:ov.querySelector('#c27Preferred').value.trim()||null,phone:ov.querySelector('#c27Phone').value.trim()||null,email:ov.querySelector('#c27Email').value.trim()||null,birth_date:ov.querySelector('#c27Birth').value||null,city:ov.querySelector('#c27City').value.trim()||null,state:ov.querySelector('#c27State').value.trim().toUpperCase()||null,status:ov.querySelector('#c27Status').value,notes:ov.querySelector('#c27Notes').value.trim()||null,updated_by:state.member?.id||null,updated_at:new Date().toISOString()};
      const {data,error}=await db.from('clients').update(payload).eq('id',clientId).select().single();
      if(error){btn.disabled=false;btn.textContent='Salvar Cliente 360';toast(error.message,'error');return;}
      await loadReferenceData();
      if(state.selectedClient?.id===clientId)state.selectedClient=data;
      document.querySelectorAll('select').forEach(sel=>{const op=Array.from(sel.options||[]).find(o=>o.value===clientId);if(op)op.textContent=data.full_name;});
      ov.remove();toast('Cliente 360 atualizado em todo o ecossistema.');await render();
    });
  }
  window.openClientContextEditor27=openClientContextEditor27;

  const previousHouse27=renderHouse;
  renderHouse=async function(){
    if(state.demo)return previousHouse27();
    const [hq,sq]=await Promise.all([
      safeQuery(db.from('house_members').select('*,clients(id,full_name,phone,email,birth_date,city,state,status)').order('created_at',{ascending:false})),
      safeQuery(db.rpc('get_house_financial_summary',{p_reference_date:new Date().toISOString().slice(0,10)}),{})
    ]);
    const list=(hq.data||[]).sort((a,b)=>(a.clients?.full_name||'').localeCompare(b.clients?.full_name||'','pt-BR'));
    const summary=sq.data||{};
    const rows=list.length?list.map(h=>`<tr><td><b>${escapeHtml(h.clients?.full_name||'—')}</b><button type="button" class="inline-edit-client27" data-edit-client27="${h.client_id}">Editar</button></td><td>${escapeHtml(h.clients?.birth_date?String(h.clients.birth_date).split('-').reverse().join('/'):'—')}</td><td>${escapeHtml(h.clients?.phone||'—')}</td><td>${h.billing_exempt?'<span class="pill gold">ISENTO</span>':`Dia ${Number(h.billing_due_day||10)}`}</td><td>${h.billing_exempt?'<span class="pill gold">ISENTO</span>':fmtMoney(h.monthly_fee)}</td><td>${statusPill(h.status)}</td></tr>`).join(''):`<tr class="empty-row"><td colspan="6">Nenhum Filho da Casa cadastrado.</td></tr>`;
    const cards=kpis([
      ['Ativos',String(summary.active_count??list.filter(x=>x.status==='ACTIVE').length),'Filhos da Casa ativos'],
      ['Previsto no mês',fmtMoney(summary.expected_monthly||0),'Mensalidades dos não isentos'],
      ['Recebido no mês',fmtMoney(summary.received_month||0),'Mensalidades efetivamente pagas'],
      ['Pendente estimado',fmtMoney(summary.estimated_pending||0),'Previsto menos recebido']
    ]);
    return `${cards}<article class="panel"><div class="section-head"><div><h2>Filhos da Casa</h2><p>${list.length} pessoas vinculadas ao Cliente 360. Qualquer edição abaixo atualiza o cadastro único.</p></div><div class="button-row"><button class="btn ghost" type="button" data-print-house>Imprimir nomes</button><button class="btn" data-action="new-house">+ Novo vínculo</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Nascimento</th><th>Telefone</th><th>Vencimento</th><th>Mensalidade</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></article><article class="panel"><div class="note"><b>Regra da mensalidade:</b> pagamento até o dia 10 de cada mês. O módulo não cria dinheiro: o recebimento entra pelo Asaas ou Financeiro e é associado ao serviço de mensalidade. A opção <b>Primeira Mensalidade LU</b> direciona 100% da primeira mensalidade prospectada exclusivamente por Lourdes para ela.</div></article>`;
  };

  function clientIdFromCell27(td){
    const b=td.querySelector('b');const txt=(b?.textContent||td.textContent||'').trim();
    const c=state.clients.find(x=>norm27(x.full_name)===norm27(txt));return c?.id||null;
  }
  function decorateVisibleClients27(){
    const content=document.getElementById('content');if(!content)return;
    content.querySelectorAll('table tbody td').forEach(td=>{
      if(td.querySelector('[data-edit-client27]'))return;
      const id=clientIdFromCell27(td);if(!id)return;
      const btn=document.createElement('button');btn.type='button';btn.className='inline-edit-client27';btn.dataset.editClient27=id;btn.textContent='Editar';td.appendChild(btn);
    });
  }
  function decorateClientSelects27(){
    document.querySelectorAll('#modalRoot select, #asaasGlobalOverlay select').forEach(sel=>{
      if(!/client/i.test(sel.id||'')||sel.closest('#clientForm')||sel.dataset.contextEdit27==='1')return;
      sel.dataset.contextEdit27='1';
      const wrap=document.createElement('div');wrap.className='context-edit-wrap27';
      const btn=document.createElement('button');btn.type='button';btn.className='link-btn';btn.textContent='Editar dados do cliente';btn.hidden=!sel.value;
      btn.addEventListener('click',()=>openClientContextEditor27(sel.value));
      sel.addEventListener('change',()=>btn.hidden=!sel.value);
      wrap.appendChild(btn);sel.insertAdjacentElement('afterend',wrap);
    });
  }

  function optionHtml27(items,label){return '<option value="">Selecione</option>'+items.map(x=>`<option value="${x.id}">${escapeHtml(x[label]||x.name||x.full_name)}</option>`).join('');}
  function allocationTotal27(form){
    const gross=Number(form.dataset.gross27||0);let total=Number(form.querySelector('#agAmount0')?.value||0);
    form.querySelectorAll('.asaas-extra-item27').forEach(x=>total+=Number(x.querySelector('.agExtraAmount27')?.value||0));
    const el=form.querySelector('.asaas-total27');if(el){const diff=Math.round((gross-total)*100)/100;el.className=`asaas-total27 ${Math.abs(diff)<.005?'ok':'bad'}`;el.innerHTML=`Recebido: <b>${fmtMoney(gross)}</b> · Associado: <b>${fmtMoney(total)}</b> · ${Math.abs(diff)<.005?'Fechou corretamente':`Falta distribuir ${fmtMoney(diff)}`}`;}
    return total;
  }
  function newAllocationItem27(form,amount=0){
    const list=form.querySelector('.asaas-extra-list27');const n=list.children.length+2;
    const div=document.createElement('div');div.className='asaas-extra-item27';
    div.innerHTML=`<div class="asaas-extra-head27"><b>Serviço ${n}</b><button type="button" data-remove-allocation27>Remover</button></div>
      <label>Serviço<select class="agExtraService27">${optionHtml27(state.services,'name')}</select></label><label>Trabalho<select class="agExtraWork27">${optionHtml27(state.works,'title')}</select></label>
      <label>Responsável<select class="agExtraResponsible27" required>${optionHtml27(state.team.filter(x=>x.is_practitioner),'full_name')}</select></label><label>Valor desta parte<input class="agExtraAmount27" type="number" min="0.01" step="0.01" value="${Number(amount||0).toFixed(2)}" required></label>
      <label>Pessoa amada<input class="agExtraLoved27" placeholder="Se aplicável"></label><label>Rival<input class="agExtraRival27" placeholder="Se aplicável"></label>
      <label class="span-2">Observação desta parte<input class="agExtraNotes27" placeholder="Opcional"></label>`;
    list.appendChild(div);div.querySelector('[data-remove-allocation27]').addEventListener('click',()=>{div.remove();allocationTotal27(form);});div.querySelectorAll('input,select').forEach(x=>x.addEventListener('input',()=>allocationTotal27(form)));return div;
  }
  function transformAsaasForm27(form){
    if(!form||form.dataset.multi27==='1')return;
    const amountInput=Array.from(form.querySelectorAll('input')).find(x=>x.disabled&&/^\d+[.,]?\d*$/.test(String(x.value||'')));
    if(!amountInput)return;
    const gross=Number(String(amountInput.value).replace(',','.'));form.dataset.gross27=String(gross);form.dataset.multi27='1';form.dataset.entryId27=lastAsaasEntry27||'';
    amountInput.disabled=false;amountInput.type='number';amountInput.step='0.01';amountInput.min='0.01';amountInput.id='agAmount0';amountInput.value=gross.toFixed(2);
    const label=amountInput.closest('label');if(label&&label.firstChild?.nodeType===3)label.firstChild.nodeValue='Valor desta parte';
    const notes=form.querySelector('#agNotes')?.closest('label');
    const box=document.createElement('div');box.className='span-2 asaas-multi-tools27';
    box.innerHTML=`<div class="asaas-extra-list27"></div><div class="button-row"><button type="button" class="btn secondary" data-add-allocation27>+ Adicionar serviço</button><div class="asaas-total27"></div></div><small>Um único PIX pode ser dividido em vários serviços. A soma precisa fechar exatamente o valor recebido.</small>`;
    notes?.insertAdjacentElement('beforebegin',box);
    box.querySelector('[data-add-allocation27]').addEventListener('click',()=>{
      let current=Number(amountInput.value||0);const firstService=byId(state.services,form.querySelector('#agService')?.value);
      if(box.querySelectorAll('.asaas-extra-item27').length===0&&Math.abs(current-gross)<.005&&Number(firstService?.default_price||0)>0&&Number(firstService.default_price)<gross){amountInput.value=Number(firstService.default_price).toFixed(2);current=Number(amountInput.value);}
      const used=allocationTotal27(form);newAllocationItem27(form,Math.max(gross-used,0));allocationTotal27(form);
    });
    form.querySelectorAll('input,select').forEach(x=>x.addEventListener('input',()=>allocationTotal27(form)));allocationTotal27(form);
  }

  async function submitAsaasMulti27(form){
    if(!requireReal())return;
    const id=form.dataset.entryId27||lastAsaasEntry27;if(!id){toast('Não foi possível identificar a entrada do Asaas. Volte à fila e abra novamente.','error');return;}
    const existing=form.querySelector('#agClient')?.value||null;const name=form.querySelector('#agName')?.value.trim()||'';const phone=form.querySelector('#agPhone')?.value.trim()||'';
    if(!existing&&!name){toast('Confirme o nome do cliente.','error');return;}if(!existing&&phone.replace(/\D/g,'').length<8){toast('Informe o telefone do novo cliente.','error');form.querySelector('#agPhone')?.focus();return;}
    const items=[];
    const first={service_id:form.querySelector('#agService')?.value||null,work_id:form.querySelector('#agWork')?.value||null,responsible_member_id:form.querySelector('#agResponsible')?.value||null,amount:Number(form.querySelector('#agAmount0')?.value||0),loved_person_name:form.querySelector('#agLoved')?.value.trim()||null,rival_name:form.querySelector('#agRival')?.value.trim()||null,notes:null};items.push(first);
    form.querySelectorAll('.asaas-extra-item27').forEach(x=>items.push({service_id:x.querySelector('.agExtraService27').value||null,work_id:x.querySelector('.agExtraWork27').value||null,responsible_member_id:x.querySelector('.agExtraResponsible27').value||null,amount:Number(x.querySelector('.agExtraAmount27').value||0),loved_person_name:x.querySelector('.agExtraLoved27').value.trim()||null,rival_name:x.querySelector('.agExtraRival27').value.trim()||null,notes:x.querySelector('.agExtraNotes27').value.trim()||null}));
    if(items.some(x=>(!x.service_id&&!x.work_id)||!x.responsible_member_id||!(x.amount>0))){toast('Preencha serviço/trabalho, responsável e valor em todas as partes.','error');return;}
    const gross=Number(form.dataset.gross27||0),total=items.reduce((s,x)=>s+x.amount,0);if(Math.abs(gross-total)>.009){toast(`Distribua exatamente ${fmtMoney(gross)}. Hoje a soma está em ${fmtMoney(total)}.`,'error');return;}
    const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Associando…';
    const {data,error}=await db.rpc('resolve_asaas_entry_multi',{p_entry_id:id,p_client_id:existing,p_client_name:name||null,p_client_phone:phone||null,p_client_email:form.querySelector('#agEmail')?.value.trim()||null,p_client_birth_date:form.querySelector('#agBirth')?.value||null,p_document_number:form.querySelector('#agDocument')?.value.trim()||null,p_items:items,p_notes:form.querySelector('#agNotes')?.value.trim()||null});
    btn.disabled=false;btn.textContent='Associar e concluir';if(error){toast(error.message,'error');return;}
    await loadReferenceData();document.getElementById('asaasGlobalOverlay')?.remove();toast(items.length>1?`Pagamento dividido em ${items.length} serviços e associado com sucesso.`:'Pagamento associado com sucesso.');if(window.refreshAsaasBell)await window.refreshAsaasBell();await render();
  }

  document.addEventListener('click',e=>{
    const asaas=e.target.closest('[data-asaas-resolve-global]');if(asaas)lastAsaasEntry27=asaas.dataset.asaasResolveGlobal;
    const edit=e.target.closest('[data-edit-client27]');if(edit){e.preventDefault();e.stopPropagation();openClientContextEditor27(edit.dataset.editClient27);}
  },true);
  document.addEventListener('submit',e=>{const form=e.target.closest('#asaasGlobalResolveForm');if(form?.dataset.multi27==='1'){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();submitAsaasMulti27(form);}},true);

  const observer27=new MutationObserver(()=>{ensureStyles27();decorateClientSelects27();const f=document.getElementById('asaasGlobalResolveForm');if(f)transformAsaasForm27(f);setTimeout(decorateVisibleClients27,0);});
  observer27.observe(document.body,{childList:true,subtree:true});
  ensureStyles27();setTimeout(()=>{decorateVisibleClients27();decorateClientSelects27();},100);
})();
