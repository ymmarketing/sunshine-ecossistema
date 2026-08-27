const CONFIG = window.SUNSHINE_CONFIG || {};
const hasSupabase = Boolean(window.supabase && CONFIG.supabaseUrl && CONFIG.supabasePublishableKey);
const db = hasSupabase ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey) : null;

const state = {
  view: 'home', session: null, member: null, demo: false,
  clients: [], services: [], team: [], works: [], sales: [],
  selectedClient: null, selectedWork: null,
  monthStart: null, monthEnd: null
};

const labels = {
  home:['Home','Visão central da operação Sunshine.'],
  dashboard:['Dashboard','Indicadores executivos sem sobrecarregar a rotina.'],
  agenda:['Agenda','Consultas, retornos e trabalhos em uma mesma visão.'],
  clientes:['Clientes','Cadastro único e histórico completo do cliente.'],
  trabalhos:['Trabalhos','Coletivos, premium e particulares com inscritos e rentabilidade.'],
  filhos:['Filhos da Casa','Cadastro vinculado, mensalidade e histórico.'],
  consultas:['Consultas','Baralho, búzios, perguntas, orientações e retornos.'],
  financeiro:['Financeiro','Vendas, pagamentos, comissões e conciliação.'],
  performance:['Performance','Reportei, campanhas e relação com resultado.'],
  config:['Configurações','Equipe, serviços, integrações e regras do ecossistema.']
};

const fmtMoney = v => Number(v || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtDate = v => v ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short'}).format(new Date(v)) : '—';
const fmtDateTime = v => v ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v)) : '—';
const escapeHtml = s => String(s ?? '').replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const val = id => document.getElementById(id)?.value ?? '';
const checked = id => Boolean(document.getElementById(id)?.checked);
const byId = (arr,id) => arr.find(x=>x.id===id);
const todayRange = () => { const a=new Date(); a.setHours(0,0,0,0); const b=new Date(a); b.setDate(b.getDate()+1); return [a.toISOString(),b.toISOString()]; };
const monthRange = () => { const a=new Date(); a.setDate(1); a.setHours(0,0,0,0); const b=new Date(a); b.setMonth(b.getMonth()+1); return [a.toISOString(),b.toISOString()]; };

function toast(message,type='ok'){
  const el=document.createElement('div'); el.className=`toast ${type}`; el.textContent=message;
  document.getElementById('toasts').appendChild(el); setTimeout(()=>el.remove(),3600);
}
function loading(text='Carregando…'){ return `<div class="empty-state"><span class="spinner"></span>${escapeHtml(text)}</div>`; }
function errorBox(text){ return `<div class="empty-state error">${escapeHtml(text)}</div>`; }
function statusPill(v){
  const map={ACTIVE:'ok',DONE:'ok',PAID:'ok',COMPLETED:'ok',CONFIRMED:'ok',OPEN:'gold',SCHEDULED:'gold',PLANNED:'neutral',PENDING:'red',OVERDUE:'red',CANCELLED:'neutral',INACTIVE:'neutral',BLOCKED:'red',REFUNDED:'neutral',REGISTERED:'gold'};
  return `<span class="pill ${map[v]||'neutral'}">${escapeHtml(v||'—')}</span>`;
}
function optionList(items,label='name',selected=''){ return `<option value="">Selecione</option>`+items.map(x=>`<option value="${x.id}" ${x.id===selected?'selected':''}>${escapeHtml(x[label]||x.full_name)}</option>`).join(''); }
function kpis(items){ return `<div class="kpi-grid">${items.map(i=>`<article class="card"><div class="card-label">${i[0]}</div><div class="value">${i[1]}</div><div class="card-foot">${i[2]||''}</div></article>`).join('')}</div>`; }

async function safeQuery(promise, fallback=[]){
  if(state.demo) return {data:fallback,error:null};
  try{ const res=await promise; if(res.error) throw res.error; return res; }
  catch(e){ console.error(e); toast(e.message||'Erro ao consultar dados','error'); return {data:fallback,error:e}; }
}

async function bootstrap(){
  bindNavigation(); bindLogin();
  if(!hasSupabase){ state.demo=true; showApp(); await render(); return; }
  const {data:{session}}=await db.auth.getSession();
  if(session) await enterAuthenticated(session); else showLogin();
  db.auth.onAuthStateChange(async (_event,session)=>{ if(session) await enterAuthenticated(session); else if(!state.demo) showLogin(); });
}

function bindNavigation(){
  document.querySelectorAll('#nav button').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.view)));
  document.getElementById('mobileMenu')?.addEventListener('click',()=>document.getElementById('nav').classList.toggle('is-open'));
  document.getElementById('logoutBtn')?.addEventListener('click',async()=>{state.demo=false; if(db) await db.auth.signOut(); showLogin();});
}
function bindLogin(){
  document.getElementById('loginForm')?.addEventListener('submit',async e=>{
    e.preventDefault(); if(!db){toast('Supabase não configurado.','error');return;}
    setLoginBusy(true); const {data,error}=await db.auth.signInWithPassword({email:val('loginEmail'),password:val('loginPassword')}); setLoginBusy(false);
    if(error){toast(error.message,'error');return;} await enterAuthenticated(data.session);
  });
  document.getElementById('demoBtn')?.addEventListener('click',async()=>{state.demo=true;state.member={full_name:'Modo visual',role:'DEMO'};showApp();await loadReferenceData();await render();});
}
function setLoginBusy(b){ const btn=document.getElementById('loginSubmit'); if(btn){btn.disabled=b;btn.textContent=b?'Entrando…':'Entrar';} }
function showLogin(){ document.getElementById('loginScreen').hidden=false;document.querySelector('.shell').hidden=true; }
function showApp(){ document.getElementById('loginScreen').hidden=true;document.querySelector('.shell').hidden=false; updateUserChip(); }

async function enterAuthenticated(session){
  state.session=session; state.demo=false;
  const {data,error}=await db.from('team_members').select('*').eq('auth_user_id',session.user.id).eq('active',true).maybeSingle();
  if(error || !data){
    showLogin(); document.getElementById('loginHelp').innerHTML='<b>A conta existe, mas ainda não está vinculada à equipe Sunshine.</b><br>Vincule o usuário a Yasmin, Rosely ou Lourdes no Supabase antes de usar dados reais.'; return;
  }
  state.member=data; showApp(); await loadReferenceData(); await render();
}
function updateUserChip(){
  const member=state.member||{full_name:'Visitante',role:'—'};
  document.getElementById('userName').textContent=member.full_name;
  document.getElementById('userRole').textContent=member.role;
  document.getElementById('envChip').textContent=state.demo?'MODO VISUAL':'CONECTADO';
  document.getElementById('envChip').className=`status-chip ${state.demo?'demo':''}`;
}

