/* Sunshine v3.24 — custos por trabalho + resultado somente após revisão */
(function(){
  const isAdmin24=()=>state.member?.role==='ADMIN';
  const money24=v=>fmtMoney(Number(v||0));
  const dateInput24=v=>{ if(!v)return new Date().toISOString().slice(0,10); return String(v).slice(0,10); };

  async function fetchWorkDetail24(workId){
    const [workQ,regsQ,metricsQ,expensesQ,costItemsQ]=await Promise.all([
      db.from('works').select('*').eq('id',workId).maybeSingle(),
      db.from('work_registrations').select('id,participant_name,participant_birth_date,loved_person_name,rival_name,status,clients(full_name,birth_date)').eq('work_id',workId).neq('status','CANCELLED').order('created_at'),
      db.rpc('get_work_metrics'),
      db.from('work_expenses').select('id,work_id,cost_item_id,description,amount,expense_date,source,notes,cost_items(name)').eq('work_id',workId).order('expense_date',{ascending:false}).order('created_at',{ascending:false}),
      db.from('cost_items').select('id,name,active').eq('active',true).order('name')
    ]);
    if(workQ.error)throw workQ.error;
    if(regsQ.error)throw regsQ.error;
    if(expensesQ.error)throw expensesQ.error;
    if(costItemsQ.error)throw costItemsQ.error;
    const work=workQ.data;
    const regs=regsQ.data||[];
    const metric=(metricsQ.data||[]).find(m=>m.work_id===workId)||{};
    const expenses=expensesQ.data||[];
    const totalCosts=expenses.reduce((sum,x)=>sum+Number(x.amount||0),0);
    const revenue=Number(metric.revenue||0);
    return {work,regs,metric,expenses,costItems:costItemsQ.data||[],totalCosts,revenue};
  }

  function birth24(v){
    if(!v)return '—';
    const p=String(v).slice(0,10).split('-');
    return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:fmtDate(v);
  }

  function expenseRows24(d){
    if(!d.expenses.length)return '<tr class="empty-row"><td colspan="6">Nenhum custo lançado. Isso não significa custo zero: revise o trabalho antes de fechar o resultado.</td></tr>';
    return d.expenses.map(x=>`<tr>
      <td>${fmtDate(x.expense_date)}</td>
      <td>${escapeHtml(x.cost_items?.name||'Outros')}</td>
      <td><b>${escapeHtml(x.description)}</b>${x.notes?`<small>${escapeHtml(x.notes)}</small>`:''}</td>
      <td><b>${money24(x.amount)}</b></td>
      <td>${escapeHtml(x.source||'MANUAL')}</td>
      <td><div class="button-row"><button class="link-btn" type="button" data-edit-work-cost="${x.id}" data-work-id="${d.work.id}">Editar</button>${isAdmin24()?`<button class="link-btn danger-link" type="button" data-delete-work-cost="${x.id}" data-work-id="${d.work.id}">Excluir</button>`:''}</div></td>
    </tr>`).join('');
  }

  function registrationRows24(d){
    if(!d.regs.length)return '<tr class="empty-row"><td colspan="5">Nenhum inscrito neste trabalho.</td></tr>';
    return d.regs.map(r=>`<tr><td><b>${escapeHtml(r.clients?.full_name||r.participant_name||'—')}</b></td><td>${escapeHtml(birth24(r.participant_birth_date||r.clients?.birth_date))}</td><td>${escapeHtml(r.loved_person_name||'—')}</td><td>${escapeHtml(r.rival_name||'—')}</td><td>${escapeHtml(r.status||'—')}</td></tr>`).join('');
  }

  async function openWorkDetail24(workId){
    if(state.demo){toast('Faça login para abrir o trabalho.','error');return;}
    openModal('Trabalho',`<div class="empty-state"><span class="spinner"></span>Carregando trabalho…</div>`,true);
    try{
      const d=await fetchWorkDetail24(workId);
      if(!d.work)throw new Error('Trabalho não encontrado.');
      state.selectedWork=d.work;
      const reviewed=Boolean(d.work.costs_reviewed);
      const result=reviewed?d.revenue-d.totalCosts:null;
      const body=document.querySelector('#modalRoot .modal-body');
      const title=document.querySelector('#modalRoot .modal-head h2');
      if(title)title.textContent=d.work.title;
      if(!body)return;
      body.innerHTML=`
        <div class="work-detail-actions">
          <button class="btn" type="button" data-v20-register="${workId}">+ Inscrição</button>
          <button class="btn ghost" type="button" data-print-work="${workId}">Imprimir lista</button>
          <button class="btn ghost" type="button" data-v20-export="${workId}">Exportar inscritos</button>
        </div>
        ${kpis([
          ['Inscritos',String(Number(d.metric.registrations||d.regs.length)),'Participantes'],
          ['Arrecadado',money24(d.revenue),'Vendas vinculadas'],
          ['Custos diretos',money24(d.totalCosts),reviewed?'Custos revisados':'Ainda não revisados'],
          ['Resultado',reviewed?money24(result):'Aguardando custos',reviewed?'Arrecadação menos custos diretos':'Não fecha até revisar os custos']
        ])}
        <section class="work-cost-panel">
          <div class="section-head"><div><h2>Custos do trabalho</h2><p>Lance aqui todo gasto diretamente atribuível a este trabalho. Comissão continua controlada separadamente no Financeiro.</p></div><div class="button-row"><button class="btn secondary" type="button" data-add-work-cost="${workId}">+ Adicionar custo</button>${isAdmin24()?`<button class="btn ${reviewed?'ghost':'secondary'}" type="button" data-review-work-costs="${workId}" data-reviewed="${reviewed?'1':'0'}">${reviewed?'Reabrir revisão':'Confirmar custos revisados'}</button>`:''}</div></div>
          <div class="cost-review-status ${reviewed?'is-reviewed':'is-pending'}"><b>${reviewed?'Custos revisados':'Custos ainda não revisados'}</b><span>${reviewed?`Fechado em ${fmtDateTime(d.work.costs_reviewed_at)}`:'O Dashboard não tratará esse resultado como definitivo até a revisão.'}</span></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Origem</th><th></th></tr></thead><tbody>${expenseRows24(d)}</tbody></table></div>
          <div class="work-cost-total"><span>Total de custos diretos</span><b>${money24(d.totalCosts)}</b></div>
        </section>
        <section class="work-registrations-panel">
          <div class="section-head"><div><h2>Inscritos</h2><p>Nomes utilizados na execução e impressão do trabalho.</p></div></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Nome completo</th><th>Nascimento</th><th>Pessoa amada</th><th>Rival</th><th>Status</th></tr></thead><tbody>${registrationRows24(d)}</tbody></table></div>
        </section>`;
    }catch(e){closeModal();toast(e.message||'Erro ao abrir trabalho.','error');}
  }

  async function costModal24(workId,costId){
    const d=await fetchWorkDetail24(workId);
    const current=costId?d.expenses.find(x=>x.id===costId):null;
    const options=d.costItems.map(x=>`<option value="${x.id}" ${current?.cost_item_id===x.id?'selected':''}>${escapeHtml(x.name)}</option>`).join('');
    openModal(current?'Editar custo':'Adicionar custo',`<form id="workCostForm" class="form-grid">
      <label>Categoria<select id="wcItem"><option value="">Outros</option>${options}</select></label>
      <label>Data<input id="wcDate" type="date" value="${dateInput24(current?.expense_date)}" required></label>
      <label class="span-2">Descrição<input id="wcDescription" value="${escapeHtml(current?.description||'')}" placeholder="Ex.: velas, flores, transporte, material…" required></label>
      <label>Valor<input id="wcAmount" type="number" min="0" step="0.01" value="${current?Number(current.amount||0):''}" required></label>
      <label>Origem<select id="wcSource"><option value="MANUAL" ${!current||current.source==='MANUAL'?'selected':''}>Manual</option><option value="IMPORT" ${current?.source==='IMPORT'?'selected':''}>Importado</option><option value="ASAAS" ${current?.source==='ASAAS'?'selected':''}>Asaas</option></select></label>
      <label class="span-2">Observações<textarea id="wcNotes" rows="3">${escapeHtml(current?.notes||'')}</textarea></label>
      <div class="note span-2"><b>Regra:</b> qualquer inclusão ou edição reabre automaticamente a revisão dos custos. O resultado só volta a ser considerado fechado depois da confirmação da administradora.</div>
      <div class="span-2">${formActions(current?'Salvar custo':'Adicionar custo')}</div>
    </form>`,true);
    bindCancel();
    document.getElementById('workCostForm').addEventListener('submit',async e=>{
      e.preventDefault(); if(!requireReal())return;
      const payload={work_id:workId,cost_item_id:val('wcItem')||null,description:val('wcDescription').trim(),amount:Number(val('wcAmount')||0),expense_date:val('wcDate'),source:val('wcSource')||'MANUAL',notes:val('wcNotes')||null};
      if(!payload.description||payload.amount<0){toast('Informe descrição e valor válidos.','error');return;}
      const q=current?await db.from('work_expenses').update(payload).eq('id',current.id):await db.from('work_expenses').insert(payload);
      if(q.error){toast(q.error.message,'error');return;}
      const r=await db.from('works').update({costs_reviewed:false,costs_reviewed_at:null,costs_reviewed_by:null}).eq('id',workId);
      if(r.error){toast(r.error.message,'error');return;}
      toast(current?'Custo atualizado. Revisão reaberta.':'Custo adicionado. Revisão pendente.');
      closeModal(); setTimeout(()=>openWorkDetail24(workId),0);
    });
  }

  async function deleteCost24(workId,costId){
    if(!isAdmin24()){toast('Apenas a administradora pode excluir custos.','error');return;}
    if(!confirm('Excluir este custo do trabalho?'))return;
    const q=await db.from('work_expenses').delete().eq('id',costId);
    if(q.error){toast(q.error.message,'error');return;}
    await db.from('works').update({costs_reviewed:false,costs_reviewed_at:null,costs_reviewed_by:null}).eq('id',workId);
    toast('Custo excluído. Revisão reaberta.');
    closeModal(); setTimeout(()=>openWorkDetail24(workId),0);
  }

  async function toggleReview24(workId,isReviewed){
    if(!isAdmin24()){toast('Apenas a administradora pode fechar a revisão dos custos.','error');return;}
    if(!isReviewed){
      const d=await fetchWorkDetail24(workId);
      if(!d.expenses.length && !confirm('Nenhum custo foi lançado. Confirma que este trabalho realmente teve R$ 0,00 de custos diretos?'))return;
      const q=await db.from('works').update({costs_reviewed:true,costs_reviewed_at:new Date().toISOString(),costs_reviewed_by:state.member.id}).eq('id',workId);
      if(q.error){toast(q.error.message,'error');return;}
      toast('Custos revisados. O resultado agora pode ser considerado fechado.');
    }else{
      const q=await db.from('works').update({costs_reviewed:false,costs_reviewed_at:null,costs_reviewed_by:null}).eq('id',workId);
      if(q.error){toast(q.error.message,'error');return;}
      toast('Revisão reaberta. O resultado volta a ficar pendente.');
    }
    closeModal(); setTimeout(()=>openWorkDetail24(workId),0);
  }

  const previousRenderWorks24=renderWorks;
  renderWorks=async function(){
    const html=await previousRenderWorks24();
    return html.replaceAll('work-metric-row','work-metric-row-v24');
  };

  renderDashboard=async function(){
    if(state.demo)return kpis([['Faturamento mês','—','Pagamentos confirmados'],['Vendas','—','Confirmadas/concluídas'],['Ticket médio','—','Valor médio por venda'],['Comissões a pagar','—','Lançamentos DUE']])+`<article class="panel"><div class="empty-state">Faça login para visualizar os indicadores.</div></article>`;
    const [ms,me]=monthRange();
    const [payments,sales,commissions,worksQ,expensesQ]=await Promise.all([
      safeQuery(db.from('payments').select('gross_amount').eq('status','PAID').gte('paid_at',ms).lt('paid_at',me)),
      safeQuery(db.from('sales').select('id,total_amount,work_id').gte('sold_at',ms).lt('sold_at',me).in('status',['CONFIRMED','COMPLETED'])),
      safeQuery(db.from('commission_entries').select('amount').eq('status','DUE')),
      safeQuery(db.from('works').select('id,title,costs_reviewed,costs_reviewed_at')),
      safeQuery(db.from('work_expenses').select('work_id,amount'))
    ]);
    const revenue=(payments.data||[]).reduce((s,x)=>s+Number(x.gross_amount||0),0);
    const saleCount=sales.data?.length||0;
    const salesTotal=(sales.data||[]).reduce((s,x)=>s+Number(x.total_amount||0),0);
    const ticket=saleCount?salesTotal/saleCount:0;
    const due=(commissions.data||[]).reduce((s,x)=>s+Number(x.amount||0),0);
    const workById=Object.fromEntries((worksQ.data||[]).map(w=>[w.id,w]));
    const revenueByWork={}; (sales.data||[]).forEach(s=>{if(s.work_id)revenueByWork[s.work_id]=(revenueByWork[s.work_id]||0)+Number(s.total_amount||0);});
    const costByWork={}; (expensesQ.data||[]).forEach(x=>costByWork[x.work_id]=(costByWork[x.work_id]||0)+Number(x.amount||0));
    const rows=Object.entries(revenueByWork).map(([id,rev])=>{
      const w=workById[id]||{title:'Trabalho'}; const cost=costByWork[id]||0; const reviewed=Boolean(w.costs_reviewed);
      return `<tr><td><b>${escapeHtml(w.title)}</b></td><td>${money24(rev)}</td><td>${reviewed?money24(cost):`<span class="cost-pending-text">${cost?money24(cost)+' · ':''}não revisado</span>`}</td><td>${reviewed?`<b>${money24(rev-cost)}</b>`:'<span class="pill gold">Aguardando custos</span>'}</td></tr>`;
    }).join('')||'<tr class="empty-row"><td colspan="4">Nenhuma venda de trabalho no período.</td></tr>';
    return `${kpis([['Faturamento mês',money24(revenue),'Pagamentos confirmados'],['Vendas',String(saleCount),'Confirmadas/concluídas'],['Ticket médio',money24(ticket),'Valor médio por venda'],['Comissões a pagar',money24(due),'Lançamentos DUE']])}
      <div class="two dashboard-result-grid"><article class="panel"><div class="section-head"><div><h2>Resultado após custos diretos</h2><p>Arrecadação menos despesas atribuídas ao trabalho. Só fecha após revisão dos custos.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Trabalho</th><th>Receita</th><th>Custos diretos</th><th>Resultado</th></tr></thead><tbody>${rows}</tbody></table></div></article>
      <article class="panel"><h2>Leitura executiva</h2><div class="note"><b>Resultado não é presumido.</b><br>Se um trabalho ainda não teve os custos revisados, o Dashboard mostra <b>Aguardando custos</b> em vez de assumir custo zero. Para lançar despesas, abra o trabalho na aba Trabalhos.</div><div class="note dashboard-cost-note"><b>Comissões:</b> permanecem separadas no Financeiro e não são descontadas aqui automaticamente, evitando dupla contagem.</div></article></div>`;
  };

  document.addEventListener('click',e=>{
    const row=e.target.closest('.work-metric-row-v24[data-work-id]');
    if(row && !e.target.closest('button,a,input,select')){e.preventDefault();e.stopPropagation();openWorkDetail24(row.dataset.workId);return;}
    const add=e.target.closest('[data-add-work-cost]'); if(add){e.preventDefault();e.stopPropagation();costModal24(add.dataset.addWorkCost);return;}
    const edit=e.target.closest('[data-edit-work-cost]'); if(edit){e.preventDefault();e.stopPropagation();costModal24(edit.dataset.workId,edit.dataset.editWorkCost);return;}
    const del=e.target.closest('[data-delete-work-cost]'); if(del){e.preventDefault();e.stopPropagation();deleteCost24(del.dataset.workId,del.dataset.deleteWorkCost);return;}
    const review=e.target.closest('[data-review-work-costs]'); if(review){e.preventDefault();e.stopPropagation();toggleReview24(review.dataset.reviewWorkCosts,review.dataset.reviewed==='1');return;}
  },true);
})();