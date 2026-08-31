/* Sunshine v3.31 — copiar fechamento de comissões para WhatsApp */
(function(){
  let observer31=null;

  function ensureStyles31(){
    if(document.getElementById('commissionCopyStyles31'))return;
    const s=document.createElement('style');
    s.id='commissionCopyStyles31';
    s.textContent=`
      .commission-copy-actions31{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
      .commission-copy-actions31 .btn{flex:1 1 220px}
      @media(max-width:720px){.commission-copy-actions31{display:grid}.commission-copy-actions31 .btn{width:100%}}
    `;
    document.head.appendChild(s);
  }

  function dateBR31(v){
    if(!v)return '—';
    const d=new Date(v);
    return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',timeZone:'America/Sao_Paulo'}).format(d);
  }

  async function openCommissionData31(){
    if(state.demo||!db)return {rows:[],start:null,end:null,totals:{Yasmin:0,Lourdes:0,Rosely:0}};
    const ceq=await db.from('commission_entries')
      .select('id,amount,beneficiary_member_id,payment_allocation_id')
      .eq('status','DUE')
      .limit(10000);
    if(ceq.error)throw ceq.error;
    const rows=ceq.data||[];
    if(!rows.length)return {rows:[],start:null,end:null,totals:{Yasmin:0,Lourdes:0,Rosely:0}};

    const allocationIds=[...new Set(rows.map(x=>x.payment_allocation_id).filter(Boolean))];
    const aq=await db.from('payment_allocations').select('id,payment_id').in('id',allocationIds).limit(10000);
    if(aq.error)throw aq.error;
    const paymentByAllocation=Object.fromEntries((aq.data||[]).map(x=>[x.id,x.payment_id]));
    const paymentIds=[...new Set((aq.data||[]).map(x=>x.payment_id).filter(Boolean))];
    const pq=await db.from('payments').select('id,paid_at,created_at').in('id',paymentIds).limit(10000);
    if(pq.error)throw pq.error;
    const paymentMap=Object.fromEntries((pq.data||[]).map(x=>[x.id,x]));
    const teamMap=Object.fromEntries((state.team||[]).map(x=>[x.id,x.full_name]));

    const totals={Yasmin:0,Lourdes:0,Rosely:0};
    const dates=[];
    rows.forEach(x=>{
      const name=teamMap[x.beneficiary_member_id]||'Outros';
      if(!(name in totals))totals[name]=0;
      totals[name]+=Number(x.amount||0);
      const p=paymentMap[paymentByAllocation[x.payment_allocation_id]];
      const dt=p?.paid_at||p?.created_at;
      if(dt)dates.push(new Date(dt));
    });
    dates.sort((a,b)=>a-b);
    return {rows,start:dates[0]||null,end:dates[dates.length-1]||null,totals};
  }

  function buildMessage31(d){
    if(!d.rows.length)return 'SEM PENDÊNCIAS';
    const start=dateBR31(d.start),end=dateBR31(d.end);
    return `FECHAMENTO DIA ${start} A ${end}\n\nCOMISSÃO DO PERÍODO: ${start} A ${end}\nYASMIN: ${fmtMoney(d.totals.Yasmin||0)}\nLOURDES: ${fmtMoney(d.totals.Lourdes||0)}\nROSELY: ${fmtMoney(d.totals.Rosely||0)}\n\nOBS\nValores referentes somente às comissões ainda não pagas no Ecossistema Sunshine.`;
  }

  async function copyText31(text){
    try{
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true;}
    }catch(_e){}
    const ta=document.createElement('textarea');
    ta.value=text;ta.style.position='fixed';ta.style.opacity='0';ta.style.pointerEvents='none';
    document.body.appendChild(ta);ta.focus();ta.select();
    let ok=false;try{ok=document.execCommand('copy');}catch(_e){}
    ta.remove();return ok;
  }

  async function copyClosing31(btn){
    const old=btn.textContent;btn.disabled=true;btn.textContent='Preparando mensagem…';
    try{
      const d=await openCommissionData31();
      const message=buildMessage31(d);
      const ok=await copyText31(message);
      if(!ok)throw new Error('O navegador não permitiu copiar automaticamente.');
      btn.textContent='Copiado ✓';
      toast(d.rows.length?'Fechamento copiado. Abra o WhatsApp e cole a mensagem.':'SEM PENDÊNCIAS copiado.');
      setTimeout(()=>{btn.disabled=false;btn.textContent=old;},1800);
    }catch(e){
      btn.disabled=false;btn.textContent=old;toast(e.message||'Não foi possível copiar o fechamento.','error');
    }
  }

  function injectCopy31(){
    if(state.view!=='financeiro'||state.demo)return;
    ensureStyles31();
    const bulk=document.getElementById('commissionBulkBar30');
    if(!bulk||bulk.querySelector('[data-copy-commission-closing31]'))return;
    const actions=document.createElement('div');
    actions.className='commission-copy-actions31';
    actions.innerHTML='<button class="btn ghost" type="button" data-copy-commission-closing31>Copiar fechamento para WhatsApp</button>';
    bulk.appendChild(actions);
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-copy-commission-closing31]');
    if(!btn)return;
    e.preventDefault();e.stopPropagation();copyClosing31(btn);
  },true);

  function start31(){
    injectCopy31();
    if(observer31)return;
    observer31=new MutationObserver(()=>injectCopy31());
    observer31.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start31);else start31();
})();
