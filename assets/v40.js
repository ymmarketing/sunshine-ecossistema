/* Sunshine v3.40 — financeiro unificado estável + comissões recolhíveis */
(function(){
  const PERIOD_KEY='sunshine.period.v33';
  const COMMISSION_KEY='sunshine.commissions.open.v40';
  let detail40={};
  let renderToken40=0;

  function style40(){
    if(document.getElementById('v40style'))return;
    const s=document.createElement('style');s.id='v40style';s.textContent=`
      .commission-toggle40{display:inline-flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid #dfcfc5;background:#fff;border-radius:11px;padding:9px 12px;font-weight:800;color:#5b2e20;cursor:pointer;white-space:nowrap}
      .finance-unified40 .section-head{align-items:center}.finance-unified40 .section-head p{margin-top:3px}.finance-unified40 td small{display:block;color:#806b62;margin-top:3px;line-height:1.35}
      .finance-status40{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:800;white-space:nowrap}.finance-status40.paid{background:#eaf5ef;color:#256044}.finance-status40.partial{background:#fff3d7;color:#745600}.finance-status40.pending{background:#fdebea;color:#a41f1f}.finance-status40.review{background:#f1ece8;color:#6f5e55}
      .finance-detail40{display:grid;gap:14px}.finance-detail-grid40{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.finance-detail-grid40>div{border:1px solid #eadfd8;border-radius:12px;padding:12px;background:#fffaf6}.finance-detail-grid40 span{display:block;font-size:10px;text-transform:uppercase;color:#8e776c}.finance-detail-grid40 b{display:block;margin-top:4px;font-size:16px}.finance-receipt40{display:flex;justify-content:space-between;gap:12px;border:1px solid #eadfd8;border-radius:12px;padding:11px 12px}.finance-receipt40 small{display:block;color:#806b62;margin-top:3px}
      @media(max-width:720px){.commission-toggle40{width:100%}.finance-unified40 .section-head{display:grid;gap:10px}.finance-unified40 .section-head .btn{width:100%}.finance-detail-grid40{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }
  function period40(){const d=new Date(),def={start:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`,end:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};try{return {...def,...JSON.parse(localStorage.getItem(PERIOD_KEY)||'{}')}}catch{return def}}
  function bounds40(p){const a=new Date(`${p.start}T00:00:00-03:00`),b=new Date(`${p.end}T00:00:00-03:00`);b.setDate(b.getDate()+1);return[a.toISOString(),b.toISOString()]}
  const br40=v=>String(v||'').split('-').reverse().join('/');
  const num40=v=>Number(v||0);
  const client40=id=>byId(state.clients||[],id)?.full_name||'Cliente não identificado';
  function label40(s){const service=byId(state.services||[],s.service_id),work=(state.works||[]).find(w=>w.id===s.work_id);return work?.title||service?.name||String(s.sale_type||'Venda').replaceAll('_',' ')}

  function commission40(){return document.getElementById('commissionControl')||[...document.querySelectorAll('#content article.panel')].find(p=>/^comiss[oõ]es$/i.test((p.querySelector('h2')?.textContent||'').trim()))||null}
  function applyCommission40(){
    if(state.view!=='financeiro')return;
    const panel=commission40();if(!panel)return;panel.id='commissionControl';
    const head=panel.querySelector('.section-head');if(!head)return;
    let btn=head.querySelector('[data-commission-toggle40]');if(!btn){btn=document.createElement('button');btn.type='button';btn.className='commission-toggle40';btn.dataset.commissionToggle40='1';head.appendChild(btn)}
    const open=localStorage.getItem(COMMISSION_KEY)==='1';btn.innerHTML=open?'<span>Recolher comissões</span><span>▲</span>':'<span>Abrir comissões</span><span>▼</span>';
    const summary=panel.querySelector('#commissionDueByPerson35');
    [...panel.children].forEach(ch=>{ch.hidden=!(open||ch===head||ch===summary)});if(summary)summary.hidden=false;
  }
  function toggleCommission40(){localStorage.setItem(COMMISSION_KEY,localStorage.getItem(COMMISSION_KEY)==='1'?'0':'1');applyCommission40()}
  function legacyPanels40(){const ps=[...document.querySelectorAll('#content article.panel')];return{payments:ps.find(p=>/^pagamentos$/i.test((p.querySelector('h2')?.textContent||'').trim())),sales:ps.find(p=>/^vendas$/i.test((p.querySelector('h2')?.textContent||'').trim()))}}

  async function load40(){
    const p=period40(),[start,end]=bounds40(p);
    const [pq,sq]=await Promise.all([
      db.from('payments').select('id,client_id,source,status,gross_amount,payment_method,paid_at,created_at').eq('status','PAID').gte('paid_at',start).lt('paid_at',end).order('paid_at',{ascending:false}).limit(5000),
      db.from('sales').select('id,client_id,service_id,work_id,responsible_member_id,sale_type,status,total_amount,unit_price,sold_at,created_at').gte('sold_at',start).lt('sold_at',end).order('sold_at',{ascending:false}).limit(5000)
    ]);if(pq.error)throw pq.error;if(sq.error)throw sq.error;
    const periodPayments=pq.data||[],periodSales=sq.data||[],payIds=periodPayments.map(x=>x.id);
    const paq=payIds.length?await db.from('payment_allocations').select('payment_id,sale_id,amount').in('payment_id',payIds).limit(10000):{data:[],error:null};if(paq.error)throw paq.error;
    const periodAlloc=paq.data||[],linked=[...new Set(periodAlloc.map(x=>x.sale_id).filter(Boolean))],have=new Set(periodSales.map(x=>x.id)),missing=linked.filter(x=>!have.has(x));
    let extraSales=[];if(missing.length){const q=await db.from('sales').select('id,client_id,service_id,work_id,responsible_member_id,sale_type,status,total_amount,unit_price,sold_at,created_at').in('id',missing).limit(5000);if(q.error)throw q.error;extraSales=q.data||[]}
    const sales=[...periodSales,...extraSales],saleIds=[...new Set(sales.map(x=>x.id))];
    const aq=saleIds.length?await db.from('payment_allocations').select('payment_id,sale_id,amount').in('sale_id',saleIds).limit(20000):{data:[],error:null};if(aq.error)throw aq.error;
    const alloc=aq.data||[],allPayIds=[...new Set(alloc.map(x=>x.payment_id).filter(Boolean))];
    let allPayments=[];if(allPayIds.length){const q=await db.from('payments').select('id,client_id,source,status,gross_amount,payment_method,paid_at,created_at').in('id',allPayIds).limit(10000);if(q.error)throw q.error;allPayments=q.data||[]}
    const payById=Object.fromEntries(allPayments.map(x=>[x.id,x])),receipts={};alloc.forEach(a=>{const pay=payById[a.payment_id];if(!pay||pay.status!=='PAID')return;(receipts[a.sale_id]||(receipts[a.sale_id]=[])).push({pay,amount:num40(a.amount)})});Object.values(receipts).forEach(x=>x.sort((a,b)=>new Date(b.pay.paid_at||b.pay.created_at)-new Date(a.pay.paid_at||a.pay.created_at)));
    const saleRows=sales.map(s=>{const rs=receipts[s.id]||[],total=num40(s.total_amount||s.unit_price),received=rs.reduce((a,x)=>a+x.amount,0),balance=Math.max(total-received,0),status=received<=.005?'PENDING':balance>.005?'PARTIAL':'PAID',last=rs[0]?.pay?.paid_at||rs[0]?.pay?.created_at||null;return{kind:'sale',sale:s,rs,total,received,balance,status,last,sort:last||s.sold_at||s.created_at}});
    const allocated=new Set(periodAlloc.map(x=>x.payment_id)),orphans=periodPayments.filter(x=>!allocated.has(x.id)).map(pay=>({kind:'payment',pay,sort:pay.paid_at||pay.created_at}));
    const rows=[...saleRows,...orphans].sort((a,b)=>new Date(b.sort)-new Date(a.sort));detail40=Object.fromEntries(saleRows.map(x=>[x.sale.id,x]));return{p,rows}
  }
  function status40(v){return v==='PAID'?'<span class="finance-status40 paid">Pago</span>':v==='PARTIAL'?'<span class="finance-status40 partial">Parcial</span>':v==='PENDING'?'<span class="finance-status40 pending">Pendente</span>':'<span class="finance-status40 review">A associar</span>'}
  function source40(rs){const a=[...new Set((rs||[]).map(x=>x.pay.source==='ASAAS'?'Asaas':x.pay.source==='MANUAL'?'Manual':x.pay.source||'Pagamento'))];return a.join(' + ')||'Sem recebimento'}
  function row40(r){
    if(r.kind==='payment')return`<tr><td>${fmtDateTime(r.pay.paid_at||r.pay.created_at)}</td><td><b>${escapeHtml(client40(r.pay.client_id))}</b></td><td><b>Pagamento sem venda associada</b><small>${escapeHtml(r.pay.source||'Pagamento')}</small></td><td>—</td><td><b>${fmtMoney(r.pay.gross_amount)}</b></td><td>—</td><td>${status40('REVIEW')}</td><td>—</td></tr>`;
    const s=r.sale;return`<tr><td>${fmtDate(s.sold_at||s.created_at)}${r.last?`<small>Último recebimento: ${fmtDate(r.last)}</small>`:''}</td><td><b>${escapeHtml(client40(s.client_id))}</b></td><td><b>${escapeHtml(label40(s))}</b><small>${escapeHtml(String(s.sale_type||'').replaceAll('_',' '))}</small></td><td><b>${fmtMoney(r.total)}</b><small>contratado</small></td><td><b>${fmtMoney(r.received)}</b><small>${r.rs.length} recebimento${r.rs.length===1?'':'s'} · ${escapeHtml(source40(r.rs))}</small></td><td><b>${fmtMoney(r.balance)}</b><small>${r.balance>.005?'a receber':'quitado'}</small></td><td>${status40(r.status)}</td><td><button type="button" class="link-btn" data-detail40="${s.id}">Ver recebimentos</button></td></tr>`
  }
  async function build40(){
    if(state.view!=='financeiro'||state.demo||!db)return;const token=++renderToken40,{payments,sales}=legacyPanels40();if(!payments||!sales)return;
    payments.hidden=true;sales.hidden=true;let panel=document.getElementById('financeUnified40');if(!panel){panel=document.createElement('article');panel.id='financeUnified40';panel.className='panel finance-unified40';payments.insertAdjacentElement('beforebegin',panel)}
    panel.innerHTML='<div class="empty-state"><span class="spinner"></span>Carregando lançamentos…</div>';
    try{const d=await load40();if(token!==renderToken40||state.view!=='financeiro')return;panel.innerHTML=`<div class="section-head"><div><h2>Lançamentos</h2><p>Venda e recebimentos em uma única visão · ${br40(d.p.start)} a ${br40(d.p.end)}</p></div><button class="btn" type="button" data-new-payment40>+ Pagamento</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Cliente</th><th>Serviço / trabalho</th><th>Valor contratado</th><th>Recebido</th><th>Saldo</th><th>Status</th><th>Ação</th></tr></thead><tbody>${d.rows.length?d.rows.map(row40).join(''):'<tr class="empty-row"><td colspan="8">Nenhum lançamento no período.</td></tr>'}</tbody></table></div>`}catch(e){console.error('v40',e);panel.innerHTML=`<div class="empty-state error">${escapeHtml(e.message||'Não foi possível carregar os lançamentos.')}</div>`}
  }
  function detailModal40(id){const r=detail40[id];if(!r)return;const s=r.sale,receipts=r.rs.length?r.rs.map(x=>`<div class="finance-receipt40"><div><b>${escapeHtml(x.pay.source==='ASAAS'?'Asaas':x.pay.source==='MANUAL'?'Manual':x.pay.source||'Pagamento')} · ${escapeHtml(x.pay.payment_method||'')}</b><small>${fmtDateTime(x.pay.paid_at||x.pay.created_at)}</small></div><b>${fmtMoney(x.amount)}</b></div>`).join(''):'<div class="empty-state compact">Nenhum recebimento associado.</div>';openModal('Venda e recebimentos',`<div class="finance-detail40"><div><b>${escapeHtml(client40(s.client_id))}</b><div class="muted">${escapeHtml(label40(s))}</div></div><div class="finance-detail-grid40"><div><span>Contratado</span><b>${fmtMoney(r.total)}</b></div><div><span>Recebido</span><b>${fmtMoney(r.received)}</b></div><div><span>Saldo</span><b>${fmtMoney(r.balance)}</b></div></div><div><h3>Histórico de recebimentos</h3>${receipts}</div></div>`,true)}

  function afterFinance40(){setTimeout(applyCommission40,80);setTimeout(applyCommission40,650);setTimeout(build40,180)}
  const prevRender40=render;render=async function(){await prevRender40();if(state.view==='financeiro')afterFinance40()};
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-commission-toggle40]');if(t){e.preventDefault();e.stopPropagation();toggleCommission40();return}
    const d=e.target.closest('[data-detail40]');if(d){e.preventDefault();detailModal40(d.dataset.detail40);return}
    const n=e.target.closest('[data-new-payment40]');if(n){e.preventDefault();const {payments}=legacyPanels40(),original=[...(payments?.querySelectorAll('button')||[])].find(b=>/pagamento/i.test(b.textContent||''));if(original)original.click();else if(typeof handleAction==='function')handleAction('new-payment');return}
    if(e.target.closest('[data-apply34],[data-apply-period32]')){setTimeout(applyCommission40,250);setTimeout(build40,550)}
  },true);
  style40();const foot=document.querySelector('.sidebar-foot');if(foot)foot.innerHTML='<span class="dot"></span> Ecossistema Sunshine · v3.40';if(state.view==='financeiro')afterFinance40();
})();
