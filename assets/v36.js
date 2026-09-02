/* Sunshine v3.36 — financeiro unificado + parcelamentos + comissões recolhíveis */
(function(){
  const PERIOD_KEY36='sunshine.period.v33';
  const COMMISSION_OPEN_KEY36='sunshine.commissions.expanded.v36';
  let observer36=null;
  let organizing36=false;
  let financeData36=[];

  function today36(){
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function defaultPeriod36(){
    const d=new Date();
    return {start:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`,end:today36()};
  }
  function period36(){
    try{return {...defaultPeriod36(),...JSON.parse(localStorage.getItem(PERIOD_KEY36)||'{}')};}
    catch(_e){return defaultPeriod36();}
  }
  function br36(v){return String(v||'').split('-').reverse().join('/');}
  function localDateKey36(v){
    if(!v)return '';
    const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v).slice(0,10);
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
    const map=Object.fromEntries(parts.map(x=>[x.type,x.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }
  function paymentDateKey36(p){return p?.competence_date||localDateKey36(p?.paid_at||p?.created_at);}
  function inPeriod36(key,p){return Boolean(key&&p.start&&p.end&&key>=p.start&&key<=p.end);}
  function norm36(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
  function statusFinance36(row){
    if(row.sale.status==='CANCELLED')return {key:'cancelado',label:'Cancelado',cls:'neutral'};
    if(row.sale.status==='REFUNDED')return {key:'estornado',label:'Estornado',cls:'neutral'};
    if(row.total>0&&row.received>=row.total-.005)return {key:'pago',label:'Pago',cls:'ok'};
    if(row.received>0)return {key:'parcial',label:'Parcial',cls:'gold'};
    return {key:'pendente',label:'Pendente',cls:'red'};
  }
  function paymentDateLabel36(p){
    if(!p)return '—';
    if(p.source==='ASAAS'&&p.competence_date)return br36(p.competence_date);
    return fmtDateTime(p.paid_at||p.created_at);
  }
  function source36(v){return v==='ASAAS'?'Asaas':v==='MANUAL'?'Manual':v||'—';}

  function ensureStyles36(){
    if(document.getElementById('sunshineV36Styles'))return;
    const s=document.createElement('style');s.id='sunshineV36Styles';s.textContent=`
      .finance-unified36{overflow:hidden}.finance-unified36 .section-head{align-items:flex-start}
      .finance-summary36{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 14px}.finance-summary36 span{display:inline-flex;gap:5px;align-items:center;border:1px solid #eadbd1;border-radius:999px;padding:7px 10px;background:#fffaf6;font-size:11px;color:#806b62}.finance-summary36 b{color:#3c2017}
      .finance-toolbar36{display:grid;grid-template-columns:minmax(220px,1fr) 180px;gap:10px;margin:0 0 12px}.finance-toolbar36 input,.finance-toolbar36 select{width:100%}
      .finance-grid-head36,.finance-main36{display:grid;grid-template-columns:105px minmax(170px,1.25fr) minmax(190px,1.35fr) 110px 110px 110px 105px 42px;gap:10px;align-items:center}
      .finance-grid-head36{padding:9px 12px;background:#f9f3ef;border-radius:10px 10px 0 0;color:#876f64;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
      .finance-list36{border:1px solid #eadbd1;border-radius:0 0 14px 14px;overflow:hidden}.finance-row36+ .finance-row36{border-top:1px solid #eee2db}
      .finance-main36{width:100%;border:0;background:#fff;text-align:left;padding:12px;color:#3c2017;font:inherit;cursor:pointer}.finance-main36:hover{background:#fffaf7}.finance-main36 b{font-size:12px}.finance-main36 small{display:block;color:#8b776e;font-size:10px;line-height:1.35;margin-top:3px}.finance-main36 .money36{font-weight:800;white-space:nowrap}.finance-main36 .remaining36{font-weight:800;white-space:nowrap}.finance-main36 .remaining36.zero{color:#256044}.finance-arrow36{font-size:18px;text-align:center;color:#8a6e62}
      .finance-status36{display:inline-flex;width:max-content;align-items:center;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:800}.finance-status36.ok{background:#eaf5ef;color:#256044}.finance-status36.gold{background:#fff3d7;color:#7b5b00}.finance-status36.red{background:#fdebea;color:#a41f1f}.finance-status36.neutral{background:#f1eeec;color:#675850}
      .finance-detail36{padding:0 12px 14px;background:#fffaf7}.finance-detail36[hidden]{display:none!important}.finance-detail-head36{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0 8px;border-top:1px dashed #e3d4cb}.finance-detail-head36 p{margin:0;color:#806b62;font-size:11px}.finance-detail-head36 b{color:#3c2017}
      .payment-list36{display:grid;gap:7px}.payment-item36{display:grid;grid-template-columns:125px minmax(130px,1fr) 120px 110px;gap:10px;align-items:center;padding:9px 10px;background:#fff;border:1px solid #eadfd8;border-radius:10px;font-size:11px}.payment-item36 small{color:#806b62}.payment-item36 strong{text-align:right}.payment-empty36{padding:10px;border:1px dashed #dccbc1;border-radius:10px;color:#806b62;font-size:11px;background:#fff}
      .commission-panel36 .section-head{align-items:center}.commission-panel36 .commission-toggle36{white-space:nowrap}.commission-panel36.is-collapsed36> :not(.section-head){display:none!important}.commission-panel36.is-collapsed36{padding-bottom:14px}.commission-panel36.is-collapsed36 .section-head{margin-bottom:0}.commission-panel36 .section-head p{max-width:760px}
      @media(max-width:980px){.finance-grid-head36{display:none}.finance-main36{grid-template-columns:1fr 1fr;gap:9px 14px}.finance-main36>div:nth-child(2),.finance-main36>div:nth-child(3){grid-column:1/-1}.finance-main36>div::before{display:block;color:#907c73;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}.finance-main36>div:nth-child(1)::before{content:'Data'}.finance-main36>div:nth-child(2)::before{content:'Cliente'}.finance-main36>div:nth-child(3)::before{content:'Serviço'}.finance-main36>div:nth-child(4)::before{content:'Venda'}.finance-main36>div:nth-child(5)::before{content:'Recebido'}.finance-main36>div:nth-child(6)::before{content:'Falta'}.finance-main36>div:nth-child(7)::before{content:'Situação'}.finance-arrow36{position:absolute;right:14px;margin-top:1px}.finance-row36{position:relative}.payment-item36{grid-template-columns:1fr 1fr}.payment-item36 strong{text-align:left}}
      @media(max-width:720px){.finance-toolbar36{grid-template-columns:1fr}.finance-main36{grid-template-columns:1fr 1fr;padding:12px 10px}.finance-detail36{padding:0 10px 12px}.finance-detail-head36{display:grid}.finance-detail-head36 .btn{width:100%}.payment-item36{grid-template-columns:1fr}.commission-panel36 .section-head{display:grid}.commission-panel36 .commission-toggle36{width:100%;margin-top:8px}}
    `;document.head.appendChild(s);
  }

  async function loadUnified36(){
    if(state.demo||!db)return [];
    const p=period36();
    const [sq,aq,pq]=await Promise.all([
      db.from('sales').select('id,client_id,service_id,work_id,appointment_id,responsible_member_id,sale_type,source,status,total_amount,sold_at,created_at,clients(full_name),services(name)').order('sold_at',{ascending:false}).limit(5000),
      db.from('payment_allocations').select('id,payment_id,sale_id,amount,created_at').limit(10000),
      db.from('payments').select('id,client_id,source,status,gross_amount,payment_method,paid_at,competence_date,created_at,notes').limit(10000)
    ]);
    if(sq.error)throw sq.error;if(aq.error)throw aq.error;if(pq.error)throw pq.error;
    const payments=Object.fromEntries((pq.data||[]).map(x=>[x.id,x]));
    const allocationsBySale={};
    (aq.data||[]).forEach(a=>{(allocationsBySale[a.sale_id]??=[]).push(a);});
    const rows=(sq.data||[]).map(sale=>{
      const allocations=allocationsBySale[sale.id]||[];
      const pieces=allocations.map(a=>({allocation:a,payment:payments[a.payment_id]})).filter(x=>x.payment);
      const paidPieces=pieces.filter(x=>x.payment.status==='PAID');
      const received=paidPieces.reduce((sum,x)=>sum+Number(x.allocation.amount||0),0);
      const total=Number(sale.total_amount||0);
      const remaining=Math.max(total-received,0);
      const paymentCount=new Set(paidPieces.map(x=>x.payment.id)).size;
      const saleDate=localDateKey36(sale.sold_at||sale.created_at);
      const movementDates=pieces.map(x=>paymentDateKey36(x.payment)).filter(Boolean);
      const visible=inPeriod36(saleDate,p)||movementDates.some(d=>inPeriod36(d,p));
      const work=byId(state.works||[],sale.work_id);
      const service=sale.services?.name||byId(state.services||[],sale.service_id)?.name||work?.title||String(sale.sale_type||'Venda').replaceAll('_',' ');
      const lastPayment=paidPieces.map(x=>x.payment).sort((a,b)=>String(paymentDateKey36(b)).localeCompare(String(paymentDateKey36(a))))[0]||null;
      return {sale,allocations,pieces,paidPieces,total,received,remaining,paymentCount,saleDate,service,visible,lastPayment};
    }).filter(x=>x.visible);
    rows.forEach(x=>x.financialStatus=statusFinance36(x));
    rows.sort((a,b)=>{
      const da=paymentDateKey36(a.lastPayment)||a.saleDate||'';const dbb=paymentDateKey36(b.lastPayment)||b.saleDate||'';
      return dbb.localeCompare(da)||String(b.sale.sold_at||'').localeCompare(String(a.sale.sold_at||''));
    });
    financeData36=rows;
    return rows;
  }

  function paymentItems36(row){
    if(!row.pieces.length)return '<div class="payment-empty36">Nenhum recebimento associado ainda.</div>';
    return row.pieces.slice().sort((a,b)=>String(paymentDateKey36(b.payment)).localeCompare(String(paymentDateKey36(a.payment)))).map(x=>`
      <div class="payment-item36">
        <div><b>${escapeHtml(paymentDateLabel36(x.payment))}</b><small>${escapeHtml(source36(x.payment.source))}</small></div>
        <div><b>${escapeHtml(x.payment.payment_method||'Pagamento')}</b><small>${x.payment.status==='PAID'?'Confirmado':escapeHtml(x.payment.status||'—')}</small></div>
        <div><small>Parte desta venda</small><b>${fmtMoney(x.allocation.amount)}</b></div>
        <strong>${x.payment.status==='PAID'?'Recebido':'Não confirmado'}</strong>
      </div>`).join('');
  }

  function unifiedRow36(row){
    const s=row.sale,st=row.financialStatus;
    const installmentText=row.paymentCount?`${row.paymentCount} pagamento${row.paymentCount===1?'':'s'}`:'Sem pagamento';
    const client=s.clients?.full_name||byId(state.clients||[],s.client_id)?.full_name||'Cliente não identificado';
    const search=norm36(`${client} ${row.service} ${st.label}`);
    return `<article class="finance-row36" data-finance-row36 data-search36="${escapeHtml(search)}" data-status36="${st.key}">
      <button type="button" class="finance-main36" data-toggle-sale36="${s.id}" aria-expanded="false">
        <div><b>${br36(row.saleDate)}</b><small>${escapeHtml(source36(s.source))}</small></div>
        <div><b>${escapeHtml(client)}</b><small>${escapeHtml(installmentText)}</small></div>
        <div><b>${escapeHtml(row.service)}</b><small>${escapeHtml(String(s.sale_type||'').replaceAll('_',' '))}</small></div>
        <div class="money36">${fmtMoney(row.total)}</div>
        <div class="money36">${fmtMoney(row.received)}</div>
        <div class="remaining36 ${row.remaining<=.005?'zero':''}">${fmtMoney(row.remaining)}</div>
        <div><span class="finance-status36 ${st.cls}">${st.label}</span></div>
        <div class="finance-arrow36" aria-hidden="true">⌄</div>
      </button>
      <div class="finance-detail36" data-sale-detail36="${s.id}" hidden>
        <div class="finance-detail-head36"><p><b>${row.paymentCount?`${row.paymentCount} recebimento${row.paymentCount===1?'':'s'} associado${row.paymentCount===1?'':'s'}`:'Ainda não recebeu'}</b> · Total da venda ${fmtMoney(row.total)} · Recebido ${fmtMoney(row.received)} · Falta ${fmtMoney(row.remaining)}.</p>${row.remaining>.005&&s.status!=='CANCELLED'?`<button type="button" class="btn secondary" data-add-receipt36="${s.id}">+ Registrar recebimento</button>`:''}</div>
        <div class="payment-list36">${paymentItems36(row)}</div>
      </div>
    </article>`;
  }

  async function unifiedHtml36(){
    const rows=await loadUnified36();const p=period36();
    const totalSales=rows.reduce((s,x)=>s+x.total,0),received=rows.reduce((s,x)=>s+x.received,0),remaining=rows.reduce((s,x)=>s+x.remaining,0);
    return `<div class="section-head"><div><h2>Vendas e recebimentos</h2><p>Cada venda aparece uma única vez. Os pagamentos ficam dentro dela — inclusive quando o cliente paga em 2x, 3x ou mais vezes.</p></div><button class="btn" data-action="new-payment">+ Novo lançamento</button></div>
      <div class="finance-summary36"><span>Período <b>${br36(p.start)} a ${br36(p.end)}</b></span><span>Vendas <b>${rows.length}</b></span><span>Valor contratado <b>${fmtMoney(totalSales)}</b></span><span>Recebido <b>${fmtMoney(received)}</b></span><span>Em aberto <b>${fmtMoney(remaining)}</b></span></div>
      <div class="finance-toolbar36"><input class="field" type="search" placeholder="Buscar cliente ou serviço" data-finance-search36><select class="select" data-finance-status-filter36><option value="">Todas as situações</option><option value="pago">Pago</option><option value="parcial">Parcial</option><option value="pendente">Pendente</option><option value="cancelado">Cancelado</option></select></div>
      <div class="finance-grid-head36"><div>Data</div><div>Cliente</div><div>Serviço</div><div>Venda</div><div>Recebido</div><div>Falta</div><div>Situação</div><div></div></div>
      <div class="finance-list36">${rows.length?rows.map(unifiedRow36).join(''):'<div class="payment-empty36" style="margin:12px">Nenhuma venda ou recebimento no período selecionado.</div>'}</div>`;
  }

  const previousFinance36=renderFinance;
  renderFinance=async function(){
    ensureStyles36();
    const html=await previousFinance36();
    if(state.demo)return html;
    const root=document.createElement('div');root.innerHTML=html;
    const panels=[...root.querySelectorAll('article.panel')];
    const pay=panels.find(x=>/^pagamentos$/i.test((x.querySelector('h2')?.textContent||'').trim()));
    const sales=panels.find(x=>/^vendas$/i.test((x.querySelector('h2')?.textContent||'').trim()));
    const unified=document.createElement('article');unified.id='financialUnified36';unified.className='panel finance-unified36';
    try{unified.innerHTML=await unifiedHtml36();}catch(e){console.error(e);unified.innerHTML=`<div class="empty-state error">${escapeHtml(e.message||'Não foi possível montar a visão unificada.')}</div>`;}
    if(pay&&sales&&pay.parentElement===sales.parentElement){pay.parentElement.replaceWith(unified);}
    else if(pay){pay.replaceWith(unified);sales?.remove();}
    else{root.appendChild(unified);}
    return root.innerHTML;
  };

  function findCommissionPanel36(){
    return [...document.querySelectorAll('#content article.panel')].find(p=>/^comiss[oõ]es$/i.test((p.querySelector('h2')?.textContent||'').trim()))||null;
  }
  function decorateCommission36(){
    if(state.view!=='financeiro')return;
    const panel=findCommissionPanel36();if(!panel)return;
    panel.classList.add('commission-panel36');
    const head=panel.querySelector('.section-head')||panel.querySelector('h2')?.parentElement;if(!head)return;
    let btn=head.querySelector('[data-toggle-commissions36]');
    if(!btn){btn=document.createElement('button');btn.type='button';btn.className='btn ghost commission-toggle36';btn.dataset.toggleCommissions36='1';head.appendChild(btn);}
    const expanded=localStorage.getItem(COMMISSION_OPEN_KEY36)==='1';
    panel.classList.toggle('is-collapsed36',!expanded);btn.textContent=expanded?'Recolher comissões':'Ver comissões';btn.setAttribute('aria-expanded',String(expanded));
  }
  function organizeFinance36(){
    if(organizing36||state.view!=='financeiro')return;organizing36=true;
    try{
      ensureStyles36();decorateCommission36();
      const content=document.getElementById('content');const unified=content?.querySelector('#financialUnified36');const commission=findCommissionPanel36();
      if(content&&unified&&commission){
        const pos=unified.compareDocumentPosition(commission);
        if(pos&Node.DOCUMENT_POSITION_PRECEDING)content.insertBefore(unified,commission);
      }
      const foot=document.querySelector('.sidebar-foot');if(foot)foot.innerHTML='<span class="dot"></span> Ecossistema Sunshine · v3.36';
    }finally{organizing36=false;}
  }

  function filterRows36(){
    const q=norm36(document.querySelector('[data-finance-search36]')?.value||'');
    const st=document.querySelector('[data-finance-status-filter36]')?.value||'';
    document.querySelectorAll('[data-finance-row36]').forEach(row=>{
      row.hidden=Boolean((q&&!String(row.dataset.search36||'').includes(q))||(st&&row.dataset.status36!==st));
    });
  }

  function receiptModal36(saleId){
    const row=financeData36.find(x=>x.sale.id===saleId);if(!row){toast('Venda não encontrada. Atualize a tela e tente novamente.','error');return;}
    if(row.remaining<=.005){toast('Esta venda já está totalmente paga.');return;}
    const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());const local=now.toISOString().slice(0,16);
    const client=row.sale.clients?.full_name||byId(state.clients||[],row.sale.client_id)?.full_name||'Cliente';
    openModal('Registrar recebimento',`<form id="receiptForm36" class="form-grid">
      <div class="span-2 soft-box"><h3>${escapeHtml(client)} · ${escapeHtml(row.service)}</h3><p>Venda ${fmtMoney(row.total)} · já recebido ${fmtMoney(row.received)} · falta <b>${fmtMoney(row.remaining)}</b>. Este recebimento será acrescentado à mesma venda.</p></div>
      <label>Valor recebido<input id="r36Amount" type="number" min="0.01" max="${row.remaining.toFixed(2)}" step="0.01" value="${row.remaining.toFixed(2)}" required></label>
      <label>Data do pagamento<input id="r36PaidAt" type="datetime-local" value="${local}" required></label>
      <label class="span-2">Método<input id="r36Method" placeholder="PIX, cartão, dinheiro…"></label>
      <label class="span-2">Observações<textarea id="r36Notes" rows="3" placeholder="Opcional"></textarea></label>
      <div class="note span-2"><b>Parcelamento:</b> se esta for a 2ª ou 3ª parte, o sistema soma ao que já foi recebido e mantém o saldo restante automaticamente.</div>
      <div class="span-2">${formActions('Registrar recebimento')}</div>
    </form>`,true);
    bindCancel();
    document.getElementById('receiptForm36').addEventListener('submit',async e=>{
      e.preventDefault();if(!requireReal())return;
      const amount=Number(document.getElementById('r36Amount').value||0),paidRaw=document.getElementById('r36PaidAt').value;
      if(amount<=0||amount>row.remaining+.005){toast(`Informe um valor entre R$ 0,01 e ${fmtMoney(row.remaining)}.`,'error');return;}
      const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Registrando…';
      const paidAt=new Date(paidRaw).toISOString();const competence=paidRaw.slice(0,10);
      const {data,error}=await db.rpc('record_sale_receipt',{
        p_sale_id:saleId,p_amount:amount,p_paid_at:paidAt,p_competence_date:competence,
        p_payment_method:document.getElementById('r36Method').value.trim()||null,p_notes:document.getElementById('r36Notes').value.trim()||null
      });
      if(error){btn.disabled=false;btn.textContent='Registrar recebimento';toast(error.message||'Não foi possível registrar o recebimento.','error');return;}
      closeModal();toast(data?.financial_status==='PAID'?'Recebimento registrado. Venda totalmente paga.':'Recebimento registrado. Saldo atualizado.');
      await navigate('financeiro');
    });
  }

  document.addEventListener('click',e=>{
    const toggle=e.target.closest('[data-toggle-sale36]');if(toggle){
      const detail=document.querySelector(`[data-sale-detail36="${toggle.dataset.toggleSale36}"]`);if(!detail)return;
      const open=detail.hidden;detail.hidden=!open;toggle.setAttribute('aria-expanded',String(open));const arrow=toggle.querySelector('.finance-arrow36');if(arrow)arrow.textContent=open?'⌃':'⌄';return;
    }
    const receipt=e.target.closest('[data-add-receipt36]');if(receipt){e.preventDefault();e.stopPropagation();receiptModal36(receipt.dataset.addReceipt36);return;}
    const c=e.target.closest('[data-toggle-commissions36]');if(c){e.preventDefault();const panel=c.closest('.commission-panel36');if(!panel)return;const open=panel.classList.contains('is-collapsed36');panel.classList.toggle('is-collapsed36',!open);localStorage.setItem(COMMISSION_OPEN_KEY36,open?'1':'0');c.textContent=open?'Recolher comissões':'Ver comissões';c.setAttribute('aria-expanded',String(open));return;}
    const apply=e.target.closest('[data-period-context32="financeiro"] [data-apply-period32]');if(apply){setTimeout(()=>{if(state.view==='financeiro')navigate('financeiro');},320);}
  },true);
  document.addEventListener('input',e=>{if(e.target.matches('[data-finance-search36]'))filterRows36();});
  document.addEventListener('change',e=>{if(e.target.matches('[data-finance-status-filter36]'))filterRows36();});

  function start36(){
    ensureStyles36();organizeFinance36();
    if(observer36)return;observer36=new MutationObserver(()=>organizeFinance36());observer36.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start36);else start36();
})();
