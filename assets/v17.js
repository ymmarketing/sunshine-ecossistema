/* Sunshine v3.17 — ajustes financeiros exclusivos da administradora, com auditoria */
(function(){
  const previousRenderFinance=renderFinance;
  const previousHandleAction=handleAction;
  const isAdmin=()=>state.member?.role==='ADMIN';

  function adminAdjustmentPanel(){
    if(!isAdmin() || state.demo) return '';
    return `<article class="panel zero-top" id="adminFinancialAdjust">
      <div class="section-head">
        <div><h2>Ajustes administrativos</h2><p>Exclusivo da administradora. Corrija cliente, classificação ou dados de um lançamento sem criar outro registro.</p></div>
        <button class="btn secondary" type="button" data-action="admin-adjust-financial">Ajustar lançamento</button>
      </div>
      <div class="source-note"><b>Proteção contra duplicidade:</b> o ajuste altera o lançamento existente e fica registrado na auditoria. Em pagamentos do Asaas, valor, status e data recebidos da plataforma permanecem protegidos.</div>
    </article>`;
  }

  renderFinance=async function(){
    const base=await previousRenderFinance();
    return adminAdjustmentPanel()+base;
  };

  async function fetchAdjustmentDetail(payment){
    const aq=await safeQuery(db.from('payment_allocations').select('id,sale_id,amount').eq('payment_id',payment.id).limit(5));
    const allocations=aq.data||[];
    let sale=null;
    if(allocations.length===1 && allocations[0].sale_id){
      const sq=await safeQuery(db.from('sales').select('*').eq('id',allocations[0].sale_id).maybeSingle());
      sale=sq.data||null;
    }
    return {payment,allocations,sale};
  }

  function isoLocal(v){
    if(!v)return '';
    const d=new Date(v); const off=d.getTimezoneOffset();
    return new Date(d.getTime()-off*60000).toISOString().slice(0,16);
  }

  async function adminAdjustmentModal(){
    if(!isAdmin()){toast('Apenas a administradora pode ajustar lançamentos financeiros.','error');return;}
    const pq=await safeQuery(db.from('payments').select('id,client_id,source,external_ref,status,gross_amount,payment_method,paid_at,notes,created_at,clients(full_name)').order('created_at',{ascending:false}).limit(250));
    const payments=pq.data||[];
    const options=payments.map(p=>`<option value="${p.id}">${fmtDateTime(p.paid_at||p.created_at)} · ${escapeHtml(p.clients?.full_name||'Cliente não identificado')} · ${fmtMoney(p.gross_amount)} · ${escapeHtml(p.source==='ASAAS'?'Asaas':p.source==='MANUAL'?'Manual':p.source||'—')}</option>`).join('');

    openModal('Ajustar lançamento financeiro',`<form id="adminFinancialAdjustmentForm" class="form-grid">
      <div class="span-2 connection-warning"><b>Permissão de administradora.</b> Este formulário edita o lançamento existente; não cria outro pagamento. Toda alteração é registrada na auditoria.</div>
      <label class="span-2">Lançamento<select id="afaPayment" required><option value="">Selecione o lançamento</option>${options}</select></label>
      <div id="afaSourceNotice" class="span-2 soft-box" hidden></div>
      <label class="span-2">Cliente<select id="afaClient">${optionList(state.clients,'full_name')}</select></label>
      <label>Serviço<select id="afaService">${optionList(state.services,'name')}</select></label>
      <label>Trabalho<select id="afaWork">${optionList(state.works,'title')}</select></label>
      <label>Responsável<select id="afaResponsible">${optionList(state.team.filter(x=>x.is_practitioner),'full_name')}</select></label>
      <label>Valor<input id="afaAmount" type="number" min="0" step="0.01"></label>
      <label>Status<select id="afaStatus"><option value="PAID">Pago</option><option value="PENDING">Pendente</option><option value="OVERDUE">Vencido</option><option value="REFUNDED">Estornado</option><option value="CANCELLED">Cancelado</option></select></label>
      <label>Método<input id="afaMethod" placeholder="PIX, cartão, dinheiro…"></label>
      <label>Data do pagamento<input id="afaPaidAt" type="datetime-local"></label>
      <label class="span-2">Observações<textarea id="afaNotes" rows="3"></textarea></label>
      <div id="afaWarning" class="span-2"></div>
      <div class="span-2">${formActions('Salvar ajuste')}</div>
    </form>`,true);
    bindCancel();

    const paymentSelect=document.getElementById('afaPayment');
    const submit=document.querySelector('#adminFinancialAdjustmentForm button[type=submit]');
    let selected=null;

    async function loadSelected(){
      const p=payments.find(x=>x.id===paymentSelect.value);
      selected=null;
      if(!p){submit.disabled=true;return;}
      const detail=await fetchAdjustmentDetail(p);
      selected=detail;
      document.getElementById('afaClient').value=p.client_id||'';
      document.getElementById('afaService').value=detail.sale?.service_id||'';
      document.getElementById('afaWork').value=detail.sale?.work_id||'';
      document.getElementById('afaResponsible').value=detail.sale?.responsible_member_id||'';
      document.getElementById('afaAmount').value=Number(p.gross_amount||0).toFixed(2);
      document.getElementById('afaStatus').value=p.status||'PAID';
      document.getElementById('afaMethod').value=p.payment_method||'';
      document.getElementById('afaPaidAt').value=isoLocal(p.paid_at||p.created_at);
      document.getElementById('afaNotes').value=detail.sale?.notes||p.notes||'';

      const asaas=p.source==='ASAAS';
      ['afaAmount','afaStatus','afaMethod','afaPaidAt'].forEach(id=>document.getElementById(id).disabled=asaas);
      const notice=document.getElementById('afaSourceNotice');
      notice.hidden=false;
      notice.innerHTML=asaas
        ? '<h3>Pagamento Asaas</h3><p>Você pode corrigir cliente, serviço/trabalho, responsável e observações. Valor, status, método e data permanecem iguais ao que veio do Asaas.</p>'
        : `<h3>Lançamento ${escapeHtml(p.source==='MANUAL'?'manual':p.source||'histórico')}</h3><p>Como administradora, você pode corrigir os dados financeiros e a classificação deste registro.</p>`;
      const warning=document.getElementById('afaWarning');
      if(detail.allocations.length>1){
        warning.innerHTML='<div class="connection-warning"><b>Ajuste bloqueado:</b> este pagamento está dividido entre mais de uma venda. Ele precisa ser tratado por alocação para não alterar valores incorretamente.</div>';
        submit.disabled=true;
      }else{
        warning.innerHTML=''; submit.disabled=false;
      }
    }
    paymentSelect.addEventListener('change',loadSelected);
    submit.disabled=true;

    document.getElementById('adminFinancialAdjustmentForm').addEventListener('submit',async e=>{
      e.preventDefault(); if(!requireReal()||!selected)return;
      if(!val('afaClient')){toast('Informe o cliente do lançamento.','error');return;}
      if(!val('afaService')&&!val('afaWork')){toast('Informe o serviço ou trabalho relacionado.','error');return;}
      if(!confirm('Salvar este ajuste administrativo? A alteração ficará registrada na auditoria.'))return;
      submit.disabled=true; submit.textContent='Salvando…';
      const {data,error}=await db.rpc('admin_adjust_financial_entry',{
        p_payment_id:selected.payment.id,
        p_client_id:val('afaClient'),
        p_service_id:val('afaService')||null,
        p_work_id:val('afaWork')||null,
        p_responsible_member_id:val('afaResponsible')||null,
        p_amount:selected.payment.source==='ASAAS'?null:Number(val('afaAmount')||0),
        p_payment_status:selected.payment.source==='ASAAS'?null:val('afaStatus'),
        p_payment_method:selected.payment.source==='ASAAS'?null:(val('afaMethod')||null),
        p_paid_at:selected.payment.source==='ASAAS'?null:(val('afaPaidAt')?new Date(val('afaPaidAt')).toISOString():null),
        p_notes:val('afaNotes')||null
      });
      submit.disabled=false; submit.textContent='Salvar ajuste';
      if(error){toast(error.message,'error');return;}
      toast('Lançamento ajustado e registrado na auditoria.');
      closeModal(); await loadReferenceData(); await navigate('financeiro');
    });
  }

  handleAction=async function(action,id){
    if(action==='admin-adjust-financial') return adminAdjustmentModal();
    return previousHandleAction(action,id);
  };
})();
