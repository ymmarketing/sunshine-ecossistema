/* Sunshine v3.6 — Agenda com botão visível para novo cliente */
(function(){
  function opt(value,label,selected){return `<option value="${value}" ${selected===value?'selected':''}>${label}</option>`;}

  appointmentModal=function(a={}){
    const existingOptions=optionList(state.clients,'full_name',a.client_id);
    openModal(a.id?'Editar compromisso':'Novo compromisso',`<form id="apptForm" class="form-grid">
      <div class="span-2">
        <label>Cliente</label>
        <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end">
          <select id="aClient" required>${existingOptions}</select>
          <button id="aNewClientBtn" class="btn ghost" type="button" style="min-height:44px;white-space:nowrap">+ Novo cliente</button>
        </div>
        <small class="helper">Selecione alguém já cadastrado ou clique em “+ Novo cliente” para cadastrar e agendar sem sair desta tela.</small>
      </div>

      <div id="aNewClientBox" class="span-2 soft-box" hidden>
        <div class="section-head" style="margin-bottom:8px"><div><h3>Novo cliente</h3><p>O cadastro será criado e já alimentará o Cliente 360.</p></div><button id="aCancelNewClient" class="btn ghost" type="button">Usar cliente existente</button></div>
        <div class="form-grid">
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
    const newBtn=document.getElementById('aNewClientBtn');
    const cancelNewBtn=document.getElementById('aCancelNewClient');
    let newClientMode=false;

    function syncClientMode(){
      box.hidden=!newClientMode;
      clientSelect.disabled=newClientMode;
      clientSelect.required=!newClientMode;
      document.getElementById('aNewName').required=newClientMode;
      newBtn.textContent=newClientMode?'Cadastrando novo cliente':'+ Novo cliente';
      newBtn.disabled=newClientMode;
    }
    newBtn.addEventListener('click',()=>{
      newClientMode=true;
      clientSelect.value='';
      syncClientMode();
      setTimeout(()=>document.getElementById('aNewName')?.focus(),0);
    });
    cancelNewBtn.addEventListener('click',()=>{
      newClientMode=false;
      ['aNewName','aNewPhone','aNewBirth','aNewEmail'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
      syncClientMode();
    });
    clientSelect.addEventListener('change',()=>{ if(clientSelect.value && newClientMode){newClientMode=false;syncClientMode();} });
    syncClientMode();

    const serviceSelect=document.getElementById('aService');
    serviceSelect.addEventListener('change',()=>{
      const s=byId(state.services,serviceSelect.value);
      if(!s)return;
      const n=String(s.name||'').toLowerCase();
      if(n.includes('baralho'))document.getElementById('aMethod').value='BARALHO';
      if(n.includes('búz')||n.includes('buz'))document.getElementById('aMethod').value='BUZIOS';
      if(n.includes('pergunta'))document.getElementById('aMethod').value='PERGUNTA_OBJETIVA';
    });

    document.getElementById('apptForm').addEventListener('submit',async e=>{
      e.preventDefault(); if(!requireReal())return;
      if(!newClientMode && !clientSelect.value){toast('Selecione um cliente ou clique em “+ Novo cliente”.','error');return;}
      if(newClientMode && !val('aNewName').trim()){toast('Informe o nome do novo cliente.','error');return;}

      const {data,error}=await db.rpc('save_appointment_with_client',{
        p_appointment_id:a.id||null,
        p_client_id:newClientMode?null:clientSelect.value,
        p_client_name:newClientMode?val('aNewName').trim():null,
        p_client_phone:newClientMode?val('aNewPhone').trim()||null:null,
        p_client_email:newClientMode?val('aNewEmail').trim()||null:null,
        p_client_birth_date:newClientMode?val('aNewBirth')||null:null,
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
      toast(newClientMode?'Cliente cadastrado e consulta agendada.':(a.id?'Compromisso atualizado.':'Consulta agendada.'));
      closeModal();
      if(newClientMode)await loadReferenceData();
      await render();
    });
  };
})();
