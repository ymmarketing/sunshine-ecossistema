/* Sunshine v3.8 — conteúdo unificado desktop/mobile, sem blocos redundantes */
(function(){
  function humanEvent(a){
    const service=a.services?.name||'';
    if(service)return service;
    const type=String(a.event_type||'').toUpperCase();
    const map={CONSULTA:'Consulta',PERGUNTA:'Pergunta',RETORNO:'Retorno',TRABALHO:'Trabalho',OUTRO:'Outro'};
    return map[type]||a.event_type||'Evento';
  }

  function accessQuickPanel(){
    return `<article class="panel"><div class="section-head"><div><h2>Acesso rápido</h2><p>Ações frequentes em um clique.</p></div></div><div class="quick-grid"><button class="quick action-card" data-action="new-client"><b>Novo cliente</b><span>Criar a identidade central.</span><div class="mini">CLIENTES</div></button><button class="quick action-card" data-action="new-appointment"><b>Agendar consulta</b><span>Registrar data, tipo e responsável.</span><div class="mini">AGENDA</div></button><button class="quick action-card" data-action="new-work"><b>Novo trabalho</b><span>Abrir coletivo, premium ou particular.</span><div class="mini">TRABALHOS</div></button><button class="quick action-card" data-action="new-payment"><b>Lançar pagamento</b><span>Registrar entrada e conciliar venda.</span><div class="mini">FINANCEIRO</div></button></div></article>`;
  }

  function homeUpcomingPanel(appts){
    const rows=appts.length?appts.map(a=>`<tr class="clickable" data-home-appointment="${a.id}" title="Abrir evento">
      <td><b>${fmtDateTime(a.starts_at)}</b></td>
      <td>${escapeHtml(a.clients?.full_name||'—')}</td>
      <td>${escapeHtml(humanEvent(a))}</td>
      <td>${escapeHtml(a.team_members?.full_name||'—')}</td>
      <td>${statusPill(a.status)}</td>
      <td><button type="button" class="link-btn">Abrir evento</button></td>
    </tr>`).join(''):`<tr class="empty-row"><td colspan="6">Nenhum evento futuro agendado.</td></tr>`;
    return `<article class="panel"><div class="section-head"><div><h2>Próximos eventos</h2><p>Consultas, retornos e compromissos futuros. Abra o evento para registrar o que foi alinhado e o follow-up.</p></div><button class="link-btn" data-go="agenda">Abrir agenda</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Data e hora</th><th>Cliente</th><th>Evento</th><th>Responsável</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
  }

  renderHome=async function(){
    if(state.demo){
      state.homeAppointments=[];
      return `${kpis([['Próximo trabalho','—','Aguardando dados'],['Inscritos','—','Aguardando dados'],['Já arrecadado','—','Aguardando dados'],['Retornos pendentes','—','Aguardando dados']])}${homeUpcomingPanel([])}${accessQuickPanel()}`;
    }
    const now=new Date().toISOString();
    const [nextWork,followups,upcoming]=await Promise.all([
      safeQuery(db.from('works').select('*').gte('scheduled_at',now).neq('status','CANCELLED').order('scheduled_at').limit(1)),
      safeQuery(db.from('follow_ups').select('id',{count:'exact'}).eq('status','PENDING')),
      safeQuery(db.from('appointments').select('*,clients(full_name),services(name),team_members:responsible_member_id(full_name)').gte('starts_at',now).neq('status','CANCELLED').order('starts_at').limit(10))
    ]);
    const w=nextWork.data?.[0]; let registrations=0,raised=0;
    if(w){
      const [regs,sales]=await Promise.all([
        safeQuery(db.from('work_registrations').select('id',{count:'exact'}).eq('work_id',w.id).neq('status','CANCELLED')),
        safeQuery(db.from('sales').select('total_amount').eq('work_id',w.id).in('status',['CONFIRMED','COMPLETED']))
      ]);
      registrations=regs.count||regs.data?.length||0;
      raised=(sales.data||[]).reduce((a,x)=>a+Number(x.total_amount||0),0);
    }
    state.homeAppointments=upcoming.data||[];
    return `${kpis([['Próximo trabalho',w?escapeHtml(w.title):'—',w?fmtDateTime(w.scheduled_at):'Nenhum agendado'],['Inscritos',String(registrations),w?'No próximo trabalho':'Sem trabalho aberto'],['Já arrecadado',fmtMoney(raised),w?'Vendas confirmadas':'—'],['Retornos pendentes',String(followups.count||followups.data?.length||0),'Acompanhamentos abertos']])}${homeUpcomingPanel(state.homeAppointments)}${accessQuickPanel()}`;
  };

  upcomingAppointments=async function(){
    if(state.demo)return `<div class="empty-state">Sem dados em modo visual.</div>`;
    const now=new Date().toISOString();
    const q=await safeQuery(db.from('appointments').select('*,clients(full_name),services(name),team_members:responsible_member_id(full_name)').gte('starts_at',now).neq('status','CANCELLED').order('starts_at').limit(20));
    const rows=q.data?.length?q.data.map(a=>`<tr class="clickable" data-appt-id="${a.id}" title="Abrir evento">
      <td>${fmtDateTime(a.starts_at)}</td>
      <td>${escapeHtml(a.clients?.full_name||'—')}</td>
      <td>${escapeHtml(humanEvent(a))}</td>
      <td>${escapeHtml(a.team_members?.full_name||'—')}</td>
      <td>${statusPill(a.status)}</td>
      <td><button type="button" class="link-btn">Abrir evento</button></td>
    </tr>`).join(''):`<tr class="empty-row"><td colspan="6">Nenhum compromisso futuro.</td></tr>`;
    return `<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Cliente</th><th>Evento</th><th>Responsável</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  };

  renderAgenda=async function(){
    const [start,end]=todayRange();
    const q=state.demo?{data:[]}:await safeQuery(db.from('appointments').select('*,clients(full_name),team_members:responsible_member_id(full_name),services(name)').gte('starts_at',start).lt('starts_at',end).order('starts_at'));
    const rows=(q.data||[]).length?q.data.map(a=>`<tr class="clickable" data-appt-id="${a.id}" title="Abrir evento"><td>${fmtDateTime(a.starts_at)}</td><td>${escapeHtml(a.clients?.full_name||'—')}</td><td>${escapeHtml(a.services?.name||a.event_type)}</td><td>${escapeHtml(a.team_members?.full_name||'—')}</td><td>${statusPill(a.status)}</td><td><button type="button" class="link-btn">Abrir evento</button></td></tr>`).join(''):`<tr class="empty-row"><td colspan="6">Nenhum compromisso agendado para hoje.</td></tr>`;
    return `<article class="panel zero-top"><div class="section-head"><div><h2>Agenda do dia</h2><p>${new Intl.DateTimeFormat('pt-BR',{dateStyle:'full'}).format(new Date())}</p></div><button class="btn" data-action="new-appointment">+ Agendar</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Horário</th><th>Cliente</th><th>Serviço</th><th>Responsável</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></article><article class="panel"><div class="section-head"><div><h2>Próximos compromissos</h2><p>Visão resumida dos próximos dias.</p></div></div>${await upcomingAppointments()}</article>`;
  };
})();
