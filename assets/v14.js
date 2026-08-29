/* Sunshine v3.14 — inclui histórico de comissões pagas no KPI Pago no mês */
(function(){
  const previousBindViewActions=bindViewActions;

  async function refreshCommissionPaidMonth(){
    if(state.demo || state.view!=='financeiro' || !state.session) return;
    const panel=document.getElementById('commissionControl');
    if(!panel) return;

    const now=new Date();
    const start=new Date(now.getFullYear(),now.getMonth(),1);
    const end=new Date(now.getFullYear(),now.getMonth()+1,1);

    const [operational,historical]=await Promise.all([
      safeQuery(db.from('commission_entries')
        .select('amount')
        .eq('calculation_source','RULE')
        .eq('status','PAID')
        .gte('paid_at',start.toISOString())
        .lt('paid_at',end.toISOString())
        .limit(2000)),
      safeQuery(db.from('commission_entries')
        .select('amount')
        .eq('calculation_source','IMPORT')
        .eq('status','HISTORICAL')
        .gte('paid_at',start.toISOString())
        .lt('paid_at',end.toISOString())
        .limit(5000))
    ]);

    const operationalTotal=(operational.data||[]).reduce((sum,row)=>sum+Number(row.amount||0),0);
    const historicalTotal=(historical.data||[]).reduce((sum,row)=>sum+Number(row.amount||0),0);
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

    const intro=panel.querySelector('.section-head p');
    if(intro) intro.textContent='As comissões novas são geradas automaticamente quando um pagamento confirmado é vinculado a uma venda. O histórico importado não entra em “A pagar”, mas o que já foi pago no mês entra em “Pago no mês”.';
  }

  bindViewActions=function(){
    previousBindViewActions();
    if(state.view==='financeiro') setTimeout(refreshCommissionPaidMonth,0);
  };
})();
