/* Sunshine v3.9 — controle operacional de comissões pagas / a pagar */
(function(){
  const previousRenderFinance = renderFinance;
  const previousHandleAction = handleAction;

  function memberName(id){ return byId(state.team,id)?.full_name || '—'; }

  async function commissionPanel(){
    if(state.demo) return `<article class="panel"><div class="section-head"><div><h2>Comissões</h2><p>Controle do que está a pagar e do que já foi pago.</p></div></div><div class="empty-state">Faça login para visualizar as comissões.</div></article>`;

    const cq = await safeQuery(
      db.from('commission_entries')
        .select('*')
        .eq('calculation_source','RULE')
        .in('status',['DUE','PAID'])
        .order('created_at',{ascending:false})
        .limit(500)
    );
    const commissions = cq.data || [];

    const allocationIds = [...new Set(commissions.map(c=>c.payment_allocation_id).filter(Boolean))];
    let allocations=[];
    if(allocationIds.length){
      const aq=await safeQuery(db.from('payment_allocations').select('id,sale_id').in('id',allocationIds));
      allocations=aq.data||[];
    }
    const allocationById=Object.fromEntries(allocations.map(a=>[a.id,a]));
    const saleIds=[...new Set(allocations.map(a=>a.sale_id).filter(Boolean))];
    let sales=[];
    if(saleIds.length){
      const sq=await safeQuery(db.from('sales').select('id,client_id,service_id,work_id,sale_type,total_amount,sold_at').in('id',saleIds));
      sales=sq.data||[];
    }
    const saleById=Object.fromEntries(sales.map(s=>[s.id,s]));

    const due=commissions.filter(c=>c.status==='DUE');
    const paid=commissions.filter(c=>c.status==='PAID');
    const dueTotal=due.reduce((a,c)=>a+Number(c.amount||0),0);
    const now=new Date();
    const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
    const paidMonth=paid.filter(c=>c.paid_at && new Date(c.paid_at)>=monthStart).reduce((a,c)=>a+Number(c.amount||0),0);
    const duePeople=new Set(due.map(c=>c.beneficiary_member_id)).size;

    const dueByPerson={};
    due.forEach(c=>dueByPerson[c.beneficiary_member_id]=(dueByPerson[c.beneficiary_member_id]||0)+Number(c.amount||0));
    const personSummary=Object.entries(dueByPerson).sort((a,b)=>b[1]-a[1]).map(([id,total])=>`<span class="pill red">${escapeHtml(memberName(id))}: ${fmtMoney(total)}</span>`).join(' ');

    const rows=commissions.map(c=>{
      const alloc=allocationById[c.payment_allocation_id];
      const sale=alloc?saleById[alloc.sale_id]:null;
      const client=sale?byId(state.clients,sale.client_id):null;
      const service=sale?byId(state.services,sale.service_id):null;
      const work=sale?state.works.find(w=>w.id===sale.work_id):null;
      const origin=work?.title || service?.name || (sale?.sale_type?String(sale.sale_type).replaceAll('_',' '):'Venda relacionada');
      const action=c.status==='DUE'
        ? `<button class="btn secondary" type="button" data-action="commission-paid" data-id="${c.id}">Marcar como pago</button>`
        : `<button class="btn ghost" type="button" data-action="commission-due" data-id="${c.id}">Reabrir</button>`;
      return `<tr>
        <td>${fmtDate(c.created_at)}</td>
        <td><b>${escapeHtml(memberName(c.beneficiary_member_id))}</b><small>Responsável: ${escapeHtml(memberName(c.responsible_member_id))}</small></td>
        <td><b>${escapeHtml(origin)}</b><small>${escapeHtml(client?.full_name||'Cliente não identificado')}</small></td>
        <td>${Number(c.percentage||0).toLocaleString('pt-BR')}%</td>
        <td><b>${fmtMoney(c.amount)}</b></td>
        <td>${statusPill(c.status)}</td>
        <td>${c.paid_at?fmtDateTime(c.paid_at):'—'}</td>
        <td>${action}</td>
      </tr>`;
    }).join('');

    return `<article class="panel" id="commissionControl">
      <div class="section-head"><div><h2>Comissões</h2><p>As comissões novas são geradas automaticamente quando um pagamento confirmado é vinculado a uma venda. O histórico importado não entra neste saldo.</p></div></div>
      ${kpis([['A pagar',fmtMoney(dueTotal),'Comissões operacionais abertas'],['Pago no mês',fmtMoney(paidMonth),'Baixas registradas neste mês'],['Pessoas com saldo',String(duePeople),'Beneficiários com valor a receber']])}
      ${personSummary?`<div class="button-row" style="margin:14px 0">${personSummary}</div>`:''}
      <div class="table-wrap"><table class="table"><thead><tr><th>Gerada</th><th>Beneficiário</th><th>Origem</th><th>%</th><th>Valor</th><th>Status</th><th>Pago em</th><th>Ação</th></tr></thead><tbody>${rows||'<tr class="empty-row"><td colspan="8">Nenhuma comissão operacional gerada ainda.</td></tr>'}</tbody></table></div>
    </article>`;
  }

  renderFinance = async function(){
    const base = await previousRenderFinance();
    return base + await commissionPanel();
  };

  handleAction = async function(action,id){
    if(action==='commission-paid' || action==='commission-due'){
      if(!requireReal()) return;
      const paid=action==='commission-paid';
      const message=paid?'Marcar esta comissão como paga?':'Reabrir esta comissão como a pagar?';
      if(!confirm(message)) return;
      const {error}=await db.rpc('set_commission_payment_status',{p_commission_id:id,p_paid:paid});
      if(error){toast(error.message,'error');return;}
      toast(paid?'Comissão marcada como paga.':'Comissão reaberta como a pagar.');
      await render();
      return;
    }
    return previousHandleAction(action,id);
  };
})();