async function loadReferenceData(){
  if(state.demo){
    state.team=[{id:'yasmin',full_name:'Yasmin',role:'ADMIN',is_practitioner:true},{id:'rosely',full_name:'Rosely',role:'EDITOR',is_practitioner:true},{id:'lourdes',full_name:'Lourdes',role:'EDITOR'}];
    state.services=[{id:'baralho',name:'Consulta de Baralho',category:'CONSULTA',default_price:250},{id:'buzios',name:'Consulta de Búzios',category:'CONSULTA',default_price:300},{id:'pergunta',name:'Pergunta Objetiva',category:'PERGUNTA',default_price:30},{id:'coletivo',name:'Trabalho Coletivo',category:'TRABALHO_COLETIVO'}];
    state.clients=[];state.works=[];state.sales=[]; return;
  }
  const [team,services,clients,works,sales]=await Promise.all([
    safeQuery(db.from('team_members').select('*').eq('active',true).order('full_name')),
    safeQuery(db.from('services').select('*').eq('active',true).order('name')),
    safeQuery(db.from('clients').select('*').order('full_name').limit(1000)),
    safeQuery(db.from('works').select('*').order('scheduled_at',{ascending:false}).limit(500)),
    safeQuery(db.from('sales').select('*').order('sold_at',{ascending:false}).limit(1000))
  ]);
  state.team=team.data||[];state.services=services.data||[];state.clients=clients.data||[];state.works=works.data||[];state.sales=sales.data||[];
}

async function navigate(view){
  state.view=view; document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const [t,s]=labels[view];document.getElementById('title').textContent=t;document.getElementById('subtitle').textContent=s;
  await render();
}
async function render(){
  const content=document.getElementById('content'); content.innerHTML=loading();
  const renderers={home:renderHome,dashboard:renderDashboard,agenda:renderAgenda,clientes:renderClients,trabalhos:renderWorks,filhos:renderHouse,consultas:renderConsultations,financeiro:renderFinance,performance:renderPerformance,config:renderConfig};
  try{ content.innerHTML=await renderers[state.view](); bindViewActions(); }catch(e){console.error(e);content.innerHTML=errorBox(e.message||'Não foi possível carregar esta tela.');}
}

async function renderHome(){
  if(state.demo) return `${kpis([['Próximo trabalho','—','Aguardando dados'],['Inscritos','—','Aguardando dados'],['Já arrecadado','—','Aguardando dados'],['Retornos pendentes','—','Aguardando dados']])}${homeBody([])}`;
  const now=new Date().toISOString(); const [todayStart,todayEnd]=todayRange();
  const [nextWork,followups,todayAppts]=await Promise.all([
    safeQuery(db.from('works').select('*').gte('scheduled_at',now).neq('status','CANCELLED').order('scheduled_at').limit(1)),
    safeQuery(db.from('follow_ups').select('id',{count:'exact'}).eq('status','PENDING')),
    safeQuery(db.from('appointments').select('*,clients(full_name),team_members:responsible_member_id(full_name)').gte('starts_at',todayStart).lt('starts_at',todayEnd).order('starts_at'))
  ]);
  const w=nextWork.data?.[0]; let registrations=0,raised=0;
  if(w){
    const [regs,sales]=await Promise.all([safeQuery(db.from('work_registrations').select('id',{count:'exact'}).eq('work_id',w.id).neq('status','CANCELLED')),safeQuery(db.from('sales').select('total_amount').eq('work_id',w.id).in('status',['CONFIRMED','COMPLETED']))]);
    registrations=regs.count||regs.data?.length||0; raised=(sales.data||[]).reduce((a,x)=>a+Number(x.total_amount||0),0);
  }
  return `${kpis([['Próximo trabalho',w?escapeHtml(w.title):'—',w?fmtDateTime(w.scheduled_at):'Nenhum agendado'],['Inscritos',String(registrations),w?'No próximo trabalho':'Sem trabalho aberto'],['Já arrecadado',fmtMoney(raised),w?'Vendas confirmadas':'—'],['Retornos pendentes',String(followups.count||followups.data?.length||0),'Acompanhamentos abertos']])}${homeBody(todayAppts.data||[])}`;
}
function homeBody(appts){
  const rows=appts.length?appts.map(a=>`<tr><td>${fmtDateTime(a.starts_at).split(' ')[1]||fmtDateTime(a.starts_at)}</td><td>${escapeHtml(a.clients?.full_name||'—')}</td><td>${escapeHtml(a.event_type)}</td><td>${escapeHtml(a.team_members?.full_name||'—')}</td><td>${statusPill(a.status)}</td></tr>`).join(''):`<tr class="empty-row"><td colspan="5">Nenhum evento para hoje.</td></tr>`;
  return `<div class="two"><article class="panel"><div class="section-head"><div><h2>Hoje na Sunshine</h2><p>Somente o que precisa de atenção na rotina.</p></div><button class="link-btn" data-go="agenda">Abrir agenda</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Horário</th><th>Cliente</th><th>Evento</th><th>Responsável</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></article><article class="panel"><h2>Próximas ações</h2><div class="timeline"><div class="timeline-item"><div class="timeline-dot"></div><div><b>Cliente 360</b><p>Cadastro único conecta consultas, trabalhos e financeiro.</p></div></div><div class="timeline-item"><div class="timeline-dot"></div><div><b>Agenda operacional</b><p>Consultas, trabalhos e retornos no mesmo calendário.</p></div></div><div class="timeline-item"><div class="timeline-dot"></div><div><b>Financeiro integrado</b><p>Venda e pagamento separados com comissão automática.</p></div></div></div></article></div><article class="panel"><div class="section-head"><div><h2>Acesso rápido</h2><p>Ações frequentes em um clique.</p></div></div><div class="quick-grid"><button class="quick action-card" data-action="new-client"><b>Novo cliente</b><span>Criar a identidade central.</span><div class="mini">CLIENTES</div></button><button class="quick action-card" data-action="new-appointment"><b>Agendar consulta</b><span>Registrar data, tipo e responsável.</span><div class="mini">AGENDA</div></button><button class="quick action-card" data-action="new-work"><b>Novo trabalho</b><span>Abrir coletivo, premium ou particular.</span><div class="mini">TRABALHOS</div></button><button class="quick action-card" data-action="new-payment"><b>Lançar pagamento</b><span>Registrar entrada e conciliar venda.</span><div class="mini">FINANCEIRO</div></button></div></article>`;
}

