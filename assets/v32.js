/* Sunshine v3.32 — big number Recebido no mês no bloco de Comissões */
(function(){
  let observer32=null;

  function commissionPanel32(){
    const panels=[...document.querySelectorAll('#content article.panel')];
    return panels.find(p=>/^comiss[oõ]es$/i.test((p.querySelector('h2')?.textContent||'').trim()))||null;
  }

  async function receivedMonth32(){
    if(state.demo||!db)return 0;
    const [ms,me]=monthRange();
    const {data,error}=await db.from('payments')
      .select('gross_amount,paid_at')
      .eq('status','PAID')
      .gte('paid_at',ms)
      .lt('paid_at',me)
      .limit(10000);
    if(error)throw error;
    return (data||[]).reduce((sum,row)=>sum+Number(row.gross_amount||0),0);
  }

  function findCommissionKpis32(panel){
    const grids=[...panel.querySelectorAll('.kpi-grid')];
    return grids.find(g=>{
      const txt=(g.textContent||'').toLowerCase();
      return txt.includes('a pagar')&&txt.includes('pago no mês')&&txt.includes('pessoas com saldo');
    })||null;
  }

  async function injectReceived32(){
    if(state.view!=='financeiro')return;
    const panel=commissionPanel32();
    if(!panel)return;
    const grid=findCommissionKpis32(panel);
    if(!grid||grid.querySelector('#commissionReceivedMonth32'))return;

    const card=document.createElement('article');
    card.className='card';
    card.id='commissionReceivedMonth32';
    card.innerHTML='<div class="card-label">RECEBIDO NO MÊS</div><div class="value">Carregando…</div><div class="card-foot">Todos os pagamentos confirmados</div>';
    grid.insertAdjacentElement('afterbegin',card);

    try{
      const total=await receivedMonth32();
      const value=card.querySelector('.value');
      if(value)value.textContent=fmtMoney(total);
    }catch(e){
      console.error(e);
      const value=card.querySelector('.value');
      if(value)value.textContent='—';
    }
  }

  function start32(){
    injectReceived32();
    if(observer32)return;
    observer32=new MutationObserver(()=>injectReceived32());
    observer32.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start32);else start32();
})();
