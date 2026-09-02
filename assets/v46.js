/* Sunshine v3.46 — estabilidade/performance + autonomia ADMIN */
(function(){
  const VERSION='v3.46';
  const isAdmin46=()=>state.member?.role==='ADMIN';
  let renderSeq46=0;

  function styles46(){
    if(document.getElementById('v46style'))return;
    const s=document.createElement('style');s.id='v46style';s.textContent=`
      .sidebar-version-current{margin-top:auto;padding:16px 8px 5px;color:#9a8177;font-size:10px}
      .admin-tools46{display:flex;gap:7px;flex-wrap:wrap}.admin-tools46 .btn{white-space:nowrap}
      .admin-payment-list46{display:grid;gap:9px}.admin-payment-row46{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #eadfd8;border-radius:12px;padding:11px 12px;background:#fffaf6}.admin-payment-row46 small{display:block;color:#806b62;margin-top:3px}.admin-payment-row46 .button-row{flex-shrink:0}
      .admin-readonly46{border:1px solid #eadfd8;background:#f8f4f1;border-radius:10px;padding:10px 12px;color:#705d55;line-height:1.45}.admin-readonly46 b{color:#3f241a}
      .admin-service46,.admin-inline-work46{margin-left:8px}
      @media(max-width:720px){.sidebar-version-current{display:none}.admin-payment-row46{display:grid}.admin-payment-row46 .button-row,.admin-tools46{display:grid}.admin-payment-row46 button,.admin-tools46 button{width:100%}}
    `;document.head.appendChild(s);
  }

  function localInput46(v){
    if(!v)return '';
    const d=new Date(v);if(Number.isNaN(d.getTime()))return '';
    const z=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
  }

  function stabilizeFinance46(){
    if(state.view!=='financeiro')return;
    const unified=document.getElementById('financeUnified40');if(!unified)return;
    unified.hidden=false;if(unified.parentElement)unified.parentElement.hidden=false;
    [...document.querySelectorAll('#content article.panel')].forEach(p=>{
      if(p===unified)return;
      const t=(p.querySelector('h2')?.textContent||'').trim();
      if(/^pagamentos$/i.test(t)||/^vendas$/i.test(t))p.hidden=true;
    });
  }

  function decorateWork46(){
    if(!isAdmin46()||state.view!=='trabalhos')return;
    document.querySelectorAll('#content tr[data-work-id]').forEach(row=>{
      if(row.querySelector('[data-admin-edit-work46]'))return;
      const work=(state.works||[]).find(x=>x.id===row.dataset.workId);const td=row.querySelector('td:first-child');if(!work||!td)return;
      const b=document.createElement('button');b.type='button';b.className='link-btn admin-inline-work46';b.dataset.adminEditWork46=work.id;b.textContent='Editar';td.appendChild(b);
    });
    if(!state.selectedWork)return;
    const work=state.selectedWork;
    const panels=[...document.querySelectorAll('#content article.panel')];
    const detail=panels.find(p=>(p.querySelector('h2')?.textContent||'').trim()===String(work.title||'').trim());
    const head=detail?.querySelector('.section-head');if(!head)return;
    let actions=head.querySelector('.button-row');
    if(!actions){actions=document.createElement('div');actions.className='button-row';head.appendChild(actions)}
    if(!actions.querySelector('[data-admin-edit-work46]')){
      const b=document.createElement('button');b.type='button';b.className='btn ghost';b.dataset.adminEditWork46=work.id;b.textContent='Editar trabalho';actions.prepend(b);
    }
  }

  function decorateFinance46(){
    if(!isAdmin46()||state.view!=='financeiro')return;
    const panel=document.getElementById('financeUnified40');if(!panel)return;
    panel.querySelectorAll('tbody tr').forEach(row=>{
      const detail=row.querySelector('[data-detail40]');if(!detail||row.querySelector('[data-admin-payments46]'))return;
      const td=detail.closest('td');if(!td)return;
      let wrap=td.querySelector('.finance-actions44');
      if(!wrap){wrap=document.createElement('div');wrap.className='finance-actions44 admin-tools46';while(td.firstChild)wrap.appendChild(td.firstChild);td.appendChild(wrap)}
      const b=document.createElement('button');b.type='button';b.className='link-btn';b.dataset.adminPayments46=detail.dataset.detail40;b.textContent='Editar pagamentos';wrap.appendChild(b);
    });
  }

  function decorateConfig46(){
    if(!isAdmin46()||state.view!=='config')return;
    const panels=[...document.querySelectorAll('#content article.panel')];
    const servicesPanel=panels.find(p=>/cat[aá]logo de servi[cç]os/i.test(p.querySelector('h2')?.textContent||''));
    if(!servicesPanel)return;
    const rows=[...servicesPanel.querySelectorAll('tbody tr')];
    rows.forEach(row=>{
      if(row.querySelector('[data-admin-service46]'))return;
      const name=(row.querySelector('td')?.textContent||'').trim();const service=(state.services||[]).find(s=>String(s.name||'').trim()===name);if(!service)return;
      const td=row.querySelector('td:last-child');if(!td)return;
      const b=document.createElement('button');b.type='button';b.className='link-btn admin-service46';b.dataset.adminService46=service.id;b.textContent='Editar';td.appendChild(b);
    });
  }

  function decorate46(){styles46();stabilizeFinance46();decorateWork46();decorateFinance46();decorateConfig46()}

  async function openSalePayments46(saleId){
    if(!isAdmin46())return;
    openModal('Editar pagamentos da venda','<div class="empty-state"><span class="spinner"></span>Carregando recebimentos…</div>',true);
    try{
      const sq=await db.from('sales').select('id,client_id,total_amount,service_id,work_id,clients(full_name)').eq('id',saleId).maybeSingle();if(sq.error)throw sq.error;
      const aq=await db.from('payment_allocations').select('payment_id,amount').eq('sale_id',saleId);if(aq.error)throw aq.error;
      const ids=[...new Set((aq.data||[]).map(x=>x.payment_id).filter(Boolean))];let payments=[];
      if(ids.length){const pq=await db.from('payments').select('*').in('id',ids).order('paid_at',{ascending:false});if(pq.error)throw pq.error;payments=pq.data||[]}
      const allocBy=Object.fromEntries((aq.data||[]).map(x=>[x.payment_id,Number(x.amount||0)]));
      const service=byId(state.services||[],sq.data?.service_id),work=byId(state.works||[],sq.data?.work_id);
      const rows=payments.length?payments.map(p=>`<div class="admin-payment-row46"><div><b>${escapeHtml(p.source||'Pagamento')} · ${escapeHtml(p.payment_method||'')}</b><small>${fmtDateTime(p.paid_at||p.created_at)} · Alocado nesta venda: ${fmtMoney(allocBy[p.id]||0)}</small><small>${escapeHtml(p.external_ref?'Ref. '+p.external_ref:'Sem referência externa')}</small></div><div class="button-row"><b>${fmtMoney(p.gross_amount)}</b><button type="button" class="btn ghost" data-admin-edit-payment46="${p.id}">Editar</button></div></div>`).join(''):'<div class="empty-state compact">Nenhum pagamento associado a esta venda.</div>';
      const body=document.querySelector('#modalRoot .modal-body');if(!body)return;
      body.innerHTML=`<div class="admin-readonly46"><b>${escapeHtml(sq.data?.clients?.full_name||'Cliente')}</b><br>${escapeHtml(work?.title||service?.name||'Venda')} · contratado ${fmtMoney(sq.data?.total_amount||0)}</div><div class="admin-payment-list46" style="margin-top:12px">${rows}</div>`;
    }catch(e){closeModal();toast(e.message||'Não foi possível carregar os pagamentos.','error')}
  }

  async function openPayment46(paymentId){
    if(!isAdmin46())return;
    const q=await db.from('payments').select('*').eq('id',paymentId).maybeSingle();if(q.error){toast(q.error.message,'error');return}const p=q.data;if(!p){toast('Pagamento não encontrado.','error');return}
    openModal('Editar pagamento',`<form id="adminPaymentForm46" class="form-grid">
      <div class="span-2 admin-readonly46"><b>Origem: ${escapeHtml(p.source||'—')}</b>${p.external_ref?`<br>Referência externa: ${escapeHtml(p.external_ref)}`:''}<br><small>Origem e referência do Asaas não são alteradas para preservar a conciliação.</small></div>
      <label class="span-2">Cliente<select id="apClient46">${optionList(state.clients||[],'full_name',p.client_id)}</select></label>
      <label>Status<select id="apStatus46"><option value="PAID">Pago</option><option value="PENDING">Pendente</option><option value="OVERDUE">Vencido</option><option value="REFUNDED">Estornado</option><option value="CANCELLED">Cancelado</option></select></label>
      <label>Data e hora<input id="apPaid46" type="datetime-local" value="${localInput46(p.paid_at)}"></label>
      <label>Valor recebido<input id="apGross46" type="number" min="0" step="0.01" value="${Number(p.gross_amount||0).toFixed(2)}" required></label>
      <label>Taxas<input id="apFees46" type="number" min="0" step="0.01" value="${Number(p.fees_amount||0).toFixed(2)}"></label>
      <label>Valor líquido<input id="apNet46" type="number" min="0" step="0.01" value="${p.net_amount==null?'':Number(p.net_amount).toFixed(2)}"></label>
      <label>Método<input id="apMethod46" value="${escapeHtml(p.payment_method||'')}" placeholder="PIX, cartão, dinheiro…"></label>
      <label class="span-2">Observações<textarea id="apNotes46" rows="3">${escapeHtml(p.notes||'')}</textarea></label>
      <div class="span-2 note"><b>Proteção financeira:</b> se o pagamento estiver dividido entre mais de uma venda, o sistema bloqueia alteração de valor que deixaria as alocações inconsistentes.</div>
      <div class="span-2">${formActions('Salvar pagamento')}</div>
    </form>`,true);
    bindCancel();document.getElementById('apStatus46').value=p.status||'PAID';
    document.getElementById('adminPaymentForm46').addEventListener('submit',async e=>{
      e.preventDefault();const submit=e.currentTarget.querySelector('button[type=submit]');submit.disabled=true;submit.textContent='Salvando…';
      const gross=Number(val('apGross46')||0),fees=Number(val('apFees46')||0),net=val('apNet46')===''?null:Number(val('apNet46'));
      const r=await db.rpc('admin_update_payment',{p_payment_id:paymentId,p_client_id:val('apClient46')||null,p_status:val('apStatus46'),p_gross_amount:gross,p_fees_amount:fees,p_net_amount:net,p_payment_method:val('apMethod46')||null,p_paid_at:val('apPaid46')?new Date(val('apPaid46')).toISOString():null,p_notes:val('apNotes46')||null});
      if(r.error){submit.disabled=false;submit.textContent='Salvar pagamento';toast(r.error.message,'error');return}
      toast('Pagamento atualizado.');closeModal();await render();
    });
  }

  function serviceEdit46(service){
    if(!isAdmin46()||!service)return;
    openModal('Editar serviço',`<form id="adminServiceForm46" class="form-grid">
      <label class="span-2">Nome<input id="asName46" required value="${escapeHtml(service.name||'')}"></label>
      <label>Categoria<select id="asCategory46"><option value="CONSULTA">Consulta</option><option value="PERGUNTA">Pergunta</option><option value="MENSALIDADE">Mensalidade</option><option value="TRABALHO_COLETIVO">Trabalho coletivo</option><option value="TRABALHO_COLETIVO_PREMIUM">Trabalho coletivo premium</option><option value="TRABALHO_PARTICULAR">Trabalho particular</option><option value="OUTRO">Outro</option></select></label>
      <label>Preço padrão<input id="asPrice46" type="number" min="0" step="0.01" value="${service.default_price==null?'':Number(service.default_price)}"></label>
      <label>Duração em minutos<input id="asDuration46" type="number" min="1" value="${service.default_duration_minutes||''}"></label>
      <label>Ativo<select id="asActive46"><option value="1">Sim</option><option value="0">Não</option></select></label>
      <div class="span-2">${formActions('Salvar serviço')}</div>
    </form>`);bindCancel();document.getElementById('asCategory46').value=service.category||'OUTRO';document.getElementById('asActive46').value=service.active===false?'0':'1';
    document.getElementById('adminServiceForm46').addEventListener('submit',async e=>{
      e.preventDefault();const r=await db.from('services').update({name:val('asName46').trim(),category:val('asCategory46'),default_price:val('asPrice46')===''?null:Number(val('asPrice46')),default_duration_minutes:val('asDuration46')===''?null:Number(val('asDuration46')),active:val('asActive46')==='1',updated_at:new Date().toISOString()}).eq('id',service.id).select().single();
      if(r.error){toast(r.error.message,'error');return}toast('Serviço atualizado.');closeModal();await loadReferenceData();await render();
    });
  }

  document.addEventListener('click',async e=>{
    const w=e.target.closest('[data-admin-edit-work46]');if(w){e.preventDefault();e.stopPropagation();const work=(state.works||[]).find(x=>x.id===w.dataset.adminEditWork46)||state.selectedWork;if(work)workModal(work);return}
    const sp=e.target.closest('[data-admin-payments46]');if(sp){e.preventDefault();e.stopPropagation();openSalePayments46(sp.dataset.adminPayments46);return}
    const p=e.target.closest('[data-admin-edit-payment46]');if(p){e.preventDefault();e.stopPropagation();openPayment46(p.dataset.adminEditPayment46);return}
    const sv=e.target.closest('[data-admin-service46]');if(sv){e.preventDefault();e.stopPropagation();serviceEdit46((state.services||[]).find(x=>x.id===sv.dataset.adminService46));return}
  },true);

  const prevRender46=render;
  render=async function(){
    const seq=++renderSeq46,start=performance.now();await prevRender46();if(seq!==renderSeq46)return;
    [0,450,1200,2500].forEach(delay=>setTimeout(()=>{if(seq===renderSeq46)decorate46()},delay));
    const ms=Math.round(performance.now()-start);if(ms>800)console.debug(`[Sunshine ${VERSION}] ${state.view} renderizou em ${ms}ms`);
  };

  function start46(){styles46();document.documentElement.dataset.sunshineVersion=VERSION;[120,700,1800].forEach(d=>setTimeout(decorate46,d))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start46);else start46();
})();
