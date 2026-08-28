/* Sunshine v3.2 — agenda robusta + histórico de trabalhos com volume/arrecadação */
(function(){
  const monthNames=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

  function option(value,label,selected){return `<option value="${value}" ${selected===value?'selected':''}>${label}</option>`;}

  // Corrige definitivamente o formulário de agenda: texto em português, valor canônico no banco.
  appointmentModal=function(a={}){
    openModal(a.id?'Editar compromisso':'Novo compromisso',`<form id="apptForm" class="form-grid">
      <label class="span-2">Cliente<select id="aClient" required>${optionList(state.clients,'full_name',a.client_id)}</select></label>
      <label>Evento<select id="aType">${option('CONSULTA','Consulta',a.event_type||'CONSULTA')}${option('PERGUNTA','Pergunta',a.event_type)}${option('RETORNO','Retorno',a.event_type)}${option('TRABALHO','Trabalho',a.event_type)}${option('OUTRO','Outro',a.event_type)}</select></label>
      <label>Serviço<select id="aService">${optionList(state.services,'name',a.service_id)}</select></label>
      <label>Método<select id="aMethod"><option value="">—</option>${option('BARALHO','Baralho',a.consultation_method||'BARALHO')}${option('BUZIOS','Búzios',a.consultation_method)}${option('PERGUNTA_OBJETIVA','Pergunta objetiva',a.consultation_method)}${option('OUTRO','Outro',a.consultation_method)}</select></label>
      <label>Responsável<select id="aResponsible">${optionList(state.team.filter(x=>x.is_practitioner),'full_name',a.responsible_member_id)}</select></label>
      <label>Início<input id="aStarts" type="datetime-local" required value="${a.starts_at?new Date(a.starts_at).toISOString().slice(0,16):''}"></label>
      <label>Status<select id="aStatus">${option('SCHEDULED','Agendado',a.status||'SCHEDULED')}${option('DONE','Concluído',a.status)}${option('RESCHEDULED','Reagendado',a.status)}${option('CANCELLED','Cancelado',a.status)}${option('NO_SHOW','Não compareceu',a.status)}</select></label>
      <label class="span-2">Orientação / resumo<textarea id="aGuidance" rows="3">${escapeHtml(a.guidance_summary||'')}</textarea></label>
      <label class="span-2">Follow-up<textarea id="aFollow" rows="2">${escapeHtml(a.follow_up_notes||'')}</textarea></label>
      <div class="span-2">${formActions(a.id?'Atualizar':'Agendar')}</div>
    </form>`,true);
    bindCancel();
    document.getElementById('apptForm').addEventListener('submit',async e=>{
      e.preventDefault(); if(!requireReal())return;
      const payload={
        client_id:val('aClient'), event_type:val('aType'), service_id:val('aService')||null,
        consultation_method:val('aMethod')||null, responsible_member_id:val('aResponsible')||null,
        starts_at:new Date(val('aStarts')).toISOString(), status:val('aStatus'),
        guidance_summary:val('aGuidance')||null, follow_up_notes:val('aFollow')||null
      };
      const res=a.id?await db.from('appointments').update(payload).eq('id',a.id):await db.from('appointments').insert(payload);
      if(res.error){toast(res.error.message,'error');return;}
      toast(a.id?'Compromisso atualizado.':'Consulta agendada.'); closeModal(); await render();
    });
  };

  function periodFromTitle(title){
    const t=String(title||'').toLowerCase();
    for(let i=0;i<monthNames.length;i++){
      if(t.includes(monthNames[i])){
        const y=(t.match(/20\d{2}/)||[])[0];
        if(y)return {label:`${monthNames[i][0].toUpperCase()+monthNames[i].slice(1)}/${y}`,sort:new Date(Number(y),i,28,12,0,0).getTime()};
      }
    }
    return null;
  }
  function workSortDate(w,lastSale){
    if(w.scheduled_at)return new Date(w.scheduled_at).getTime();
    if(lastSale)return new Date(lastSale).getTime();
    return periodFromTitle(w.title)?.sort||new Date(w.created_at||0).getTime();
  }
  function workDateLabel(w,lastSale){
    if(w.scheduled_at)return fmtDate(w.scheduled_at);
    const p=periodFromTitle(w.title); if(p)return p.label;
    if(lastSale)return new Intl.DateTimeFormat('pt-BR',{month:'short',year:'numeric'}).format(new Date(lastSale));
    return '—';
  }

  renderWorks=async function(){
    if(state.demo){
      return `${kpis([['Trabalhos cadastrados','—','Todos os períodos'],['Abertos','—','Aceitando inscrições'],['Planejados','—','Próximos'],['Concluídos','—','Histórico']])}<article class="panel"><div class="empty-state">Faça login para visualizar os trabalhos.</div></article>`;
    }
    const [wq,rq,sq]=await Promise.all([
      safeQuery(db.from('works').select('*,team_members:responsible_member_id(full_name)').limit(500)),
      safeQuery(db.from('work_registrations').select('work_id,status').limit(5000)),
      safeQuery(db.from('sales').select('work_id,total_amount,status,sold_at').not('work_id','is',null).limit(5000))
    ]);
    const works=wq.data||[]; state.works=works;
    const volume={},revenue={},lastSale={};
    (rq.data||[]).forEach(r=>{if(r.work_id&&r.status!=='CANCELLED')volume[r.work_id]=(volume[r.work_id]||0)+1;});
    (sq.data||[]).forEach(s=>{
      if(!s.work_id)return;
      if(['CONFIRMED','COMPLETED'].includes(s.status))revenue[s.work_id]=(revenue[s.work_id]||0)+Number(s.total_amount||0);
      if(s.sold_at&&(!lastSale[s.work_id]||new Date(s.sold_at)>new Date(lastSale[s.work_id])))lastSale[s.work_id]=s.sold_at;
    });
    works.sort((a,b)=>{
      const ao=a.status==='OPEN'?0:1,bo=b.status==='OPEN'?0:1;
      if(ao!==bo)return ao-bo;
      return workSortDate(b,lastSale[b.id])-workSortDate(a,lastSale[a.id]);
    });
    const open=works.filter(w=>w.status==='OPEN').length,planned=works.filter(w=>w.status==='PLANNED').length,done=works.filter(w=>w.status==='DONE').length;
    const rows=works.map(w=>`<tr class="clickable work-metric-row" data-work-id="${w.id}" data-work-type="${escapeHtml(w.work_type||'')}">
      <td><b>${escapeHtml(w.title)}</b>${w.status==='OPEN'?'<small class="open-note">Em aberto · prioridade atual</small>':''}</td>
      <td>${escapeHtml(pt?pt(w.work_type):w.work_type||'—')}</td>
      <td>${escapeHtml(workDateLabel(w,lastSale[w.id]))}</td>
      <td>${w.unit_price!=null?fmtMoney(w.unit_price):'—'}</td>
      <td><b>${volume[w.id]||0}</b><small>inscrições</small></td>
      <td><b>${fmtMoney(revenue[w.id]||0)}</b></td>
      <td>${escapeHtml(w.team_members?.full_name||'—')}</td>
      <td>${statusPill(w.status)}</td>
    </tr>`).join('');
    let detail='';
    if(state.selectedWork){
      const w=works.find(x=>x.id===state.selectedWork.id)||state.selectedWork;
      detail=`<article class="panel work-summary-panel"><div class="section-head"><div><h2>${escapeHtml(w.title)}</h2><p>${escapeHtml(workDateLabel(w,lastSale[w.id]))}</p></div><div class="button-row"><button class="btn" data-action="new-registration" data-id="${w.id}">+ Inscrição</button><button class="btn ghost" data-action="export-registration" data-id="${w.id}">Exportar inscritos</button></div></div><div class="profile-grid"><div><span>Volume</span><b>${volume[w.id]||0} inscrições</b></div><div><span>Arrecadado</span><b>${fmtMoney(revenue[w.id]||0)}</b></div><div><span>Valor por participação</span><b>${w.unit_price!=null?fmtMoney(w.unit_price):'—'}</b></div><div><span>Status</span><b>${statusPill(w.status)}</b></div></div></article>`;
    }
    return `${kpis([['Trabalhos cadastrados',String(works.length),'Todos os períodos'],['Abertos',String(open),'Sempre no topo'],['Planejados',String(planned),'Próximos'],['Concluídos',String(done),'Histórico']])}<article class="panel"><div class="toolbar"><input id="workSearch" class="field grow" placeholder="Buscar trabalho"><select id="workTypeFilter" class="select"><option value="">Todos os tipos</option><option value="COLETIVO">Coletivo</option><option value="COLETIVO_PREMIUM">Coletivo premium</option><option value="PARTICULAR">Particular</option></select><button class="btn" data-action="new-work">+ Novo trabalho</button></div><div class="table-wrap"><table class="table work-metrics-table"><thead><tr><th>Trabalho</th><th>Tipo</th><th>Data / período</th><th>Valor</th><th>Volume</th><th>Arrecadado</th><th>Responsável</th><th>Status</th></tr></thead><tbody>${rows||'<tr class="empty-row"><td colspan="8">Nenhum trabalho cadastrado.</td></tr>'}</tbody></table></div></article>${detail}`;
  };

  const previousBind=bindViewActions;
  bindViewActions=function(){
    previousBind();
    const type=document.getElementById('workTypeFilter');
    if(type)type.addEventListener('change',()=>{
      const v=type.value;
      document.querySelectorAll('.work-metric-row').forEach(r=>r.hidden=Boolean(v)&&r.dataset.workType!==v);
    });
  };
})();
