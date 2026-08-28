/* Sunshine v3.4 — Agenda com cadastro de cliente no mesmo fluxo */
(function(){
  function opt(value,label,selected){return `<option value="${value}" ${selected===value?'selected':''}>${label}</option>`;}

  appointmentModal=function(a={}){
    const existingOptions=optionList(state.clients,'full_name',a.client_id);
    openModal(a.id?'Editar compromisso':'Novo compromisso',`<form id="apptForm" class="form-grid">
      <label class="span-2">Cliente
        <select id="aClient" required>${existingOptions}<option value="__NEW__">+ Cadastrar novo cliente</option></select>
        <small class="helper">Você pode selecionar alguém já cadastrado ou criar um novo cliente sem sair da Agenda.</small>
      </label>

      <div id="aNewClientBox" class="span-2 soft-box" hidden>
        <h3>Novo cliente</h3>
        <p>Esses dados já alimentam o Cliente 360.</p>
        <div class="form-grid" style="margin-top:10px">
          <label class="span-2">Nome completo<input id="aNewName" placeholder="Nome do cliente"></label>
          <label>Telefone<input id="aNewPhone" placeholder="Telefone / WhatsApp"></label>
          <label>Nascimento<input id="aNewBirth" type="date"></label>
          <label class="span-2">E-mail<input id="aNewEmail" type="email" placeholder="Opcional"></label>
        </div>
      </div>

      <label>Evento<select id="aType">${opt('CONSULTA','Consulta',a.event_type||'CONSULTA')}${opt('PERGUNTA','Pergunta',a.event_type)}${opt('RETORNO','Retorno',a.event_type)}${opt('TRABALHO','Trabalho',a.event_type)}${opt('OUTRO','Outro',a.event_type)}</select></label>
      <label>Serviço<select id="aService">${optionList(state.services,'name',a.service_id)}</select></label>
      <label>Método<select id="aMethod"><option value="">—</option>${opt('BARALHO','Baralho',a.consultation_method||'BARALHO')}${opt('BUZIOS','Búzios',a.consultation_method)}${opt('PERGUNTA_OBJETIVA','Pergunta objetiva',a.consultation_method)}${opt('OUTRO','Outro',a.consultation_method)}</select></label>
      <label>Responsável<select id="aResponsible">${optionList(state.team.filter(x=>x.is_practitioner),'full_name',a.responsible_member_id)}</select></label>
      <label>Início<input id="aStarts" type="datetime-local" required value="${a.starts_at?new Date(a.starts_at).toISOString().slice(0,16):''}"></label>
      <label>Status<select id="aStatus">${opt('SCHEDULED','Agendado',a.status||'SCHEDULED')}${opt('DONE','Concluído',a.status)}${opt('RESCHEDULED','Reagendado',a.status)}${opt('CANCELLED','Cancelado',a.status)}${opt('NO_SHOW','Não compareceu',a.status)}</select></label>
      <label class="span-2">Orientação / resumo<textarea id="aGuidance" rows="3">${escapeHtml(a.guidance_summary||'')}</textarea></label>
      <label class="span-2">Follow-up<textarea id="aFollow" rows="2">${escapeHtml(a.follow_up_notes||'')}</textarea></label>
      <div class="span-2">${formActions(a.id?'Atualizar':'Agendar')}</div>
    </form>`,true);

    bindCancel();
    const clientSelect=document.getElementById('aClient');
    const box=document.getElementById('aNewClientBox');
    const syncClientMode=()=>{
      const isNew=clientSelect.value==='__NEW__';
      box.hidden=!isNew;
      document.getElementById('aNewName').required=isNew;
    };
    clientSelect.addEventListener('change',syncClientMode); syncClientMode();

    const serviceSelect=document.getElementById('aService');
    serviceSelect.addEventListener('change',()=>{
      const s=byId(state.services,serviceSelect.value);
      if(!s)return;
      if(s.name==='Consulta de Baralho')document.getElementById('aMethod').value='BARALHO';
      if(s.name==='Consulta de Búzios')document.getElementById('aMethod').value='BUZIOS';
      if(s.name==='Pergunta Objetiva')document.getElementById('aMethod').value='PERGUNTA_OBJETIVA';
    });

    document.getElementById('apptForm').addEventListener('submit',async e=>{
      e.preventDefault(); if(!requireReal())return;
      const newClient=clientSelect.value==='__NEW__';
      if(!newClient && !clientSelect.value){toast('Selecione um cliente ou escolha “Cadastrar novo cliente”.','error');return;}
      if(newClient && !val('aNewName').trim()){toast('Informe o nome do novo cliente.','error');return;}

      const {data,error}=await db.rpc('save_appointment_with_client',{
        p_appointment_id:a.id||null,
        p_client_id:newClient?null:clientSelect.value,
        p_client_name:newClient?val('aNewName').trim():null,
        p_client_phone:newClient?val('aNewPhone').trim()||null:null,
        p_client_email:newClient?val('aNewEmail').trim()||null:null,
        p_client_birth_date:newClient?val('aNewBirth')||null:null,
        p_service_id:val('aService')||null,
        p_responsible_member_id:val('aResponsible')||null,
        p_event_type:val('aType'),
        p_consultation_method:val('aMethod')||null,
        p_starts_at:new Date(val('aStarts')).toISOString(),
        p_status:val('aStatus'),
        p_guidance_summary:val('aGuidance')||null,
        p_follow_up_notes:val('aFollow')||null
      });
      if(error){toast(error.message,'error');return;}
      toast(newClient?'Cliente cadastrado e consulta agendada.':(a.id?'Compromisso atualizado.':'Consulta agendada.'));
      closeModal();
      if(newClient)await loadReferenceData();
      await render();
    });
  };
})();
