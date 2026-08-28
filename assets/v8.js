/* Sunshine v3.7 — Home com próximos eventos clicáveis */
(function(){
  function humanEvent(a){
    const service=a.services?.name||'';
    if(service)return service;
    const type=String(a.event_type||'').toUpperCase();
    const map={CONSULTA:'Consulta',PERGUNTA:'Pergunta',RETORNO:'Retorno',TRABALHO:'Trabalho',OUTRO:'Outro'};
    return map[type]||a.event_type||'Evento';
  }

  function upcomingEventsPanel(appts){
    const rows=appts.length?appts.map(a=>`<tr class="clickable" data-home-appointment="${a.id}" title="Clique para abrir e atualizar o evento">
      <td><b>${fmtDateTime(a.starts_at)}</b></td>
      <td>${escapeHtml(a.clients?.full_name||'—')}</td>
      <td>${escapeHtml(humanEvent(a))}</td>
      <td>${escapeHtml(a.team_members?.full_name||'—')}</td>
      <td>${statusPill(a.status)}</td>
    </tr>`).join(''):`<tr class="empty-row"><td colspan="5">Nenhum evento futuro agendado.</td></tr>`;

    return `<div class="two"><article class="panel"><div class="section-head"><div><h2>Próximos eventos</h2><p>Consultas, retornos e outros compromissos futuros. Clique em um evento para atualizar os dados, registrar o que foi alinhado e definir o follow-up.</p></div><button class="link-btn" data-go="agenda">Abrir agenda</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Data e hora</th><th>Cliente</th><th>Evento</th><th>Responsável</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></article><article class="panel"><h2>Próximas ações</h2><div class="timeline"><div class="timeline-item"><div class="timeline-dot"></div><div><b>Cliente 360</b><p>Cadastro único conecta consultas, trabalhos e financeiro.</p></div></div><div class="timeline-item"><div class="timeline-dot"></div><div><b>Agenda operacional</b><p>Consultas, trabalhos e retornos no mesmo calendário.</p></div></div><div class="timeline-item"><div class="timeline-dot"></div><div><b>Financeiro integrado</b><p>Venda e pagamento separados com comissão automática.</p></div></div></div></article></div><article class="panel"><div class="section-head"><div><h2>Acesso rápido</h2><p>Ações frequentes em um clique.</p></div></div><div class="quick-grid"><button class="quick action-card" data-action="new-client"><b>Novo cliente</b><span>Criar a identidade central.</span><div class="mini">CLIENTES</div></button><button class="quick action-card" data-action="new-appointment"><b>Agendar consulta</b><span>Registrar data, tipo e responsável.</span><div class="mini">AGENDA</div></button><button class="quick action-card" data-action="new-work"><b>Novo trabalho</b><span>Abrir coletivo, premium ou particular.</span><div class="mini">TRABALHOS</div></button><button class="quick action-card" data-action="new-payment"><b>Lançar pagamento</b><span>Registrar entrada e conciliar venda.</span><div class="mini">FINANCEIRO</div></button></div></article>`;
  }

  renderHome=async function(){
    if(state.demo){
      state.homeAppointments=[];
      return `${kpis([['Próximo trabalho','—','Aguardando dados'],['Inscritos','—','Aguardando dados'],['Já arrecadado','—','Aguardando dados'],['Retornos pendentes','—','Aguardando dados']])}${upcomingEventsPanel([])}`;
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
    return `${kpis([['Próximo trabalho',w?escapeHtml(w.title):'—',w?fmtDateTime(w.scheduled_at):'Nenhum agendado'],['Inscritos',String(registrations),w?'No próximo trabalho':'Sem trabalho aberto'],['Já arrecadado',fmtMoney(raised),w?'Vendas confirmadas':'—'],['Retornos pendentes',String(followups.count||followups.data?.length||0),'Acompanhamentos abertos']])}${upcomingEventsPanel(state.homeAppointments)}`;
  };

  document.addEventListener('click',function(e){
    const row=e.target.closest('[data-home-appointment]');
    if(!row)return;
    const a=(state.homeAppointments||[]).find(x=>x.id===row.dataset.homeAppointment);
    if(!a)return;
    appointmentModal(a);
  });
})();
