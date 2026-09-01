/* Sunshine v3.32 — fechamento de comissões + recebido no mês */
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

  function commissionPanel31(){
    const panels=[...document.querySelectorAll('#content article.panel')];
    return panels.find(p=>/^comiss[oõ]es$/i.test((p.querySelector('h2')?.textContent||'').trim()))||null;
  }

  async function receivedMonth31(){
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

  function findCommissionKpis31(panel){
    const grids=[...panel.querySelectorAll('.kpi-grid')];
    return grids.find(g=>{
      const txt=(g.textContent||'').toLowerCase();
      return txt.includes('a pagar')&&txt.includes('pago no mês')&&txt.includes('pessoas com saldo');
    })||null;
  }

  async function injectReceived31(){
    if(state.view!=='financeiro')return;
    const panel=commissionPanel31();
    if(!panel)return;
    const grid=findCommissionKpis31(panel);
    if(!grid||grid.querySelector('#commissionReceivedMonth31'))return;

    const card=document.createElement('article');
    card.className='card';
    card.id='commissionReceivedMonth31';
    card.innerHTML='<div class="card-label">RECEBIDO NO MÊS</div><div class="value">Carregando…</div><div class="card-foot">Todos os pagamentos confirmados</div>';
    grid.insertAdjacentElement('afterbegin',card);

    try{
      const total=await receivedMonth31();
      if(card.isConnected){
        const value=card.querySelector('.value');
        if(value)value.textContent=fmtMoney(total);
      }
    }catch(e){
      console.error(e);
      if(card.isConnected){
        const value=card.querySelector('.value');
        if(value)value.textContent='—';
      }
    }
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
    return `COMISSÃO DO PERÍODO: ${start} A ${end}\n\nYASMIN: ${fmtMoney(d.totals.Yasmin||0)}\nLOURDES: ${fmtMoney(d.totals.Lourdes||0)}\nROSELY: ${fmtMoney(d.totals.Rosely||0)}`;
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

  function showVersion31(){
    const foot=document.querySelector('.sidebar-foot');
    if(foot)foot.innerHTML='<span class="dot"></span> Ecossistema Sunshine · v3.32';
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-copy-commission-closing31]');
    if(!btn)return;
    e.preventDefault();e.stopPropagation();copyClosing31(btn);
  },true);

  function injectAll31(){
    showVersion31();
    injectCopy31();
    injectReceived31();
  }

  function start31(){
    injectAll31();
    if(observer31)return;
    observer31=new MutationObserver(()=>injectAll31());
    observer31.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start31);else start31();
})();
