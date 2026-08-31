/* Sunshine v3.26 — agenda e pagamento no mesmo fluxo + responsável obrigatório */
(function(){
  function sourceLabel26(v){ return v==='ASAAS'?'Asaas':v==='MANUAL'?'Manual':(v||'Pagamento'); }
  function eventType26(saleType){
    if(saleType==='CONSULTA')return 'CONSULTA';
    if(saleType==='PERGUNTA')return 'PERGUNTA';
    if(saleType==='TRABALHO')return 'TRABALHO';
    return null;
  }

  function ensureStyles26(){
    if(document.getElementById('agendaPaymentStyles26'))return;
    const style=document.createElement('style');
    style.id='agendaPaymentStyles26';
    style.textContent=`
      .agenda-payment-box26{border:1px solid #eadbd1;border-radius:15px;padding:14px;background:#fffaf6;display:grid;gap:10px}
      .agenda-payment-head26{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.agenda-payment-head26 h3{margin:0 0 3px;font-size:15px}.agenda-payment-head26 p{margin:0;color:#806b62;font-size:12px}
      .agenda-payment-badge26{display:inline-flex;align-items:center;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:800;white-space:nowrap;background:#f4eee9;color:#735e54}.agenda-payment-badge26.paid{background:#eaf5ef;color:#256044}.agenda-payment-badge26.ready{background:#fff3d7;color:#7b5b00}
      .agenda-payment-help26{font-size:11px;color:#806b62;line-height:1.45}.agenda-payment-help26 b{color:#5b2e20}
      @media(max-width:720px){.agenda-payment-head26{display:grid}.agenda-payment-box26 select{width:100%}}
    `;
    document.head.appendChild(style);
  }

  async function paymentLinks26(clientId,appointmentId){
    if(!clientId||state.demo||!db)return [];
    const pq=await safeQuery(db.from('payments')
      .select('id,client_id,source,status,gross_amount,payment_method,paid_at,created_at')
      .eq('client_id',clientId).eq('status','PAID').order('paid_at',{ascending:false}).limit(100));
    const payments=pq.data||[];
    if(!payments.length)return [];
    const paymentIds=payments.map(p=>p.id);
    const aq=await safeQuery(db.from('payment_allocations').select('payment_id,sale_id,amount').in('payment_id',paymentIds).limit(1000));
    const allocations=aq.data||[];
    const saleIds=[...new Set(allocations.map(x=>x.sale_id).filter(Boolean))];
    let sales=[];
    if(saleIds.length){
      const sq=await safeQuery(db.from('sales').select('id,client_id,service_id,work_id,appointment_id,responsible_member_id,sale_type,total_amount,source').in('id',saleIds));
      sales=sq.data||[];
    }
    const saleById=Object.fromEntries(sales.map(s=>[s.id,s]));
    return payments.map(p=>{
      const pa=allocations.filter(x=>x.payment_id===p.id);
      const linkedSales=pa.map(x=>saleById[x.sale_id]).filter(Boolean);
      const current=linkedSales.find(s=>s.appointment_id===appointmentId);
      const unassigned=linkedSales.find(s=>!s.appointment_id);
      const used=pa.reduce((sum,x)=>sum+Number(x.amount||0),0);
      const available=Math.max(Number(p.gross_amount||0)-used,0);
      const sale=current||unassigned||null;
      const eligible=Boolean(current||unassigned||available>0.005);
      return {payment:p,sale,current:Boolean(current),available,eligible};
    }).filter(x=>x.eligible);
  }

  function paymentOption26(x){
    const s=x.sale;
    const service=s?.service_id?byId(state.services,s.service_id):null;
    const work=s?.work_id?byId(state.works,s.work_id):null;
    const what=service?.name||work?.title||'pagamento recebido';
    const stateText=x.current?'já associado':(s?'classificado':'saldo disponível');
    return `${sourceLabel26(x.payment.source)} · ${fmtDate(x.payment.paid_at||x.payment.created_at)} · ${fmtMoney(x.payment.gross_amount)} · ${what} · ${stateText}`;
  }

  appointmentModal=function(a={}){
    ensureStyles26();
    openModal(a.id?'Editar compromisso':'Novo compromisso',`<form id="apptForm" class="form-grid">
      <label class="span-2">Cliente<select id="aClient" required>${optionList(state.clients,'full_name',a.client_id)}</select></label>
      <label>Evento<select id="aType"><option>CONSULTA</option><option>PERGUNTA</option><option>RETORNO</option><option>TRABALHO</option><option>OUTRO</option></select></label>
      <label>Serviço<select id="aService">${optionList(state.services,'name',a.service_id)}</select></label>
      <label>Método<select id="aMethod"><option value="">—</option><option>BARALHO</option><option>BUZIOS</option><option>PERGUNTA_OBJETIVA</option><option>OUTRO</option></select></label>
      <label>Responsável<select id="aResponsible">${optionList(state.team.filter(x=>x.is_practitioner),'full_name',a.responsible_member_id)}</select></label>
      <label>Início<input id="aStarts" type="datetime-local" required value="${a.starts_at?new Date(a.starts_at).toISOString().slice(0,16):''}"></label>
      <label>Status<select id="aStatus"><option>SCHEDULED</option><option>DONE</option><option>RESCHEDULED</option><option>CANCELLED</option><option>NO_SHOW</option></select></label>
      <div class="span-2 agenda-payment-box26">
        <div class="agenda-payment-head26"><div><h3>Pagamento</h3><p>Se a pessoa já pagou, associe aqui. Não é necessário abrir o Financeiro depois.</p></div><span id="aPaymentBadge26" class="agenda-payment-badge26">A verificar</span></div>
        <label>Pagamento já recebido<select id="aPayment"><option value="">Carregando pagamentos…</option></select></label>
        <div id="aPaymentHelp26" class="agenda-payment-help26"><b>Fluxo único:</b> ao salvar, agenda, venda e pagamento ficam conectados ao mesmo registro.</div>
      </div>
      <label class="span-2">Orientação / resumo<textarea id="aGuidance" rows="3">${escapeHtml(a.guidance_summary||'')}</textarea></label>
      <label class="span-2">Follow-up<textarea id="aFollow" rows="2">${escapeHtml(a.follow_up_notes||'')}</textarea></label>
      <div class="span-2">${formActions(a.id?'Atualizar':'Agendar')}</div>
    </form>`,true);
    bindCancel();
    if(a.event_type)document.getElementById('aType').value=a.event_type;
    if(a.consultation_method)document.getElementById('aMethod').value=a.consultation_method;
    if(a.status)document.getElementById('aStatus').value=a.status;

    const client=document.getElementById('aClient');
    const payment=document.getElementById('aPayment');
    const badge=document.getElementById('aPaymentBadge26');
    const help=document.getElementById('aPaymentHelp26');
    let links=[];

    function syncFromSelected26(){
      const x=links.find(i=>i.payment.id===payment.value);
      if(!x){
        badge.textContent='Não associado';badge.className='agenda-payment-badge26';
        help.innerHTML='<b>Sem duplicidade:</b> deixar em branco não cria nenhum pagamento. Se o pagamento chegar depois pelo Asaas, ele poderá ser conectado automaticamente quando houver correspondência.';
        return;
      }
      if(x.sale?.service_id)document.getElementById('aService').value=x.sale.service_id;
      if(x.sale?.responsible_member_id)document.getElementById('aResponsible').value=x.sale.responsible_member_id;
      const type=eventType26(x.sale?.sale_type); if(type)document.getElementById('aType').value=type;
      badge.textContent=x.current?'Pago':'Será associado';badge.className=`agenda-payment-badge26 ${x.current?'paid':'ready'}`;
      help.innerHTML=x.current
        ? '<b>Pago:</b> este compromisso já está ligado ao pagamento recebido.'
        : '<b>Ao salvar:</b> o pagamento selecionado será associado e o serviço/responsável da agenda acompanharão a classificação financeira.';
    }

    async function refreshPayments26(){
      payment.disabled=true;payment.innerHTML='<option value="">Carregando pagamentos…</option>';
      links=await paymentLinks26(client.value,a.id||null);
      const current=links.find(x=>x.current);
      payment.innerHTML='<option value="">Não associar pagamento agora</option>'+links.map(x=>`<option value="${x.payment.id}">${escapeHtml(paymentOption26(x))}</option>`).join('');
      payment.disabled=false;
      if(current)payment.value=current.payment.id;
      syncFromSelected26();
    }

    client.addEventListener('change',refreshPayments26);
    payment.addEventListener('change',syncFromSelected26);
    refreshPayments26();

    document.getElementById('apptForm').addEventListener('submit',async e=>{
      e.preventDefault(); if(!requireReal())return;
      const submit=e.currentTarget.querySelector('button[type=submit]');
      submit.disabled=true;submit.textContent=a.id?'Atualizando…':'Agendando…';
      const payload={
        client_id:val('aClient'),event_type:val('aType'),service_id:val('aService')||null,
        consultation_method:val('aMethod')||null,responsible_member_id:val('aResponsible')||null,
        starts_at:new Date(val('aStarts')).toISOString(),status:val('aStatus'),
        guidance_summary:val('aGuidance')||null,follow_up_notes:val('aFollow')||null
      };
      const res=a.id
        ? await db.from('appointments').update(payload).eq('id',a.id).select().single()
        : await db.from('appointments').insert(payload).select().single();
      if(res.error){submit.disabled=false;submit.textContent=a.id?'Atualizar':'Agendar';toast(res.error.message,'error');return;}

      if(payment.value){
        const linked=await db.rpc('associate_payment_to_appointment',{p_appointment_id:res.data.id,p_payment_id:payment.value});
        if(linked.error){
          submit.disabled=false;submit.textContent=a.id?'Atualizar':'Agendar';
          toast(`Agenda salva, mas a associação financeira precisa ser revisada: ${linked.error.message}`,'error');
          a=res.data; await refreshPayments26(); return;
        }
        toast('Agenda e pagamento atualizados juntos.');
      }else{
        toast('Agenda atualizada.');
      }
      closeModal(); await loadReferenceData(); await render();
    });
  };

  function requireResponsible26(){
    const configs=[
      ['agResponsible','Responsável obrigatório para calcular as comissões.'],
      ['fmResponsible','Responsável obrigatório para calcular as comissões.'],
      ['afaResponsible','Defina o responsável para que a comissão seja recalculada.']
    ];
    configs.forEach(([id,msg])=>{
      const el=document.getElementById(id); if(!el||el.dataset.required26==='1')return;
      el.dataset.required26='1'; el.required=true;
      const label=el.closest('label');
      if(label){const small=document.createElement('small');small.className='helper';small.textContent=msg;label.appendChild(small);}
    });
  }

  const observer26=new MutationObserver(requireResponsible26);
  observer26.observe(document.body,{childList:true,subtree:true});
  requireResponsible26();
})();
