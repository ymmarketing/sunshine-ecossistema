/* Sunshine v3.30 — baixa em lote de comissões */
(function(){
  const isAdmin30=()=>state.member?.role==='ADMIN';
  let observer30=null;

  function ensureStyles30(){
    if(document.getElementById('commissionBulkStyles30'))return;
    const s=document.createElement('style');
    s.id='commissionBulkStyles30';
    s.textContent=`
      .commission-bulk-bar30{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:14px 0 16px;padding:14px 16px;border:1px solid #eadbd1;border-radius:14px;background:#fff8f5}
      .commission-bulk-bar30>div{min-width:0}.commission-bulk-bar30 b{display:block;color:#5b2e20;font-size:13px}.commission-bulk-bar30 span{display:block;margin-top:3px;color:#806b62;font-size:12px;line-height:1.4}
      .commission-bulk-bar30 .btn{white-space:nowrap}
      @media(max-width:720px){.commission-bulk-bar30{align-items:stretch;display:grid}.commission-bulk-bar30 .btn{width:100%}}
    `;
    document.head.appendChild(s);
  }

  async function dueSummary30(){
    if(state.demo||!db)return {count:0,total:0};
    const {data,error}=await db.from('commission_entries').select('id,amount').eq('status','DUE').limit(10000);
    if(error)throw error;
    const rows=data||[];
    return {count:rows.length,total:rows.reduce((sum,x)=>sum+Number(x.amount||0),0)};
  }

  async function refreshBulkBar30(bar){
    const btn=bar?.querySelector('[data-pay-all-commissions30]');
    const copy=bar?.querySelector('[data-commission-bulk-copy30]');
    if(!btn||!copy)return;
    try{
      const s=await dueSummary30();
      btn.disabled=s.count===0;
      btn.textContent=s.count?`Marcar todos como pagos (${s.count})`:'Nenhuma comissão a pagar';
      copy.textContent=s.count
        ? `${s.count} comissões abertas · total ${fmtMoney(s.total)}. A baixa registra a mesma data e hora para todas.`
        : 'Não existe comissão operacional aguardando pagamento.';
    }catch(e){
      console.error(e); btn.disabled=true; copy.textContent='Não foi possível carregar o saldo das comissões.';
    }
  }

  function commissionPanel30(){
    const panels=[...document.querySelectorAll('#content article.panel')];
    return panels.find(p=>/^comiss[oõ]es$/i.test((p.querySelector('h2')?.textContent||'').trim()))||null;
  }

  function injectBulk30(){
    if(state.view!=='financeiro'||!isAdmin30()||state.demo)return;
    ensureStyles30();
    const panel=commissionPanel30();
    if(!panel||panel.querySelector('#commissionBulkBar30'))return;
    const h2=panel.querySelector('h2');
    if(!h2)return;
    const bar=document.createElement('div');
    bar.id='commissionBulkBar30';
    bar.className='commission-bulk-bar30';
    bar.innerHTML=`<div><b>Baixa em lote</b><span data-commission-bulk-copy30>Carregando comissões abertas…</span></div><button class="btn secondary" type="button" data-pay-all-commissions30>Carregando…</button>`;
    const anchor=h2.closest('.section-head')||h2;
    anchor.insertAdjacentElement('afterend',bar);
    refreshBulkBar30(bar);
  }

  async function payAll30(btn){
    if(!isAdmin30()){toast('Apenas a administradora pode dar baixa em todas as comissões.','error');return;}
    let s;
    try{s=await dueSummary30();}catch(e){toast(e.message||'Erro ao consultar comissões.','error');return;}
    if(!s.count){toast('Não há comissões a pagar.');return;}
    const ok=confirm(`Marcar como pagas todas as ${s.count} comissões abertas, no total de ${fmtMoney(s.total)}?\n\nEsta ação registra a baixa de todas com a data e hora atuais.`);
    if(!ok)return;
    btn.disabled=true; const old=btn.textContent; btn.textContent='Dando baixa…';
    const {data,error}=await db.rpc('admin_pay_all_due_commissions');
    if(error){btn.disabled=false;btn.textContent=old;toast(error.message,'error');return;}
    const qty=Number(data?.count||0), total=Number(data?.total||0);
    toast(`${qty} comissões marcadas como pagas · ${fmtMoney(total)}.`);
    await navigate('financeiro');
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-pay-all-commissions30]');
    if(!btn)return;
    e.preventDefault();e.stopPropagation();payAll30(btn);
  },true);

  function start30(){
    ensureStyles30();
    injectBulk30();
    if(observer30)return;
    observer30=new MutationObserver(()=>injectBulk30());
    observer30.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start30);else start30();
})();