async function renderDashboard(){
  if(state.demo) return kpis([['Faturamento mês','—','Pagamentos confirmados'],['Vendas','—','Período atual'],['Ticket médio','—','Por venda'],['Comissões','—','A pagar']])+`<article class="panel"><div class="empty-state">Os indicadores serão calculados automaticamente quando houver dados reais.</div></article>`;
  const [ms,me]=monthRange();
  const [payments,sales,commissions,works,expenses]=await Promise.all([
    safeQuery(db.from('payments').select('gross_amount,paid_at,status').eq('status','PAID').gte('paid_at',ms).lt('paid_at',me)),
    safeQuery(db.from('sales').select('id,total_amount,work_id,status,sold_at').gte('sold_at',ms).lt('sold_at',me).in('status',['CONFIRMED','COMPLETED'])),
    safeQuery(db.from('commission_entries').select('amount,status').eq('status','DUE')),
    safeQuery(db.from('works').select('id,title,status,scheduled_at')),
    safeQuery(db.from('work_expenses').select('work_id,amount'))
  ]);
  const revenue=(payments.data||[]).reduce((a,x)=>a+Number(x.gross_amount||0),0); const saleCount=sales.data?.length||0; const ticket=saleCount? (sales.data.reduce((a,x)=>a+Number(x.total_amount||0),0)/saleCount):0; const due=(commissions.data||[]).reduce((a,x)=>a+Number(x.amount||0),0);
  const revenueByWork={}; (sales.data||[]).forEach(s=>{if(s.work_id) revenueByWork[s.work_id]=(revenueByWork[s.work_id]||0)+Number(s.total_amount||0)}); const costByWork={}; (expenses.data||[]).forEach(x=>costByWork[x.work_id]=(costByWork[x.work_id]||0)+Number(x.amount||0));
  const ranking=(works.data||[]).map(w=>({title:w.title,revenue:revenueByWork[w.id]||0,cost:costByWork[w.id]||0,margin:(revenueByWork[w.id]||0)-(costByWork[w.id]||0)})).filter(x=>x.revenue||x.cost).sort((a,b)=>b.margin-a.margin).slice(0,8);
  const rows=ranking.length?ranking.map(x=>`<tr><td>${escapeHtml(x.title)}</td><td>${fmtMoney(x.revenue)}</td><td>${fmtMoney(x.cost)}</td><td><b>${fmtMoney(x.margin)}</b></td></tr>`).join(''):`<tr class="empty-row"><td colspan="4">Ainda não há trabalhos com receita/custos suficientes para ranking.</td></tr>`;
  return `${kpis([['Faturamento mês',fmtMoney(revenue),'Pagamentos confirmados'],['Vendas',String(saleCount),'Confirmadas/concluídas'],['Ticket médio',fmtMoney(ticket),'Valor médio por venda'],['Comissões a pagar',fmtMoney(due),'Lançamentos DUE']])}<div class="two"><article class="panel"><div class="section-head"><div><h2>Rentabilidade por trabalho</h2><p>Receita confirmada menos despesas atribuídas.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Trabalho</th><th>Receita</th><th>Custos</th><th>Margem</th></tr></thead><tbody>${rows}</tbody></table></div></article><article class="panel"><h2>Leitura executiva</h2><div class="note"><b>O Dashboard é enxuto por desenho.</b><br>Detalhes financeiros e de performance permanecem dentro de seus módulos para não cansar quem trabalha aqui todos os dias.</div></article></div>`;
}

async function renderClients(){
  const q=state.demo?{data:state.clients}:await safeQuery(db.from('clients').select('*').order('full_name').limit(1000)); state.clients=q.data||[];
  const rows=state.clients.length?state.clients.map(c=>`<tr class="clickable" data-client-id="${c.id}"><td><b>${escapeHtml(c.full_name)}</b>${c.preferred_name?`<small>${escapeHtml(c.preferred_name)}</small>`:''}</td><td>${escapeHtml(c.phone||'—')}</td><td>${escapeHtml(c.email||'—')}</td><td>${fmtDate(c.birth_date)}</td><td>${statusPill(c.status)}</td></tr>`).join(''):`<tr class="empty-row"><td colspan="5">A base nova de clientes está pronta para começar do zero.</td></tr>`;
  let detail=''; if(state.selectedClient) detail=await clientDetail(state.selectedClient);
  return `<article class="panel"><div class="toolbar"><input id="clientSearch" class="field grow" placeholder="Buscar por nome, telefone ou e-mail"><select id="clientStatus" class="select"><option value="">Todos os status</option><option>ACTIVE</option><option>INACTIVE</option><option>BLOCKED</option></select><button class="btn" data-action="new-client">+ Novo cliente</button></div><div class="table-wrap"><table class="table" id="clientTable"><thead><tr><th>Cliente</th><th>Telefone</th><th>E-mail</th><th>Nascimento</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></article>${detail}`;
}
async function clientDetail(client){
  if(state.demo) return `<div class="two"><article class="panel"><h2>Ficha Cliente 360</h2><div class="note">Selecione ou cadastre um cliente real para visualizar a linha do tempo completa.</div></article><article class="panel"><h2>Linha do tempo</h2><div class="empty-state">Sem dados em modo visual.</div></article></div>`;
  const [timeline,odu,appts,sales]=await Promise.all([
    safeQuery(db.from('client_timeline_events').select('*').eq('client_id',client.id).order('occurred_at',{ascending:false}).limit(30)),
    safeQuery(db.from('client_odu_profiles').select('*').eq('client_id',client.id).eq('is_current',true).order('calculated_at',{ascending:false}).limit(1)),
    safeQuery(db.from('appointments').select('*').eq('client_id',client.id).order('starts_at',{ascending:false}).limit(10)),
    safeQuery(db.from('sales').select('*').eq('client_id',client.id).order('sold_at',{ascending:false}).limit(10))
  ]);
  const trows=(timeline.data||[]).length?(timeline.data||[]).map(x=>`<div class="timeline-item"><div class="timeline-dot"></div><div><b>${escapeHtml(x.title)}</b><p>${fmtDateTime(x.occurred_at)}${x.summary?` · ${escapeHtml(x.summary)}`:''}</p></div></div>`).join(''):`<div class="empty-state compact">Nenhum evento registrado ainda.</div>`;
  const o=odu.data?.[0];
  return `<div class="client-summary"><article class="panel"><div class="section-head"><div><h2>Cliente 360</h2><p>${escapeHtml(client.full_name)}</p></div><div class="button-row"><button class="btn secondary" data-action="edit-client" data-id="${client.id}">Editar</button><button class="btn ghost" data-action="odu-client" data-id="${client.id}">Odu</button></div></div><div class="profile-grid"><div><span>Telefone</span><b>${escapeHtml(client.phone||'—')}</b></div><div><span>E-mail</span><b>${escapeHtml(client.email||'—')}</b></div><div><span>Nascimento</span><b>${fmtDate(client.birth_date)}</b></div><div><span>Localidade</span><b>${escapeHtml([client.city,client.state].filter(Boolean).join(' / ')||'—')}</b></div></div><div class="note" style="margin-top:12px"><b>Odu atual:</b> ${o?escapeHtml([o.birth_odu,o.head_odu,o.destiny_odu].filter(Boolean).join(' · ')||'registrado'):'não cadastrado'}.</div><div class="subgrid"><div><h3>Atendimentos recentes</h3><p class="metric-line"><b>${appts.data?.length||0}</b> registros carregados</p></div><div><h3>Vendas recentes</h3><p class="metric-line"><b>${sales.data?.length||0}</b> registros carregados</p></div></div></article><article class="panel"><h2>Linha do tempo</h2><div class="timeline">${trows}</div></article></div>`;
}

