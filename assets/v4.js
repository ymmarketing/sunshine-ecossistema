/* Sunshine v3.1 — Cliente 360 na linha + vendas descritas */
(function(){
  const saleTypePt={CONSULTA:'Consulta',PERGUNTA:'Pergunta',TRABALHO:'Trabalho',MENSALIDADE:'Mensalidade',OUTRO:'Outro'};

  function saleDescription(s){
    const work=s.works?.title||s.works?.name||'';
    if(work) return work;
    const notes=String(s.notes||'');
    const historical=notes.match(/Trabalho:\s*([^·]+)/i);
    if(historical?.[1]?.trim()) return historical[1].trim();
    const service=s.services?.name||'';
    if(service) return service;
    return saleTypePt[s.sale_type]||'Venda';
  }

  function saleOriginLabel(s){
    if(String(s.notes||'').startsWith('Histórico 2026')) return 'Histórico importado';
    if(s.source==='ASAAS') return 'Asaas';
    if(s.source==='MANUAL') return 'Lançamento manual';
    return saleTypePt[s.sale_type]||'Venda';
  }

  async function inlineClientDetail(client){
    if(state.demo){
      return `<div class="client-inline"><div class="empty-state compact">Faça login para visualizar o Cliente 360.</div></div>`;
    }
    const [salesQ,timelineQ,apptsQ,oduQ]=await Promise.all([
      safeQuery(db.from('sales').select('id,sold_at,sale_type,total_amount,status,notes,source,services(name),works(title)',{count:'exact'}).eq('client_id',client.id).order('sold_at',{ascending:false}).limit(200)),
      safeQuery(db.from('client_timeline_events').select('id,title,summary,occurred_at,event_type').eq('client_id',client.id).order('occurred_at',{ascending:false}).limit(30)),
      safeQuery(db.from('appointments').select('id',{count:'exact',head:true}).eq('client_id',client.id)),
      safeQuery(db.from('client_odu_profiles').select('id,birth_odu,head_odu,destiny_odu').eq('client_id',client.id).eq('is_current',true).order('calculated_at',{ascending:false}).limit(1))
    ]);
    const sales=salesQ.data||[];
    const saleCount=salesQ.count??sales.length;
    const saleItems=sales.map(s=>`<div class="sale-item"><div class="sale-date">${fmtDate(s.sold_at)}</div><div class="sale-desc"><b>${escapeHtml(saleDescription(s))}</b><small>${escapeHtml(saleOriginLabel(s))}${s.status?` · ${escapeHtml(s.status==='CONFIRMED'?'Confirmada':s.status==='COMPLETED'?'Concluída':s.status==='PENDING'?'Pendente':s.status)}`:''}</small></div><div class="sale-value">${fmtMoney(s.total_amount)}</div></div>`).join('');
    const timeline=(timelineQ.data||[]).map(x=>`<div class="client-timeline-event"><b>${escapeHtml(x.title)}</b> · ${fmtDateTime(x.occurred_at)}${x.summary?` · ${escapeHtml(x.summary)}`:''}</div>`).join('');
    const o=oduQ.data?.[0];
    const oduLabel=o?([o.birth_odu,o.head_odu,o.destiny_odu].filter(Boolean).join(' · ')||'Cadastrado'):'Não cadastrado';
    const locality=[client.city,client.state].filter(Boolean).join(' / ')||'—';
    return `<div class="client-inline">
      <div class="client-inline-head"><div><h3>Cliente 360 · ${escapeHtml(client.full_name)}</h3><p>Abra somente quando precisar consultar ou atualizar este cadastro.</p></div><div class="client-inline-actions"><button class="btn secondary" data-action="edit-client" data-id="${client.id}">Editar cadastro</button><button class="btn ghost" data-action="odu-client" data-id="${client.id}">Odu</button></div></div>
      <div class="client-inline-grid">
        <div class="client-card"><h4>Cadastro</h4><div class="client-profile-grid">
          <div class="client-profile-item"><span>Telefone</span><b>${escapeHtml(client.phone||'—')}</b></div>
          <div class="client-profile-item"><span>Nascimento</span><b>${fmtDate(client.birth_date)}</b></div>
          <div class="client-profile-item"><span>E-mail</span><b>${escapeHtml(client.email||'—')}</b></div>
          <div class="client-profile-item"><span>Localidade</span><b>${escapeHtml(locality)}</b></div>
          <div class="client-profile-item"><span>Atendimentos</span><b>${apptsQ.count||0}</b></div>
          <div class="client-profile-item"><span>Odu</span><b>${escapeHtml(oduLabel)}</b></div>
        </div>${timeline?`<details class="client-timeline-mini"><summary>Ver linha do tempo (${timelineQ.data?.length||0} eventos recentes)</summary><div class="client-timeline-list">${timeline}</div></details>`:''}</div>
        <div class="client-card"><div class="sales-head"><h4>Vendas e serviços contratados</h4><span class="sales-count">${saleCount} ${saleCount===1?'venda':'vendas'}</span></div>${saleItems?`<div class="sale-list">${saleItems}</div>`:'<div class="empty-state compact">Nenhuma venda vinculada a este cliente.</div>'}</div>
      </div>
    </div>`;
  }

  renderClients=async function(){
    const selectedId=state.selectedClient?.id||null;
    const q=state.demo?{data:state.clients}:await safeQuery(db.from('clients').select('*').order('full_name').limit(1000));
    state.clients=q.data||[];
    state.selectedClient=selectedId?state.clients.find(c=>c.id===selectedId)||null:null;
    const expanded=state.selectedClient?await inlineClientDetail(state.selectedClient):'';
    const body=state.clients.length?state.clients.map(c=>{
      const open=state.selectedClient?.id===c.id;
      const main=`<tr class="client-row ${open?'is-open':''}" data-client-toggle-id="${c.id}" data-status="${escapeHtml(c.status||'')}"><td class="client-arrow-cell"><button class="client-expand-btn" type="button" aria-label="${open?'Recolher':'Expandir'} ${escapeHtml(c.full_name)}" aria-expanded="${open?'true':'false'}">${open?'▾':'▸'}</button></td><td><b>${escapeHtml(c.full_name)}</b>${c.preferred_name?`<small>${escapeHtml(c.preferred_name)}</small>`:''}</td><td>${escapeHtml(c.phone||'—')}</td><td>${escapeHtml(c.email||'—')}</td><td>${fmtDate(c.birth_date)}</td><td>${statusPill(c.status)}</td></tr>`;
      return main+(open?`<tr class="client-detail-row" data-client-detail-for="${c.id}"><td colspan="6">${expanded}</td></tr>`:'');
    }).join(''):`<tr class="empty-row"><td colspan="6">Nenhum cliente cadastrado.</td></tr>`;
    return `<article class="panel"><div class="toolbar"><input id="clientSearch" class="field grow" placeholder="Buscar por nome, telefone ou e-mail"><select id="clientStatus" class="select"><option value="">Todos os status</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option><option value="BLOCKED">Bloqueados</option></select><button class="btn" data-action="new-client">+ Novo cliente</button></div><div class="table-wrap"><table class="table client-table-v31" id="clientTable"><thead><tr><th></th><th>Cliente</th><th>Telefone</th><th>E-mail</th><th>Nascimento</th><th>Status</th></tr></thead><tbody>${body}</tbody></table></div></article>`;
  };

  function applyClientFilters(){
    const q=String(document.getElementById('clientSearch')?.value||'').trim().toLowerCase();
    const status=String(document.getElementById('clientStatus')?.value||'');
    document.querySelectorAll('#clientTable tbody .client-row').forEach(row=>{
      const visible=(!q||row.innerText.toLowerCase().includes(q))&&(!status||row.dataset.status===status);
      row.hidden=!visible;
      const detail=document.querySelector(`[data-client-detail-for="${row.dataset.clientToggleId}"]`);
      if(detail)detail.hidden=!visible;
    });
  }

  const previousBindViewActions=bindViewActions;
  bindViewActions=function(){
    previousBindViewActions();
    document.querySelectorAll('[data-client-toggle-id]').forEach(row=>row.addEventListener('click',async e=>{
      if(e.target.closest('[data-action]'))return;
      const id=row.dataset.clientToggleId;
      const oldTop=row.getBoundingClientRect().top;
      state.selectedClient=state.selectedClient?.id===id?null:byId(state.clients,id);
      await render();
      requestAnimationFrame(()=>{
        const replacement=document.querySelector(`[data-client-toggle-id="${id}"]`);
        if(replacement){const newTop=replacement.getBoundingClientRect().top;window.scrollBy(0,newTop-oldTop);}
      });
    }));
    document.getElementById('clientSearch')?.addEventListener('input',applyClientFilters);
    document.getElementById('clientStatus')?.addEventListener('change',applyClientFilters);
  };

  // Daqui para frente toda venda precisa estar classificada em um serviço ou trabalho.
  document.addEventListener('submit',e=>{
    const form=e.target;
    let service='',work='';
    if(form?.id==='quickEntryForm'){service=val('qService');work=val('qWork');}
    else if(form?.id==='asaasResolveForm'){service=val('arService');work=val('arWork');}
    else if(form?.id==='saleForm'){service=val('sService');work=val('sWork');}
    else return;
    if(!service&&!work){
      e.preventDefault();
      e.stopImmediatePropagation();
      toast('Informe o serviço ou o trabalho contratado. Toda venda nova precisa ter um descritivo.','error');
    }
  },true);
})();
