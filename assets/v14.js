/* Sunshine v3.15 — histórico + baixas do mês detalhados por beneficiário */
(function(){
  const previousBindViewActions=bindViewActions;

  function commissionMemberName(id){ return byId(state.team,id)?.full_name || '—'; }

  async function refreshCommissionPaidMonth(){
    if(state.demo || state.view!=='financeiro' || !state.session) return;
    const panel=document.getElementById('commissionControl');
    if(!panel) return;

    const now=new Date();
    const start=new Date(now.getFullYear(),now.getMonth(),1);
    const end=new Date(now.getFullYear(),now.getMonth()+1,1);

    const [operational,historical]=await Promise.all([
      safeQuery(db.from('commission_entries')
        .select('amount,beneficiary_member_id')
        .eq('calculation_source','RULE')
        .eq('status','PAID')
        .gte('paid_at',start.toISOString())
        .lt('paid_at',end.toISOString())
        .limit(2000)),
      safeQuery(db.from('commission_entries')
        .select('amount,beneficiary_member_id')
        .eq('calculation_source','IMPORT')
        .eq('status','HISTORICAL')
        .gte('paid_at',start.toISOString())
        .lt('paid_at',end.toISOString())
        .limit(5000))
    ]);

    const operationalRows=operational.data||[];
    const historicalRows=historical.data||[];
    const operationalTotal=operationalRows.reduce((sum,row)=>sum+Number(row.amount||0),0);
    const historicalTotal=historicalRows.reduce((sum,row)=>sum+Number(row.amount||0),0);
    const total=operationalTotal+historicalTotal;

    const paidCard=Array.from(panel.querySelectorAll('.card')).find(card=>/PAGO NO MÊS/i.test(card.textContent||''));
    if(paidCard){
      const value=paidCard.querySelector('.value');
      const foot=paidCard.querySelector('.card-foot');
      if(value) value.textContent=fmtMoney(total);
      if(foot) foot.textContent=historicalTotal>0
        ? 'Histórico pago + baixas operacionais neste mês'
        : 'Baixas operacionais registradas neste mês';
    }

    const byPerson={};
    [...historicalRows,...operationalRows].forEach(row=>{
      const id=row.beneficiary_member_id;
      if(!id) return;
      byPerson[id]=(byPerson[id]||0)+Number(row.amount||0);
    });

    panel.querySelector('#paidMonthByPerson')?.remove();
    if(Object.keys(byPerson).length){
      const block=document.createElement('div');
      block.id='paidMonthByPerson';
      block.className='source-note';
      block.style.margin='14px 0';
      const items=Object.entries(byPerson)
        .sort((a,b)=>b[1]-a[1])
        .map(([id,value])=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:5px 0"><b>${escapeHtml(commissionMemberName(id))}</b><span>${fmtMoney(value)}</span></div>`)
        .join('');
      block.innerHTML=`<b>Pago no mês por pessoa</b><div style="margin-top:7px">${items}</div>`;
      const grid=panel.querySelector('.kpi-grid');
      if(grid) grid.insertAdjacentElement('afterend',block);
    }

    const intro=panel.querySelector('.section-head p');
    if(intro) intro.textContent='As comissões novas são geradas automaticamente quando um pagamento confirmado é vinculado a uma venda. O histórico importado não entra em “A pagar”, mas o que já foi pago no mês entra em “Pago no mês”.';
  }

  bindViewActions=function(){
    previousBindViewActions();
    if(state.view==='financeiro') setTimeout(refreshCommissionPaidMonth,0);
  };
})();