async function renderAgenda(){
  const [start,end]=todayRange();
  const q=state.demo?{data:[]}:await safeQuery(db.from('appointments').select('*,clients(full_name),team_members:responsible_member_id(full_name),services(name)').gte('starts_at',start).lt('starts_at',end).order('starts_at'));
  const rows=(q.data||[]).length?q.data.map(a=>`<tr class="clickable" data-appt-id="${a.id}"><td>${fmtDateTime(a.starts_at)}</td><td>${escapeHtml(a.clients?.full_name||'—')}</td><td>${escapeHtml(a.services?.name||a.event_type)}</td><td>${escapeHtml(a.team_members?.full_name||'—')}</td><td>${statusPill(a.status)}</td></tr>`).join(''):`<tr class="empty-row"><td colspan="5">Nenhum compromisso agendado para hoje.</td></tr>`;
  return `<div class="calendar-shell"><article class="panel zero-top"><div class="section-head"><div><h2>Agenda do dia</h2><p>${new Intl.DateTimeFormat('pt-BR',{dateStyle:'full'}).format(new Date())}</p></div><button class="btn" data-action="new-appointment">+ Agendar</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Horário</th><th>Cliente</th><th>Serviço</th><th>Responsável</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></article><article class="panel zero-top"><h2>Rotina de atendimento</h2><div class="timeline"><div class="timeline-item"><div class="timeline-dot"></div><div><b>Antes</b><p>Cliente, serviço, responsável e horário definidos.</p></div></div><div class="timeline-item"><div class="timeline-dot"></div><div><b>Durante</b><p>Consulta ou trabalho acontece sem exigir registros excessivos.</p></div></div><div class="timeline-item"><div class="timeline-dot"></div><div><b>Depois</b><p>Orientação, status e follow-up atualizam o Cliente 360.</p></div></div></div></article></div><article class="panel"><div class="section-head"><div><h2>Próximos compromissos</h2><p>Visão resumida dos próximos dias.</p></div></div>${await upcomingAppointments()}</article>`;
}
async function upcomingAppointments(){
  if(state.demo) return `<div class="empty-state">Sem dados em modo visual.</div>`;
  const now=new Date().toISOString(); const q=await safeQuery(db.from('appointments').select('*,clients(full_name),team_members:responsible_member_id(full_name)').gte('starts_at',now).neq('status','CANCELLED').order('starts_at').limit(20));
  const rows=q.data?.length?q.data.map(a=>`<tr><td>${fmtDateTime(a.starts_at)}</td><td>${escapeHtml(a.clients?.full_name||'—')}</td><td>${escapeHtml(a.event_type)}</td><td>${escapeHtml(a.team_members?.full_name||'—')}</td><td>${statusPill(a.status)}</td></tr>`).join(''):`<tr class="empty-row"><td colspan="5">Nenhum compromisso futuro.</td></tr>`;
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Cliente</th><th>Evento</th><th>Responsável</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function renderWorks(){
  const q=state.demo?{data:state.works}:await safeQuery(db.from('works').select('*,team_members:responsible_member_id(full_name)').order('scheduled_at',{ascending:false}).limit(500)); state.works=q.data||[];
  const rows=state.works.length?state.works.map(w=>`<tr class="clickable" data-work-id="${w.id}"><td><b>${escapeHtml(w.title)}</b><small>${escapeHtml(w.entity_detail||'')}</small></td><td>${escapeHtml(w.work_type)}</td><td>${fmtDateTime(w.scheduled_at)}</td><td>${fmtMoney(w.unit_price)}</td><td>${escapeHtml(w.team_members?.full_name||byId(state.team,w.responsible_member_id)?.full_name||'—')}</td><td>${statusPill(w.status)}</td></tr>`).join(''):`<tr class="empty-row"><td colspan="6">Nenhum trabalho criado ainda.</td></tr>`;
  let detail=''; if(state.selectedWork) detail=await workDetail(state.selectedWork);
  return `${kpis([['Trabalhos cadastrados',String(state.works.length),'Todos os períodos'],['Abertos',String(state.works.filter(x=>x.status==='OPEN').length),'Aceitando inscrições'],['Planejados',String(state.works.filter(x=>x.status==='PLANNED').length),'Próximos'],['Concluídos',String(state.works.filter(x=>x.status==='DONE').length),'Histórico']])}<article class="panel"><div class="toolbar"><input id="workSearch" class="field grow" placeholder="Buscar trabalho"><select id="workType" class="select"><option value="">Todos os tipos</option><option>COLETIVO</option><option>COLETIVO_PREMIUM</option><option>PARTICULAR</option></select><button class="btn" data-action="new-work">+ Novo trabalho</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Trabalho</th><th>Tipo</th><th>Data</th><th>Valor</th><th>Responsável</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></article>${detail}`;
}
async function workDetail(work){
  if(state.demo) return `<article class="panel"><div class="empty-state">Selecione um trabalho real para visualizar inscritos e financeiro.</div></article>`;
  const [regs,sales,expenses]=await Promise.all([
    safeQuery(db.from('work_registrations').select('*,clients(full_name,phone)').eq('work_id',work.id).order('created_at')),
    safeQuery(db.from('sales').select('total_amount,status').eq('work_id',work.id).in('status',['CONFIRMED','COMPLETED'])),
    safeQuery(db.from('work_expenses').select('*').eq('work_id',work.id).order('expense_date'))
  ]);
  const raised=(sales.data||[]).reduce((a,x)=>a+Number(x.total_amount||0),0), cost=(expenses.data||[]).reduce((a,x)=>a+Number(x.amount||0),0);
  const rows=regs.data?.length?regs.data.map(r=>`<tr><td>${escapeHtml(r.clients?.full_name||r.participant_name||'—')}</td><td>${fmtDate(r.participant_birth_date)}</td><td>${escapeHtml(r.loved_person_name||'—')}</td><td>${escapeHtml(r.rival_name||'—')}</td><td>${statusPill(r.status)}</td></tr>`).join(''):`<tr class="empty-row"><td colspan="5">Nenhum inscrito.</td></tr>`;
  return `<article class="panel"><div class="section-head"><div><h2>${escapeHtml(work.title)}</h2><p>${fmtDateTime(work.scheduled_at)} · ${escapeHtml(work.work_type)}</p></div><div class="button-row"><button class="btn secondary" data-action="new-registration" data-id="${work.id}">+ Inscrito</button><button class="btn ghost" data-action="export-registration" data-id="${work.id}">Exportar lista</button></div></div>${kpis([['Inscritos',String(regs.data?.length||0),'Participantes'],['Arrecadado',fmtMoney(raised),'Vendas confirmadas'],['Custos',fmtMoney(cost),'Despesas atribuídas'],['Margem',fmtMoney(raised-cost),'Antes de impostos']])}<div class="table-wrap" style="margin-top:12px"><table class="table"><thead><tr><th>Participante</th><th>Nascimento</th><th>Pessoa amada</th><th>Rival</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
}

async function renderHouse(){
  const q=state.demo?{data:[]}:await safeQuery(db.from('house_members').select('*,clients(full_name,phone,email)').order('created_at',{ascending:false}));
  const rows=q.data?.length?q.data.map(h=>`<tr><td><b>${escapeHtml(h.clients?.full_name||'—')}</b></td><td>${escapeHtml(h.clients?.phone||'—')}</td><td>${fmtDate(h.joined_at)}</td><td>${fmtMoney(h.monthly_fee)}</td><td>${statusPill(h.status)}</td></tr>`).join(''):`<tr class="empty-row"><td colspan="5">Nenhum Filho da Casa cadastrado.</td></tr>`;
  return `<article class="panel"><div class="section-head"><div><h2>Filhos da Casa</h2><p>O cadastro é sempre vinculado ao Cliente 360.</p></div><button class="btn" data-action="new-house">+ Novo vínculo</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Telefone</th><th>Entrada</th><th>Mensalidade</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></article><article class="panel"><div class="note"><b>Regra do módulo:</b> pagamentos de mensalidade entram como venda + pagamento e, por isso, aparecem também no histórico financeiro do cliente.</div></article>`;
}

async function renderConsultations(){
  const q=state.demo?{data:[]}:await safeQuery(db.from('appointments').select('*,clients(full_name),services(name),team_members:responsible_member_id(full_name)').in('event_type',['CONSULTA','PERGUNTA','RETORNO']).order('starts_at',{ascending:false}).limit(100));
  const rows=q.data?.length?q.data.map(a=>`<tr class="clickable" data-appt-id="${a.id}"><td>${fmtDateTime(a.starts_at)}</td><td>${escapeHtml(a.clients?.full_name||'—')}</td><td>${escapeHtml(a.services?.name||a.consultation_method||a.event_type)}</td><td>${escapeHtml(a.team_members?.full_name||'—')}</td><td>${statusPill(a.status)}</td><td class="wrap-cell">${escapeHtml(a.guidance_summary||'—')}</td></tr>`).join(''):`<tr class="empty-row"><td colspan="6">Nenhuma consulta registrada.</td></tr>`;
  return `<article class="panel"><div class="section-head"><div><h2>Histórico de consultas</h2><p>Orientação e retorno ficam ligados ao cliente.</p></div><button class="btn" data-action="new-appointment">+ Nova consulta</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Cliente</th><th>Tipo</th><th>Responsável</th><th>Status</th><th>Orientação</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
}

async function renderFinance(){
  if(state.demo) return `${kpis([['Entradas hoje','—','Pagamentos confirmados'],['Faturamento mês','—','Pagamentos'],['Comissões a pagar','—','Regra automática'],['Vendas pendentes','—','Aguardando pagamento']])}<article class="panel"><div class="empty-state">Financeiro conectado ao Supabase. Faça login com usuário vinculado para operar.</div></article>`;
  const [ms,me]=monthRange(); const [ts,te]=todayRange();
  const [payments,sales,commissions]=await Promise.all([
    safeQuery(db.from('payments').select('*,clients(full_name)').order('created_at',{ascending:false}).limit(100)),
    safeQuery(db.from('sales').select('*,clients(full_name),services(name)').order('sold_at',{ascending:false}).limit(100)),
    safeQuery(db.from('commission_entries').select('*,team_members:beneficiary_member_id(full_name)').eq('status','DUE'))
  ]);
  const today=(payments.data||[]).filter(p=>p.status==='PAID' && p.paid_at>=ts && p.paid_at<te).reduce((a,x)=>a+Number(x.gross_amount||0),0);
  const month=(payments.data||[]).filter(p=>p.status==='PAID' && p.paid_at>=ms && p.paid_at<me).reduce((a,x)=>a+Number(x.gross_amount||0),0);
  const due=(commissions.data||[]).reduce((a,x)=>a+Number(x.amount||0),0); const pending=(sales.data||[]).filter(s=>s.status==='PENDING').length;
  const prow=payments.data?.length?payments.data.map(p=>`<tr><td>${fmtDateTime(p.paid_at||p.created_at)}</td><td>${escapeHtml(p.clients?.full_name||'—')}</td><td>${escapeHtml(p.source)}</td><td>${fmtMoney(p.gross_amount)}</td><td>${statusPill(p.status)}</td></tr>`).join(''):`<tr class="empty-row"><td colspan="5">Nenhum pagamento.</td></tr>`;
  const srow=sales.data?.length?sales.data.slice(0,30).map(s=>`<tr><td>${fmtDateTime(s.sold_at)}</td><td>${escapeHtml(s.clients?.full_name||'—')}</td><td>${escapeHtml(s.services?.name||s.sale_type)}</td><td>${fmtMoney(s.total_amount)}</td><td>${statusPill(s.status)}</td></tr>`).join(''):`<tr class="empty-row"><td colspan="5">Nenhuma venda.</td></tr>`;
  return `${kpis([['Entradas hoje',fmtMoney(today),'Pagamentos confirmados'],['Faturamento mês',fmtMoney(month),'Período atual'],['Comissões a pagar',fmtMoney(due),'Geradas automaticamente'],['Vendas pendentes',String(pending),'Aguardando conclusão']])}<div class="two"><article class="panel"><div class="section-head"><div><h2>Pagamentos</h2><p>Entrada financeira separada da venda.</p></div><button class="btn" data-action="new-payment">+ Pagamento</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Cliente</th><th>Origem</th><th>Valor</th><th>Status</th></tr></thead><tbody>${prow}</tbody></table></div></article><article class="panel"><div class="section-head"><div><h2>Vendas</h2><p>Serviço contratado, antes do pagamento.</p></div><button class="btn secondary" data-action="new-sale">+ Venda</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Cliente</th><th>Serviço</th><th>Valor</th><th>Status</th></tr></thead><tbody>${srow}</tbody></table></div></article></div>`;
}

async function renderPerformance(){
  const q=state.demo?{data:[{provider:'REPORTEI',name:'Sunshine Oráculos',status:'PENDING'}]}:await safeQuery(db.from('performance_data_sources').select('*').order('created_at'));
  const source=q.data?.[0]; const campaigns=state.demo?{data:[]}:await safeQuery(db.from('marketing_campaigns').select('*,works(title)').order('starts_at',{ascending:false}).limit(50));
  const rows=campaigns.data?.length?campaigns.data.map(c=>`<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.works?.title||'—')}</td><td>${fmtDate(c.starts_at)}</td><td>${fmtDate(c.ends_at)}</td><td>${statusPill(c.status)}</td></tr>`).join(''):`<tr class="empty-row"><td colspan="5">Nenhuma campanha cadastrada.</td></tr>`;
  return `${kpis([['Fonte',escapeHtml(source?.provider||'—'),escapeHtml(source?.name||'')],['Status',escapeHtml(source?.status||'—'),'Integração Reportei'],['Última sincronização',source?.last_synced_at?fmtDateTime(source.last_synced_at):'—','Dados de marketing'],['Campanhas',String(campaigns.data?.length||0),'Vinculáveis a trabalhos']])}<article class="panel"><div class="section-head"><div><h2>Campanhas</h2><p>Performance entra como contexto, sem transformar a rotina em BI.</p></div><button class="btn" data-action="new-campaign">+ Campanha</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Campanha</th><th>Trabalho</th><th>Início</th><th>Fim</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
}

async function renderConfig(){
  const services=state.services.map(s=>`<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.category)}</td><td>${s.default_price==null?'—':fmtMoney(s.default_price)}</td><td>${s.default_duration_minutes||'—'}</td></tr>`).join('');
  const team=state.team.map(m=>`<tr><td>${escapeHtml(m.full_name)}</td><td>${escapeHtml(m.role)}</td><td>${m.is_practitioner?'Sim':'Não'}</td><td>${m.auth_user_id?'Vinculado':'Pendente'}</td></tr>`).join('');
  return `<div class="two"><article class="panel"><div class="section-head"><div><h2>Equipe</h2><p>Acesso controlado por Supabase Auth + RLS.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Pessoa</th><th>Perfil</th><th>Atende</th><th>Login</th></tr></thead><tbody>${team}</tbody></table></div></article><article class="panel"><h2>Integrações</h2><div class="integration-list"><div><b>Supabase</b><span class="pill ok">ATIVO</span><small>Projeto exclusivo em São Paulo.</small></div><div><b>Asaas</b><span class="pill neutral">PENDENTE</span><small>Conexão será feita por backend seguro.</small></div><div><b>Reportei</b><span class="pill gold">PREPARADO</span><small>Fonte Sunshine Oráculos cadastrada.</small></div></div></article></div><article class="panel"><div class="section-head"><div><h2>Catálogo de serviços</h2><p>Base canônica criada para a operação nova.</p></div><button class="btn" data-action="new-service">+ Serviço</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Serviço</th><th>Categoria</th><th>Preço padrão</th><th>Duração</th></tr></thead><tbody>${services}</tbody></table></div></article><article class="panel"><h2>Comissões</h2><div class="note"><b>Motor automático ativo.</b><br>Rosely responsável → Rosely 80%, Yasmin 10%, Lourdes 10%. Yasmin responsável → Yasmin 80%, Rosely 10%, Lourdes 10%.</div></article>`;
}

function bindViewActions(){
  document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.go)));
  document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>handleAction(b.dataset.action,b.dataset.id)));
  document.querySelectorAll('[data-client-id]').forEach(r=>r.addEventListener('click',async()=>{state.selectedClient=byId(state.clients,r.dataset.clientId);await render();}));
  document.querySelectorAll('[data-work-id]').forEach(r=>r.addEventListener('click',async()=>{state.selectedWork=state.works.find(x=>x.id===r.dataset.workId);await render();}));
  document.querySelectorAll('[data-appt-id]').forEach(r=>r.addEventListener('click',()=>editAppointment(r.dataset.apptId)));
  const cs=document.getElementById('clientSearch'); if(cs) cs.addEventListener('input',filterClientRows);
  const ws=document.getElementById('workSearch'); if(ws) ws.addEventListener('input',filterWorkRows);
}
function filterClientRows(e){ const q=e.target.value.toLowerCase(); document.querySelectorAll('#clientTable tbody tr[data-client-id]').forEach(r=>r.hidden=!r.innerText.toLowerCase().includes(q)); }
function filterWorkRows(e){ const q=e.target.value.toLowerCase(); document.querySelectorAll('[data-work-id]').forEach(r=>r.hidden=!r.innerText.toLowerCase().includes(q)); }

async function handleAction(action,id){
  const map={
    'new-client':()=>clientModal(), 'edit-client':()=>clientModal(byId(state.clients,id)), 'odu-client':()=>oduModal(byId(state.clients,id)),
    'new-appointment':()=>appointmentModal(), 'new-work':()=>workModal(), 'new-registration':()=>registrationModal(state.works.find(w=>w.id===id)),
    'export-registration':()=>exportRegistrations(id), 'new-house':()=>houseModal(), 'new-sale':()=>saleModal(), 'new-payment':()=>paymentModal(),
    'new-campaign':()=>campaignModal(), 'new-service':()=>serviceModal()
  }; if(map[action]) return map[action]();
}

function openModal(title,body,wide=false){
  const root=document.getElementById('modalRoot'); root.innerHTML=`<div class="modal-backdrop" data-close-modal><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true"><div class="modal-head"><h2>${escapeHtml(title)}</h2><button class="icon-btn" data-close-modal>×</button></div><div class="modal-body">${body}</div></section></div>`;
  root.querySelectorAll('[data-close-modal]').forEach(x=>x.addEventListener('click',e=>{if(e.target===x)closeModal()}));
}
function closeModal(){document.getElementById('modalRoot').innerHTML='';}
function formActions(label='Salvar'){return `<div class="form-actions"><button type="button" class="btn ghost" data-close-form>Cancelar</button><button type="submit" class="btn">${label}</button></div>`;}
function bindCancel(){document.querySelector('[data-close-form]')?.addEventListener('click',closeModal);}
function requireReal(){ if(state.demo){toast('Ação bloqueada no modo visual. Faça login para gravar dados.','error'); return false;} return true; }

