/* Sunshine v3.39 — comissões recolhíveis + lançamentos financeiros unificados */
(function(){
  const PERIOD_KEY='sunshine.period.v33';
  const COMMISSION_KEY='sunshine.commissions.open.v39';
  let observer39=null;
  let timer39=null;
  let busy39=false;
  let detailCache39={};

  function ensureStyles39(){
    if(document.getElementById('sunshineV39Styles'))return;
    const s=document.createElement('style');
    s.id='sunshineV39Styles';
    s.textContent=`
      .commission-toggle39{display:inline-flex;align-items:center;gap:8px;border:1px solid #dfcfc5;background:#fff;border-radius:11px;padding:9px 12px;font-weight:800;color:#5b2e20;cursor:pointer;white-space:nowrap}
      .commission-toggle39 .arrow39{font-size:13px;line-height:1}.commission-summary39{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0 0}
      #commissionControl[data-collapsed39="1"]{padding-bottom:14px}#commissionControl[data-collapsed39="1"] .section-head{margin-bottom:0}
      .finance-unified39 .section-head{align-items:center}.finance-unified39 .unified-intro39{margin-top:2px;color:#806b62;font-size:12px}
      .finance-unified39 .status39{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:800;white-space:nowrap}
      .finance-unified39 .status39.paid{background:#eaf5ef;color:#256044}.finance-unified39 .status39.partial{background:#fff3d7;color:#745600}.finance-unified39 .status39.pending{background:#fdebea;color:#a41f1f}.finance-unified39 .status39.review{background:#f1ece8;color:#6f5e55}
      .finance-unified39 .money39 b{display:block}.finance-unified39 .money39 small,.finance-unified39 td small{display:block;color:#806b62;margin-top:3px;line-height:1.3}
      .finance-unified39 .service39 b{display:block}.finance-unified39 .empty39{padding:28px 16px;text-align:center;color:#806b62}
      .finance-detail39{display:grid;gap:14px}.finance-detail-summary39{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.finance-detail-summary39>div{border:1px solid #eadfd8;border-radius:12px;padding:12px;background:#fffaf6}.finance-detail-summary39 span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#8e776c}.finance-detail-summary39 b{display:block;margin-top:4px;font-size:16px}
      .finance-receipt39{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border:1px solid #eadfd8;border-radius:12px;padding:11px 12px}.finance-receipt39 small{display:block;color:#806b62;margin-top:3px}
      @media(max-width:720px){.commission-toggle39{width:100%;justify-content:space-between}.finance-detail-summary39{grid-template-columns:1fr}.finance-unified39 .section-head{display:grid;gap:10px}.finance-unified39 .section-head .btn{width:100%}}
    `;
    document.head.appendChild(s);
  }

  function period39(){
    const d=new Date();
    const def={start:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`,end:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
    try{return {...def,...JSON.parse(localStorage.getItem(PERIOD_KEY)||'{}')};}catch(_e){return def;}
  }
  function bounds39(p){const a=new Date(`${p.start}T00:00:00-03:00`),b=new Date(`${p.end}T00:00:00-03:00`);b.setDate(b.getDate()+1);return [a.toISOString(),b.toISOString()];}
  function br39(v){return String(v||'').split('-').reverse().join('/');}
  function money39(v){return Number(v||0);}
  function client39(id){return byId(state.clients||[],id)?.full_name||'Cliente não identificado';}
  function item39(s){
    const service=byId(state.services||[],s.service_id);
    const work=(state.works||[]).find(w=>w.id===s.work_id);
    return work?.title||service?.name||String(s.sale_type||'Venda').replaceAll('_',' ');
  }

  function commissionPanel39(){return document.getElementById('commissionControl')||[...document.querySelectorAll('#content article.panel')].find(p=>/^comiss[oõ]es$/i.test((p.querySelector('h2')?.textContent||'').trim()))||null;}
  function applyCommissionState39(panel){
    if(!panel)return;
    panel.id=panel.id||'commissionControl';
    const head=panel.querySelector('.section-head');if(!head)return;
    let btn=head.querySelector('[data-commission-toggle39]');
    if(!btn){
      btn=document.createElement('button');btn.type='button';btn.className='commission-toggle39';btn.dataset.commissionToggle39='1';head.appendChild(btn);
    }
    const open=localStorage.getItem(COMMISSION_KEY)==='1';
    panel.dataset.collapsed39=open?'0':'1';
    btn.innerHTML=open?'<span>Recolher comissões</span><span class="arrow39">▲</span>':'<span>Abrir comissões</span><span class="arrow39">▼</span>';
    const keep=new Set([head,panel.querySelector('#commissionDueByPerson35')].filter(Boolean));
    [...panel.children].forEach(ch=>{if(!keep.has(ch))ch.hidden=!open;});
    const people=panel.querySelector('#commissionDueByPerson35');if(people)people.hidden=false;
  }

  function toggleCommission39(){
    const panel=commissionPanel39();if(!panel)return;
    const next=localStorage.getItem(COMMISSION_KEY)==='1'?'0':'1';localStorage.setItem(COMMISSION_KEY,next);applyCommissionState39(panel);
  }

  function financePanels39(){
    const panels=[...document.querySelectorAll('#content article.panel')];
    const payments=panels.find(p=>/^pagamentos$/i.test((p.querySelector('h2')?.textContent||'').trim()));
    const sales=panels.find(p=>/^vendas$/i.test((p.querySelector('h2')?.textContent||'').trim()));
    return {payments,sales};
  }

  async function loadUnified39(){
    const p=period39(),[start,end]=bounds39(p);
    const [payQ,saleQ]=await Promise.all([
      db.from('payments').select('id,client_id,source,status,gross_amount,payment_method,paid_at,created_at,notes').eq('status','PAID').gte('paid_at',start).lt('paid_at',end).order('paid_at',{ascending:false}).limit(5000),
      db.from('sales').select('id,client_id,service_id,work_id,responsible_member_id,sale_type,status,total_amount,unit_price,discount_amount,sold_at,created_at').gte('sold_at',start).lt('sold_at',end).order('sold_at',{ascending:false}).limit(5000)
    ]);
    if(payQ.error)throw payQ.error;if(saleQ.error)throw saleQ.error;
    const periodPayments=payQ.data||[],periodSales=saleQ.data||[];
    const periodPayIds=periodPayments.map(x=>x.id);
    const periodAllocQ=periodPayIds.length?await db.from('payment_allocations').select('id,payment_id,sale_id,amount').in('payment_id',periodPayIds).limit(10000):{data:[],error:null};
    if(periodAllocQ.error)throw periodAllocQ.error;
    const periodAlloc=periodAllocQ.data||[];
    const linkedSaleIds=[...new Set(periodAlloc.map(x=>x.sale_id).filter(Boolean))];
    const have=new Set(periodSales.map(x=>x.id));
    const missing=linkedSaleIds.filter(id=>!have.has(id));
    let linkedSales=[];
    if(missing.length){const q=await db.from('sales').select('id,client_id,service_id,work_id,responsible_member_id,sale_type,status,total_amount,unit_price,discount_amount,sold_at,created_at').in('id',missing).limit(5000);if(q.error)throw q.error;linkedSales=q.data||[];}
    const sales=[...periodSales,...linkedSales];
    const saleIds=[...new Set(sales.map(x=>x.id))];
    const allAllocQ=saleIds.length?await db.from('payment_allocations').select('id,payment_id,sale_id,amount').in('sale_id',saleIds).limit(20000):{data:[],error:null};
    if(allAllocQ.error)throw allAllocQ.error;
    const allAlloc=allAllocQ.data||[];
    const allPaymentIds=[...new Set(allAlloc.map(x=>x.payment_id).filter(Boolean))];
    let allPayments=[];
    if(allPaymentIds.length){const q=await db.from('payments').select('id,client_id,source,status,gross_amount,payment_method,paid_at,created_at,notes').in('id',allPaymentIds).limit(10000);if(q.error)throw q.error;allPayments=q.data||[];}
    const payById=Object.fromEntries(allPayments.map(x=>[x.id,x]));
    const receiptsBySale={};
    allAlloc.forEach(a=>{
      const payment=payById[a.payment_id];if(!payment||payment.status!=='PAID')return;
      (receiptsBySale[a.sale_id]||(receiptsBySale[a.sale_id]=[])).push({allocation:a,payment,amount:money39(a.amount)});
    });
    Object.values(receiptsBySale).forEach(list=>list.sort((a,b)=>new Date(b.payment.paid_at||b.payment.created_at)-new Date(a.payment.paid_at||a.payment.created_at)));
    const rows=sales.map(s=>{
      const receipts=receiptsBySale[s.id]||[];
      const total=money39(s.total_amount||s.unit_price);
      const received=receipts.reduce((sum,x)=>sum+x.amount,0);
      const balance=Math.max(total-received,0);
      const status=received<=.005?'PENDING':balance>.005?'PARTIAL':'PAID';
      const lastReceipt=receipts[0]?.payment?.paid_at||receipts[0]?.payment?.created_at||null;
      return {kind:'sale',sale:s,total,received,balance,status,receipts,lastReceipt,sortDate:lastReceipt||s.sold_at||s.created_at};
    });
    const allocatedPeriodIds=new Set(periodAlloc.map(x=>x.payment_id));
    const orphan=periodPayments.filter(pmt=>!allocatedPeriodIds.has(pmt.id)).map(pmt=>({kind:'payment',payment:pmt,total:money39(pmt.gross_amount),received:money39(pmt.gross_amount),balance:0,status:'REVIEW',receipts:[],sortDate:pmt.paid_at||pmt.created_at}));
    const combined=[...rows,...orphan].sort((a,b)=>new Date(b.sortDate)-new Date(a.sortDate));
    detailCache39=Object.fromEntries(rows.map(r=>[r.sale.id,r]));
    return {period:p,rows:combined};
  }

  function statusHtml39(v){
    if(v==='PAID')return '<span class="status39 paid">Pago</span>';
    if(v==='PARTIAL')return '<span class="status39 partial">Parcial</span>';
    if(v==='PENDING')return '<span class="status39 pending">Pendente</span>';
    return '<span class="status39 review">A associar</span>';
  }
  function sourceSummary39(receipts){
    const names=[...new Set((receipts||[]).map(x=>x.payment.source==='ASAAS'?'Asaas':x.payment.source==='MANUAL'?'Manual':(x.payment.source||'Pagamento')))];
    return names.join(' + ')||'Sem recebimento';
  }
  function rowHtml39(r){
    if(r.kind==='payment'){
      return `<tr><td>${fmtDateTime(r.payment.paid_at||r.payment.created_at)}</td><td><b>${escapeHtml(client39(r.payment.client_id))}</b></td><td class="service39"><b>Pagamento sem venda associada</b><small>${escapeHtml(r.payment.source||'Pagamento')}</small></td><td class="money39"><b>—</b><small>venda não identificada</small></td><td class="money39"><b>${fmtMoney(r.received)}</b><small>${escapeHtml(r.payment.payment_method||r.payment.source||'Recebimento')}</small></td><td>—</td><td>${statusHtml39('REVIEW')}</td><td>—</td></tr>`;
    }
    const s=r.sale,clientName=client39(s.client_id),label=item39(s);
    const last=r.lastReceipt?`Último: ${fmtDate(r.lastReceipt)}`:(s.sold_at?`Venda: ${fmtDate(s.sold_at)}`:'');
    return `<tr data-unified-sale39="${s.id}">
      <td>${fmtDate(s.sold_at||s.created_at)}${last?`<small>${escapeHtml(last)}</small>`:''}</td>
      <td><b>${escapeHtml(clientName)}</b></td>
      <td class="service39"><b>${escapeHtml(label)}</b><small>${escapeHtml(String(s.sale_type||'').replaceAll('_',' '))}</small></td>
      <td class="money39"><b>${fmtMoney(r.total)}</b><small>valor contratado</small></td>
      <td class="money39"><b>${fmtMoney(r.received)}</b><small>${r.receipts.length} recebimento${r.receipts.length===1?'':'s'} · ${escapeHtml(sourceSummary39(r.receipts))}</small></td>
      <td class="money39"><b>${fmtMoney(r.balance)}</b><small>${r.balance>.005?'a receber':'quitado'}</small></td>
      <td>${statusHtml39(r.status)}</td>
      <td><button class="link-btn" type="button" data-unified-detail39="${s.id}">Ver recebimentos</button></td>
    </tr>`;
  }

  async function renderUnified39(){
    if(busy39||state.view!=='financeiro'||state.demo||!db)return;
    const {payments,sales}=financePanels39();if(!payments||!sales)return;
    busy39=true;
    try{
      applyCommissionState39(commissionPanel39());
      let panel=document.getElementById('financeUnified39');
      if(!panel){panel=document.createElement('article');panel.id='financeUnified39';panel.className='panel finance-unified39';payments.insertAdjacentElement('beforebegin',panel);}
      payments.hidden=true;sales.hidden=true;
      panel.innerHTML='<div class="empty-state"><span class="spinner"></span>Unificando vendas e recebimentos…</div>';
      const d=await loadUnified39();
      const rows=d.rows.length?d.rows.map(rowHtml39).join(''):`<tr><td colspan="8" class="empty39">Nenhum lançamento no período selecionado.</td></tr>`;
      panel.innerHTML=`<div class="section-head"><div><h2>Lançamentos</h2><p class="unified-intro39">Uma única visão: venda, quanto entrou, quanto falta e situação do pagamento · ${br39(d.period.start)} a ${br39(d.period.end)}</p></div><button class="btn" type="button" data-unified-new-payment39>+ Pagamento</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Cliente</th><th>Serviço / trabalho</th><th>Valor contratado</th><th>Recebido</th><th>Saldo</th><th>Status</th><th>Ação</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }catch(e){console.error('v39 unified finance',e);toast(e.message||'Não foi possível unificar os lançamentos.','error');}
    finally{busy39=false;}
  }

  function openDetail39(id){
    const r=detailCache39[id];if(!r)return;
    const s=r.sale,label=item39(s),clientName=client39(s.client_id);
    const receipts=r.receipts.length?r.receipts.map(x=>`<div class="finance-receipt39"><div><b>${escapeHtml(x.payment.source==='ASAAS'?'Asaas':x.payment.source==='MANUAL'?'Manual':(x.payment.source||'Pagamento'))} · ${escapeHtml(x.payment.payment_method||'')}</b><small>${fmtDateTime(x.payment.paid_at||x.payment.created_at)}</small></div><b>${fmtMoney(x.amount)}</b></div>`).join(''):'<div class="empty-state compact">Nenhum recebimento associado ainda.</div>';
    openModal('Venda e recebimentos',`<div class="finance-detail39"><div><b>${escapeHtml(clientName)}</b><div class="muted">${escapeHtml(label)}</div></div><div class="finance-detail-summary39"><div><span>Valor contratado</span><b>${fmtMoney(r.total)}</b></div><div><span>Recebido</span><b>${fmtMoney(r.received)}</b></div><div><span>Saldo</span><b>${fmtMoney(r.balance)}</b></div></div><div><h3>Histórico de recebimentos</h3>${receipts}</div></div>`,true);
  }

  function schedule39(delay=320){clearTimeout(timer39);timer39=setTimeout(()=>{if(state.view==='financeiro'){applyCommissionState39(commissionPanel39());renderUnified39();}},delay);}

  document.addEventListener('click',e=>{
    const toggle=e.target.closest('[data-commission-toggle39]');if(toggle){e.preventDefault();e.stopPropagation();toggleCommission39();return;}
    const detail=e.target.closest('[data-unified-detail39]');if(detail){e.preventDefault();openDetail39(detail.dataset.unifiedDetail39);return;}
    const add=e.target.closest('[data-unified-new-payment39]');if(add){e.preventDefault();const {payments}=financePanels39();const original=[...(payments?.querySelectorAll('button')||[])].find(b=>/pagamento/i.test(b.textContent||''));if(original)original.click();else if(typeof handleAction==='function')handleAction('new-payment');return;}
    if(e.target.closest('[data-apply34],[data-apply-period32]'))schedule39(700);
  },true);

  function start39(){
    ensureStyles39();
    const foot=document.querySelector('.sidebar-foot');if(foot)foot.innerHTML='<span class="dot"></span> Ecossistema Sunshine · v3.39';
    schedule39(500);
    if(observer39)return;
    observer39=new MutationObserver(()=>{if(state.view==='financeiro')schedule39(450);});
    observer39.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start39);else start39();
})();
