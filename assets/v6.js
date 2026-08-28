/* Sunshine v3.5 — lançamento completo com preço fixo, variável ou livre */
(function(){
  function saleTypeFromService(service,workId){
    if(workId)return 'TRABALHO';
    if(service?.category==='CONSULTA')return 'CONSULTA';
    if(service?.category==='PERGUNTA')return 'PERGUNTA';
    if(service?.category==='MENSALIDADE')return 'MENSALIDADE';
    if(String(service?.category||'').startsWith('TRABALHO_'))return 'TRABALHO';
    return 'OUTRO';
  }
  function defaultMethod(service){
    const n=String(service?.name||'').toLowerCase();
    if(n.includes('búz')||n.includes('buz'))return 'BUZIOS';
    if(n.includes('baralho'))return 'BARALHO';
    if(n.includes('pergunta'))return 'PERGUNTA_OBJETIVA';
    return 'OUTRO';
  }
  function priceMode(service){return service?.metadata?.price_mode||null;}
  function quickEntryWithAppointment(){
    openModal('Novo lançamento',`<form id="quickEntryFormV6" class="form-grid">
      <div class="span-2 soft-box"><h3>1. Cliente</h3><p>Selecione alguém já cadastrado ou deixe em branco para criar o cliente neste mesmo lançamento.</p></div>
      <label class="span-2">Cliente existente<select id="q6Client">${optionList(state.clients,'full_name')}</select></label>
      <label class="span-2">Nome do novo cliente<input id="q6Name" placeholder="Preencha somente se for cliente novo"></label>
      <label>Telefone<input id="q6Phone"></label><label>E-mail<input id="q6Email" type="email"></label>
      <label>Nascimento<input id="q6Birth" type="date"></label>

      <div class="span-2 soft-box"><h3>2. Serviço ou trabalho</h3><p>O sistema cria a venda automaticamente. Se houver trabalho selecionado, também cria a inscrição.</p></div>
      <label>Serviço<select id="q6Service">${optionList(state.services,'name')}</select></label>
      <label>Trabalho<select id="q6Work">${optionList(state.works,'title')}</select></label>
      <label>Responsável<select id="q6Responsible">${optionList(state.team.filter(x=>x.is_practitioner),'full_name')}</select></label>
      <label>Valor<input id="q6Amount" required type="number" min="0" step="0.01"><small id="q6AmountHelp" class="helper"></small></label>

      <div id="q6AppointmentBox" class="span-2 soft-box" hidden>
        <h3>Agendar consulta</h3><p>Se a data já estiver definida, informe aqui. A consulta entra automaticamente na Agenda junto com a venda e o pagamento.</p>
        <div class="form-grid" style="margin-top:10px">
          <label>Data e hora da consulta<input id="q6AppointmentAt" type="datetime-local"></label>
          <label>Método<select id="q6Method"><option value="BARALHO">Baralho</option><option value="BUZIOS">Búzios</option><option value="PERGUNTA_OBJETIVA">Pergunta objetiva</option><option value="OUTRO">Outro</option></select></label>
        </div>
      </div>

      <label>Pessoa amada<input id="q6Loved" placeholder="Opcional para trabalhos"></label>
      <label>Rival<input id="q6Rival" placeholder="Opcional para trabalhos"></label>

      <div class="span-2 soft-box"><h3>3. Pagamento</h3><p>Pago gera a comissão automaticamente. Pendente registra a venda e o recebimento ainda em aberto.</p></div>
      <label>Status do pagamento<select id="q6Status"><option value="PAID">Pago</option><option value="PENDING">Pendente</option><option value="OVERDUE">Vencido</option><option value="REFUNDED">Estornado</option><option value="CANCELLED">Cancelado</option></select></label>
      <label>Método<input id="q6PayMethod" placeholder="PIX, cartão, dinheiro…"></label>
      <label>Data do pagamento<input id="q6PaidAt" type="datetime-local" value="${new Date().toISOString().slice(0,16)}"></label>
      <label>Origem<select id="q6Source"><option value="MANUAL">Manual</option><option value="ASAAS">Asaas</option></select></label>
      <label class="span-2">Observações<textarea id="q6Notes" rows="3"></textarea></label>
      <div class="span-2">${formActions('Salvar lançamento completo')}</div>
    </form>`,true);
    bindCancel();

    const clientSel=document.getElementById('q6Client');
    const serviceSel=document.getElementById('q6Service');
    const workSel=document.getElementById('q6Work');
    const amount=document.getElementById('q6Amount');
    const amountHelp=document.getElementById('q6AmountHelp');
    const apptBox=document.getElementById('q6AppointmentBox');
    const method=document.getElementById('q6Method');

    function syncClient(){
      const disabled=Boolean(clientSel.value);
      ['q6Name','q6Phone','q6Email','q6Birth'].forEach(id=>document.getElementById(id).disabled=disabled);
    }
    function syncCommercial(){
      const service=byId(state.services,serviceSel.value);
      const work=state.works.find(w=>w.id===workSel.value);
      amountHelp.textContent='';
      if(work?.unit_price!=null){
        amount.value=work.unit_price;
        amountHelp.textContent='Valor definido no trabalho selecionado.';
      }else if(service?.default_price!=null){
        amount.value=service.default_price;
        amountHelp.textContent='Valor padrão do serviço.';
      }else if(service){
        amount.value='';
        const mode=priceMode(service);
        amountHelp.textContent=mode==='FREE'?'Valor livre: informe quanto a pessoa pagou.':mode==='VARIABLE'?'Valor variável: digite o valor combinado na hora.':'Informe o valor recebido.';
      }else if(!work){
        amount.value='';
      }
      const isAppointment=!workSel.value && ['CONSULTA','PERGUNTA'].includes(service?.category);
      apptBox.hidden=!isAppointment;
      if(isAppointment)method.value=defaultMethod(service);
      if(!isAppointment)document.getElementById('q6AppointmentAt').value='';
    }
    clientSel.addEventListener('change',syncClient);
    serviceSel.addEventListener('change',syncCommercial);
    workSel.addEventListener('change',syncCommercial);
    syncClient(); syncCommercial();

    document.getElementById('quickEntryFormV6').addEventListener('submit',async e=>{
      e.preventDefault(); if(!requireReal())return;
      const clientId=val('q6Client')||null;
      if(!clientId&&!val('q6Name').trim()){toast('Selecione um cliente ou informe o nome do novo cliente.','error');return;}
      const service=byId(state.services,val('q6Service'));
      const workId=val('q6Work')||null;
      if(!service&&!workId){toast('Selecione um serviço ou trabalho.','error');return;}
      if(val('q6Amount')===''){toast('Informe o valor do lançamento.','error');return;}
      const saleType=saleTypeFromService(service,workId);
      const appointmentAt=val('q6AppointmentAt');
      const {data,error}=await db.rpc('register_quick_entry_with_appointment',{
        p_client_id:clientId,
        p_client_name:val('q6Name').trim()||null,
        p_client_phone:val('q6Phone').trim()||null,
        p_client_email:val('q6Email').trim()||null,
        p_client_birth_date:val('q6Birth')||null,
        p_service_id:val('q6Service')||null,
        p_work_id:workId,
        p_responsible_member_id:val('q6Responsible')||null,
        p_sale_type:saleType,
        p_amount:Number(val('q6Amount')||0),
        p_payment_status:val('q6Status'),
        p_payment_method:val('q6PayMethod')||null,
        p_source:val('q6Source'),
        p_paid_at:val('q6PaidAt')?new Date(val('q6PaidAt')).toISOString():new Date().toISOString(),
        p_notes:val('q6Notes')||null,
        p_loved_person_name:val('q6Loved')||null,
        p_rival_name:val('q6Rival')||null,
        p_appointment_starts_at:appointmentAt?new Date(appointmentAt).toISOString():null,
        p_consultation_method:appointmentAt?val('q6Method'):null
      });
      if(error){toast(error.message,'error');return;}
      const scheduled=Boolean(data?.appointment_id);
      toast(scheduled?'Lançamento salvo e consulta adicionada à Agenda.':workId?'Cliente, venda, pagamento e inscrição registrados.':'Cliente, venda e pagamento registrados.');
      closeModal(); await loadReferenceData(); await navigate(scheduled?'agenda':'financeiro');
    });
  }

  const previousHandleAction=handleAction;
  handleAction=async function(action,id){
    if(action==='quick-entry')return quickEntryWithAppointment();
    return previousHandleAction(action,id);
  };
})();