function clientModal(c={}){
  openModal(c.id?'Editar cliente':'Novo cliente',`<form id="clientForm" class="form-grid"><label class="span-2">Nome completo<input id="fFullName" required value="${escapeHtml(c.full_name||'')}"></label><label>Nome preferido<input id="fPreferred" value="${escapeHtml(c.preferred_name||'')}"></label><label>Telefone<input id="fPhone" value="${escapeHtml(c.phone||'')}"></label><label>E-mail<input id="fEmail" type="email" value="${escapeHtml(c.email||'')}"></label><label>Nascimento<input id="fBirth" type="date" value="${c.birth_date||''}"></label><label>Cidade<input id="fCity" value="${escapeHtml(c.city||'')}"></label><label>Estado<input id="fState" maxlength="2" value="${escapeHtml(c.state||'')}"></label><label>Status<select id="fStatus"><option ${c.status==='ACTIVE'?'selected':''}>ACTIVE</option><option ${c.status==='INACTIVE'?'selected':''}>INACTIVE</option><option ${c.status==='BLOCKED'?'selected':''}>BLOCKED</option></select></label><label class="checkbox"><input id="fOptin" type="checkbox" ${c.marketing_opt_in?'checked':''}> Aceita comunicações</label><label class="span-2">Observações<textarea id="fNotes" rows="3">${escapeHtml(c.notes||'')}</textarea></label><div class="span-2">${formActions(c.id?'Atualizar':'Criar cliente')}</div></form>`); bindCancel();
  document.getElementById('clientForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const payload={full_name:val('fFullName').trim(),preferred_name:val('fPreferred').trim()||null,phone:val('fPhone').trim()||null,email:val('fEmail').trim()||null,birth_date:val('fBirth')||null,city:val('fCity').trim()||null,state:val('fState').trim().toUpperCase()||null,status:val('fStatus'),marketing_opt_in:checked('fOptin'),notes:val('fNotes').trim()||null,source:'MANUAL'};const res=c.id?await db.from('clients').update(payload).eq('id',c.id).select().single():await db.from('clients').insert(payload).select().single();if(res.error){toast(res.error.message,'error');return;}toast('Cliente salvo.');closeModal();await loadReferenceData();state.selectedClient=res.data;await navigate('clientes');});
}

function oduModal(client){ if(!client)return; openModal(`Odu · ${client.full_name}`,`<form id="oduForm" class="form-grid"><label>Odu de nascimento<input id="oBirth"></label><label>Odu de cabeça<input id="oHead"></label><label>Odu de destino<input id="oDestiny"></label><label>Odu de caminho<input id="oPath"></label><label>Odu regente do ano<input id="oAnnual"></label><label>Odu de ancestralidade<input id="oAncestry"></label><label class="span-2">Síntese comportamental<textarea id="oSummary" rows="4"></textarea></label><label class="span-2">Observações<textarea id="oNotes" rows="3"></textarea></label><div class="span-2">${formActions('Salvar leitura')}</div></form>`,true);bindCancel();document.getElementById('oduForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;await db.from('client_odu_profiles').update({is_current:false}).eq('client_id',client.id).eq('is_current',true);const {error}=await db.from('client_odu_profiles').insert({client_id:client.id,birth_odu:val('oBirth')||null,head_odu:val('oHead')||null,destiny_odu:val('oDestiny')||null,path_odu:val('oPath')||null,annual_odu:val('oAnnual')||null,ancestry_odu:val('oAncestry')||null,behavioral_summary:val('oSummary')||null,notes:val('oNotes')||null,is_current:true});if(error){toast(error.message,'error');return;}toast('Leitura de Odu salva.');closeModal();await render();}); }

function appointmentModal(a={}){
  openModal(a.id?'Editar compromisso':'Novo compromisso',`<form id="apptForm" class="form-grid"><label class="span-2">Cliente<select id="aClient" required>${optionList(state.clients,'full_name',a.client_id)}</select></label><label>Evento<select id="aType"><option>CONSULTA</option><option>PERGUNTA</option><option>RETORNO</option><option>TRABALHO</option><option>OUTRO</option></select></label><label>Serviço<select id="aService">${optionList(state.services,'name',a.service_id)}</select></label><label>Método<select id="aMethod"><option value="">—</option><option>BARALHO</option><option>BUZIOS</option><option>PERGUNTA_OBJETIVA</option><option>OUTRO</option></select></label><label>Responsável<select id="aResponsible">${optionList(state.team.filter(x=>x.is_practitioner),'full_name',a.responsible_member_id)}</select></label><label>Início<input id="aStarts" type="datetime-local" required value="${a.starts_at?new Date(a.starts_at).toISOString().slice(0,16):''}"></label><label>Status<select id="aStatus"><option>SCHEDULED</option><option>DONE</option><option>RESCHEDULED</option><option>CANCELLED</option><option>NO_SHOW</option></select></label><label class="span-2">Orientação / resumo<textarea id="aGuidance" rows="3">${escapeHtml(a.guidance_summary||'')}</textarea></label><label class="span-2">Follow-up<textarea id="aFollow" rows="2">${escapeHtml(a.follow_up_notes||'')}</textarea></label><div class="span-2">${formActions(a.id?'Atualizar':'Agendar')}</div></form>`,true);bindCancel(); if(a.event_type)document.getElementById('aType').value=a.event_type;if(a.consultation_method)document.getElementById('aMethod').value=a.consultation_method;if(a.status)document.getElementById('aStatus').value=a.status;
  document.getElementById('apptForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const payload={client_id:val('aClient'),event_type:val('aType'),service_id:val('aService')||null,consultation_method:val('aMethod')||null,responsible_member_id:val('aResponsible')||null,starts_at:new Date(val('aStarts')).toISOString(),status:val('aStatus'),guidance_summary:val('aGuidance')||null,follow_up_notes:val('aFollow')||null};const res=a.id?await db.from('appointments').update(payload).eq('id',a.id):await db.from('appointments').insert(payload);if(res.error){toast(res.error.message,'error');return;}toast('Agenda atualizada.');closeModal();await render();});
}
async function editAppointment(id){ if(state.demo)return; const {data,error}=await db.from('appointments').select('*').eq('id',id).single();if(error){toast(error.message,'error');return;}appointmentModal(data); }

function workModal(w={}){
  openModal('Novo trabalho',`<form id="workForm" class="form-grid"><label class="span-2">Nome do trabalho<input id="wTitle" required></label><label>Tipo<select id="wType"><option>COLETIVO</option><option>COLETIVO_PREMIUM</option><option>PARTICULAR</option></select></label><label>Entidade / detalhe<input id="wEntity"></label><label>Data e hora<input id="wDate" type="datetime-local"></label><label>Valor por participação<input id="wPrice" type="number" step="0.01"></label><label>Responsável<select id="wResponsible">${optionList(state.team.filter(x=>x.is_practitioner),'full_name')}</select></label><label>Status<select id="wStatus"><option>PLANNED</option><option>OPEN</option><option>CLOSED</option><option>DONE</option><option>CANCELLED</option></select></label><label class="span-2">Observações<textarea id="wNotes" rows="3"></textarea></label><div class="span-2">${formActions('Criar trabalho')}</div></form>`);bindCancel();document.getElementById('workForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const payload={title:val('wTitle'),work_type:val('wType'),entity_detail:val('wEntity')||null,scheduled_at:val('wDate')?new Date(val('wDate')).toISOString():null,unit_price:Number(val('wPrice')||0)||null,responsible_member_id:val('wResponsible')||null,status:val('wStatus'),notes:val('wNotes')||null};const {data,error}=await db.from('works').insert(payload).select().single();if(error){toast(error.message,'error');return;}toast('Trabalho criado.');closeModal();await loadReferenceData();state.selectedWork=data;await navigate('trabalhos');});
}

function registrationModal(work){ if(!work)return; openModal(`Inscrição · ${work.title}`,`<form id="regForm" class="form-grid"><label class="span-2">Cliente existente<select id="rClient">${optionList(state.clients,'full_name')}</select></label><div class="form-divider span-2">ou informe participante sem cadastro completo</div><label>Nome do participante<input id="rName"></label><label>Nascimento<input id="rBirth" type="date"></label><label>Pessoa amada<input id="rLoved"></label><label>Rival<input id="rRival"></label><label>Status<select id="rStatus"><option>REGISTERED</option><option>CONFIRMED</option><option>DONE</option><option>CANCELLED</option></select></label><div class="span-2">${formActions('Adicionar inscrito')}</div></form>`);bindCancel();document.getElementById('regForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const clientId=val('rClient')||null,name=val('rName').trim()||null;if(!clientId&&!name){toast('Selecione um cliente ou informe o nome.','error');return;}const {error}=await db.from('work_registrations').insert({work_id:work.id,client_id:clientId,participant_name:name,participant_birth_date:val('rBirth')||null,loved_person_name:val('rLoved')||null,rival_name:val('rRival')||null,status:val('rStatus')});if(error){toast(error.message,'error');return;}toast('Inscrição adicionada.');closeModal();await render();}); }
async function exportRegistrations(workId){ if(state.demo){toast('Sem dados para exportar.','error');return;}const {data,error}=await db.from('work_registrations').select('participant_name,participant_birth_date,loved_person_name,rival_name,status,clients(full_name)').eq('work_id',workId).order('created_at');if(error){toast(error.message,'error');return;}const rows=[['Nome','Nascimento','Pessoa amada','Rival','Status'],...(data||[]).map(r=>[r.clients?.full_name||r.participant_name||'',r.participant_birth_date||'',r.loved_person_name||'',r.rival_name||'',r.status])];const csv='\ufeff'+rows.map(row=>row.map(x=>`\"${String(x).replaceAll('\"','\"\"')}\"`).join(';')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='inscritos-sunshine.csv';a.click();URL.revokeObjectURL(a.href);}

function houseModal(){ openModal('Vincular Filho da Casa',`<form id="houseForm" class="form-grid"><label class="span-2">Cliente<select id="hClient" required>${optionList(state.clients,'full_name')}</select></label><label>Data de entrada<input id="hJoined" type="date"></label><label>Mensalidade<input id="hFee" type="number" step="0.01"></label><label>Status<select id="hStatus"><option>ACTIVE</option><option>INACTIVE</option><option>SUSPENDED</option></select></label><label class="span-2">Observações<textarea id="hNotes" rows="3"></textarea></label><div class="span-2">${formActions('Criar vínculo')}</div></form>`);bindCancel();document.getElementById('houseForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const {error}=await db.from('house_members').insert({client_id:val('hClient'),joined_at:val('hJoined')||null,monthly_fee:Number(val('hFee')||0)||null,status:val('hStatus'),notes:val('hNotes')||null});if(error){toast(error.message,'error');return;}toast('Vínculo criado.');closeModal();await render();}); }

function saleModal(){ openModal('Registrar venda',`<form id="saleForm" class="form-grid"><label class="span-2">Cliente<select id="sClient">${optionList(state.clients,'full_name')}</select></label><label>Serviço<select id="sService">${optionList(state.services,'name')}</select></label><label>Trabalho<select id="sWork">${optionList(state.works,'title')}</select></label><label>Tipo<select id="sType"><option>CONSULTA</option><option>PERGUNTA</option><option>TRABALHO</option><option>MENSALIDADE</option><option>OUTRO</option></select></label><label>Responsável<select id="sResponsible">${optionList(state.team.filter(x=>x.is_practitioner),'full_name')}</select></label><label>Quantidade<input id="sQty" type="number" min="0.01" step="0.01" value="1"></label><label>Valor unitário<input id="sPrice" type="number" min="0" step="0.01"></label><label>Desconto<input id="sDiscount" type="number" min="0" step="0.01" value="0"></label><label>Status<select id="sStatus"><option>PENDING</option><option>CONFIRMED</option><option>COMPLETED</option><option>CANCELLED</option><option>REFUNDED</option></select></label><label class="span-2">Observações<textarea id="sNotes" rows="3"></textarea></label><div class="span-2">${formActions('Registrar venda')}</div></form>`);bindCancel();document.getElementById('sService').addEventListener('change',e=>{const s=byId(state.services,e.target.value);if(s?.default_price!=null)document.getElementById('sPrice').value=s.default_price;});document.getElementById('saleForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const {data,error}=await db.from('sales').insert({client_id:val('sClient')||null,service_id:val('sService')||null,work_id:val('sWork')||null,responsible_member_id:val('sResponsible')||null,sale_type:val('sType'),source:'MANUAL',status:val('sStatus'),quantity:Number(val('sQty')||1),unit_price:Number(val('sPrice')||0),discount_amount:Number(val('sDiscount')||0),notes:val('sNotes')||null}).select().single();if(error){toast(error.message,'error');return;}toast('Venda registrada.');closeModal();await loadReferenceData();await navigate('financeiro');}); }

function paymentModal(){ openModal('Registrar pagamento',`<form id="payForm" class="form-grid"><label class="span-2">Cliente<select id="pClient">${optionList(state.clients,'full_name')}</select></label><label class="span-2">Venda a conciliar<select id="pSale"><option value="">Sem vínculo / conciliar depois</option>${state.sales.map(s=>`<option value="${s.id}">${escapeHtml((byId(state.clients,s.client_id)?.full_name||'Sem cliente')+' · '+fmtMoney(s.total_amount)+' · '+fmtDate(s.sold_at))}</option>`).join('')}</select></label><label>Valor recebido<input id="pAmount" required type="number" min="0" step="0.01"></label><label>Taxas<input id="pFees" type="number" min="0" step="0.01" value="0"></label><label>Origem<select id="pSource"><option>MANUAL</option><option>ASAAS</option></select></label><label>Método<input id="pMethod" placeholder="PIX, cartão, dinheiro…"></label><label>Status<select id="pStatus"><option>PAID</option><option>PENDING</option><option>OVERDUE</option><option>REFUNDED</option><option>CANCELLED</option></select></label><label>Data do pagamento<input id="pPaid" type="datetime-local" value="${new Date().toISOString().slice(0,16)}"></label><label class="span-2">Observações<textarea id="pNotes" rows="3"></textarea></label><div class="span-2">${formActions('Registrar pagamento')}</div></form>`);bindCancel();document.getElementById('pSale').addEventListener('change',e=>{const s=byId(state.sales,e.target.value);if(s){document.getElementById('pAmount').value=s.total_amount;if(s.client_id)document.getElementById('pClient').value=s.client_id;}});document.getElementById('payForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const amount=Number(val('pAmount')||0), status=val('pStatus');const {data,error}=await db.from('payments').insert({client_id:val('pClient')||null,source:val('pSource'),status,gross_amount:amount,fees_amount:Number(val('pFees')||0),payment_method:val('pMethod')||null,paid_at:status==='PAID'&&val('pPaid')?new Date(val('pPaid')).toISOString():null,competence_date:(val('pPaid')||new Date().toISOString()).slice(0,10),notes:val('pNotes')||null}).select().single();if(error){toast(error.message,'error');return;}const saleId=val('pSale');if(saleId){const alloc=await db.from('payment_allocations').insert({payment_id:data.id,sale_id:saleId,amount});if(alloc.error){toast('Pagamento salvo, mas a conciliação falhou: '+alloc.error.message,'error');}else toast('Pagamento e comissão processados.');}else toast('Pagamento registrado.');closeModal();await navigate('financeiro');}); }

function campaignModal(){ openModal('Nova campanha',`<form id="campForm" class="form-grid"><label class="span-2">Nome<input id="cName" required></label><label>Trabalho<select id="cWork">${optionList(state.works,'title')}</select></label><label>Serviço<select id="cService">${optionList(state.services,'name')}</select></label><label>Início<input id="cStart" type="datetime-local"></label><label>Fim<input id="cEnd" type="datetime-local"></label><label>Status<select id="cStatus"><option>PLANNED</option><option>ACTIVE</option><option>DONE</option><option>CANCELLED</option></select></label><label class="span-2">Observações<textarea id="cNotes" rows="3"></textarea></label><div class="span-2">${formActions('Criar campanha')}</div></form>`);bindCancel();document.getElementById('campForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const {error}=await db.from('marketing_campaigns').insert({name:val('cName'),work_id:val('cWork')||null,service_id:val('cService')||null,starts_at:val('cStart')?new Date(val('cStart')).toISOString():null,ends_at:val('cEnd')?new Date(val('cEnd')).toISOString():null,status:val('cStatus'),notes:val('cNotes')||null});if(error){toast(error.message,'error');return;}toast('Campanha criada.');closeModal();await render();}); }

function serviceModal(){ openModal('Novo serviço',`<form id="serviceForm" class="form-grid"><label class="span-2">Nome<input id="svName" required></label><label>Categoria<select id="svCategory"><option>CONSULTA</option><option>PERGUNTA</option><option>MENSALIDADE</option><option>TRABALHO_COLETIVO</option><option>TRABALHO_COLETIVO_PREMIUM</option><option>TRABALHO_PARTICULAR</option><option>OUTRO</option></select></label><label>Preço padrão<input id="svPrice" type="number" min="0" step="0.01"></label><label>Duração em minutos<input id="svDuration" type="number" min="1"></label><div class="span-2">${formActions('Criar serviço')}</div></form>`);bindCancel();document.getElementById('serviceForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const {error}=await db.from('services').insert({name:val('svName'),category:val('svCategory'),default_price:Number(val('svPrice')||0)||null,default_duration_minutes:Number(val('svDuration')||0)||null});if(error){toast(error.message,'error');return;}toast('Serviço criado.');closeModal();await loadReferenceData();await render();}); }

document.addEventListener('DOMContentLoaded',bootstrap);
