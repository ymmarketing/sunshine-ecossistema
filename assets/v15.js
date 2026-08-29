/* Sunshine v3.16 — financeiro nasce só no Asaas/Financeiro; Agenda apenas associa pagamentos */
(function(){
  const previousAppointmentModal=appointmentModal;
  const previousHandleAction=handleAction;

  function ensureFinanceLinkStyles(){
    if(document.getElementById('appointmentFinanceStyles')) return;
    const style=document.createElement('style');
    style.id='appointmentFinanceStyles';
    style.textContent=`
      .appointment-finance-ticket{border:1px solid #eadbd1;border-radius:15px;padding:14px;background:#fffaf6}
      .appointment-finance-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
      .appointment-finance-head h3{margin:0 0 3px;font-size:15px}
      .appointment-finance-head p{margin:0;font-size:12px;color:#806b62}
      .finance-ticket-status{display:inline-flex;align-items:center;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:800;white-space:nowrap}
      .finance-ticket-status.paid{background:#eaf5ef;color:#256044}.finance-ticket-status.partial{background:#fff3d7;color:#7b5b00}.finance-ticket-status.pending{background:#fdebea;color:#a41f1f}
      .finance-ticket-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0}
      .finance-ticket-grid>div{border:1px solid #eee2db;border-radius:11px;padding:9px;background:#fff}.finance-ticket-grid span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#907c73}.finance-ticket-grid b{display:block;margin-top:3px;font-size:13px}
      .finance-linked-list{display:grid;gap:6px;margin:8px 0}.finance-linked-item{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:10px;background:#fff;border:1px solid #eee2db;font-size:12px}.finance-linked-item small{display:block;color:#806b62;margin-top:2px}
      .finance-associate-box{margin-top:10px;padding-top:10px;border-top:1px solid #eee2db}.finance-associate-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}.finance-associate-row select{width:100%}
      .finance-rule-note{font-size:11px;color:#806b62;margin-top:8px}.finance-rule-note b{color:#5b2e20}
      @media(max-width:720px){.finance-ticket-grid{grid-template-columns:1fr 1fr}.finance-associate-row{grid-template-columns:1fr}.finance-associate-row .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function paymentSourceLabel(v){ return v==='ASAAS'?'Asaas':v==='MANUAL'?'Manual':v||'—'; }
  function saleTypeFor(service,workId){
    if(workId) return 'TRABALHO';
    if(service?.category==='CONSULTA') return 'CONSULTA';
    if(service?.category==='PERGUNTA') return 'PERGUNTA';
    if(service?.category==='MENSALIDADE') return 'MENSALIDADE';
    if(String(service?.category||'').startsWith('TRABALHO_')) return 'TRABALHO';
    return 'OUTRO';
  }

  async function appointmentFinancialData(a){
    const salesQ=await safeQuery(db.from('sales').select('id,total_amount,unit_price,status,service_id,work_id,appointment_id,source').eq('appointment_id',a.id).order('created_at',{ascending:false}).limit(20));
    const sales=salesQ.data||[];
    const saleIds=sales.map(s=>s.id);
    let allocations=[];
    if(saleIds.length){
      const aq=await safeQuery(db.from('payment_allocations').select('id,payment_id,sale_id,amount').in('sale_id',saleIds).limit(200));
      allocations=aq.data||[];
    }
    const paymentIds=[...new Set(allocations.map(x=>x.payment_id).filter(Boolean))];
    let linkedPayments=[];
    if(paymentIds.length){
      const pq=await safeQuery(db.from('payments').select('id,client_id,source,status,gross_amount,payment_method,paid_at,created_at').in('id',paymentIds));
      linkedPayments=pq.data||[];
    }

    let expected=sales.reduce((sum,s)=>sum+Number(s.total_amount??s.unit_price??0),0);
    if(!expected){
      const service=byId(state.services,a.service_id);
      const work=state.works.find(w=>w.id===a.work_id);
      expected=Number(work?.unit_price??service?.default_price??0);
    }
    const linkedById=Object.fromEntries(linkedPayments.map(p=>[p.id,p]));
    const paid=allocations.reduce((sum,x)=>sum+(linkedById[x.payment_id]?.status==='PAID'?Number(x.amount||0):0),0);
    const status=paid<=0?'PENDING':(expected>0&&paid<expected?'PARTIAL':'PAID');

    const candidateQ=await safeQuery(db.from('payments').select('id,client_id,source,status,gross_amount,payment_method,paid_at,created_at').eq('client_id',a.client_id).eq('status','PAID').order('paid_at',{ascending:false}).limit(100));
    const candidatePayments=candidateQ.data||[];
    const candidateIds=candidatePayments.map(p=>p.id);
    let candidateAlloc=[];
    if(candidateIds.length){
      const aq=await safeQuery(db.from('payment_allocations').select('payment_id,sale_id,amount').in('payment_id',candidateIds).limit(1000));
      candidateAlloc=aq.data||[];
    }
    const allocSaleIds=[...new Set(candidateAlloc.map(x=>x.sale_id).filter(Boolean))];
    let allocSales=[];
    if(allocSaleIds.length){
      const sq=await safeQuery(db.from('sales').select('id,client_id,service_id,work_id,appointment_id,total_amount').in('id',allocSaleIds));
      allocSales=sq.data||[];
    }
    const saleById=Object.fromEntries(allocSales.map(s=>[s.id,s]));
    const usedByPayment={};
    candidateAlloc.forEach(x=>usedByPayment[x.payment_id]=(usedByPayment[x.payment_id]||0)+Number(x.amount||0));
    const eligible=candidatePayments.filter(p=>{
      if(paymentIds.includes(p.id)) return false;
      const used=usedByPayment[p.id]||0;
      if(used<Number(p.gross_amount||0)-0.005) return true;
      return candidateAlloc.some(x=>{
        if(x.payment_id!==p.id) return false;
        const s=saleById[x.sale_id];
        return s && !s.appointment_id && s.client_id===a.client_id && (!a.service_id||s.service_id===a.service_id) && (!a.work_id||s.work_id===a.work_id);
      });
    });
    return {sales,allocations,linkedPayments,expected,paid,status,eligible,usedByPayment};
  }

  async function renderAppointmentFinanceTicket(a){
    const root=document.getElementById('appointmentFinanceTicket');
    if(!root||!a.id||state.demo) return;
    root.innerHTML='<div class="empty-state compact">Carregando situação financeira…</div>';
    const d=await appointmentFinancialData(a);
    const statusLabel=d.status==='PAID'?'Pago':d.status==='PARTIAL'?'Parcial':'Pagamento pendente';
    const statusClass=d.status==='PAID'?'paid':d.status==='PARTIAL'?'partial':'pending';
    const linked=d.allocations.map(x=>{
      const p=d.linkedPayments.find(y=>y.id===x.payment_id);
      if(!p) return '';
      return `<div class="finance-linked-item"><div><b>${escapeHtml(paymentSourceLabel(p.source))} · ${escapeHtml(p.payment_method||'Pagamento')}</b><small>${fmtDateTime(p.paid_at||p.created_at)}</small></div><b>${fmtMoney(x.amount)}</b></div>`;
    }).join('');
    const options=d.eligible.map(p=>{
      const used=d.usedByPayment[p.id]||0;
      const free=Math.max(Number(p.gross_amount||0)-used,0);
      const suffix=free>0.005?` · livre ${fmtMoney(free)}`:' · venda já classificada';
      return `<option value="${p.id}">${escapeHtml(paymentSourceLabel(p.source))} · ${fmtDate(p.paid_at||p.created_at)} · ${fmtMoney(p.gross_amount)}${escapeHtml(suffix)}</option>`;
    }).join('');

    root.innerHTML=`<div class="appointment-finance-ticket">
      <div class="appointment-finance-head"><div><h3>Ticket de pagamento</h3><p>O compromisso não cria financeiro. Ele apenas mostra ou associa pagamentos existentes.</p></div><span class="finance-ticket-status ${statusClass}">${statusLabel}</span></div>
      <div class="finance-ticket-grid"><div><span>Valor do serviço</span><b>${d.expected?fmtMoney(d.expected):'Variável'}</b></div><div><span>Pago associado</span><b>${fmtMoney(d.paid)}</b></div><div><span>Saldo</span><b>${d.expected?fmtMoney(Math.max(d.expected-d.paid,0)):(d.paid?'—':'Pendente')}</b></div></div>
      ${linked?`<div class="finance-linked-list">${linked}</div>`:''}
      <div class="finance-associate-box">
        ${options?`<div class="finance-associate-row"><label>Associar pagamento já existente<select id="appointmentPaymentSelect"><option value="">Selecione um pagamento</option>${options}</select></label><button type="button" class="btn secondary" id="associateAppointmentPaymentBtn">Associar pagamento</button></div>`:`<div class="empty-state compact">Nenhum pagamento disponível para associar a este compromisso. Se a pessoa ainda não pagou, deixe como pendente. Quando o Asaas chegar ou um pagamento manual for lançado no Financeiro, ele poderá ser associado aqui.</div>`}
        <div class="finance-rule-note"><b>Regra:</b> dinheiro só é criado pelo Asaas ou por lançamento manual dentro do Financeiro.</div>
      </div>
    </div>`;

    const btn=document.getElementById('associateAppointmentPaymentBtn');
    btn?.addEventListener('click',async()=>{
      const paymentId=document.getElementById('appointmentPaymentSelect')?.value;
      if(!paymentId){toast('Selecione um pagamento para associar.','error');return;}
      btn.disabled=true; btn.textContent='Associando…';
      const {data,error}=await db.rpc('associate_payment_to_appointment',{p_appointment_id:a.id,p_payment_id:paymentId});
      btn.disabled=false; btn.textContent='Associar pagamento';
      if(error){toast(error.message,'error');return;}
      toast(data?.financial_status==='PAID'?'Pagamento associado. Consulta marcada como paga.':'Pagamento associado ao compromisso.');
      await renderAppointmentFinanceTicket(a);
    });
  }

  appointmentModal=function(a={}){
    ensureFinanceLinkStyles();
    previousAppointmentModal(a);
    const form=document.getElementById('apptForm');
    if(!form) return;
    const target=form.querySelector('#aGuidance')?.closest('label')||form.querySelector('.span-2:last-of-type');
    const box=document.createElement('div');
    box.id='appointmentFinanceTicket';
    box.className='span-2';
    if(a.id){
      box.innerHTML='<div class="empty-state compact">Carregando situação financeira…</div>';
    }else{
      box.innerHTML=`<div class="appointment-finance-ticket"><div class="appointment-finance-head"><div><h3>Ticket de pagamento</h3><p>A Agenda não registra dinheiro.</p></div><span class="finance-ticket-status pending">Pagamento pendente</span></div><div class="finance-rule-note"><b>Depois de agendar:</b> o pagamento poderá chegar pelo Asaas ou ser lançado manualmente no Financeiro. Só então ele será associado a este compromisso.</div></div>`;
    }
    if(target) form.insertBefore(box,target); else form.appendChild(box);
    if(a.id) setTimeout(()=>renderAppointmentFinanceTicket(a),0);
  };

  async function loadClientAppointments(clientId,select){
    if(!select) return;
    select.innerHTML='<option value="">Não relacionar agora</option>';
    if(!clientId) return;
    const q=await safeQuery(db.from('appointments').select('id,client_id,service_id,work_id,responsible_member_id,event_type,starts_at,status,services(name)').eq('client_id',clientId).neq('status','CANCELLED').order('starts_at',{ascending:false}).limit(40));
    (q.data||[]).forEach(a=>{
      const o=document.createElement('option'); o.value=a.id; o.dataset.service=a.service_id||''; o.dataset.work=a.work_id||''; o.dataset.responsible=a.responsible_member_id||'';
      o.textContent=`${fmtDateTime(a.starts_at)} · ${a.services?.name||a.event_type||'Compromisso'} · ${a.status==='DONE'?'Concluído':'Agendado'}`;
      select.appendChild(o);
    });
  }

  function financeManualEntryModal(){
    openModal('Lançar pagamento manual',`<form id="financeManualEntryForm" class="form-grid">
      <div class="span-2 soft-box"><h3>1. Cliente</h3><p>Todo pagamento precisa ficar associado a uma pessoa.</p></div>
      <label class="span-2">Cliente existente<select id="fmClient">${optionList(state.clients,'full_name')}</select></label>
      <label class="span-2">Nome do novo cliente<input id="fmName" placeholder="Preencha somente se for cliente novo"></label>
      <label>Telefone<input id="fmPhone"></label><label>E-mail<input id="fmEmail" type="email"></label><label>Nascimento<input id="fmBirth" type="date"></label>
      <div class="span-2 soft-box"><h3>2. O que foi pago?</h3><p>Informe o serviço ou trabalho. Se já existir um compromisso, você pode relacioná-lo agora.</p></div>
      <label>Serviço<select id="fmService">${optionList(state.services,'name')}</select></label>
      <label>Trabalho<select id="fmWork">${optionList(state.works,'title')}</select></label>
      <label>Responsável<select id="fmResponsible">${optionList(state.team.filter(x=>x.is_practitioner),'full_name')}</select></label>
      <label>Valor recebido<input id="fmAmount" required type="number" min="0" step="0.01"></label>
      <label class="span-2">Relacionar a compromisso existente<select id="fmAppointment"><option value="">Não relacionar agora</option></select><small class="helper">Relacionar não cria outro pagamento; apenas conecta esta entrada ao compromisso.</small></label>
      <div class="span-2 soft-box"><h3>3. Pagamento</h3><p>Origem fixa: <b>Manual</b>. Pagamentos do Asaas nunca devem ser digitados aqui.</p></div>
      <label>Método<input id="fmMethod" placeholder="PIX, cartão, dinheiro…"></label>
      <label>Data do pagamento<input id="fmPaidAt" type="datetime-local" value="${new Date().toISOString().slice(0,16)}"></label>
      <label class="span-2">Observações<textarea id="fmNotes" rows="3"></textarea></label>
      <div class="span-2">${formActions('Registrar pagamento manual')}</div>
    </form>`,true);
    bindCancel();

    const client=document.getElementById('fmClient');
    const appt=document.getElementById('fmAppointment');
    const service=document.getElementById('fmService');
    const work=document.getElementById('fmWork');
    const responsible=document.getElementById('fmResponsible');
    const amount=document.getElementById('fmAmount');

    const syncNewClient=()=>{
      const existing=Boolean(client.value);
      ['fmName','fmPhone','fmEmail','fmBirth'].forEach(id=>document.getElementById(id).disabled=existing);
      loadClientAppointments(client.value,appt);
    };
    const syncPrice=()=>{
      const s=byId(state.services,service.value); const w=state.works.find(x=>x.id===work.value);
      if(w?.unit_price!=null) amount.value=w.unit_price;
      else if(s?.default_price!=null) amount.value=s.default_price;
      else if(s||w) amount.value='';
    };
    client.addEventListener('change',syncNewClient);
    service.addEventListener('change',syncPrice); work.addEventListener('change',syncPrice);
    appt.addEventListener('change',()=>{
      const o=appt.selectedOptions?.[0]; if(!o||!o.value)return;
      service.value=o.dataset.service||''; work.value=o.dataset.work||''; responsible.value=o.dataset.responsible||''; syncPrice();
    });
    syncNewClient();

    document.getElementById('financeManualEntryForm').addEventListener('submit',async e=>{
      e.preventDefault(); if(!requireReal())return;
      const clientId=client.value||null;
      if(!clientId&&!val('fmName').trim()){toast('Selecione um cliente ou informe o nome do novo cliente.','error');return;}
      const s=byId(state.services,service.value); const workId=work.value||null;
      if(!s&&!workId){toast('Informe o serviço ou trabalho pago.','error');return;}
      if(val('fmAmount')===''){toast('Informe o valor recebido.','error');return;}
      const submit=e.target.querySelector('button[type=submit]'); submit.disabled=true; submit.textContent='Salvando…';
      const {data,error}=await db.rpc('register_quick_entry',{
        p_client_id:clientId,p_client_name:val('fmName').trim()||null,p_client_phone:val('fmPhone').trim()||null,p_client_email:val('fmEmail').trim()||null,p_client_birth_date:val('fmBirth')||null,
        p_service_id:service.value||null,p_work_id:workId,p_responsible_member_id:responsible.value||null,p_sale_type:saleTypeFor(s,workId),p_amount:Number(val('fmAmount')||0),p_payment_status:'PAID',p_payment_method:val('fmMethod')||null,p_source:'MANUAL',p_paid_at:val('fmPaidAt')?new Date(val('fmPaidAt')).toISOString():new Date().toISOString(),p_notes:val('fmNotes')||null,p_loved_person_name:null,p_rival_name:null
      });
      if(error){submit.disabled=false;submit.textContent='Registrar pagamento manual';toast(error.message,'error');return;}
      if(appt.value&&data?.payment_id){
        const linked=await db.rpc('associate_payment_to_appointment',{p_appointment_id:appt.value,p_payment_id:data.payment_id});
        if(linked.error){submit.disabled=false;submit.textContent='Registrar pagamento manual';toast(`Pagamento registrado, mas não foi possível relacionar ao compromisso: ${linked.error.message}`,'error');return;}
      }
      toast(appt.value?'Pagamento manual registrado e associado ao compromisso.':'Pagamento manual registrado.');
      closeModal(); await loadReferenceData(); await navigate('financeiro');
    });
  }

  handleAction=async function(action,id){
    if(action==='quick-entry'||action==='new-payment'){
      if(state.view!=='financeiro'){
        await navigate('financeiro');
        setTimeout(()=>document.getElementById('financeTopFold')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
        return;
      }
      return financeManualEntryModal();
    }
    return previousHandleAction(action,id);
  };
})();
