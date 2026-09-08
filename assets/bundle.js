
/* ---- assets/config.js ---- */
window.SUNSHINE_CONFIG = {
  supabaseUrl: "https://dhpsvwkytcqasmtaeayv.supabase.co",
  supabasePublishableKey: "sb_publishable_4E1ODSLKb3wkFXBLeMKJCw_5nGlycsz"
};

;

/* ---- assets/login-alias.js ---- */
// Login simples por nome; o e-mail técnico permanece invisível para a equipe.
(function(){
  const map={yasmin:'yasmin@sunshine.local',rosely:'rosely@sunshine.local',lourdes:'lourdes@sunshine.local'};
  const normalize=s=>String(s||'').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  document.addEventListener('submit',function(e){
    if(e.target?.id!=='loginForm') return;
    const username=document.getElementById('loginUsername');
    const email=document.getElementById('loginEmail');
    if(!username||!email) return;
    const key=normalize(username.value);
    email.value=map[key]||key;
  },true);
})();

;

/* ---- assets/app.js ---- */
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

;

/* ---- assets/v2.js ---- */
/* Sunshine v2 — simplificação operacional sem alterar os valores canônicos do banco */
(function(){
  const PT = {
    ACTIVE:'Ativo', INACTIVE:'Inativo', BLOCKED:'Bloqueado', SUSPENDED:'Suspenso',
    DONE:'Concluído', PAID:'Pago', COMPLETED:'Concluído', CONFIRMED:'Confirmado', OPEN:'Aberto', CLOSED:'Encerrado',
    SCHEDULED:'Agendado', PLANNED:'Planejado', PENDING:'Pendente', OVERDUE:'Vencido', CANCELLED:'Cancelado',
    REFUNDED:'Estornado', REGISTERED:'Inscrito', RESCHEDULED:'Reagendado', NO_SHOW:'Não compareceu', DUE:'A pagar',
    CONNECTED:'Conectado', PREPARED:'Preparado', NOT_STARTED:'Não iniciado', IN_PRODUCTION:'Em produção', READY:'Pronto',
    VALIDATED:'Validado', ADJUSTMENTS:'Ajustes', LOW:'Baixa', MEDIUM:'Média', HIGH:'Alta', CRITICAL:'Crítica',
    COLETIVO:'Coletivo', COLETIVO_PREMIUM:'Coletivo premium', PARTICULAR:'Particular',
    CONSULTA:'Consulta', PERGUNTA:'Pergunta', MENSALIDADE:'Mensalidade', TRABALHO:'Trabalho', OUTRO:'Outro',
    TRABALHO_COLETIVO:'Trabalho coletivo', TRABALHO_COLETIVO_PREMIUM:'Trabalho coletivo premium', TRABALHO_PARTICULAR:'Trabalho particular',
    BARALHO:'Baralho', BUZIOS:'Búzios', PERGUNTA_OBJETIVA:'Pergunta objetiva', RETORNO:'Retorno',
    ADMIN:'Administrador', EDITOR:'Edição', VIEWER:'Leitura',
    ORIXA:'Orixá', ENTITY:'Entidade', THEMATIC:'Temático', HOUSE:'Casa', OTHER:'Outro',
    ONE_TIME:'Data única', YEARLY:'Anual', WEEKLY:'Semanal',
    WORK_PHOTOS:'Fotos de trabalhos', DOCUMENT:'Documento', CLIENT_FILE:'Arquivo de cliente', CAMPAIGN:'Campanha',
    MANUAL:'Manual', ASAAS:'Asaas', IMPORT:'Importação'
  };
  const TYPE_TO_SALE = cat => {
    if(cat==='CONSULTA') return 'CONSULTA';
    if(cat==='PERGUNTA') return 'PERGUNTA';
    if(cat==='MENSALIDADE') return 'MENSALIDADE';
    if(String(cat||'').startsWith('TRABALHO_')) return 'TRABALHO';
    return 'OUTRO';
  };
  const pt = v => PT[v] || v || '—';

  labels.campanhas=['Campanhas','Planejamento técnico dos trabalhos dos próximos 3 meses e acompanhamento da produção YM.'];
  labels.arquivos=['Arquivos','Links do Google Drive vinculados a trabalhos, clientes e campanhas.'];

  const originalStatusPill = statusPill;
  statusPill = function(v){
    const map={ACTIVE:'ok',DONE:'ok',PAID:'ok',COMPLETED:'ok',CONFIRMED:'ok',CONNECTED:'ok',VALIDATED:'ok',READY:'ok',OPEN:'gold',SCHEDULED:'gold',PLANNED:'neutral',IN_PRODUCTION:'gold',PENDING:'red',OVERDUE:'red',ADJUSTMENTS:'red',CANCELLED:'neutral',INACTIVE:'neutral',BLOCKED:'red',REFUNDED:'neutral',REGISTERED:'gold',RESCHEDULED:'gold',NO_SHOW:'red',CLOSED:'neutral',SUSPENDED:'red',DUE:'red'};
    return `<span class="pill ${map[v]||'neutral'}">${escapeHtml(pt(v))}</span>`;
  };

  function translateVisibleTokens(root){
    if(!root) return;
    root.querySelectorAll('option').forEach(o=>{ if(PT[o.value]) o.textContent=PT[o.value]; });
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[]; let n;
    while((n=walker.nextNode())) nodes.push(n);
    nodes.forEach(node=>{
      const raw=node.nodeValue; const t=raw.trim();
      if(PT[t]) node.nodeValue=raw.replace(t,PT[t]);
    });
  }

  const originalOpenModal = openModal;
  openModal = function(title,body,wide=false){
    originalOpenModal(title,body,wide);
    translateVisibleTokens(document.getElementById('modalRoot'));
  };

  const originalBindViewActions = bindViewActions;
  bindViewActions = function(){
    originalBindViewActions();
    translateVisibleTokens(document.getElementById('content'));
  };

  const originalRenderHome = renderHome;
  renderHome = async function(){
    const base=await originalRenderHome();
    const launch=`<article class="panel launch-panel zero-top"><div class="launch-copy"><h2>Novo lançamento</h2><p>Cadastre o cliente, registre a venda e o pagamento em uma única ação. Se for um trabalho, a inscrição também é criada automaticamente.</p></div><div class="launch-actions"><button class="btn launch" data-action="quick-entry">+ Lançar tudo junto</button></div></article>`;
    return launch+base;
  };

  const originalRenderFinance = renderFinance;
  renderFinance = async function(){
    let base=await originalRenderFinance();
    base=base.replaceAll('Vendas pendentes','Vendas a receber').replaceAll('Aguardando conclusão','Pagamento ainda não confirmado');
    const intro=`<article class="panel launch-panel zero-top"><div class="launch-copy"><h2>Lançamento rápido</h2><p>Na rotina normal use esta opção: cliente + serviço/trabalho + venda + pagamento no mesmo formulário. Os lançamentos separados continuam disponíveis para exceções.</p></div><div class="launch-actions"><button class="btn launch" data-action="quick-entry">+ Novo lançamento</button></div></article><article class="panel"><div class="source-note"><b>Venda e pagamento são coisas diferentes no banco, mas não precisam dar trabalho para a equipe.</b> Venda é o serviço contratado. Pagamento é o dinheiro recebido. O lançamento rápido cria e vincula os dois automaticamente.</div></article>`;
    return intro+base;
  };

  const originalRenderAgenda = renderAgenda;
  renderAgenda = async function(){
    const base=await originalRenderAgenda();
    return base + await renderSpiritualCalendar();
  };

  async function renderSpiritualCalendar(){
    if(state.demo) return `<article class="panel spiritual-panel"><div class="section-head"><div><h2>Calendário espiritual</h2><p>Dias de Orixás, entidades e datas temáticas da casa.</p></div><button class="btn" data-action="new-spiritual-event">+ Data espiritual</button></div><div class="empty-state">Faça login para visualizar o calendário configurado.</div></article>`;
    const q=await safeQuery(db.from('spiritual_calendar_events').select('*').eq('active',true).order('month').order('day'));
    const today=new Date(); today.setHours(0,0,0,0); const limit=new Date(today); limit.setMonth(limit.getMonth()+6);
    const occurrences=[];
    (q.data||[]).forEach(e=>{
      let d=null;
      if(e.recurrence_type==='ONE_TIME' && e.event_date) d=new Date(e.event_date+'T12:00:00');
      if(e.recurrence_type==='YEARLY'){
        d=new Date(today.getFullYear(),Number(e.month)-1,Number(e.day),12,0,0);
        if(d<today) d=new Date(today.getFullYear()+1,Number(e.month)-1,Number(e.day),12,0,0);
      }
      if(e.recurrence_type==='WEEKLY'){
        d=new Date(today); const diff=(Number(e.weekday)-d.getDay()+7)%7; d.setDate(d.getDate()+diff); d.setHours(12,0,0,0);
      }
      if(d && d<=limit) occurrences.push({...e,nextDate:d});
    });
    occurrences.sort((a,b)=>a.nextDate-b.nextDate);
    const items=occurrences.slice(0,12).map(e=>`<div class="spiritual-event"><div class="date">${new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(e.nextDate)}</div><b>${escapeHtml(e.title)}</b><p>${escapeHtml(pt(e.category))}${e.notes?` · ${escapeHtml(e.notes)}`:''}</p></div>`).join('');
    return `<article class="panel spiritual-panel"><div class="section-head"><div><h2>Calendário espiritual</h2><p>Próximos 6 meses · referências editáveis conforme a tradição da casa.</p></div><button class="btn" data-action="new-spiritual-event">+ Data espiritual</button></div><div class="spiritual-list">${items||'<div class="empty-state">Nenhuma data espiritual no período.</div>'}</div></article>`;
  }

  async function renderFiles(){
    if(state.demo) return `<article class="panel"><div class="section-head"><div><h2>Arquivos do ecossistema</h2><p>Somente links do Google Drive; nenhuma imagem é salva no banco.</p></div><button class="btn" data-action="new-file">+ Link do Drive</button></div><div class="empty-state">Faça login para visualizar os links cadastrados.</div></article>`;
    const q=await safeQuery(db.from('drive_links').select('*,works(title),clients(full_name),marketing_campaigns:campaign_id(name)').order('created_at',{ascending:false}).limit(500));
    const cards=(q.data||[]).map(f=>{
      const relations=[]; if(f.works?.title)relations.push(f.works.title); if(f.clients?.full_name)relations.push(f.clients.full_name); if(f.marketing_campaigns?.name)relations.push(f.marketing_campaigns.name);
      return `<div class="link-card"><b>${escapeHtml(f.title)}</b><p>${escapeHtml(pt(f.link_type))}${relations.length?` · ${escapeHtml(relations.join(' · '))}`:''}</p><div class="meta"><a class="external-link" href="${escapeHtml(f.drive_url)}" target="_blank" rel="noopener noreferrer">Abrir no Drive ↗</a><span class="pill neutral">${fmtDate(f.created_at)}</span></div></div>`;
    }).join('');
    return `<article class="panel zero-top"><div class="section-head"><div><h2>Arquivos</h2><p>Links de pastas e arquivos do Google Drive. O banco guarda apenas a referência.</p></div><button class="btn" data-action="new-file">+ Link do Drive</button></div><div class="source-note"><b>Regra:</b> fotos, vídeos e documentos permanecem no Google Drive. O Ecossistema Sunshine salva somente o link e o vínculo com trabalho, cliente ou campanha.</div><div class="link-card-grid" style="margin-top:12px">${cards||'<div class="empty-state">Nenhum link cadastrado ainda.</div>'}</div></article>`;
  }

  function technicalAnalysis(work,campaign,regs,revenue){
    const now=new Date(); const d=work.scheduled_at?new Date(work.scheduled_at):null; const days=d?Math.ceil((d-now)/86400000):999;
    let phase='Planejamento'; let text='Definir tese comercial, promessa, prova, CTA e calendário de conteúdo na Central YM.';
    if(days<=45 && days>20){ phase='Aquecimento'; text='Aumentar repetição do tema, prova, contexto do trabalho e captação de intenção antes da janela de venda.'; }
    if(days<=20 && days>7){ phase='Conversão'; text='Priorizar oferta, benefício, preço, prazo e CTA direto. Conteúdo YM deve conduzir para WhatsApp/inscrição.'; }
    if(days<=7){ phase='Fechamento'; text='Operar urgência real: vagas/prazo, prova, reforço de benefício e chamadas diretas. Evitar dispersão temática.'; }
    if(days<0){ phase='Encerrado'; text='Trabalho já passou; usar para leitura de resultado e aprendizado da campanha.'; }
    if(!campaign && days>=0) text+=' A campanha ainda não está estruturada nesta aba.';
    if(regs===0 && days<=20 && days>=0) text+=' Atenção: ainda não há inscrições registradas.';
    if(revenue>0 && regs>0) text+=` Receita registrada até agora: ${fmtMoney(revenue)}.`;
    return {phase,text};
  }

  async function renderCampaigns(){
    if(state.demo) return `<article class="panel"><div class="source-note"><b>Sunshine é cliente YM.</b> O conteúdo é produzido pela YM e validado na Central YM. Aqui ficam o planejamento comercial e a leitura dos próximos trabalhos.</div></article><article class="panel"><div class="empty-state">Faça login para visualizar os próximos 3 meses.</div></article>`;
    const start=new Date(); const end=new Date(start); end.setMonth(end.getMonth()+3);
    const [wq,cq,rq,sq]=await Promise.all([
      safeQuery(db.from('works').select('*').gte('scheduled_at',start.toISOString()).lt('scheduled_at',end.toISOString()).neq('status','CANCELLED').order('scheduled_at')),
      safeQuery(db.from('marketing_campaigns').select('*').gte('starts_at',new Date(start.getFullYear(),start.getMonth(),1).toISOString()).lt('starts_at',end.toISOString()).order('starts_at')),
      safeQuery(db.from('work_registrations').select('work_id,status').neq('status','CANCELLED')),
      safeQuery(db.from('sales').select('work_id,total_amount,status').in('status',['CONFIRMED','COMPLETED']))
    ]);
    const works=wq.data||[], campaigns=cq.data||[];
    const regCount={}; (rq.data||[]).forEach(r=>regCount[r.work_id]=(regCount[r.work_id]||0)+1);
    const revenue={}; (sq.data||[]).forEach(s=>{if(s.work_id) revenue[s.work_id]=(revenue[s.work_id]||0)+Number(s.total_amount||0)});
    const byWork={}; campaigns.forEach(c=>{if(c.work_id && !byWork[c.work_id])byWork[c.work_id]=c});
    const monthBuckets=[]; for(let i=0;i<3;i++){const d=new Date(start.getFullYear(),start.getMonth()+i,1); monthBuckets.push({year:d.getFullYear(),month:d.getMonth(),label:new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(d),count:0});}
    works.forEach(w=>{const d=new Date(w.scheduled_at);const b=monthBuckets.find(x=>x.year===d.getFullYear()&&x.month===d.getMonth());if(b)b.count++;});
    const monthHtml=monthBuckets.map(m=>`<div class="month-card"><div class="month">${escapeHtml(m.label)}</div><div class="count">${m.count}</div><p>${m.count===1?'trabalho previsto':'trabalhos previstos'}</p></div>`).join('');
    const rows=works.map(w=>{
      const c=byWork[w.id]; const analysis=technicalAnalysis(w,c,regCount[w.id]||0,revenue[w.id]||0);
      return `<tr><td><b>${escapeHtml(w.title)}</b><small>${fmtDateTime(w.scheduled_at)}</small></td><td>${escapeHtml(analysis.phase)}</td><td>${regCount[w.id]||0}</td><td>${fmtMoney(revenue[w.id]||0)}</td><td>${c?statusPill(c.ym_content_status):'<span class="pill neutral">Não iniciado</span>'}</td><td>${c?statusPill(c.ym_validation_status):'<span class="pill neutral">Pendente</span>'}</td><td class="analysis-cell">${escapeHtml(c?.technical_analysis||analysis.text)}</td><td><button class="btn ghost" data-action="campaign-for-work" data-id="${w.id}">${c?'Atualizar plano':'Planejar'}</button></td></tr>`;
    }).join('');
    return `<article class="panel zero-top"><div class="source-note"><b>Fluxo oficial:</b> Sunshine é cliente YM. O Ecossistema Sunshine organiza o trabalho e a necessidade comercial; a produção de conteúdo acontece pela YM e a validação oficial acontece na Central YM. Não duplicamos o conteúdo aqui.</div><div class="ym-flow"><div class="ym-step"><strong>1. Sunshine</strong><span>Define trabalho, data, preço, meta e necessidade comercial.</span></div><div class="ym-step"><strong>2. YM</strong><span>Produz a estratégia e os conteúdos da campanha.</span></div><div class="ym-step"><strong>3. Central YM</strong><span>Valida, acompanha status e mantém a fonte oficial do conteúdo.</span></div></div></article><article class="panel"><div class="section-head"><div><h2>Próximos 3 meses</h2><p>Análise operacional por janela, inscritos, receita e status YM.</p></div><button class="btn" data-action="new-campaign">+ Campanha</button></div><div class="campaign-months">${monthHtml}</div><div class="table-wrap" style="margin-top:12px"><table class="table"><thead><tr><th>Trabalho</th><th>Fase</th><th>Inscritos</th><th>Receita</th><th>Conteúdo YM</th><th>Validação Central</th><th>Análise técnica</th><th>Ação</th></tr></thead><tbody>${rows||'<tr class="empty-row"><td colspan="8">Cadastre os trabalhos futuros para gerar a análise dos próximos 3 meses.</td></tr>'}</tbody></table></div></article>`;
  }

  const originalNavigate = navigate;
  navigate = async function(view){
    if(view!=='campanhas' && view!=='arquivos') return originalNavigate(view);
    state.view=view;
    document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    const [t,s]=labels[view]; document.getElementById('title').textContent=t; document.getElementById('subtitle').textContent=s;
    const content=document.getElementById('content'); content.innerHTML=loading();
    try{ content.innerHTML=view==='campanhas'?await renderCampaigns():await renderFiles(); bindViewActions(); }
    catch(e){ console.error(e); content.innerHTML=errorBox(e.message||'Não foi possível carregar esta tela.'); }
  };

  const originalHandleAction = handleAction;
  handleAction = async function(action,id){
    if(action==='quick-entry') return quickEntryModal();
    if(action==='new-file') return fileModal();
    if(action==='new-spiritual-event') return spiritualEventModal();
    if(action==='campaign-for-work') return campaignModal(id);
    return originalHandleAction(action,id);
  };

  function quickEntryModal(){
    openModal('Novo lançamento',`<form id="quickEntryForm" class="form-grid"><div class="span-2 soft-box"><h3>1. Cliente</h3><p>Selecione alguém já cadastrado ou deixe em branco para criar o cliente neste mesmo lançamento.</p></div><label class="span-2">Cliente existente<select id="qClient">${optionList(state.clients,'full_name')}</select></label><label class="span-2">Nome do novo cliente<input id="qName" placeholder="Preencha somente se for cliente novo"></label><label>Telefone<input id="qPhone"></label><label>E-mail<input id="qEmail" type="email"></label><label>Nascimento<input id="qBirth" type="date"></label><div class="span-2 soft-box"><h3>2. Serviço ou trabalho</h3><p>O sistema cria a venda automaticamente. Se houver trabalho selecionado, também cria a inscrição.</p></div><label>Serviço<select id="qService">${optionList(state.services,'name')}</select></label><label>Trabalho<select id="qWork">${optionList(state.works,'title')}</select></label><label>Responsável<select id="qResponsible">${optionList(state.team.filter(x=>x.is_practitioner),'full_name')}</select></label><label>Valor<input id="qAmount" required type="number" min="0" step="0.01"></label><label>Pessoa amada<input id="qLoved" placeholder="Opcional para trabalhos"></label><label>Rival<input id="qRival" placeholder="Opcional para trabalhos"></label><div class="span-2 soft-box"><h3>3. Pagamento</h3><p>Pago gera a comissão automaticamente. Pendente registra a venda e o recebimento ainda em aberto.</p></div><label>Status do pagamento<select id="qStatus"><option value="PAID">Pago</option><option value="PENDING">Pendente</option><option value="OVERDUE">Vencido</option><option value="REFUNDED">Estornado</option><option value="CANCELLED">Cancelado</option></select></label><label>Método<input id="qMethod" placeholder="PIX, cartão, dinheiro…"></label><label>Data do pagamento<input id="qPaidAt" type="datetime-local" value="${new Date().toISOString().slice(0,16)}"></label><label>Origem<select id="qSource"><option value="MANUAL">Manual</option><option value="ASAAS">Asaas</option></select></label><label class="span-2">Observações<textarea id="qNotes" rows="3"></textarea></label><div class="span-2">${formActions('Salvar lançamento completo')}</div></form>`,true);
    bindCancel();
    const updatePrice=()=>{
      const service=byId(state.services,val('qService')); const work=state.works.find(w=>w.id===val('qWork'));
      if(work?.unit_price!=null) document.getElementById('qAmount').value=work.unit_price;
      else if(service?.default_price!=null) document.getElementById('qAmount').value=service.default_price;
    };
    document.getElementById('qService').addEventListener('change',updatePrice); document.getElementById('qWork').addEventListener('change',updatePrice);
    document.getElementById('qClient').addEventListener('change',e=>{const disabled=Boolean(e.target.value);['qName','qPhone','qEmail','qBirth'].forEach(k=>document.getElementById(k).disabled=disabled);});
    document.getElementById('quickEntryForm').addEventListener('submit',async e=>{
      e.preventDefault(); if(!requireReal())return;
      const clientId=val('qClient')||null; if(!clientId && !val('qName').trim()){toast('Selecione um cliente ou informe o nome do novo cliente.','error');return;}
      const service=byId(state.services,val('qService')); const workId=val('qWork')||null; const saleType=workId?'TRABALHO':TYPE_TO_SALE(service?.category);
      const amount=Number(val('qAmount')||0);
      const {data,error}=await db.rpc('register_quick_entry',{
        p_client_id:clientId,p_client_name:val('qName').trim()||null,p_client_phone:val('qPhone').trim()||null,p_client_email:val('qEmail').trim()||null,p_client_birth_date:val('qBirth')||null,
        p_service_id:val('qService')||null,p_work_id:workId,p_responsible_member_id:val('qResponsible')||null,p_sale_type:saleType,p_amount:amount,p_payment_status:val('qStatus'),p_payment_method:val('qMethod')||null,p_source:val('qSource'),p_paid_at:val('qPaidAt')?new Date(val('qPaidAt')).toISOString():new Date().toISOString(),p_notes:val('qNotes')||null,p_loved_person_name:val('qLoved')||null,p_rival_name:val('qRival')||null
      });
      if(error){toast(error.message,'error');return;}
      toast(workId?'Cliente, venda, pagamento e inscrição registrados.':'Cliente, venda e pagamento registrados.'); closeModal(); await loadReferenceData(); await navigate('financeiro');
    });
  }

  paymentModal = function(){
    openModal('Registrar pagamento',`<form id="payForm" class="form-grid"><label class="span-2">Cliente<select id="pClient">${optionList(state.clients,'full_name')}</select></label><label class="span-2">Venda relacionada (opcional)<select id="pSale"><option value="">Sem venda vinculada</option>${state.sales.map(s=>`<option value="${s.id}">${escapeHtml((byId(state.clients,s.client_id)?.full_name||'Sem cliente')+' · '+fmtMoney(s.total_amount)+' · '+fmtDate(s.sold_at))}</option>`).join('')}</select><small class="helper">Use quando o pagamento corresponde a uma venda já registrada. Para a rotina comum, prefira “Novo lançamento”, que cria tudo junto.</small></label><label>Valor recebido<input id="pAmount" required type="number" min="0" step="0.01"></label><label>Taxas<input id="pFees" type="number" min="0" step="0.01" value="0"></label><label>Origem<select id="pSource"><option value="MANUAL">Manual</option><option value="ASAAS">Asaas</option></select></label><label>Método<input id="pMethod" placeholder="PIX, cartão, dinheiro…"></label><label>Status<select id="pStatus"><option value="PAID">Pago</option><option value="PENDING">Pendente</option><option value="OVERDUE">Vencido</option><option value="REFUNDED">Estornado</option><option value="CANCELLED">Cancelado</option></select></label><label>Data do pagamento<input id="pPaid" type="datetime-local" value="${new Date().toISOString().slice(0,16)}"></label><label class="span-2">Observações<textarea id="pNotes" rows="3"></textarea></label><div class="span-2">${formActions('Registrar pagamento')}</div></form>`,true);
    bindCancel(); document.getElementById('pSale').addEventListener('change',e=>{const s=byId(state.sales,e.target.value);if(s){document.getElementById('pAmount').value=s.total_amount;if(s.client_id)document.getElementById('pClient').value=s.client_id;}});
    document.getElementById('payForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const amount=Number(val('pAmount')||0), status=val('pStatus');const {data,error}=await db.from('payments').insert({client_id:val('pClient')||null,source:val('pSource'),status,gross_amount:amount,fees_amount:Number(val('pFees')||0),payment_method:val('pMethod')||null,paid_at:status==='PAID'&&val('pPaid')?new Date(val('pPaid')).toISOString():null,competence_date:(val('pPaid')||new Date().toISOString()).slice(0,10),notes:val('pNotes')||null}).select().single();if(error){toast(error.message,'error');return;}const saleId=val('pSale');if(saleId){const alloc=await db.from('payment_allocations').insert({payment_id:data.id,sale_id:saleId,amount});if(alloc.error){toast('Pagamento salvo, mas o vínculo com a venda falhou: '+alloc.error.message,'error');}else toast('Pagamento vinculado à venda.');}else toast('Pagamento registrado.');closeModal();await navigate('financeiro');});
  };

  async function fileModal(){
    const campaigns=state.demo?[]:(await safeQuery(db.from('marketing_campaigns').select('id,name').order('starts_at',{ascending:false}).limit(100))).data||[];
    openModal('Salvar link do Google Drive',`<form id="fileForm" class="form-grid"><label class="span-2">Título<input id="flTitle" required placeholder="Ex.: Fotos Agrado Padilha 11/09"></label><label class="span-2">Link do Drive<input id="flUrl" type="url" required placeholder="https://drive.google.com/..."><small class="helper">Somente links do Google Drive ou Google Docs. Nenhum arquivo é enviado para o Supabase.</small></label><label>Tipo<select id="flType"><option value="WORK_PHOTOS">Fotos de trabalhos</option><option value="DOCUMENT">Documento</option><option value="CLIENT_FILE">Arquivo de cliente</option><option value="CAMPAIGN">Campanha</option><option value="OTHER">Outro</option></select></label><label>Trabalho<select id="flWork">${optionList(state.works,'title')}</select></label><label>Cliente<select id="flClient">${optionList(state.clients,'full_name')}</select></label><label>Campanha<select id="flCampaign">${optionList(campaigns,'name')}</select></label><label class="span-2">Observações<textarea id="flNotes" rows="3"></textarea></label><div class="span-2">${formActions('Salvar link')}</div></form>`); bindCancel();
    document.getElementById('fileForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const url=val('flUrl').trim();if(!/^https:\/\/(drive|docs)\.google\.com\//i.test(url)){toast('Use um link do Google Drive ou Google Docs.','error');return;}const payload={title:val('flTitle').trim(),drive_url:url,link_type:val('flType'),work_id:val('flWork')||null,client_id:val('flClient')||null,campaign_id:val('flCampaign')||null,notes:val('flNotes')||null,created_by:state.member?.id||null};const {error}=await db.from('drive_links').insert(payload);if(error){toast(error.message,'error');return;}toast('Link salvo no ecossistema.');closeModal();await navigate('arquivos');});
  }

  function spiritualEventModal(){
    openModal('Nova data espiritual',`<form id="spForm" class="form-grid"><label class="span-2">Nome<input id="spTitle" required placeholder="Ex.: Dia de Ogum"></label><label>Categoria<select id="spCategory"><option value="ORIXA">Orixá</option><option value="ENTITY">Entidade</option><option value="THEMATIC">Temático</option><option value="HOUSE">Casa</option><option value="OTHER">Outro</option></select></label><label>Recorrência<select id="spRecurrence"><option value="YEARLY">Anual</option><option value="ONE_TIME">Data única</option><option value="WEEKLY">Semanal</option></select></label><label id="spDateLabel">Data<input id="spDate" type="date"></label><label id="spMonthLabel">Mês<input id="spMonth" type="number" min="1" max="12"></label><label id="spDayLabel">Dia<input id="spDay" type="number" min="1" max="31"></label><label id="spWeekdayLabel">Dia da semana<select id="spWeekday"><option value="0">Domingo</option><option value="1">Segunda</option><option value="2">Terça</option><option value="3">Quarta</option><option value="4">Quinta</option><option value="5">Sexta</option><option value="6">Sábado</option></select></label><label class="span-2">Observações<textarea id="spNotes" rows="3" placeholder="Referência, tradição da casa, orientação de campanha…"></textarea></label><div class="span-2">${formActions('Salvar data')}</div></form>`); bindCancel();
    const sync=()=>{const r=val('spRecurrence');document.getElementById('spDateLabel').hidden=r!=='ONE_TIME';document.getElementById('spMonthLabel').hidden=r!=='YEARLY';document.getElementById('spDayLabel').hidden=r!=='YEARLY';document.getElementById('spWeekdayLabel').hidden=r!=='WEEKLY';}; document.getElementById('spRecurrence').addEventListener('change',sync); sync();
    document.getElementById('spForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const r=val('spRecurrence');const payload={title:val('spTitle').trim(),category:val('spCategory'),recurrence_type:r,event_date:r==='ONE_TIME'?val('spDate'):null,month:r==='YEARLY'?Number(val('spMonth')):null,day:r==='YEARLY'?Number(val('spDay')):null,weekday:r==='WEEKLY'?Number(val('spWeekday')):null,notes:val('spNotes')||null,created_by:state.member?.id||null};const {error}=await db.from('spiritual_calendar_events').insert(payload);if(error){toast(error.message,'error');return;}toast('Data adicionada ao calendário espiritual.');closeModal();await navigate('agenda');});
  }

  campaignModal = async function(preselectedWorkId=''){
    const existing=preselectedWorkId && !state.demo ? (await safeQuery(db.from('marketing_campaigns').select('*').eq('work_id',preselectedWorkId).order('created_at',{ascending:false}).limit(1))).data?.[0] : null;
    const c=existing||{};
    openModal(c.id?'Plano de campanha':'Nova campanha',`<form id="campForm" class="form-grid"><label class="span-2">Nome<input id="cName" required value="${escapeHtml(c.name||'')}"></label><label>Trabalho<select id="cWork">${optionList(state.works,'title',c.work_id||preselectedWorkId)}</select></label><label>Serviço<select id="cService">${optionList(state.services,'name',c.service_id)}</select></label><label>Início<input id="cStart" type="datetime-local" value="${c.starts_at?new Date(c.starts_at).toISOString().slice(0,16):''}"></label><label>Fim<input id="cEnd" type="datetime-local" value="${c.ends_at?new Date(c.ends_at).toISOString().slice(0,16):''}"></label><label>Prioridade<select id="cPriority"><option value="LOW">Baixa</option><option value="MEDIUM">Média</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option></select></label><label>Status da campanha<select id="cStatus"><option value="PLANNED">Planejada</option><option value="ACTIVE">Ativa</option><option value="DONE">Concluída</option><option value="CANCELLED">Cancelada</option></select></label><label>Conteúdo YM<select id="cContent"><option value="NOT_STARTED">Não iniciado</option><option value="IN_PRODUCTION">Em produção</option><option value="READY">Pronto</option></select></label><label>Validação Central YM<select id="cValidation"><option value="PENDING">Pendente</option><option value="VALIDATED">Validado</option><option value="ADJUSTMENTS">Ajustes</option></select></label><label>Meta de receita<input id="cTarget" type="number" min="0" step="0.01" value="${c.target_revenue||''}"></label><label>Posts planejados<input id="cPosts" type="number" min="0" value="${c.planned_posts||''}"></label><label class="span-2">Objetivo<input id="cObjective" value="${escapeHtml(c.objective||'')}"></label><label class="span-2">Hipótese comercial<textarea id="cHypothesis" rows="3">${escapeHtml(c.commercial_hypothesis||'')}</textarea></label><label class="span-2">Análise técnica<textarea id="cAnalysis" rows="4">${escapeHtml(c.technical_analysis||'')}</textarea></label><label class="span-2">Link da Central YM<input id="cYmUrl" type="url" value="${escapeHtml(c.ym_central_url||'')}" placeholder="Link do conteúdo/cliente/campanha na Central YM"></label><label class="span-2">Observações<textarea id="cNotes" rows="3">${escapeHtml(c.notes||'')}</textarea></label><div class="span-2">${formActions(c.id?'Atualizar plano':'Criar campanha')}</div></form>`,true); bindCancel();
    ['cPriority','cStatus','cContent','cValidation'].forEach(id=>{if(c[id==='cPriority'?'campaign_priority':id==='cStatus'?'status':id==='cContent'?'ym_content_status':'ym_validation_status'])document.getElementById(id).value=c[id==='cPriority'?'campaign_priority':id==='cStatus'?'status':id==='cContent'?'ym_content_status':'ym_validation_status'];});
    const prefill=()=>{const w=state.works.find(x=>x.id===val('cWork'));if(w&&!val('cName'))document.getElementById('cName').value=`Campanha · ${w.title}`;if(w&&!val('cStart')){const d=new Date(w.scheduled_at);d.setDate(d.getDate()-21);document.getElementById('cStart').value=d.toISOString().slice(0,16);}if(w&&!val('cEnd'))document.getElementById('cEnd').value=new Date(w.scheduled_at).toISOString().slice(0,16);}; document.getElementById('cWork').addEventListener('change',prefill); if(!c.id)prefill();
    document.getElementById('campForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const payload={name:val('cName'),work_id:val('cWork')||null,service_id:val('cService')||null,starts_at:val('cStart')?new Date(val('cStart')).toISOString():null,ends_at:val('cEnd')?new Date(val('cEnd')).toISOString():null,status:val('cStatus'),campaign_priority:val('cPriority'),ym_content_status:val('cContent'),ym_validation_status:val('cValidation'),target_revenue:Number(val('cTarget')||0)||null,planned_posts:Number(val('cPosts')||0)||null,objective:val('cObjective')||null,commercial_hypothesis:val('cHypothesis')||null,technical_analysis:val('cAnalysis')||null,ym_central_url:val('cYmUrl')||null,notes:val('cNotes')||null,managed_by:'YM',content_source:'CENTRAL_YM'};const res=c.id?await db.from('marketing_campaigns').update(payload).eq('id',c.id):await db.from('marketing_campaigns').insert(payload);if(res.error){toast(res.error.message,'error');return;}toast('Plano de campanha salvo.');closeModal();await navigate('campanhas');});
  };
})();

;

/* ---- assets/v3.js ---- */
/* Sunshine v3 — Inbox Asaas: entrada financeira automática -> classificação humana */
(function(){
  const ASAAS_PT={RECEIVED:'Recebido',CONFIRMED:'Confirmado',PENDING:'Pendente',OVERDUE:'Vencido',REFUNDED:'Estornado',DELETED:'Excluído',PIX:'PIX',CREDIT_CARD:'Cartão',BOLETO:'Boleto',UNDEFINED:'Não informado'};
  const asaasPt=v=>ASAAS_PT[v]||v||'—';
  const onlyDigits=v=>String(v||'').replace(/\D/g,'');
  const memberIsAdmin=()=>state.member?.role==='ADMIN';

  async function refreshAsaasBadge(){
    const bell=document.getElementById('asaasBell'), countEl=document.getElementById('asaasBellCount');
    if(!bell||!countEl||state.demo||!state.session){ if(countEl)countEl.hidden=true; return 0; }
    const {count,error}=await db.from('asaas_incoming_payments').select('id',{count:'exact',head:true}).in('classification_status',['PENDING','REVIEW']);
    const n=error?0:(count||0); countEl.textContent=String(n); countEl.hidden=n===0; bell.classList.toggle('has-pending',n>0); bell.title=n?`${n} entrada(s) do Asaas a registrar`:'Nenhuma entrada pendente do Asaas'; return n;
  }

  document.addEventListener('DOMContentLoaded',()=>{
    document.getElementById('asaasBell')?.addEventListener('click',async()=>{ await navigate('financeiro'); setTimeout(()=>document.getElementById('asaasInbox')?.scrollIntoView({behavior:'smooth',block:'start'}),80); });
  });

  const previousRender=render;
  render=async function(){ await previousRender(); await refreshAsaasBadge(); };

  async function pendingEntries(){
    if(state.demo) return [];
    const q=await safeQuery(db.from('asaas_incoming_payments').select('*').in('classification_status',['PENDING','REVIEW']).order('received_at',{ascending:false}).limit(100));
    return q.data||[];
  }

  function localMatch(e){
    if(e.matched_client_id) return byId(state.clients,e.matched_client_id)||null;
    const doc=onlyDigits(e.customer_document), email=String(e.customer_email||'').trim().toLowerCase(), phone=onlyDigits(e.customer_mobile_phone||e.customer_phone);
    return state.clients.find(c=>doc&&onlyDigits(c.document_number)===doc)||state.clients.find(c=>email&&String(c.email||'').trim().toLowerCase()===email)||state.clients.find(c=>phone&&onlyDigits(c.phone)===phone)||null;
  }

  async function renderAsaasInbox(){
    const entries=await pendingEntries();
    const amount=entries.reduce((a,e)=>a+Number(e.gross_amount||0),0);
    const rows=entries.map(e=>{
      const match=localMatch(e); const contact=[e.customer_email,e.customer_mobile_phone||e.customer_phone,e.customer_document].filter(Boolean).join(' · ');
      return `<tr class="asaas-inbox-row"><td>${fmtDateTime(e.payment_date||e.received_at)}</td><td class="asaas-person"><b>${escapeHtml(e.customer_name||'Cliente não identificado')}</b><small>${escapeHtml(contact||e.asaas_customer_id||'Dados do cliente ainda serão enriquecidos pela API')}</small>${match?`<span class="match-hint">Possível cliente: ${escapeHtml(match.full_name)}</span>`:'<span class="needs-review">Cadastro precisa ser confirmado</span>'}</td><td>${escapeHtml(asaasPt(e.billing_type))}</td><td class="asaas-value">${fmtMoney(e.gross_amount)}</td><td>${escapeHtml(asaasPt(e.asaas_status))}</td><td><div class="button-row"><button class="btn" data-action="resolve-asaas" data-id="${e.id}">Registrar entrada</button><button class="btn ghost" data-action="ignore-asaas" data-id="${e.id}">Ignorar</button></div></td></tr>`;
    }).join('');
    return `<article class="panel zero-top" id="asaasInbox"><div class="section-head"><div><h2>Entradas do Asaas a registrar</h2><p>O dinheiro já entrou. Falta dizer ao sistema o que o cliente comprou.</p></div>${entries.length?`<span class="pill red">${entries.length} pendente${entries.length===1?'':'s'}</span>`:'<span class="pill ok">Tudo registrado</span>'}</div><div class="asaas-banner"><div><strong>Como funciona</strong><span>Asaas envia valor + dados financeiros + identificação do cliente. Aqui você confirma/complete o cliente e classifica como consulta, pergunta, mensalidade ou trabalho.</span></div><button class="btn secondary" data-action="quick-entry">Lançamento manual</button></div><div class="asaas-summary"><div><span>Pendências</span><b>${entries.length}</b></div><div><span>Valor aguardando classificação</span><b>${fmtMoney(amount)}</b></div><div><span>Origem</span><b>Automático via Asaas</b></div></div><div class="table-wrap"><table class="table asaas-inbox-table"><thead><tr><th>Recebido</th><th>Cliente</th><th>Método</th><th>Valor</th><th>Asaas</th><th>Ação</th></tr></thead><tbody>${rows||'<tr class="empty-row"><td colspan="6">Nenhuma entrada automática aguardando registro.</td></tr>'}</tbody></table></div></article>`;
  }

  const previousFinance=renderFinance;
  renderFinance=async function(){ return (await renderAsaasInbox()) + await previousFinance(); };

  const previousHome=renderHome;
  renderHome=async function(){
    const base=await previousHome(); if(state.demo)return base; const entries=await pendingEntries();
    if(!entries.length)return base;
    return `<div class="asaas-banner" style="margin-bottom:14px"><div><strong>${entries.length} entrada${entries.length===1?'':'s'} do Asaas aguardando registro</strong><span>Pagamento recebido, mas o serviço/trabalho ainda precisa ser informado.</span></div><button class="btn" data-go="financeiro">Revisar agora</button></div>`+base;
  };

  const previousConfig=renderConfig;
  renderConfig=async function(){
    const base=await previousConfig();
    if(state.demo)return base+`<article class="panel"><h2>Asaas</h2><div class="empty-state">Faça login para consultar a conexão.</div></article>`;
    const q=await safeQuery(db.from('asaas_integration_settings').select('*').order('created_at').limit(1)); const s=q.data?.[0];
    const connected=s?.status==='CONNECTED';
    return base+`<article class="panel"><div class="section-head"><div><h2>Integração Asaas</h2><p>Recebimentos automáticos entram primeiro em “Entradas do Asaas a registrar”.</p></div>${statusPill(connected?'CONNECTED':'PENDING')}</div><div class="integration-card ${connected?'connected':''}"><h3>${connected?'Asaas conectado':'Conectar conta Asaas'}</h3><p>${connected?`Webhook ativo${s.last_event_at?` · último evento ${fmtDateTime(s.last_event_at)}`:''}. A chave da API fica criptografada no Vault do Supabase e nunca é publicada no HTML.`:'A conexão cria um webhook seguro no Asaas e passa a receber pagamentos automaticamente.'}</p>${s?.last_error?`<div class="connection-warning" style="margin-top:10px">Último erro: ${escapeHtml(s.last_error)}</div>`:''}<div class="button-row">${memberIsAdmin()?`<button class="btn ${connected?'secondary':''}" data-action="connect-asaas">${connected?'Reconfigurar Asaas':'Conectar Asaas'}</button>`:'<span class="microcopy">Somente Yasmin (administradora) pode alterar a conexão.</span>'}</div></div></article>`;
  };

  const previousHandle=handleAction;
  handleAction=async function(action,id){
    if(action==='resolve-asaas')return resolveAsaasModal(id);
    if(action==='ignore-asaas')return ignoreAsaas(id);
    if(action==='connect-asaas')return connectAsaasModal();
    return previousHandle(action,id);
  };

  async function resolveAsaasModal(id){
    if(state.demo)return; const {data:e,error}=await db.from('asaas_incoming_payments').select('*').eq('id',id).single(); if(error){toast(error.message,'error');return;}
    const match=localMatch(e); const preClient=match?.id||'';
    openModal('Registrar entrada recebida no Asaas',`<form id="asaasResolveForm" class="form-grid"><div class="span-2 soft-box"><h3>Pagamento já recebido</h3><p>${escapeHtml(e.customer_name||'Cliente')} · <b>${fmtMoney(e.gross_amount)}</b> · ${escapeHtml(asaasPt(e.billing_type))}. Agora classifique o que foi contratado.</p></div><label class="span-2">Cliente existente<select id="arClient">${optionList(state.clients,'full_name',preClient)}</select><small class="helper">Se houver correspondência por CPF/CNPJ, e-mail ou ID Asaas, ela vem pré-selecionada. Dados vazios do cadastro serão complementados com o Asaas.</small></label><div class="form-divider span-2">ou confirme os dados para criar um novo cliente</div><label class="span-2">Nome<input id="arName" value="${escapeHtml(e.customer_name||'')}"></label><label>Telefone<input id="arPhone" value="${escapeHtml(e.customer_mobile_phone||e.customer_phone||'')}"></label><label>E-mail<input id="arEmail" type="email" value="${escapeHtml(e.customer_email||'')}"></label><label>CPF/CNPJ<input id="arDocument" value="${escapeHtml(e.customer_document||'')}"></label><label>Nascimento<input id="arBirth" type="date"></label><div class="span-2 soft-box"><h3>O que ela comprou?</h3><p>Essa classificação cria a venda e vincula o pagamento que já veio do Asaas.</p></div><label>Serviço<select id="arService">${optionList(state.services,'name')}</select></label><label>Trabalho<select id="arWork">${optionList(state.works,'title')}</select></label><label>Responsável<select id="arResponsible">${optionList(state.team.filter(x=>x.is_practitioner),'full_name')}</select></label><label>Valor recebido<input value="${Number(e.gross_amount||0).toFixed(2)}" disabled></label><label>Pessoa amada<input id="arLoved" placeholder="Se aplicável"></label><label>Rival<input id="arRival" placeholder="Se aplicável"></label><label class="span-2">Observações<textarea id="arNotes" rows="3" placeholder="Ex.: Agrado coletivo de Padilha"></textarea></label><div class="span-2">${formActions('Registrar e concluir pendência')}</div></form>`,true); bindCancel();
    const toggle=()=>{const existing=Boolean(val('arClient'));['arName','arPhone','arEmail','arDocument','arBirth'].forEach(k=>document.getElementById(k).disabled=existing);};document.getElementById('arClient').addEventListener('change',toggle);toggle();
    document.getElementById('asaasResolveForm').addEventListener('submit',async ev=>{ev.preventDefault();if(!requireReal())return;const existing=val('arClient')||null;if(!existing&&!val('arName').trim()){toast('Confirme o nome do cliente.','error');return;}const service=byId(state.services,val('arService'));const workId=val('arWork')||null;const saleType=workId?'TRABALHO':(service?.category==='CONSULTA'?'CONSULTA':service?.category==='PERGUNTA'?'PERGUNTA':service?.category==='MENSALIDADE'?'MENSALIDADE':String(service?.category||'').startsWith('TRABALHO_')?'TRABALHO':'OUTRO');const {error:rerr}=await db.rpc('resolve_asaas_entry',{p_entry_id:id,p_client_id:existing,p_client_name:val('arName')||null,p_client_phone:val('arPhone')||null,p_client_email:val('arEmail')||null,p_client_birth_date:val('arBirth')||null,p_document_number:val('arDocument')||null,p_service_id:val('arService')||null,p_work_id:workId,p_responsible_member_id:val('arResponsible')||null,p_sale_type:saleType,p_loved_person_name:val('arLoved')||null,p_rival_name:val('arRival')||null,p_notes:val('arNotes')||null});if(rerr){toast(rerr.message,'error');return;}toast(workId?'Entrada registrada e inscrição criada.':'Entrada do Asaas registrada.');closeModal();await loadReferenceData();await navigate('financeiro');});
  }

  async function ignoreAsaas(id){ if(!requireReal())return; if(!confirm('Ignorar esta entrada? Ela sairá da lista de pendências, mas o evento continuará registrado para auditoria.'))return;const {error}=await db.from('asaas_incoming_payments').update({classification_status:'IGNORED',resolved_by:state.member?.id||null,resolved_at:new Date().toISOString()}).eq('id',id);if(error){toast(error.message,'error');return;}toast('Entrada ignorada.');await render(); }

  function connectAsaasModal(){
    if(!memberIsAdmin()){toast('Somente a administradora pode configurar o Asaas.','error');return;}
    openModal('Conectar Asaas',`<form id="asaasConnectForm" class="form-grid"><div class="span-2 connection-warning"><b>Conexão segura.</b> A chave será enviada diretamente ao backend Supabase por HTTPS e armazenada criptografada no Vault. Ela não fica no HTML nem no GitHub.</div><label>Ambiente<select id="acEnv"><option value="PRODUCTION">Produção</option><option value="SANDBOX">Sandbox</option></select></label><label>E-mail para alertas do webhook<input id="acEmail" type="email" required placeholder="E-mail que receberá alertas de falha"></label><label class="span-2">API Key do Asaas<input id="acKey" type="password" required autocomplete="off" placeholder="$aact_prod_..."><small class="helper">A chave é validada antes da conexão. O sistema cria ou atualiza automaticamente o webhook “Sunshine Ecossistema”.</small></label><div class="span-2">${formActions('Conectar com segurança')}</div></form>`,true); bindCancel();
    document.getElementById('asaasConnectForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const submit=e.target.querySelector('button[type=submit]');submit.disabled=true;submit.textContent='Conectando…';const {data,error}=await db.functions.invoke('asaas-connect',{body:{apiKey:val('acKey'),alertEmail:val('acEmail'),environment:val('acEnv')}});document.getElementById('acKey').value='';submit.disabled=false;submit.textContent='Conectar com segurança';if(error||data?.error){toast(data?.detail||data?.error||error?.message||'Falha ao conectar Asaas','error');return;}toast('Asaas conectado e webhook ativado.');closeModal();await navigate('config');});
  }

  const previousClientDetail=clientDetail;
  clientDetail=async function(client){const base=await previousClientDetail(client);if(state.demo)return base;return base+`<article class="panel"><div class="section-head"><div><h2>Dados financeiros e cadastrais</h2><p>Campos que podem ser enriquecidos pelo Asaas.</p></div><button class="btn secondary" data-action="edit-client" data-id="${client.id}">Editar dados</button></div><div class="profile-grid"><div><span>CPF/CNPJ</span><b>${escapeHtml(client.document_number||'—')}</b></div><div><span>ID Asaas</span><b>${escapeHtml(client.asaas_customer_id||'—')}</b></div><div><span>CEP</span><b>${escapeHtml(client.postal_code||'—')}</b></div><div><span>Endereço</span><b>${escapeHtml([client.address_line,client.address_number,client.address_complement].filter(Boolean).join(', ')||'—')}</b></div></div></article>`;};

  clientModal=function(c={}){
    openModal(c.id?'Editar cliente':'Novo cliente',`<form id="clientForm" class="form-grid"><label class="span-2">Nome completo<input id="fFullName" required value="${escapeHtml(c.full_name||'')}"></label><label>Nome preferido<input id="fPreferred" value="${escapeHtml(c.preferred_name||'')}"></label><label>Telefone<input id="fPhone" value="${escapeHtml(c.phone||'')}"></label><label>E-mail<input id="fEmail" type="email" value="${escapeHtml(c.email||'')}"></label><label>Nascimento<input id="fBirth" type="date" value="${c.birth_date||''}"></label><label>CPF/CNPJ<input id="fDocument" value="${escapeHtml(c.document_number||'')}"></label><label>CEP<input id="fPostal" value="${escapeHtml(c.postal_code||'')}"></label><label>Endereço<input id="fAddress" value="${escapeHtml(c.address_line||'')}"></label><label>Número<input id="fAddressNumber" value="${escapeHtml(c.address_number||'')}"></label><label>Complemento<input id="fAddressComplement" value="${escapeHtml(c.address_complement||'')}"></label><label>Bairro<input id="fDistrict" value="${escapeHtml(c.district||'')}"></label><label>Cidade<input id="fCity" value="${escapeHtml(c.city||'')}"></label><label>Estado<input id="fState" maxlength="2" value="${escapeHtml(c.state||'')}"></label><label>Status<select id="fStatus"><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option><option value="BLOCKED">Bloqueado</option></select></label><label class="checkbox"><input id="fOptin" type="checkbox" ${c.marketing_opt_in?'checked':''}> Aceita comunicações</label><label class="span-2">Observações<textarea id="fNotes" rows="3">${escapeHtml(c.notes||'')}</textarea></label><div class="span-2">${formActions(c.id?'Atualizar':'Criar cliente')}</div></form>`,true);bindCancel();if(c.status)document.getElementById('fStatus').value=c.status;
    document.getElementById('clientForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const payload={full_name:val('fFullName').trim(),preferred_name:val('fPreferred').trim()||null,phone:val('fPhone').trim()||null,email:val('fEmail').trim()||null,birth_date:val('fBirth')||null,document_number:val('fDocument').trim()||null,postal_code:val('fPostal').trim()||null,address_line:val('fAddress').trim()||null,address_number:val('fAddressNumber').trim()||null,address_complement:val('fAddressComplement').trim()||null,district:val('fDistrict').trim()||null,city:val('fCity').trim()||null,state:val('fState').trim().toUpperCase()||null,status:val('fStatus'),marketing_opt_in:checked('fOptin'),notes:val('fNotes').trim()||null,source:c.source||'MANUAL'};const res=c.id?await db.from('clients').update(payload).eq('id',c.id).select().single():await db.from('clients').insert(payload).select().single();if(res.error){toast(res.error.message,'error');return;}toast('Cliente salvo.');closeModal();await loadReferenceData();state.selectedClient=res.data;await navigate('clientes');});
  };
})();

;

/* ---- assets/v4.js ---- */
/* Sunshine v3.1 — Cliente 360 na linha + vendas descritas */
(function(){
  const saleTypePt={CONSULTA:'Consulta',PERGUNTA:'Pergunta',TRABALHO:'Trabalho',MENSALIDADE:'Mensalidade',OUTRO:'Outro'};

  function saleDescription(s){
    const work=s.works?.title||s.works?.name||'';
    if(work) return work;
    const notes=String(s.notes||'');
    const historical=notes.match(/Trabalho:\s*([^·]+)/i);
    if(historical?.[1]?.trim()) return historical[1].trim();
    const service=s.services?.name||'';
    if(service) return service;
    return saleTypePt[s.sale_type]||'Venda';
  }

  function saleOriginLabel(s){
    if(String(s.notes||'').startsWith('Histórico 2026')) return 'Histórico importado';
    if(s.source==='ASAAS') return 'Asaas';
    if(s.source==='MANUAL') return 'Lançamento manual';
    return saleTypePt[s.sale_type]||'Venda';
  }

  async function inlineClientDetail(client){
    if(state.demo){
      return `<div class="client-inline"><div class="empty-state compact">Faça login para visualizar o Cliente 360.</div></div>`;
    }
    const [salesQ,timelineQ,apptsQ,oduQ]=await Promise.all([
      safeQuery(db.from('sales').select('id,sold_at,sale_type,total_amount,status,notes,source,services(name),works(title)',{count:'exact'}).eq('client_id',client.id).order('sold_at',{ascending:false}).limit(200)),
      safeQuery(db.from('client_timeline_events').select('id,title,summary,occurred_at,event_type').eq('client_id',client.id).order('occurred_at',{ascending:false}).limit(30)),
      safeQuery(db.from('appointments').select('id',{count:'exact',head:true}).eq('client_id',client.id)),
      safeQuery(db.from('client_odu_profiles').select('id,birth_odu,head_odu,destiny_odu').eq('client_id',client.id).eq('is_current',true).order('calculated_at',{ascending:false}).limit(1))
    ]);
    const sales=salesQ.data||[];
    const saleCount=salesQ.count??sales.length;
    const saleItems=sales.map(s=>`<div class="sale-item"><div class="sale-date">${fmtDate(s.sold_at)}</div><div class="sale-desc"><b>${escapeHtml(saleDescription(s))}</b><small>${escapeHtml(saleOriginLabel(s))}${s.status?` · ${escapeHtml(s.status==='CONFIRMED'?'Confirmada':s.status==='COMPLETED'?'Concluída':s.status==='PENDING'?'Pendente':s.status)}`:''}</small></div><div class="sale-value">${fmtMoney(s.total_amount)}</div></div>`).join('');
    const timeline=(timelineQ.data||[]).map(x=>`<div class="client-timeline-event"><b>${escapeHtml(x.title)}</b> · ${fmtDateTime(x.occurred_at)}${x.summary?` · ${escapeHtml(x.summary)}`:''}</div>`).join('');
    const o=oduQ.data?.[0];
    const oduLabel=o?([o.birth_odu,o.head_odu,o.destiny_odu].filter(Boolean).join(' · ')||'Cadastrado'):'Não cadastrado';
    const locality=[client.city,client.state].filter(Boolean).join(' / ')||'—';
    return `<div class="client-inline">
      <div class="client-inline-head"><div><h3>Cliente 360 · ${escapeHtml(client.full_name)}</h3><p>Abra somente quando precisar consultar ou atualizar este cadastro.</p></div><div class="client-inline-actions"><button class="btn secondary" data-action="edit-client" data-id="${client.id}">Editar cadastro</button><button class="btn ghost" data-action="odu-client" data-id="${client.id}">Odu</button></div></div>
      <div class="client-inline-grid">
        <div class="client-card"><h4>Cadastro</h4><div class="client-profile-grid">
          <div class="client-profile-item"><span>Telefone</span><b>${escapeHtml(client.phone||'—')}</b></div>
          <div class="client-profile-item"><span>Nascimento</span><b>${fmtDate(client.birth_date)}</b></div>
          <div class="client-profile-item"><span>E-mail</span><b>${escapeHtml(client.email||'—')}</b></div>
          <div class="client-profile-item"><span>Localidade</span><b>${escapeHtml(locality)}</b></div>
          <div class="client-profile-item"><span>Atendimentos</span><b>${apptsQ.count||0}</b></div>
          <div class="client-profile-item"><span>Odu</span><b>${escapeHtml(oduLabel)}</b></div>
        </div>${timeline?`<details class="client-timeline-mini"><summary>Ver linha do tempo (${timelineQ.data?.length||0} eventos recentes)</summary><div class="client-timeline-list">${timeline}</div></details>`:''}</div>
        <div class="client-card"><div class="sales-head"><h4>Vendas e serviços contratados</h4><span class="sales-count">${saleCount} ${saleCount===1?'venda':'vendas'}</span></div>${saleItems?`<div class="sale-list">${saleItems}</div>`:'<div class="empty-state compact">Nenhuma venda vinculada a este cliente.</div>'}</div>
      </div>
    </div>`;
  }

  renderClients=async function(){
    const selectedId=state.selectedClient?.id||null;
    const q=state.demo?{data:state.clients}:await safeQuery(db.from('clients').select('*').order('full_name').limit(1000));
    state.clients=q.data||[];
    state.selectedClient=selectedId?state.clients.find(c=>c.id===selectedId)||null:null;
    const expanded=state.selectedClient?await inlineClientDetail(state.selectedClient):'';
    const body=state.clients.length?state.clients.map(c=>{
      const open=state.selectedClient?.id===c.id;
      const main=`<tr class="client-row ${open?'is-open':''}" data-client-toggle-id="${c.id}" data-status="${escapeHtml(c.status||'')}"><td class="client-arrow-cell"><button class="client-expand-btn" type="button" aria-label="${open?'Recolher':'Expandir'} ${escapeHtml(c.full_name)}" aria-expanded="${open?'true':'false'}">${open?'▾':'▸'}</button></td><td><b>${escapeHtml(c.full_name)}</b>${c.preferred_name?`<small>${escapeHtml(c.preferred_name)}</small>`:''}</td><td>${escapeHtml(c.phone||'—')}</td><td>${escapeHtml(c.email||'—')}</td><td>${fmtDate(c.birth_date)}</td><td>${statusPill(c.status)}</td></tr>`;
      return main+(open?`<tr class="client-detail-row" data-client-detail-for="${c.id}"><td colspan="6">${expanded}</td></tr>`:'');
    }).join(''):`<tr class="empty-row"><td colspan="6">Nenhum cliente cadastrado.</td></tr>`;
    return `<article class="panel"><div class="toolbar"><input id="clientSearch" class="field grow" placeholder="Buscar por nome, telefone ou e-mail"><select id="clientStatus" class="select"><option value="">Todos os status</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option><option value="BLOCKED">Bloqueados</option></select><button class="btn" data-action="new-client">+ Novo cliente</button></div><div class="table-wrap"><table class="table client-table-v31" id="clientTable"><thead><tr><th></th><th>Cliente</th><th>Telefone</th><th>E-mail</th><th>Nascimento</th><th>Status</th></tr></thead><tbody>${body}</tbody></table></div></article>`;
  };

  function applyClientFilters(){
    const q=String(document.getElementById('clientSearch')?.value||'').trim().toLowerCase();
    const status=String(document.getElementById('clientStatus')?.value||'');
    document.querySelectorAll('#clientTable tbody .client-row').forEach(row=>{
      const visible=(!q||row.innerText.toLowerCase().includes(q))&&(!status||row.dataset.status===status);
      row.hidden=!visible;
      const detail=document.querySelector(`[data-client-detail-for="${row.dataset.clientToggleId}"]`);
      if(detail)detail.hidden=!visible;
    });
  }

  const previousBindViewActions=bindViewActions;
  bindViewActions=function(){
    previousBindViewActions();
    document.querySelectorAll('[data-client-toggle-id]').forEach(row=>row.addEventListener('click',async e=>{
      if(e.target.closest('[data-action]'))return;
      const id=row.dataset.clientToggleId;
      const oldTop=row.getBoundingClientRect().top;
      state.selectedClient=state.selectedClient?.id===id?null:byId(state.clients,id);
      await render();
      requestAnimationFrame(()=>{
        const replacement=document.querySelector(`[data-client-toggle-id="${id}"]`);
        if(replacement){const newTop=replacement.getBoundingClientRect().top;window.scrollBy(0,newTop-oldTop);}
      });
    }));
    document.getElementById('clientSearch')?.addEventListener('input',applyClientFilters);
    document.getElementById('clientStatus')?.addEventListener('change',applyClientFilters);
  };

  // Daqui para frente toda venda precisa estar classificada em um serviço ou trabalho.
  document.addEventListener('submit',e=>{
    const form=e.target;
    let service='',work='';
    if(form?.id==='quickEntryForm'){service=val('qService');work=val('qWork');}
    else if(form?.id==='asaasResolveForm'){service=val('arService');work=val('arWork');}
    else if(form?.id==='saleForm'){service=val('sService');work=val('sWork');}
    else return;
    if(!service&&!work){
      e.preventDefault();
      e.stopImmediatePropagation();
      toast('Informe o serviço ou o trabalho contratado. Toda venda nova precisa ter um descritivo.','error');
    }
  },true);
})();

;

/* ---- assets/v5.js ---- */
/* Sunshine v3.2 — agenda robusta + histórico de trabalhos com volume/arrecadação */
(function(){
  const monthNames=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const WORK_PT={COLETIVO:'Coletivo',COLETIVO_PREMIUM:'Coletivo premium',PARTICULAR:'Particular'};

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
      <td>${escapeHtml(WORK_PT[w.work_type]||w.work_type||'—')}</td>
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

;

/* ---- assets/v6.js ---- */
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

;

/* ---- assets/v7.js ---- */
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

;

/* ---- assets/v8.js ---- */
/* Sunshine v3.7 — Home com próximos eventos clicáveis no desktop e mobile */
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
      <td><button type="button" class="link-btn" data-open-home-appointment="${a.id}">Abrir evento</button></td>
    </tr>`).join(''):`<tr class="empty-row"><td colspan="6">Nenhum evento futuro agendado.</td></tr>`;

    return `<div class="two"><article class="panel"><div class="section-head"><div><h2>Próximos eventos</h2><p>Consultas, retornos e outros compromissos futuros. Abra o evento para registrar o que foi alinhado e definir o follow-up.</p></div><button class="link-btn" data-go="agenda">Abrir agenda</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Data e hora</th><th>Cliente</th><th>Evento</th><th>Responsável</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></article><article class="panel"><h2>Próximas ações</h2><div class="timeline"><div class="timeline-item"><div class="timeline-dot"></div><div><b>Cliente 360</b><p>Cadastro único conecta consultas, trabalhos e financeiro.</p></div></div><div class="timeline-item"><div class="timeline-dot"></div><div><b>Agenda operacional</b><p>Consultas, trabalhos e retornos no mesmo calendário.</p></div></div><div class="timeline-item"><div class="timeline-dot"></div><div><b>Financeiro integrado</b><p>Venda e pagamento separados com comissão automática.</p></div></div></div></article></div><article class="panel"><div class="section-head"><div><h2>Acesso rápido</h2><p>Ações frequentes em um clique.</p></div></div><div class="quick-grid"><button class="quick action-card" data-action="new-client"><b>Novo cliente</b><span>Criar a identidade central.</span><div class="mini">CLIENTES</div></button><button class="quick action-card" data-action="new-appointment"><b>Agendar consulta</b><span>Registrar data, tipo e responsável.</span><div class="mini">AGENDA</div></button><button class="quick action-card" data-action="new-work"><b>Novo trabalho</b><span>Abrir coletivo, premium ou particular.</span><div class="mini">TRABALHOS</div></button><button class="quick action-card" data-action="new-payment"><b>Lançar pagamento</b><span>Registrar entrada e conciliar venda.</span><div class="mini">FINANCEIRO</div></button></div></article>`;
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

  function openHomeAppointment(id){
    const a=(state.homeAppointments||[]).find(x=>x.id===id);
    if(!a){toast('Não foi possível localizar este evento.','error');return;}
    appointmentModal(a);
  }

  document.addEventListener('click',function(e){
    const button=e.target.closest('[data-open-home-appointment]');
    if(button){
      e.preventDefault(); e.stopPropagation();
      openHomeAppointment(button.dataset.openHomeAppointment);
      return;
    }
    const row=e.target.closest('[data-home-appointment]');
    if(row)openHomeAppointment(row.dataset.homeAppointment);
  },true);
})();

;

/* ---- assets/v9.js ---- */
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

;

/* ---- assets/v10.js ---- */
/* Sunshine v3.9 — controle operacional de comissões pagas / a pagar */
(function(){
  const previousRenderFinance = renderFinance;
  const previousHandleAction = handleAction;

  function memberName(id){ return byId(state.team,id)?.full_name || '—'; }

  async function commissionPanel(){
    if(state.demo) return `<article class="panel"><div class="section-head"><div><h2>Comissões</h2><p>Controle do que está a pagar e do que já foi pago.</p></div></div><div class="empty-state">Faça login para visualizar as comissões.</div></article>`;

    const cq = await safeQuery(
      db.from('commission_entries')
        .select('*')
        .eq('calculation_source','RULE')
        .in('status',['DUE','PAID'])
        .order('created_at',{ascending:false})
        .limit(500)
    );
    const commissions = cq.data || [];

    const allocationIds = [...new Set(commissions.map(c=>c.payment_allocation_id).filter(Boolean))];
    let allocations=[];
    if(allocationIds.length){
      const aq=await safeQuery(db.from('payment_allocations').select('id,sale_id').in('id',allocationIds));
      allocations=aq.data||[];
    }
    const allocationById=Object.fromEntries(allocations.map(a=>[a.id,a]));
    const saleIds=[...new Set(allocations.map(a=>a.sale_id).filter(Boolean))];
    let sales=[];
    if(saleIds.length){
      const sq=await safeQuery(db.from('sales').select('id,client_id,service_id,work_id,sale_type,total_amount,sold_at').in('id',saleIds));
      sales=sq.data||[];
    }
    const saleById=Object.fromEntries(sales.map(s=>[s.id,s]));

    const due=commissions.filter(c=>c.status==='DUE');
    const paid=commissions.filter(c=>c.status==='PAID');
    const dueTotal=due.reduce((a,c)=>a+Number(c.amount||0),0);
    const now=new Date();
    const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
    const paidMonth=paid.filter(c=>c.paid_at && new Date(c.paid_at)>=monthStart).reduce((a,c)=>a+Number(c.amount||0),0);
    const duePeople=new Set(due.map(c=>c.beneficiary_member_id)).size;

    const dueByPerson={};
    due.forEach(c=>dueByPerson[c.beneficiary_member_id]=(dueByPerson[c.beneficiary_member_id]||0)+Number(c.amount||0));
    const personSummary=Object.entries(dueByPerson).sort((a,b)=>b[1]-a[1]).map(([id,total])=>`<span class="pill red">${escapeHtml(memberName(id))}: ${fmtMoney(total)}</span>`).join(' ');

    const rows=commissions.map(c=>{
      const alloc=allocationById[c.payment_allocation_id];
      const sale=alloc?saleById[alloc.sale_id]:null;
      const client=sale?byId(state.clients,sale.client_id):null;
      const service=sale?byId(state.services,sale.service_id):null;
      const work=sale?state.works.find(w=>w.id===sale.work_id):null;
      const origin=work?.title || service?.name || (sale?.sale_type?String(sale.sale_type).replaceAll('_',' '):'Venda relacionada');
      const action=c.status==='DUE'
        ? `<button class="btn secondary" type="button" data-action="commission-paid" data-id="${c.id}">Marcar como pago</button>`
        : `<button class="btn ghost" type="button" data-action="commission-due" data-id="${c.id}">Reabrir</button>`;
      return `<tr>
        <td>${fmtDate(c.created_at)}</td>
        <td><b>${escapeHtml(memberName(c.beneficiary_member_id))}</b><small>Responsável: ${escapeHtml(memberName(c.responsible_member_id))}</small></td>
        <td><b>${escapeHtml(origin)}</b><small>${escapeHtml(client?.full_name||'Cliente não identificado')}</small></td>
        <td>${Number(c.percentage||0).toLocaleString('pt-BR')}%</td>
        <td><b>${fmtMoney(c.amount)}</b></td>
        <td>${statusPill(c.status)}</td>
        <td>${c.paid_at?fmtDateTime(c.paid_at):'—'}</td>
        <td>${action}</td>
      </tr>`;
    }).join('');

    return `<article class="panel" id="commissionControl">
      <div class="section-head"><div><h2>Comissões</h2><p>As comissões novas são geradas automaticamente quando um pagamento confirmado é vinculado a uma venda. O histórico importado não entra neste saldo.</p></div></div>
      ${kpis([['A pagar',fmtMoney(dueTotal),'Comissões operacionais abertas'],['Pago no mês',fmtMoney(paidMonth),'Baixas registradas neste mês'],['Pessoas com saldo',String(duePeople),'Beneficiários com valor a receber']])}
      ${personSummary?`<div class="button-row" style="margin:14px 0">${personSummary}</div>`:''}
      <div class="table-wrap"><table class="table"><thead><tr><th>Gerada</th><th>Beneficiário</th><th>Origem</th><th>%</th><th>Valor</th><th>Status</th><th>Pago em</th><th>Ação</th></tr></thead><tbody>${rows||'<tr class="empty-row"><td colspan="8">Nenhuma comissão operacional gerada ainda.</td></tr>'}</tbody></table></div>
    </article>`;
  }

  renderFinance = async function(){
    const base = await previousRenderFinance();
    return base + await commissionPanel();
  };

  handleAction = async function(action,id){
    if(action==='commission-paid' || action==='commission-due'){
      if(!requireReal()) return;
      const paid=action==='commission-paid';
      const message=paid?'Marcar esta comissão como paga?':'Reabrir esta comissão como a pagar?';
      if(!confirm(message)) return;
      const {error}=await db.rpc('set_commission_payment_status',{p_commission_id:id,p_paid:paid});
      if(error){toast(error.message,'error');return;}
      toast(paid?'Comissão marcada como paga.':'Comissão reaberta como a pagar.');
      await render();
      return;
    }
    return previousHandleAction(action,id);
  };
})();

;

/* ---- assets/v11.js ---- */
/* Sunshine v3.10 — Financeiro compacto: comissões antes de pagamentos/vendas e topo recolhível */
(function(){
  const previousBindViewActions = bindViewActions;

  function ensureFinanceStyle(){
    if(document.getElementById('financeCompactStyle')) return;
    const style=document.createElement('style');
    style.id='financeCompactStyle';
    style.textContent=`
      .finance-fold{padding:0;overflow:hidden}
      .finance-fold>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px;font-weight:800;color:var(--text,#24110B);user-select:none}
      .finance-fold>summary::-webkit-details-marker{display:none}
      .finance-fold>summary:after{content:'▾';font-size:18px;transition:transform .18s ease}
      .finance-fold[open]>summary:after{transform:rotate(180deg)}
      .finance-fold .summary-copy{display:flex;flex-direction:column;gap:3px}
      .finance-fold .summary-copy small{font-weight:500;color:var(--muted,#806b62)}
      .finance-fold-body{padding:0 18px 18px}
      .finance-fold-body>.panel,.finance-fold-body>.kpi-grid,.finance-fold-body>.asaas-banner{margin-top:12px}
      #commissionControl{margin-top:14px}
      @media(max-width:720px){
        .finance-fold>summary{padding:16px}
        .finance-fold-body{padding:0 12px 12px}
      }
    `;
    document.head.appendChild(style);
  }

  function organizeFinance(){
    if(state.view!=='financeiro') return;
    const content=document.getElementById('content');
    const commission=content?.querySelector('#commissionControl');
    if(!content||!commission) return;

    ensureFinanceStyle();

    const paymentSales=Array.from(content.children).find(el=>
      el.classList?.contains('two') &&
      /Pagamentos/i.test(el.textContent||'') &&
      /Vendas/i.test(el.textContent||'')
    );

    if(paymentSales && commission.nextElementSibling!==paymentSales){
      content.insertBefore(commission,paymentSales);
    }

    if(content.querySelector('#financeTopFold')) return;

    const topNodes=[];
    let node=content.firstElementChild;
    while(node && node!==commission){
      const next=node.nextElementSibling;
      topNodes.push(node);
      node=next;
    }

    if(topNodes.length){
      const details=document.createElement('details');
      details.id='financeTopFold';
      details.className='panel finance-fold';
      details.innerHTML=`<summary><span class="summary-copy">Resumo, pendências e lançamentos<small>Abra somente quando precisar consultar indicadores, entradas do Asaas ou fazer um lançamento manual.</small></span></summary><div class="finance-fold-body"></div>`;
      content.insertBefore(details,commission);
      const body=details.querySelector('.finance-fold-body');
      topNodes.forEach(el=>body.appendChild(el));
    }
  }

  bindViewActions=function(){
    previousBindViewActions();
    organizeFinance();
  };
})();

;

/* ---- assets/v12.js ---- */
/* Sunshine v3.11 — clareza de baixa de comissões + menu mobile fecha após navegação */
(function(){
  function closeMobileMenu(){
    const nav=document.getElementById('nav');
    if(nav) nav.classList.remove('is-open');
  }

  // No mobile, selecionar uma seção deve levar direto ao conteúdo, sem deixar o menu aberto.
  document.querySelectorAll('#nav button[data-view]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      closeMobileMenu();
      if(window.matchMedia && window.matchMedia('(max-width: 900px)').matches){
        setTimeout(()=>document.querySelector('main')?.scrollIntoView({block:'start'}),30);
      }
    });
  });

  const previousBindViewActions=bindViewActions;
  bindViewActions=function(){
    previousBindViewActions();

    if(state.view==='financeiro'){
      const panel=document.getElementById('commissionControl');
      if(panel && !panel.querySelector('.commission-howto')){
        const head=panel.querySelector('.section-head');
        const guide=document.createElement('div');
        guide.className='source-note commission-howto';
        guide.style.margin='12px 0 14px';
        guide.innerHTML=`<b>Como dar baixa:</b> quando existir uma comissão aberta, ela aparecerá abaixo com status <b>A pagar</b> e botão <b>Marcar como pago</b>. Ao tocar nesse botão, o sistema muda para <b>Pago</b> e registra automaticamente a data e a hora. Se não houver linha abaixo, não existe comissão operacional nova aguardando pagamento.`;
        if(head) head.insertAdjacentElement('afterend',guide); else panel.prepend(guide);

        const empty=panel.querySelector('tbody .empty-row td');
        if(empty){
          empty.innerHTML='<b>Nenhuma comissão nova a pagar neste momento.</b><br><small>O histórico importado não vira saldo em aberto. Uma comissão nova nasce quando um pagamento confirmado é vinculado a uma venda e o responsável pelo atendimento está definido.</small>';
        }
      }
    }
  };
})();

;

/* ---- assets/v13.js ---- */
/* Sunshine v3.13 — push notifications + realtime Asaas alerts */
(function(){
  let realtimeChannel=null;
  let pushRegistration=null;
  let pushChecked=false;

  function pushSupported(){
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  function b64urlToUint8Array(base64String){
    const padding='='.repeat((4-base64String.length%4)%4);
    const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
    const rawData=atob(base64);
    return Uint8Array.from([...rawData].map(c=>c.charCodeAt(0)));
  }

  async function ensureServiceWorker(){
    if(!pushSupported()) return null;
    if(pushRegistration) return pushRegistration;
    try{
      pushRegistration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
      await navigator.serviceWorker.ready;
      return pushRegistration;
    }catch(err){ console.error('service_worker_error',err); return null; }
  }

  async function currentSubscription(){
    const reg=await ensureServiceWorker();
    if(!reg) return null;
    return await reg.pushManager.getSubscription();
  }

  async function isPushEnabled(){
    if(!pushSupported() || Notification.permission!=='granted') return false;
    return Boolean(await currentSubscription());
  }

  function ensurePushStyles(){
    if(document.getElementById('pushAlertStyles')) return;
    const style=document.createElement('style');
    style.id='pushAlertStyles';
    style.textContent=`
      .push-alert-banner{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;margin-bottom:14px;border:1px solid #F0D5B4;border-radius:16px;background:#FFF8EF}
      .push-alert-banner strong{display:block;color:#5B2E20;margin-bottom:3px}
      .push-alert-banner span{font-size:13px;color:#7A6258}
      .push-alert-banner .btn{white-space:nowrap}
      @media(max-width:720px){.push-alert-banner{align-items:flex-start;flex-direction:column}.push-alert-banner .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  async function renderPushBanner(){
    if(state.demo || state.view!=='home' || !state.session) return;
    ensurePushStyles();
    const content=document.getElementById('content');
    if(!content) return;
    content.querySelector('#pushAlertBanner')?.remove();
    if(!pushSupported()) return;
    const enabled=await isPushEnabled();
    if(enabled) return;
    const denied=Notification.permission==='denied';
    const banner=document.createElement('div');
    banner.id='pushAlertBanner';
    banner.className='push-alert-banner';
    banner.innerHTML=`<div><strong>${denied?'Notificações bloqueadas no navegador':'Receber pagamentos do Asaas no celular'}</strong><span>${denied?'Ative as notificações nas permissões do navegador para receber os alertas.':'Quando um pagamento chegar, a Sunshine avisa mesmo com o aplicativo fechado.'}</span></div>${denied?'':'<button class="btn" type="button" id="enablePushBtn">Ativar notificações</button>'}`;
    content.prepend(banner);
    banner.querySelector('#enablePushBtn')?.addEventListener('click',enablePushNotifications);
  }

  async function enablePushNotifications(){
    if(!requireReal()) return;
    if(!pushSupported()){ toast('Este navegador não suporta notificações push.','error'); return; }
    const permission=await Notification.requestPermission();
    if(permission!=='granted'){
      toast('Permissão de notificações não concedida.','error');
      await renderPushBanner();
      return;
    }
    const reg=await ensureServiceWorker();
    if(!reg){ toast('Não foi possível ativar o serviço de notificações.','error'); return; }
    try{
      const {data:config,error:configError}=await db.functions.invoke('push-config',{body:{}});
      if(configError || !config?.publicKey) throw configError || new Error('Chave pública de push indisponível.');
      let subscription=await reg.pushManager.getSubscription();
      if(!subscription){
        subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64urlToUint8Array(config.publicKey)});
      }
      const json=subscription.toJSON();
      const {error}=await db.from('push_subscriptions').upsert({
        auth_user_id:state.session.user.id,
        endpoint:subscription.endpoint,
        p256dh:json.keys?.p256dh,
        auth:json.keys?.auth,
        user_agent:navigator.userAgent,
        active:true,
        failure_count:0,
        updated_at:new Date().toISOString()
      },{onConflict:'endpoint'});
      if(error) throw error;
      toast('Notificações de pagamentos do Asaas ativadas.');
      await renderPushBanner();
    }catch(err){
      console.error('push_enable_error',err);
      toast(err?.message||'Não foi possível ativar as notificações.','error');
    }
  }

  function startRealtimeNotifications(){
    if(!db || !state.session || realtimeChannel) return;
    realtimeChannel=db.channel('sunshine-app-notifications')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'app_notifications'},payload=>{
        const n=payload.new||{};
        if(n.notification_type==='ASAAS_PAYMENT_RECEIVED'){
          toast(n.body||'Novo pagamento recebido pelo Asaas.');
          if(typeof refreshAsaasBell==='function') refreshAsaasBell();
        }
      })
      .subscribe();
  }

  async function initPushAfterAuth(){
    if(!state.session || state.demo) return;
    await ensureServiceWorker();
    startRealtimeNotifications();
    await renderPushBanner();
    const params=new URLSearchParams(location.search);
    if(params.get('view')==='financeiro'){
      setTimeout(()=>navigate('financeiro'),100);
      history.replaceState({},'',location.pathname);
    }
  }

  const previousBindViewActions=bindViewActions;
  bindViewActions=function(){
    previousBindViewActions();
    setTimeout(renderPushBanner,0);
  };

  navigator.serviceWorker?.addEventListener('message',event=>{
    if(event.data?.type==='OPEN_FINANCEIRO_ASAAS') navigate('financeiro');
  });

  const poll=setInterval(()=>{
    if(state.session && !pushChecked){
      pushChecked=true;
      clearInterval(poll);
      initPushAfterAuth();
    }
  },400);
  setTimeout(()=>clearInterval(poll),20000);
})();

;

/* ---- assets/v14.js ---- */
/* Sunshine v3.15 — histórico + baixas do mês detalhados por beneficiário */
(function(){
  const previousBindViewActions=bindViewActions;

  function commissionMemberName(id){ return byId(state.team,id)?.full_name || '—'; }

  async function refreshCommissionPaidMonth(){
    if(state.demo || state.view!=='financeiro' || !state.session) return;
    const panel=document.getElementById('commissionControl');
    if(!panel) return;

    const now=new Date();
    const start=new Date(now.getFullYear(),now.getMonth(),1);
    const end=new Date(now.getFullYear(),now.getMonth()+1,1);

    const [operational,historical]=await Promise.all([
      safeQuery(db.from('commission_entries')
        .select('amount,beneficiary_member_id')
        .eq('calculation_source','RULE')
        .eq('status','PAID')
        .gte('paid_at',start.toISOString())
        .lt('paid_at',end.toISOString())
        .limit(2000)),
      safeQuery(db.from('commission_entries')
        .select('amount,beneficiary_member_id')
        .eq('calculation_source','IMPORT')
        .eq('status','HISTORICAL')
        .gte('paid_at',start.toISOString())
        .lt('paid_at',end.toISOString())
        .limit(5000))
    ]);

    const operationalRows=operational.data||[];
    const historicalRows=historical.data||[];
    const operationalTotal=operationalRows.reduce((sum,row)=>sum+Number(row.amount||0),0);
    const historicalTotal=historicalRows.reduce((sum,row)=>sum+Number(row.amount||0),0);
    const total=operationalTotal+historicalTotal;

    const paidCard=Array.from(panel.querySelectorAll('.card')).find(card=>/PAGO NO MÊS/i.test(card.textContent||''));
    if(paidCard){
      const value=paidCard.querySelector('.value');
      const foot=paidCard.querySelector('.card-foot');
      if(value) value.textContent=fmtMoney(total);
      if(foot) foot.textContent=historicalTotal>0
        ? 'Histórico pago + baixas operacionais neste mês'
        : 'Baixas operacionais registradas neste mês';
    }

    const byPerson={};
    [...historicalRows,...operationalRows].forEach(row=>{
      const id=row.beneficiary_member_id;
      if(!id) return;
      byPerson[id]=(byPerson[id]||0)+Number(row.amount||0);
    });

    panel.querySelector('#paidMonthByPerson')?.remove();
    if(Object.keys(byPerson).length){
      const block=document.createElement('div');
      block.id='paidMonthByPerson';
      block.className='source-note';
      block.style.margin='14px 0';
      const items=Object.entries(byPerson)
        .sort((a,b)=>b[1]-a[1])
        .map(([id,value])=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:5px 0"><b>${escapeHtml(commissionMemberName(id))}</b><span>${fmtMoney(value)}</span></div>`)
        .join('');
      block.innerHTML=`<b>Pago no mês por pessoa</b><div style="margin-top:7px">${items}</div>`;
      const grid=panel.querySelector('.kpi-grid');
      if(grid) grid.insertAdjacentElement('afterend',block);
    }

    const intro=panel.querySelector('.section-head p');
    if(intro) intro.textContent='As comissões novas são geradas automaticamente quando um pagamento confirmado é vinculado a uma venda. O histórico importado não entra em “A pagar”, mas o que já foi pago no mês entra em “Pago no mês”.';
  }

  bindViewActions=function(){
    previousBindViewActions();
    if(state.view==='financeiro') setTimeout(refreshCommissionPaidMonth,0);
  };
})();

;

/* ---- assets/v15.js ---- */
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

;

/* ---- assets/v16.js ---- */
/* Sunshine v3.16.1 — nenhum pagamento Asaas recebido pode ficar solto */
(function(){
  const previousHandleAction=handleAction;
  const previousBindViewActions=bindViewActions;

  handleAction=async function(action,id){
    if(action==='ignore-asaas'){
      toast('Pagamento recebido pelo Asaas precisa ser associado a um cliente e a um serviço/trabalho. Ele não pode ser ignorado.','error');
      return;
    }
    return previousHandleAction(action,id);
  };

  bindViewActions=function(){
    previousBindViewActions();
    document.querySelectorAll('[data-action="ignore-asaas"]').forEach(btn=>btn.remove());
    const inbox=document.getElementById('asaasInbox');
    if(inbox){
      const p=inbox.querySelector('.section-head p');
      if(p) p.textContent='O dinheiro já entrou. Para concluir, associe obrigatoriamente o cliente e o serviço ou trabalho contratado.';
    }
  };
})();

;

/* ---- assets/v17.js ---- */
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

;

/* ---- assets/v18.js ---- */
/* Sunshine v3.18 — métricas de trabalhos agregadas no banco, sem limite de 1000 linhas */
(function(){
  const monthNames=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const WORK_PT={COLETIVO:'Coletivo',COLETIVO_PREMIUM:'Coletivo premium',PARTICULAR:'Particular'};

  function periodFromTitle18(title){
    const t=String(title||'').toLowerCase();
    for(let i=0;i<monthNames.length;i++){
      if(t.includes(monthNames[i])){
        const y=(t.match(/20\d{2}/)||[])[0];
        if(y)return {label:`${monthNames[i][0].toUpperCase()+monthNames[i].slice(1)}/${y}`,sort:new Date(Number(y),i,28,12,0,0).getTime()};
      }
    }
    return null;
  }
  function workSortDate18(w,lastSale){
    if(w.scheduled_at)return new Date(w.scheduled_at).getTime();
    if(lastSale)return new Date(lastSale).getTime();
    return periodFromTitle18(w.title)?.sort||new Date(w.created_at||0).getTime();
  }
  function workDateLabel18(w,lastSale){
    if(w.scheduled_at)return fmtDate(w.scheduled_at);
    const p=periodFromTitle18(w.title); if(p)return p.label;
    if(lastSale)return new Intl.DateTimeFormat('pt-BR',{month:'short',year:'numeric'}).format(new Date(lastSale));
    return '—';
  }

  renderWorks=async function(){
    if(state.demo){
      return `${kpis([['Trabalhos cadastrados','—','Todos os períodos'],['Abertos','—','Aceitando inscrições'],['Planejados','—','Próximos'],['Concluídos','—','Histórico']])}<article class="panel"><div class="empty-state">Faça login para visualizar os trabalhos.</div></article>`;
    }

    const [wq,mq]=await Promise.all([
      safeQuery(db.from('works').select('*,team_members:responsible_member_id(full_name)').limit(500)),
      safeQuery(db.rpc('get_work_metrics'))
    ]);
    const works=wq.data||[]; state.works=works;
    const metrics={};
    (mq.data||[]).forEach(m=>metrics[m.work_id]={
      volume:Number(m.registrations||0),
      revenue:Number(m.revenue||0),
      lastSale:m.last_sale||null
    });

    works.sort((a,b)=>{
      const ao=a.status==='OPEN'?0:1,bo=b.status==='OPEN'?0:1;
      if(ao!==bo)return ao-bo;
      return workSortDate18(b,metrics[b.id]?.lastSale)-workSortDate18(a,metrics[a.id]?.lastSale);
    });

    const open=works.filter(w=>w.status==='OPEN').length;
    const planned=works.filter(w=>w.status==='PLANNED').length;
    const done=works.filter(w=>w.status==='DONE').length;

    const rows=works.map(w=>{
      const m=metrics[w.id]||{volume:0,revenue:0,lastSale:null};
      return `<tr class="clickable work-metric-row" data-work-id="${w.id}" data-work-type="${escapeHtml(w.work_type||'')}">
        <td><b>${escapeHtml(w.title)}</b>${w.status==='OPEN'?'<small class="open-note">Em aberto · prioridade atual</small>':''}</td>
        <td>${escapeHtml(WORK_PT[w.work_type]||w.work_type||'—')}</td>
        <td>${escapeHtml(workDateLabel18(w,m.lastSale))}</td>
        <td>${w.unit_price!=null?fmtMoney(w.unit_price):'—'}</td>
        <td><b>${m.volume}</b><small>inscrições</small></td>
        <td><b>${fmtMoney(m.revenue)}</b></td>
        <td>${escapeHtml(w.team_members?.full_name||byId(state.team,w.responsible_member_id)?.full_name||'—')}</td>
        <td>${statusPill(w.status)}</td>
      </tr>`;
    }).join('');

    let detail='';
    if(state.selectedWork){
      const w=works.find(x=>x.id===state.selectedWork.id)||state.selectedWork;
      const m=metrics[w.id]||{volume:0,revenue:0,lastSale:null};
      detail=`<article class="panel work-summary-panel"><div class="section-head"><div><h2>${escapeHtml(w.title)}</h2><p>${escapeHtml(workDateLabel18(w,m.lastSale))}</p></div><div class="button-row"><button class="btn" data-action="new-registration" data-id="${w.id}">+ Inscrição</button><button class="btn ghost" data-action="export-registration" data-id="${w.id}">Exportar inscritos</button></div></div><div class="profile-grid"><div><span>Volume</span><b>${m.volume} inscrições</b></div><div><span>Arrecadado</span><b>${fmtMoney(m.revenue)}</b></div><div><span>Valor por participação</span><b>${w.unit_price!=null?fmtMoney(w.unit_price):'—'}</b></div><div><span>Status</span><b>${statusPill(w.status)}</b></div></div></article>`;
    }

    return `${kpis([['Trabalhos cadastrados',String(works.length),'Todos os períodos'],['Abertos',String(open),'Sempre no topo'],['Planejados',String(planned),'Próximos'],['Concluídos',String(done),'Histórico']])}<article class="panel"><div class="toolbar"><input id="workSearch" class="field grow" placeholder="Buscar trabalho"><select id="workTypeFilter" class="select"><option value="">Todos os tipos</option><option value="COLETIVO">Coletivo</option><option value="COLETIVO_PREMIUM">Coletivo premium</option><option value="PARTICULAR">Particular</option></select><button class="btn" data-action="new-work">+ Novo trabalho</button></div><div class="table-wrap"><table class="table work-metrics-table"><thead><tr><th>Trabalho</th><th>Tipo</th><th>Data / período</th><th>Valor</th><th>Volume</th><th>Arrecadado</th><th>Responsável</th><th>Status</th></tr></thead><tbody>${rows||'<tr class="empty-row"><td colspan="8">Nenhum trabalho cadastrado.</td></tr>'}</tbody></table></div></article>${detail}`;
  };
})();

;

/* ---- assets/v19.js ---- */
/* Sunshine v3.19 — Filhos da Casa oficiais + vencimento dia 10 + impressão de listas */
(function(){
  function fmtBirth19(v){
    if(!v)return '—';
    const s=String(v).slice(0,10), p=s.split('-');
    return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:fmtDate(v);
  }

  function printableDocument19(title,subtitle,headers,rows){
    const th=headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('');
    const body=rows.length?rows.map(r=>`<tr>${r.map(v=>`<td>${escapeHtml(v??'')}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">Nenhum registro.</td></tr>`;
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
      @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#24110B;margin:0;font-size:12pt}header{border-bottom:2px solid #B40001;padding-bottom:10px;margin-bottom:18px}h1{font-size:20pt;margin:0 0 4px}.brand{font-weight:700;color:#B40001;font-size:10pt;letter-spacing:.08em;text-transform:uppercase}.sub{color:#665852;margin-top:4px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #d8d1cb;vertical-align:top}th{font-size:9pt;text-transform:uppercase;letter-spacing:.05em;color:#6b5a52}tbody tr{break-inside:avoid}footer{margin-top:16px;color:#7a6c65;font-size:9pt}@media print{button{display:none}}
    </style></head><body><header><div class="brand">Sunshine Oráculos</div><h1>${escapeHtml(title)}</h1><div class="sub">${escapeHtml(subtitle||'')}</div></header><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table><footer>Ecossistema Sunshine · lista gerada em ${new Date().toLocaleString('pt-BR')}</footer></body></html>`;
  }

  async function printHouseRoster19(){
    if(state.demo){toast('Sem dados para imprimir.','error');return;}
    const win=window.open('','_blank');
    if(!win){toast('Permita a abertura da janela de impressão.','error');return;}
    win.document.write('<p style="font-family:Arial;padding:20px">Preparando lista…</p>');
    const {data,error}=await db.from('house_members').select('billing_exempt,status,clients(full_name,birth_date)').eq('status','ACTIVE');
    if(error){win.close();toast(error.message,'error');return;}
    const list=(data||[]).sort((a,b)=>(a.clients?.full_name||'').localeCompare(b.clients?.full_name||'','pt-BR'));
    const rows=list.map(h=>[h.clients?.full_name||'—',fmtBirth19(h.clients?.birth_date)]);
    win.document.open();win.document.write(printableDocument19('Filhos da Casa','Nomes completos e datas de nascimento',['Nome completo','Data de nascimento'],rows));win.document.close();
    setTimeout(()=>{win.focus();win.print();},250);
  }

  async function getWorkPrintData19(workId){
    const {data,error}=await db.from('work_registrations')
      .select('participant_name,participant_birth_date,loved_person_name,rival_name,status,clients(full_name,birth_date)')
      .eq('work_id',workId).neq('status','CANCELLED').order('created_at');
    if(error)throw error;
    return data||[];
  }

  async function printWorkRoster19(workId){
    if(state.demo){toast('Sem dados para imprimir.','error');return;}
    const win=window.open('','_blank');
    if(!win){toast('Permita a abertura da janela de impressão.','error');return;}
    win.document.write('<p style="font-family:Arial;padding:20px">Preparando lista…</p>');
    try{
      const regs=await getWorkPrintData19(workId);
      const work=(state.works||[]).find(w=>w.id===workId)||state.selectedWork||{};
      const hasLoved=regs.some(r=>String(r.loved_person_name||'').trim());
      const hasRival=regs.some(r=>String(r.rival_name||'').trim());
      const headers=['Nome completo','Data de nascimento'];
      if(hasLoved)headers.push('Pessoa amada');
      if(hasRival)headers.push('Rival');
      const rows=regs.map(r=>{
        const row=[r.clients?.full_name||r.participant_name||'—',fmtBirth19(r.participant_birth_date||r.clients?.birth_date)];
        if(hasLoved)row.push(r.loved_person_name||'—');
        if(hasRival)row.push(r.rival_name||'—');
        return row;
      });
      const subtitle=[work.scheduled_at?fmtDateTime(work.scheduled_at):'',work.work_type||''].filter(Boolean).join(' · ');
      win.document.open();win.document.write(printableDocument19(work.title||'Trabalho Sunshine',subtitle,headers,rows));win.document.close();
      setTimeout(()=>{win.focus();win.print();},250);
    }catch(e){win.close();toast(e.message||'Erro ao preparar impressão.','error');}
  }

  // CSV continua disponível, agora usando também o nascimento canônico do Cliente 360.
  exportRegistrations=async function(workId){
    if(state.demo){toast('Sem dados para exportar.','error');return;}
    try{
      const data=await getWorkPrintData19(workId);
      const rows=[['Nome','Nascimento','Pessoa amada','Rival','Status'],...data.map(r=>[
        r.clients?.full_name||r.participant_name||'',
        r.participant_birth_date||r.clients?.birth_date||'',
        r.loved_person_name||'',r.rival_name||'',r.status||''
      ])];
      const csv='\ufeff'+rows.map(row=>row.map(x=>`"${String(x).replaceAll('"','""')}"`).join(';')).join('\n');
      const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='inscritos-sunshine.csv';a.click();URL.revokeObjectURL(a.href);
    }catch(e){toast(e.message||'Erro ao exportar lista.','error');}
  };

  renderHouse=async function(){
    const q=state.demo?{data:[]}:await safeQuery(db.from('house_members').select('*,clients(full_name,phone,email,birth_date)'));
    const list=(q.data||[]).sort((a,b)=>(a.clients?.full_name||'').localeCompare(b.clients?.full_name||'','pt-BR'));
    const rows=list.length?list.map(h=>`<tr>
      <td><b>${escapeHtml(h.clients?.full_name||'—')}</b></td>
      <td>${escapeHtml(fmtBirth19(h.clients?.birth_date))}</td>
      <td>${escapeHtml(h.clients?.phone||'—')}</td>
      <td>${h.billing_exempt?'<span class="pill gold">ISENTO</span>':`Dia ${Number(h.billing_due_day||10)}`}</td>
      <td>${h.billing_exempt?'<span class="pill gold">ISENTO</span>':fmtMoney(h.monthly_fee)}</td>
      <td>${statusPill(h.status)}</td>
    </tr>`).join(''):`<tr class="empty-row"><td colspan="6">Nenhum Filho da Casa cadastrado.</td></tr>`;
    return `<article class="panel"><div class="section-head"><div><h2>Filhos da Casa</h2><p>${list.length} pessoas vinculadas ao Cliente 360.</p></div><div class="button-row"><button class="btn ghost" type="button" data-print-house>Imprimir nomes</button><button class="btn" data-action="new-house">+ Novo vínculo</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Nascimento</th><th>Telefone</th><th>Vencimento</th><th>Mensalidade</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></article><article class="panel"><div class="note"><b>Regra da mensalidade:</b> pagamento até o dia 10 de cada mês. O módulo Filhos da Casa não cria movimentação financeira. O recebimento entra somente pelo Asaas ou por lançamento manual no Financeiro e é associado ao serviço Mensalidade Filho da Casa. Cassia Schunck, Edson Carlos Rodrigues e Isabella Schunck Martins são exceções permanentes e aparecem como <b>ISENTO</b>.</div></article>`;
  };

  houseModal=function(){
    openModal('Vincular Filho da Casa',`<form id="houseForm" class="form-grid"><label class="span-2">Cliente<select id="hClient" required>${optionList(state.clients,'full_name')}</select></label><label>Data de entrada<input id="hJoined" type="date"></label><label>Mensalidade<input id="hFee" type="number" step="0.01" value="200"></label><div class="note span-2"><b>Vencimento padrão:</b> dia 10 de cada mês. Pagamentos são registrados somente no Financeiro/Asaas.</div><label>Status<select id="hStatus"><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option><option value="SUSPENDED">Suspenso</option></select></label><label class="span-2">Observações<textarea id="hNotes" rows="3"></textarea></label><div class="span-2">${formActions('Criar vínculo')}</div></form>`);
    bindCancel();document.getElementById('houseForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const {error}=await db.from('house_members').insert({client_id:val('hClient'),joined_at:val('hJoined')||null,monthly_fee:Number(val('hFee')||200),billing_due_day:10,status:val('hStatus'),notes:val('hNotes')||null});if(error){toast(error.message,'error');return;}toast('Vínculo criado.');closeModal();await render();});
  };

  const previousRenderWorks19=renderWorks;
  renderWorks=async function(){
    let html=await previousRenderWorks19();
    if(state.selectedWork?.id){
      html=html.replace('Exportar inscritos</button>',`Exportar inscritos</button><button class="btn ghost" type="button" data-print-work="${state.selectedWork.id}">Imprimir lista</button>`);
    }
    return html;
  };

  document.addEventListener('click',e=>{
    const house=e.target.closest('[data-print-house]');
    if(house){e.preventDefault();e.stopPropagation();printHouseRoster19();return;}
    const work=e.target.closest('[data-print-work]');
    if(work){e.preventDefault();e.stopPropagation();printWorkRoster19(work.dataset.printWork);}
  },true);
})();

;

/* ---- assets/v20.js ---- */
/* Sunshine v3.20 — detalhe de trabalho clicável no desktop/mobile */
(function(){
  function birth20(v){
    if(!v)return '—';
    const s=String(v).slice(0,10),p=s.split('-');
    return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:fmtDate(v);
  }
  function statusPt20(v){
    const m={REGISTERED:'Inscrito',CONFIRMED:'Confirmado',DONE:'Concluído',CANCELLED:'Cancelado'};
    return m[v]||v||'—';
  }

  async function openWorkDetail20(workId){
    if(state.demo){toast('Faça login para abrir os inscritos.','error');return;}
    const work=(state.works||[]).find(w=>w.id===workId);
    if(!work){toast('Trabalho não encontrado.','error');return;}
    state.selectedWork=work;

    openModal(work.title,`<div class="empty-state"><span class="spinner"></span>Carregando inscritos…</div>`,true);
    const [regsQ,metricsQ]=await Promise.all([
      db.from('work_registrations')
        .select('id,participant_name,participant_birth_date,loved_person_name,rival_name,status,clients(full_name,birth_date)')
        .eq('work_id',workId).neq('status','CANCELLED').order('created_at'),
      db.rpc('get_work_metrics')
    ]);
    if(regsQ.error){closeModal();toast(regsQ.error.message,'error');return;}
    const regs=regsQ.data||[];
    const metric=(metricsQ.data||[]).find(m=>m.work_id===workId)||{};
    const rows=regs.length?regs.map(r=>`<tr>
      <td><b>${escapeHtml(r.clients?.full_name||r.participant_name||'—')}</b></td>
      <td>${escapeHtml(birth20(r.participant_birth_date||r.clients?.birth_date))}</td>
      <td>${escapeHtml(r.loved_person_name||'—')}</td>
      <td>${escapeHtml(r.rival_name||'—')}</td>
      <td>${escapeHtml(statusPt20(r.status))}</td>
    </tr>`).join(''):`<tr class="empty-row"><td colspan="5">Nenhum inscrito neste trabalho.</td></tr>`;

    const root=document.getElementById('modalRoot');
    const body=root?.querySelector('.modal-body');
    if(!body)return;
    body.innerHTML=`
      <div class="work-detail-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <button class="btn" type="button" data-v20-register="${workId}">+ Inscrição</button>
        <button class="btn ghost" type="button" data-print-work="${workId}">Imprimir lista</button>
        <button class="btn ghost" type="button" data-v20-export="${workId}">Exportar inscritos</button>
      </div>
      ${kpis([
        ['Inscritos',String(Number(metric.registrations||regs.length)),'Participantes'],
        ['Arrecadado',fmtMoney(metric.revenue||0),'Vendas vinculadas'],
        ['Valor',work.unit_price!=null?fmtMoney(work.unit_price):'—','Por participação'],
        ['Status',escapeHtml(work.status||'—'),'Situação do trabalho']
      ])}
      <div class="table-wrap" style="margin-top:14px">
        <table class="table">
          <thead><tr><th>Nome completo</th><th>Nascimento</th><th>Pessoa amada</th><th>Rival</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  document.addEventListener('click',e=>{
    const row=e.target.closest('.work-metric-row[data-work-id]');
    if(row && !e.target.closest('button,a,input,select')){
      e.preventDefault();e.stopPropagation();openWorkDetail20(row.dataset.workId);return;
    }
    const reg=e.target.closest('[data-v20-register]');
    if(reg){
      e.preventDefault();e.stopPropagation();
      const w=(state.works||[]).find(x=>x.id===reg.dataset.v20Register);
      closeModal();setTimeout(()=>registrationModal(w),0);return;
    }
    const exp=e.target.closest('[data-v20-export]');
    if(exp){e.preventDefault();e.stopPropagation();exportRegistrations(exp.dataset.v20Export);return;}
  },true);

  // Sinal visual explícito de que o nome abre o trabalho.
  const prevRenderWorks20=renderWorks;
  renderWorks=async function(){
    const html=await prevRenderWorks20();
    setTimeout(()=>{
      document.querySelectorAll('.work-metric-row[data-work-id]').forEach(row=>{
        row.style.cursor='pointer';
        const first=row.querySelector('td:first-child b');
        if(first){first.style.textDecoration='underline';first.style.textDecorationColor='#B40001';first.style.textUnderlineOffset='3px';}
      });
    },0);
    return html;
  };
})();

;

/* ---- assets/v21.js ---- */
/* Sunshine v3.21 — marca Sunshine sempre retorna para a Home */
(function(){
  function goHomeFromBrand(){
    if(typeof navigate==='function'){
      navigate('home');
    }
    const nav=document.getElementById('nav');
    if(nav)nav.classList.remove('is-open');
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function enableBrandHomeLink(){
    const brand=document.querySelector('.sidebar .brand');
    if(!brand || brand.dataset.homeLinkBound==='1')return;
    brand.dataset.homeLinkBound='1';
    brand.setAttribute('role','link');
    brand.setAttribute('tabindex','0');
    brand.setAttribute('aria-label','Ir para a Home');
    brand.setAttribute('title','Ir para a Home');
    brand.style.cursor='pointer';
    brand.addEventListener('click',goHomeFromBrand);
    brand.addEventListener('keydown',e=>{
      if(e.key==='Enter' || e.key===' '){
        e.preventDefault();
        goHomeFromBrand();
      }
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enableBrandHomeLink);
  else enableBrandHomeLink();
})();

;

/* ---- assets/v22.js ---- */
/* Sunshine v3.22 — aplica escopo visual da Home */
(function(){
  const previousRenderHome22=renderHome;
  renderHome=async function(){
    return `<div class="home-view-v22">${await previousRenderHome22()}</div>`;
  };
})();

;

/* ---- assets/v24.js ---- */
/* Sunshine v3.24 — custos por trabalho + resultado somente após revisão */
(function(){
  const isAdmin24=()=>state.member?.role==='ADMIN';
  const money24=v=>fmtMoney(Number(v||0));
  const dateInput24=v=>{ if(!v)return new Date().toISOString().slice(0,10); return String(v).slice(0,10); };

  async function fetchWorkDetail24(workId){
    const [workQ,regsQ,metricsQ,expensesQ,costItemsQ]=await Promise.all([
      db.from('works').select('*').eq('id',workId).maybeSingle(),
      db.from('work_registrations').select('id,participant_name,participant_birth_date,loved_person_name,rival_name,status,clients(full_name,birth_date)').eq('work_id',workId).neq('status','CANCELLED').order('created_at'),
      db.rpc('get_work_metrics'),
      db.from('work_expenses').select('id,work_id,cost_item_id,description,amount,expense_date,source,notes,cost_items(name)').eq('work_id',workId).order('expense_date',{ascending:false}).order('created_at',{ascending:false}),
      db.from('cost_items').select('id,name,active').eq('active',true).order('name')
    ]);
    if(workQ.error)throw workQ.error;
    if(regsQ.error)throw regsQ.error;
    if(expensesQ.error)throw expensesQ.error;
    if(costItemsQ.error)throw costItemsQ.error;
    const work=workQ.data;
    const regs=regsQ.data||[];
    const metric=(metricsQ.data||[]).find(m=>m.work_id===workId)||{};
    const expenses=expensesQ.data||[];
    const totalCosts=expenses.reduce((sum,x)=>sum+Number(x.amount||0),0);
    const revenue=Number(metric.revenue||0);
    return {work,regs,metric,expenses,costItems:costItemsQ.data||[],totalCosts,revenue};
  }

  function birth24(v){
    if(!v)return '—';
    const p=String(v).slice(0,10).split('-');
    return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:fmtDate(v);
  }

  function expenseRows24(d){
    if(!d.expenses.length)return '<tr class="empty-row"><td colspan="6">Nenhum custo lançado. Isso não significa custo zero: revise o trabalho antes de fechar o resultado.</td></tr>';
    return d.expenses.map(x=>`<tr>
      <td>${fmtDate(x.expense_date)}</td>
      <td>${escapeHtml(x.cost_items?.name||'Outros')}</td>
      <td><b>${escapeHtml(x.description)}</b>${x.notes?`<small>${escapeHtml(x.notes)}</small>`:''}</td>
      <td><b>${money24(x.amount)}</b></td>
      <td>${escapeHtml(x.source||'MANUAL')}</td>
      <td><div class="button-row"><button class="link-btn" type="button" data-edit-work-cost="${x.id}" data-work-id="${d.work.id}">Editar</button>${isAdmin24()?`<button class="link-btn danger-link" type="button" data-delete-work-cost="${x.id}" data-work-id="${d.work.id}">Excluir</button>`:''}</div></td>
    </tr>`).join('');
  }

  function registrationRows24(d){
    if(!d.regs.length)return '<tr class="empty-row"><td colspan="5">Nenhum inscrito neste trabalho.</td></tr>';
    return d.regs.map(r=>`<tr><td><b>${escapeHtml(r.clients?.full_name||r.participant_name||'—')}</b></td><td>${escapeHtml(birth24(r.participant_birth_date||r.clients?.birth_date))}</td><td>${escapeHtml(r.loved_person_name||'—')}</td><td>${escapeHtml(r.rival_name||'—')}</td><td>${escapeHtml(r.status||'—')}</td></tr>`).join('');
  }

  async function openWorkDetail24(workId){
    if(state.demo){toast('Faça login para abrir o trabalho.','error');return;}
    openModal('Trabalho',`<div class="empty-state"><span class="spinner"></span>Carregando trabalho…</div>`,true);
    try{
      const d=await fetchWorkDetail24(workId);
      if(!d.work)throw new Error('Trabalho não encontrado.');
      state.selectedWork=d.work;
      const reviewed=Boolean(d.work.costs_reviewed);
      const result=reviewed?d.revenue-d.totalCosts:null;
      const body=document.querySelector('#modalRoot .modal-body');
      const title=document.querySelector('#modalRoot .modal-head h2');
      if(title)title.textContent=d.work.title;
      if(!body)return;
      body.innerHTML=`
        <div class="work-detail-actions">
          <button class="btn" type="button" data-v20-register="${workId}">+ Inscrição</button>
          <button class="btn ghost" type="button" data-print-work="${workId}">Imprimir lista</button>
          <button class="btn ghost" type="button" data-v20-export="${workId}">Exportar inscritos</button>
        </div>
        ${kpis([
          ['Inscritos',String(Number(d.metric.registrations||d.regs.length)),'Participantes'],
          ['Arrecadado',money24(d.revenue),'Vendas vinculadas'],
          ['Custos diretos',money24(d.totalCosts),reviewed?'Custos revisados':'Ainda não revisados'],
          ['Resultado',reviewed?money24(result):'Aguardando custos',reviewed?'Arrecadação menos custos diretos':'Não fecha até revisar os custos']
        ])}
        <section class="work-cost-panel">
          <div class="section-head"><div><h2>Custos do trabalho</h2><p>Lance aqui todo gasto diretamente atribuível a este trabalho. Comissão continua controlada separadamente no Financeiro.</p></div><div class="button-row"><button class="btn secondary" type="button" data-add-work-cost="${workId}">+ Adicionar custo</button>${isAdmin24()?`<button class="btn ${reviewed?'ghost':'secondary'}" type="button" data-review-work-costs="${workId}" data-reviewed="${reviewed?'1':'0'}">${reviewed?'Reabrir revisão':'Confirmar custos revisados'}</button>`:''}</div></div>
          <div class="cost-review-status ${reviewed?'is-reviewed':'is-pending'}"><b>${reviewed?'Custos revisados':'Custos ainda não revisados'}</b><span>${reviewed?`Fechado em ${fmtDateTime(d.work.costs_reviewed_at)}`:'O Dashboard não tratará esse resultado como definitivo até a revisão.'}</span></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Origem</th><th></th></tr></thead><tbody>${expenseRows24(d)}</tbody></table></div>
          <div class="work-cost-total"><span>Total de custos diretos</span><b>${money24(d.totalCosts)}</b></div>
        </section>
        <section class="work-registrations-panel">
          <div class="section-head"><div><h2>Inscritos</h2><p>Nomes utilizados na execução e impressão do trabalho.</p></div></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Nome completo</th><th>Nascimento</th><th>Pessoa amada</th><th>Rival</th><th>Status</th></tr></thead><tbody>${registrationRows24(d)}</tbody></table></div>
        </section>`;
    }catch(e){closeModal();toast(e.message||'Erro ao abrir trabalho.','error');}
  }

  async function costModal24(workId,costId){
    const d=await fetchWorkDetail24(workId);
    const current=costId?d.expenses.find(x=>x.id===costId):null;
    const options=d.costItems.map(x=>`<option value="${x.id}" ${current?.cost_item_id===x.id?'selected':''}>${escapeHtml(x.name)}</option>`).join('');
    openModal(current?'Editar custo':'Adicionar custo',`<form id="workCostForm" class="form-grid">
      <label>Categoria<select id="wcItem"><option value="">Outros</option>${options}</select></label>
      <label>Data<input id="wcDate" type="date" value="${dateInput24(current?.expense_date)}" required></label>
      <label class="span-2">Descrição<input id="wcDescription" value="${escapeHtml(current?.description||'')}" placeholder="Ex.: velas, flores, transporte, material…" required></label>
      <label>Valor<input id="wcAmount" type="number" min="0" step="0.01" value="${current?Number(current.amount||0):''}" required></label>
      <label>Origem<select id="wcSource"><option value="MANUAL" ${!current||current.source==='MANUAL'?'selected':''}>Manual</option><option value="IMPORT" ${current?.source==='IMPORT'?'selected':''}>Importado</option><option value="ASAAS" ${current?.source==='ASAAS'?'selected':''}>Asaas</option></select></label>
      <label class="span-2">Observações<textarea id="wcNotes" rows="3">${escapeHtml(current?.notes||'')}</textarea></label>
      <div class="note span-2"><b>Regra:</b> qualquer inclusão ou edição reabre automaticamente a revisão dos custos. O resultado só volta a ser considerado fechado depois da confirmação da administradora.</div>
      <div class="span-2">${formActions(current?'Salvar custo':'Adicionar custo')}</div>
    </form>`,true);
    bindCancel();
    document.getElementById('workCostForm').addEventListener('submit',async e=>{
      e.preventDefault(); if(!requireReal())return;
      const payload={work_id:workId,cost_item_id:val('wcItem')||null,description:val('wcDescription').trim(),amount:Number(val('wcAmount')||0),expense_date:val('wcDate'),source:val('wcSource')||'MANUAL',notes:val('wcNotes')||null};
      if(!payload.description||payload.amount<0){toast('Informe descrição e valor válidos.','error');return;}
      const q=current?await db.from('work_expenses').update(payload).eq('id',current.id):await db.from('work_expenses').insert(payload);
      if(q.error){toast(q.error.message,'error');return;}
      const r=await db.from('works').update({costs_reviewed:false,costs_reviewed_at:null,costs_reviewed_by:null}).eq('id',workId);
      if(r.error){toast(r.error.message,'error');return;}
      toast(current?'Custo atualizado. Revisão reaberta.':'Custo adicionado. Revisão pendente.');
      closeModal(); setTimeout(()=>openWorkDetail24(workId),0);
    });
  }

  async function deleteCost24(workId,costId){
    if(!isAdmin24()){toast('Apenas a administradora pode excluir custos.','error');return;}
    if(!confirm('Excluir este custo do trabalho?'))return;
    const q=await db.from('work_expenses').delete().eq('id',costId);
    if(q.error){toast(q.error.message,'error');return;}
    await db.from('works').update({costs_reviewed:false,costs_reviewed_at:null,costs_reviewed_by:null}).eq('id',workId);
    toast('Custo excluído. Revisão reaberta.');
    closeModal(); setTimeout(()=>openWorkDetail24(workId),0);
  }

  async function toggleReview24(workId,isReviewed){
    if(!isAdmin24()){toast('Apenas a administradora pode fechar a revisão dos custos.','error');return;}
    if(!isReviewed){
      const d=await fetchWorkDetail24(workId);
      if(!d.expenses.length && !confirm('Nenhum custo foi lançado. Confirma que este trabalho realmente teve R$ 0,00 de custos diretos?'))return;
      const q=await db.from('works').update({costs_reviewed:true,costs_reviewed_at:new Date().toISOString(),costs_reviewed_by:state.member.id}).eq('id',workId);
      if(q.error){toast(q.error.message,'error');return;}
      toast('Custos revisados. O resultado agora pode ser considerado fechado.');
    }else{
      const q=await db.from('works').update({costs_reviewed:false,costs_reviewed_at:null,costs_reviewed_by:null}).eq('id',workId);
      if(q.error){toast(q.error.message,'error');return;}
      toast('Revisão reaberta. O resultado volta a ficar pendente.');
    }
    closeModal(); setTimeout(()=>openWorkDetail24(workId),0);
  }

  const previousRenderWorks24=renderWorks;
  renderWorks=async function(){
    const html=await previousRenderWorks24();
    return html.replaceAll('work-metric-row','work-metric-row-v24');
  };

  renderDashboard=async function(){
    if(state.demo)return kpis([['Faturamento mês','—','Pagamentos confirmados'],['Vendas','—','Confirmadas/concluídas'],['Ticket médio','—','Valor médio por venda'],['Comissões a pagar','—','Lançamentos DUE']])+`<article class="panel"><div class="empty-state">Faça login para visualizar os indicadores.</div></article>`;
    const [ms,me]=monthRange();
    const [payments,sales,commissions,worksQ,expensesQ]=await Promise.all([
      safeQuery(db.from('payments').select('gross_amount').eq('status','PAID').gte('paid_at',ms).lt('paid_at',me)),
      safeQuery(db.from('sales').select('id,total_amount,work_id').gte('sold_at',ms).lt('sold_at',me).in('status',['CONFIRMED','COMPLETED'])),
      safeQuery(db.from('commission_entries').select('amount').eq('status','DUE')),
      safeQuery(db.from('works').select('id,title,costs_reviewed,costs_reviewed_at')),
      safeQuery(db.from('work_expenses').select('work_id,amount'))
    ]);
    const revenue=(payments.data||[]).reduce((s,x)=>s+Number(x.gross_amount||0),0);
    const saleCount=sales.data?.length||0;
    const salesTotal=(sales.data||[]).reduce((s,x)=>s+Number(x.total_amount||0),0);
    const ticket=saleCount?salesTotal/saleCount:0;
    const due=(commissions.data||[]).reduce((s,x)=>s+Number(x.amount||0),0);
    const workById=Object.fromEntries((worksQ.data||[]).map(w=>[w.id,w]));
    const revenueByWork={}; (sales.data||[]).forEach(s=>{if(s.work_id)revenueByWork[s.work_id]=(revenueByWork[s.work_id]||0)+Number(s.total_amount||0);});
    const costByWork={}; (expensesQ.data||[]).forEach(x=>costByWork[x.work_id]=(costByWork[x.work_id]||0)+Number(x.amount||0));
    const rows=Object.entries(revenueByWork).map(([id,rev])=>{
      const w=workById[id]||{title:'Trabalho'}; const cost=costByWork[id]||0; const reviewed=Boolean(w.costs_reviewed);
      return `<tr><td><b>${escapeHtml(w.title)}</b></td><td>${money24(rev)}</td><td>${reviewed?money24(cost):`<span class="cost-pending-text">${cost?money24(cost)+' · ':''}não revisado</span>`}</td><td>${reviewed?`<b>${money24(rev-cost)}</b>`:'<span class="pill gold">Aguardando custos</span>'}</td></tr>`;
    }).join('')||'<tr class="empty-row"><td colspan="4">Nenhuma venda de trabalho no período.</td></tr>';
    return `${kpis([['Faturamento mês',money24(revenue),'Pagamentos confirmados'],['Vendas',String(saleCount),'Confirmadas/concluídas'],['Ticket médio',money24(ticket),'Valor médio por venda'],['Comissões a pagar',money24(due),'Lançamentos DUE']])}
      <div class="two dashboard-result-grid"><article class="panel"><div class="section-head"><div><h2>Resultado após custos diretos</h2><p>Arrecadação menos despesas atribuídas ao trabalho. Só fecha após revisão dos custos.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Trabalho</th><th>Receita</th><th>Custos diretos</th><th>Resultado</th></tr></thead><tbody>${rows}</tbody></table></div></article>
      <article class="panel"><h2>Leitura executiva</h2><div class="note"><b>Resultado não é presumido.</b><br>Se um trabalho ainda não teve os custos revisados, o Dashboard mostra <b>Aguardando custos</b> em vez de assumir custo zero. Para lançar despesas, abra o trabalho na aba Trabalhos.</div><div class="note dashboard-cost-note"><b>Comissões:</b> permanecem separadas no Financeiro e não são descontadas aqui automaticamente, evitando dupla contagem.</div></article></div>`;
  };

  document.addEventListener('click',e=>{
    const row=e.target.closest('.work-metric-row-v24[data-work-id]');
    if(row && !e.target.closest('button,a,input,select')){e.preventDefault();e.stopPropagation();openWorkDetail24(row.dataset.workId);return;}
    const add=e.target.closest('[data-add-work-cost]'); if(add){e.preventDefault();e.stopPropagation();costModal24(add.dataset.addWorkCost);return;}
    const edit=e.target.closest('[data-edit-work-cost]'); if(edit){e.preventDefault();e.stopPropagation();costModal24(edit.dataset.workId,edit.dataset.editWorkCost);return;}
    const del=e.target.closest('[data-delete-work-cost]'); if(del){e.preventDefault();e.stopPropagation();deleteCost24(del.dataset.workId,del.dataset.deleteWorkCost);return;}
    const review=e.target.closest('[data-review-work-costs]'); if(review){e.preventDefault();e.stopPropagation();toggleReview24(review.dataset.reviewWorkCosts,review.dataset.reviewed==='1');return;}
  },true);
})();
;

/* ---- assets/v25.js ---- */
/* Sunshine v3.25 — pendências Asaas globais e associação em qualquer tela */
(function(){
  const initialAsaasDeepLink=new URLSearchParams(location.search).get('asaas')==='pending';
  let pendingCache25=[];
  let overlay25=null;
  let observer25=null;
  let realtime25=null;

  const digits25=v=>String(v||'').replace(/\D/g,'');
  const statusPt25=v=>({RECEIVED:'Recebido',CONFIRMED:'Confirmado',PENDING:'Pendente',OVERDUE:'Vencido',REFUNDED:'Estornado',PIX:'PIX',CREDIT_CARD:'Cartão',BOLETO:'Boleto'}[v]||v||'—');

  function matchClient25(e){
    if(e.matched_client_id) return byId(state.clients,e.matched_client_id)||null;
    const doc=digits25(e.customer_document);
    const email=String(e.customer_email||'').trim().toLowerCase();
    const phone=digits25(e.customer_mobile_phone||e.customer_phone);
    return state.clients.find(c=>doc&&digits25(c.document_number)===doc)
      ||state.clients.find(c=>email&&String(c.email||'').trim().toLowerCase()===email)
      ||state.clients.find(c=>phone&&digits25(c.phone)===phone)
      ||null;
  }

  async function fetchPending25(){
    if(state.demo||!state.session||!db){ pendingCache25=[]; return pendingCache25; }
    const {data,error}=await db.from('asaas_incoming_payments')
      .select('*')
      .in('classification_status',['PENDING','REVIEW'])
      .order('received_at',{ascending:false})
      .limit(100);
    if(error){ console.error('asaas_pending_global',error); return pendingCache25; }
    pendingCache25=data||[];
    return pendingCache25;
  }

  function removeLegacyHomeBanner25(){
    const content=document.getElementById('content');
    if(!content)return;
    Array.from(content.querySelectorAll('.asaas-banner')).forEach(el=>{
      const txt=(el.textContent||'').toLowerCase();
      if(txt.includes('aguardando registro')&&txt.includes('asaas')) el.remove();
    });
  }

  function ensureGlobalBar25(entries){
    const main=document.querySelector('main');
    const content=document.getElementById('content');
    if(!main||!content)return;
    let bar=document.getElementById('globalAsaasPendingBar');
    if(!entries.length){ bar?.remove(); return; }
    if(!bar){
      bar=document.createElement('section');
      bar.id='globalAsaasPendingBar';
      bar.className='asaas-global-bar';
      main.insertBefore(bar,content);
    }
    const total=entries.reduce((s,e)=>s+Number(e.gross_amount||0),0);
    const first=entries[0];
    bar.innerHTML=`<div class="asaas-global-bar-copy">
      <span class="asaas-global-kicker">PAGAMENTO RECEBIDO · FALTA ASSOCIAR</span>
      <strong>${entries.length===1?escapeHtml(first.customer_name||'Cliente não identificado'):`${entries.length} pagamentos aguardando associação`}</strong>
      <span>${entries.length===1?`${fmtMoney(first.gross_amount)} · ${escapeHtml(statusPt25(first.billing_type))}`:`Total pendente de classificação: ${fmtMoney(total)}`}. Associe a uma pessoa e ao serviço/trabalho correto.</span>
    </div><button type="button" class="btn" data-asaas-open-queue>Associar agora</button>`;
  }

  function updateBell25(entries){
    const bell=document.getElementById('asaasBell');
    const count=document.getElementById('asaasBellCount');
    if(!bell||!count)return;
    count.textContent=String(entries.length);
    count.hidden=!entries.length;
    bell.classList.toggle('has-pending',entries.length>0);
    bell.title=entries.length?`${entries.length} pagamento(s) do Asaas aguardando associação`:'Nenhum pagamento do Asaas aguardando associação';
  }

  function injectOpportunityInModal25(entries){
    const root=document.getElementById('modalRoot');
    const body=root?.querySelector('.modal-body');
    if(!body)return;
    const existingBox=body.querySelector('.asaas-modal-opportunity');
    if(!entries.length){ existingBox?.remove(); return; }
    if(existingBox)return;
    const title=(root.querySelector('.modal-head')?.textContent||'').toLowerCase();
    if(title.includes('asaas')||title.includes('registrar entrada recebida'))return;
    const total=entries.reduce((s,e)=>s+Number(e.gross_amount||0),0);
    const box=document.createElement('div');
    box.className='asaas-modal-opportunity';
    box.innerHTML=`<div><b>${entries.length} pagamento${entries.length===1?'':'s'} do Asaas sem associação</b><span>${fmtMoney(total)} aguardando cliente + serviço/trabalho. Você pode resolver sem sair desta tela.</span></div><button type="button" class="btn secondary" data-asaas-open-queue>Associar pagamento</button>`;
    body.prepend(box);
  }

  async function refreshGlobalAsaas25(){
    const entries=await fetchPending25();
    updateBell25(entries);
    ensureGlobalBar25(entries);
    removeLegacyHomeBanner25();
    injectOpportunityInModal25(entries);
    if(!entries.length) closeOverlay25();
    return entries;
  }
  window.refreshAsaasBell=refreshGlobalAsaas25;

  function overlayShell25(inner){
    closeOverlay25();
    overlay25=document.createElement('div');
    overlay25.id='asaasGlobalOverlay';
    overlay25.className='asaas-global-overlay';
    overlay25.innerHTML=`<div class="asaas-global-sheet" role="dialog" aria-modal="true">${inner}</div>`;
    document.body.appendChild(overlay25);
    overlay25.addEventListener('click',e=>{ if(e.target===overlay25) closeOverlay25(); });
    return overlay25.querySelector('.asaas-global-sheet');
  }
  function closeOverlay25(){ overlay25?.remove(); overlay25=null; }

  async function openQueue25(){
    const entries=await fetchPending25();
    if(!entries.length){ toast('Não há pagamentos do Asaas aguardando associação.'); await refreshGlobalAsaas25(); return; }
    const total=entries.reduce((s,e)=>s+Number(e.gross_amount||0),0);
    const cards=entries.map(e=>{
      const match=matchClient25(e);
      const contact=[e.customer_email,e.customer_mobile_phone||e.customer_phone,e.customer_document].filter(Boolean).join(' · ');
      return `<article class="asaas-queue-card">
        <div class="asaas-queue-top"><div><b>${escapeHtml(e.customer_name||'Cliente não identificado')}</b><span>${escapeHtml(contact||'Dados cadastrais serão confirmados na associação')}</span></div><strong>${fmtMoney(e.gross_amount)}</strong></div>
        <div class="asaas-queue-meta"><span>${fmtDateTime(e.payment_date||e.received_at)}</span><span>${escapeHtml(statusPt25(e.billing_type))}</span><span>${escapeHtml(statusPt25(e.asaas_status))}</span>${match?`<span class="pill gold">Possível cliente: ${escapeHtml(match.full_name)}</span>`:'<span class="pill red">Cliente a confirmar</span>'}</div>
        <button type="button" class="btn" data-asaas-resolve-global="${e.id}">Associar cliente e serviço</button>
      </article>`;
    }).join('');
    overlayShell25(`<div class="asaas-sheet-head"><div><span class="eyebrow">Entradas do Asaas</span><h2>Pagamentos a associar</h2><p>O dinheiro já entrou. Nenhuma entrada sai desta fila sem cliente e serviço/trabalho.</p></div><button class="icon-btn" type="button" data-asaas-overlay-close aria-label="Fechar">×</button></div><div class="asaas-queue-summary"><div><span>Pendências</span><b>${entries.length}</b></div><div><span>Valor</span><b>${fmtMoney(total)}</b></div></div><div class="asaas-queue-list">${cards}</div>`);
  }

  function saleType25(service,workId){
    if(workId)return 'TRABALHO';
    if(service?.category==='CONSULTA')return 'CONSULTA';
    if(service?.category==='PERGUNTA')return 'PERGUNTA';
    if(service?.category==='MENSALIDADE')return 'MENSALIDADE';
    if(String(service?.category||'').startsWith('TRABALHO_'))return 'TRABALHO';
    return 'OUTRO';
  }

  function setSelectClient25(clientId){
    if(!clientId)return;
    const client=byId(state.clients,clientId);
    ['aClient','fmClient','q6Client'].forEach(id=>{
      const sel=document.getElementById(id);
      if(!sel)return;
      if(!Array.from(sel.options).some(o=>o.value===clientId)){
        const o=document.createElement('option');o.value=clientId;o.textContent=client?.full_name||'Cliente associado';sel.appendChild(o);
      }
      if(id==='aClient'&&document.getElementById('aCancelNewClient')&&!document.getElementById('aNewClientBox')?.hidden){
        document.getElementById('aCancelNewClient').click();
      }
      sel.disabled=false; sel.value=clientId; sel.dispatchEvent(new Event('change',{bubbles:true}));
    });
  }

  async function openResolve25(id){
    const e=pendingCache25.find(x=>x.id===id)||(await fetchPending25()).find(x=>x.id===id);
    if(!e){ toast('Esta pendência não está mais disponível.','error'); await refreshGlobalAsaas25(); return; }
    const match=matchClient25(e);
    const preClient=match?.id||'';
    const sheet=overlayShell25(`<div class="asaas-sheet-head"><div><span class="eyebrow">Pagamento recebido</span><h2>${escapeHtml(e.customer_name||'Cliente')}</h2><p><b>${fmtMoney(e.gross_amount)}</b> · ${escapeHtml(statusPt25(e.billing_type))} · ${fmtDateTime(e.payment_date||e.received_at)}</p></div><button class="icon-btn" type="button" data-asaas-back-queue aria-label="Voltar">←</button></div>
      <form id="asaasGlobalResolveForm" class="form-grid asaas-global-form">
        <div class="span-2 soft-box"><h3>1. Quem pagou?</h3><p>Selecione um cliente existente ou confirme os dados abaixo para criar o Cliente 360 com o que veio do Asaas.</p></div>
        <label class="span-2">Cliente existente<select id="agClient">${optionList(state.clients,'full_name',preClient)}</select></label>
        <div class="span-2 form-divider">ou criar/completar cliente com os dados recebidos</div>
        <label class="span-2">Nome<input id="agName" value="${escapeHtml(e.customer_name||'')}"></label>
        <label>Telefone<input id="agPhone" value="${escapeHtml(e.customer_mobile_phone||e.customer_phone||'')}"></label>
        <label>E-mail<input id="agEmail" type="email" value="${escapeHtml(e.customer_email||'')}"></label>
        <label>CPF/CNPJ<input id="agDocument" value="${escapeHtml(e.customer_document||'')}"></label>
        <label>Nascimento<input id="agBirth" type="date"></label>
        <div class="span-2 soft-box"><h3>2. O que foi pago?</h3><p>Obrigatório classificar como serviço ou trabalho. O pagamento não pode ficar solto.</p></div>
        <label>Serviço<select id="agService">${optionList(state.services,'name')}</select></label>
        <label>Trabalho<select id="agWork">${optionList(state.works,'title')}</select></label>
        <label>Responsável<select id="agResponsible">${optionList(state.team.filter(x=>x.is_practitioner),'full_name')}</select></label>
        <label>Valor recebido<input value="${Number(e.gross_amount||0).toFixed(2)}" disabled></label>
        <label>Pessoa amada<input id="agLoved" placeholder="Se aplicável"></label>
        <label>Rival<input id="agRival" placeholder="Se aplicável"></label>
        <label class="span-2">Observações<textarea id="agNotes" rows="3" placeholder="Ex.: Agrado coletivo, consulta, mensalidade…"></textarea></label>
        <div class="span-2 asaas-resolve-actions"><button type="button" class="btn ghost" data-asaas-back-queue>Voltar</button><button type="submit" class="btn">Associar e concluir</button></div>
      </form>`);
    const form=sheet.querySelector('#asaasGlobalResolveForm');
    const clientSel=sheet.querySelector('#agClient');
    const toggle=()=>{
      const existing=Boolean(clientSel.value);
      ['agName','agPhone','agEmail','agDocument','agBirth'].forEach(k=>{const el=sheet.querySelector('#'+k);if(el)el.disabled=existing;});
    };
    clientSel.addEventListener('change',toggle);toggle();
    form.addEventListener('submit',async ev=>{
      ev.preventDefault();
      if(!requireReal())return;
      const existing=clientSel.value||null;
      const name=sheet.querySelector('#agName').value.trim();
      const serviceId=sheet.querySelector('#agService').value||null;
      const workId=sheet.querySelector('#agWork').value||null;
      if(!existing&&!name){toast('Confirme o nome do cliente.','error');return;}
      if(!serviceId&&!workId){toast('Selecione o serviço ou trabalho pago.','error');return;}
      const service=byId(state.services,serviceId);
      const submit=form.querySelector('button[type=submit]');
      submit.disabled=true;submit.textContent='Associando…';
      const {data,error}=await db.rpc('resolve_asaas_entry',{
        p_entry_id:id,
        p_client_id:existing,
        p_client_name:name||null,
        p_client_phone:sheet.querySelector('#agPhone').value.trim()||null,
        p_client_email:sheet.querySelector('#agEmail').value.trim()||null,
        p_client_birth_date:sheet.querySelector('#agBirth').value||null,
        p_document_number:sheet.querySelector('#agDocument').value.trim()||null,
        p_service_id:serviceId,
        p_work_id:workId,
        p_responsible_member_id:sheet.querySelector('#agResponsible').value||null,
        p_sale_type:saleType25(service,workId),
        p_loved_person_name:sheet.querySelector('#agLoved').value.trim()||null,
        p_rival_name:sheet.querySelector('#agRival').value.trim()||null,
        p_notes:sheet.querySelector('#agNotes').value.trim()||null
      });
      submit.disabled=false;submit.textContent='Associar e concluir';
      if(error){toast(error.message,'error');return;}
      await loadReferenceData();
      setSelectClient25(data?.client_id);
      closeOverlay25();
      toast(workId?'Pagamento associado e inscrição criada.':'Pagamento do Asaas associado ao cliente e serviço.');
      await refreshGlobalAsaas25();
      if(state.view==='financeiro') await render();
    });
  }

  function bindGlobalClicks25(){
    document.addEventListener('click',e=>{
      if(e.target.closest('#asaasBell')){
        e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openQueue25();return;
      }
      const open=e.target.closest('[data-asaas-open-queue]');
      if(open){e.preventDefault();e.stopPropagation();openQueue25();return;}
      const resolve=e.target.closest('[data-asaas-resolve-global]');
      if(resolve){e.preventDefault();e.stopPropagation();openResolve25(resolve.dataset.asaasResolveGlobal);return;}
      if(e.target.closest('[data-asaas-overlay-close]')){e.preventDefault();closeOverlay25();return;}
      if(e.target.closest('[data-asaas-back-queue]')){e.preventDefault();openQueue25();return;}
    },true);
  }

  function watchModals25(){
    if(observer25)return;
    const root=document.getElementById('modalRoot');
    if(!root)return;
    observer25=new MutationObserver(()=>{ if(pendingCache25.length) setTimeout(()=>injectOpportunityInModal25(pendingCache25),0); });
    observer25.observe(root,{childList:true,subtree:true});
  }

  function startRealtime25(){
    if(realtime25||!db||!state.session)return;
    realtime25=db.channel('sunshine-asaas-global-pending')
      .on('postgres_changes',{event:'*',schema:'public',table:'asaas_incoming_payments'},async payload=>{
        await refreshGlobalAsaas25();
        const n=payload.new||{};
        if(n.classification_status==='PENDING'&&payload.eventType==='INSERT'){
          const bar=document.getElementById('globalAsaasPendingBar');
          bar?.classList.add('pulse');setTimeout(()=>bar?.classList.remove('pulse'),1600);
        }
      }).subscribe();
  }

  const previousBind25=bindViewActions;
  bindViewActions=function(){
    previousBind25();
    setTimeout(refreshGlobalAsaas25,0);
  };

  bindGlobalClicks25();
  watchModals25();

  navigator.serviceWorker?.addEventListener('message',event=>{
    if(event.data?.type==='OPEN_FINANCEIRO_ASAAS') setTimeout(openQueue25,250);
  });

  const authPoll25=setInterval(async()=>{
    if(state.session&&!state.demo){
      clearInterval(authPoll25);
      startRealtime25();
      await refreshGlobalAsaas25();
      if(initialAsaasDeepLink) setTimeout(openQueue25,300);
    }
  },300);
  setTimeout(()=>clearInterval(authPoll25),20000);
})();

;

/* ---- assets/v26.js ---- */
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

;

/* ---- assets/v25a.js ---- */
/* Sunshine v3.25.1 — telefone obrigatório ao criar cliente a partir do Asaas */
(function(){
  function enhancePhone(root=document){
    const forms=[root.querySelector?.('#asaasGlobalResolveForm'),root.querySelector?.('#asaasResolveForm')].filter(Boolean);
    forms.forEach(form=>{
      const client=form.querySelector('#agClient,#arClient');
      const phone=form.querySelector('#agPhone,#arPhone');
      if(!phone||phone.dataset.asaasPhoneRequired==='1')return;
      phone.dataset.asaasPhoneRequired='1';
      const label=phone.closest('label');
      if(label){
        const helper=document.createElement('small');
        helper.className='helper';
        helper.textContent='Obrigatório quando estiver criando um novo cliente.';
        phone.insertAdjacentElement('afterend',helper);
      }
      const sync=()=>{
        const newClient=!client?.value;
        phone.required=newClient;
        phone.setAttribute('aria-required',newClient?'true':'false');
      };
      client?.addEventListener('change',sync);
      sync();
      form.addEventListener('submit',ev=>{
        if(!client?.value && !phone.value.trim()){
          ev.preventDefault();
          ev.stopImmediatePropagation();
          phone.focus();
          phone.scrollIntoView({behavior:'smooth',block:'center'});
          toast('Informe o telefone do novo cliente para concluir a associação.','error');
        }
      },true);
    });
  }
  const observer=new MutationObserver(()=>enhancePhone(document));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>enhancePhone(document));
  setTimeout(()=>enhancePhone(document),400);
})();

;

/* ---- assets/v27.js ---- */
/* Sunshine v3.27 — Cliente 360 contextual + KPIs Filhos da Casa + Asaas com múltiplos serviços */
(function(){
  const norm27=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  let lastAsaasEntry27=null;

  function ensureStyles27(){
    if(document.getElementById('sunshineV27Styles'))return;
    const s=document.createElement('style');s.id='sunshineV27Styles';s.textContent=`
      .inline-edit-client27{margin-left:8px;border:0;background:#fff2ed;color:#9d2f19;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap}
      .context-edit-wrap27{display:flex;align-items:center;gap:8px;margin-top:7px}.context-edit-wrap27 .link-btn{font-size:11px}
      .client-context-overlay27{position:fixed;inset:0;background:rgba(36,17,11,.28);z-index:5000;display:flex;align-items:center;justify-content:center;padding:18px}
      .client-context-sheet27{width:min(760px,100%);max-height:calc(100dvh - 28px);overflow:auto;background:#fffdfb;border:1px solid #eadbd1;border-radius:20px;box-shadow:0 22px 70px rgba(63,31,20,.22)}
      .client-context-head27{display:flex;justify-content:space-between;gap:15px;padding:18px 20px;border-bottom:1px solid #eee1d8}.client-context-head27 h2{margin:2px 0 0}.client-context-body27{padding:18px 20px}
      .asaas-multi-tools27{border:1px solid #ead7c9;background:#fffaf5;border-radius:14px;padding:12px;display:grid;gap:8px}.asaas-multi-tools27 .button-row{justify-content:space-between;align-items:center}.asaas-total27{font-size:12px;color:#705d55}.asaas-total27 b{color:#3c2017}.asaas-total27.bad{color:#a40000}.asaas-total27.ok{color:#256044}
      .asaas-extra-list27{display:grid;gap:12px}.asaas-extra-item27{border:1px solid #e7dbd3;border-radius:14px;padding:12px;background:#fff;display:grid;grid-template-columns:1fr 1fr;gap:10px}.asaas-extra-item27 .span-2{grid-column:1/-1}.asaas-extra-head27{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center}.asaas-extra-head27 b{font-size:13px}.asaas-extra-head27 button{border:0;background:#fff0ed;color:#9d2f19;border-radius:999px;padding:5px 9px;font-weight:800;cursor:pointer}
      @media(max-width:720px){.client-context-overlay27{padding:6px;align-items:flex-end}.client-context-sheet27{border-radius:18px 18px 0 0;max-height:calc(100dvh - 6px)}.asaas-extra-item27{grid-template-columns:1fr}.asaas-extra-item27 .span-2{grid-column:auto}.inline-edit-client27{padding:5px 9px}}
    `;document.head.appendChild(s);
  }

  async function openClientContextEditor27(clientId){
    if(!clientId||state.demo)return;
    ensureStyles27();
    let c=byId(state.clients,clientId);
    if(!c){const q=await safeQuery(db.from('clients').select('*').eq('id',clientId).maybeSingle());c=q.data;}
    if(!c){toast('Cliente não encontrado.','error');return;}
    document.getElementById('clientContextOverlay27')?.remove();
    const ov=document.createElement('div');ov.id='clientContextOverlay27';ov.className='client-context-overlay27';
    ov.innerHTML=`<div class="client-context-sheet27" role="dialog" aria-modal="true"><div class="client-context-head27"><div><span class="eyebrow">Cliente 360</span><h2>${escapeHtml(c.full_name)}</h2></div><button type="button" class="icon-btn" data-close-client27>×</button></div><div class="client-context-body27"><form id="clientContextForm27" class="form-grid">
      <label class="span-2">Nome completo<input id="c27Name" required value="${escapeHtml(c.full_name||'')}"></label>
      <label>Nome preferido<input id="c27Preferred" value="${escapeHtml(c.preferred_name||'')}"></label>
      <label>Telefone<input id="c27Phone" value="${escapeHtml(c.phone||'')}"></label>
      <label>E-mail<input id="c27Email" type="email" value="${escapeHtml(c.email||'')}"></label>
      <label>Nascimento<input id="c27Birth" type="date" value="${c.birth_date||''}"></label>
      <label>Cidade<input id="c27City" value="${escapeHtml(c.city||'')}"></label>
      <label>Estado<input id="c27State" maxlength="2" value="${escapeHtml(c.state||'')}"></label>
      <label>Status<select id="c27Status"><option value="ACTIVE" ${c.status==='ACTIVE'?'selected':''}>Ativo</option><option value="INACTIVE" ${c.status==='INACTIVE'?'selected':''}>Inativo</option><option value="BLOCKED" ${c.status==='BLOCKED'?'selected':''}>Bloqueado</option></select></label>
      <label class="span-2">Observações<textarea id="c27Notes" rows="3">${escapeHtml(c.notes||'')}</textarea></label>
      <div class="span-2 form-actions"><button type="button" class="btn ghost" data-close-client27>Cancelar</button><button type="submit" class="btn">Salvar Cliente 360</button></div>
    </form></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click',e=>{if(e.target===ov||e.target.closest('[data-close-client27]'))ov.remove();});
    ov.querySelector('#clientContextForm27').addEventListener('submit',async e=>{
      e.preventDefault();if(!requireReal())return;
      const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Salvando…';
      const payload={full_name:ov.querySelector('#c27Name').value.trim(),preferred_name:ov.querySelector('#c27Preferred').value.trim()||null,phone:ov.querySelector('#c27Phone').value.trim()||null,email:ov.querySelector('#c27Email').value.trim()||null,birth_date:ov.querySelector('#c27Birth').value||null,city:ov.querySelector('#c27City').value.trim()||null,state:ov.querySelector('#c27State').value.trim().toUpperCase()||null,status:ov.querySelector('#c27Status').value,notes:ov.querySelector('#c27Notes').value.trim()||null,updated_by:state.member?.id||null,updated_at:new Date().toISOString()};
      const {data,error}=await db.from('clients').update(payload).eq('id',clientId).select().single();
      if(error){btn.disabled=false;btn.textContent='Salvar Cliente 360';toast(error.message,'error');return;}
      await loadReferenceData();
      if(state.selectedClient?.id===clientId)state.selectedClient=data;
      document.querySelectorAll('select').forEach(sel=>{const op=Array.from(sel.options||[]).find(o=>o.value===clientId);if(op)op.textContent=data.full_name;});
      ov.remove();toast('Cliente 360 atualizado em todo o ecossistema.');await render();
    });
  }
  window.openClientContextEditor27=openClientContextEditor27;

  const previousHouse27=renderHouse;
  renderHouse=async function(){
    if(state.demo)return previousHouse27();
    const [hq,sq]=await Promise.all([
      safeQuery(db.from('house_members').select('*,clients(id,full_name,phone,email,birth_date,city,state,status)').order('created_at',{ascending:false})),
      safeQuery(db.rpc('get_house_financial_summary',{p_reference_date:new Date().toISOString().slice(0,10)}),{})
    ]);
    const list=(hq.data||[]).sort((a,b)=>(a.clients?.full_name||'').localeCompare(b.clients?.full_name||'','pt-BR'));
    const summary=sq.data||{};
    const rows=list.length?list.map(h=>`<tr><td><b>${escapeHtml(h.clients?.full_name||'—')}</b><button type="button" class="inline-edit-client27" data-edit-client27="${h.client_id}">Editar</button></td><td>${escapeHtml(h.clients?.birth_date?String(h.clients.birth_date).split('-').reverse().join('/'):'—')}</td><td>${escapeHtml(h.clients?.phone||'—')}</td><td>${h.billing_exempt?'<span class="pill gold">ISENTO</span>':`Dia ${Number(h.billing_due_day||10)}`}</td><td>${h.billing_exempt?'<span class="pill gold">ISENTO</span>':fmtMoney(h.monthly_fee)}</td><td>${statusPill(h.status)}</td></tr>`).join(''):`<tr class="empty-row"><td colspan="6">Nenhum Filho da Casa cadastrado.</td></tr>`;
    const cards=kpis([
      ['Ativos',String(summary.active_count??list.filter(x=>x.status==='ACTIVE').length),'Filhos da Casa ativos'],
      ['Previsto no mês',fmtMoney(summary.expected_monthly||0),'Mensalidades dos não isentos'],
      ['Recebido no mês',fmtMoney(summary.received_month||0),'Mensalidades efetivamente pagas'],
      ['Pendente estimado',fmtMoney(summary.estimated_pending||0),'Previsto menos recebido']
    ]);
    return `${cards}<article class="panel"><div class="section-head"><div><h2>Filhos da Casa</h2><p>${list.length} pessoas vinculadas ao Cliente 360. Qualquer edição abaixo atualiza o cadastro único.</p></div><div class="button-row"><button class="btn ghost" type="button" data-print-house>Imprimir nomes</button><button class="btn" data-action="new-house">+ Novo vínculo</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Nascimento</th><th>Telefone</th><th>Vencimento</th><th>Mensalidade</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></article><article class="panel"><div class="note"><b>Regra da mensalidade:</b> pagamento até o dia 10 de cada mês. O módulo não cria dinheiro: o recebimento entra pelo Asaas ou Financeiro e é associado ao serviço de mensalidade. A opção <b>Primeira Mensalidade LU</b> direciona 100% da primeira mensalidade prospectada exclusivamente por Lourdes para ela.</div></article>`;
  };

  function clientIdFromCell27(td){
    const b=td.querySelector('b');const txt=(b?.textContent||td.textContent||'').trim();
    const c=state.clients.find(x=>norm27(x.full_name)===norm27(txt));return c?.id||null;
  }
  function decorateVisibleClients27(){
    const content=document.getElementById('content');if(!content)return;
    content.querySelectorAll('table tbody td').forEach(td=>{
      if(td.querySelector('[data-edit-client27]'))return;
      const id=clientIdFromCell27(td);if(!id)return;
      const btn=document.createElement('button');btn.type='button';btn.className='inline-edit-client27';btn.dataset.editClient27=id;btn.textContent='Editar';td.appendChild(btn);
    });
  }
  function decorateClientSelects27(){
    document.querySelectorAll('#modalRoot select, #asaasGlobalOverlay select').forEach(sel=>{
      if(!/client/i.test(sel.id||'')||sel.closest('#clientForm')||sel.dataset.contextEdit27==='1')return;
      sel.dataset.contextEdit27='1';
      const wrap=document.createElement('div');wrap.className='context-edit-wrap27';
      const btn=document.createElement('button');btn.type='button';btn.className='link-btn';btn.textContent='Editar dados do cliente';btn.hidden=!sel.value;
      btn.addEventListener('click',()=>openClientContextEditor27(sel.value));
      sel.addEventListener('change',()=>btn.hidden=!sel.value);
      wrap.appendChild(btn);sel.insertAdjacentElement('afterend',wrap);
    });
  }

  function optionHtml27(items,label){return '<option value="">Selecione</option>'+items.map(x=>`<option value="${x.id}">${escapeHtml(x[label]||x.name||x.full_name)}</option>`).join('');}
  function allocationTotal27(form){
    const gross=Number(form.dataset.gross27||0);let total=Number(form.querySelector('#agAmount0')?.value||0);
    form.querySelectorAll('.asaas-extra-item27').forEach(x=>total+=Number(x.querySelector('.agExtraAmount27')?.value||0));
    const el=form.querySelector('.asaas-total27');if(el){const diff=Math.round((gross-total)*100)/100;el.className=`asaas-total27 ${Math.abs(diff)<.005?'ok':'bad'}`;el.innerHTML=`Recebido: <b>${fmtMoney(gross)}</b> · Associado: <b>${fmtMoney(total)}</b> · ${Math.abs(diff)<.005?'Fechou corretamente':`Falta distribuir ${fmtMoney(diff)}`}`;}
    return total;
  }
  function newAllocationItem27(form,amount=0){
    const list=form.querySelector('.asaas-extra-list27');const n=list.children.length+2;
    const div=document.createElement('div');div.className='asaas-extra-item27';
    div.innerHTML=`<div class="asaas-extra-head27"><b>Serviço ${n}</b><button type="button" data-remove-allocation27>Remover</button></div>
      <label>Serviço<select class="agExtraService27">${optionHtml27(state.services,'name')}</select></label><label>Trabalho<select class="agExtraWork27">${optionHtml27(state.works,'title')}</select></label>
      <label>Responsável<select class="agExtraResponsible27" required>${optionHtml27(state.team.filter(x=>x.is_practitioner),'full_name')}</select></label><label>Valor desta parte<input class="agExtraAmount27" type="number" min="0.01" step="0.01" value="${Number(amount||0).toFixed(2)}" required></label>
      <label>Pessoa amada<input class="agExtraLoved27" placeholder="Se aplicável"></label><label>Rival<input class="agExtraRival27" placeholder="Se aplicável"></label>
      <label class="span-2">Observação desta parte<input class="agExtraNotes27" placeholder="Opcional"></label>`;
    list.appendChild(div);div.querySelector('[data-remove-allocation27]').addEventListener('click',()=>{div.remove();allocationTotal27(form);});div.querySelectorAll('input,select').forEach(x=>x.addEventListener('input',()=>allocationTotal27(form)));return div;
  }
  function transformAsaasForm27(form){
    if(!form||form.dataset.multi27==='1')return;
    const amountInput=Array.from(form.querySelectorAll('input')).find(x=>x.disabled&&/^\d+[.,]?\d*$/.test(String(x.value||'')));
    if(!amountInput)return;
    const gross=Number(String(amountInput.value).replace(',','.'));form.dataset.gross27=String(gross);form.dataset.multi27='1';form.dataset.entryId27=lastAsaasEntry27||'';
    amountInput.disabled=false;amountInput.type='number';amountInput.step='0.01';amountInput.min='0.01';amountInput.id='agAmount0';amountInput.value=gross.toFixed(2);
    const label=amountInput.closest('label');if(label&&label.firstChild?.nodeType===3)label.firstChild.nodeValue='Valor desta parte';
    const notes=form.querySelector('#agNotes')?.closest('label');
    const box=document.createElement('div');box.className='span-2 asaas-multi-tools27';
    box.innerHTML=`<div class="asaas-extra-list27"></div><div class="button-row"><button type="button" class="btn secondary" data-add-allocation27>+ Adicionar serviço</button><div class="asaas-total27"></div></div><small>Um único PIX pode ser dividido em vários serviços. A soma precisa fechar exatamente o valor recebido.</small>`;
    notes?.insertAdjacentElement('beforebegin',box);
    box.querySelector('[data-add-allocation27]').addEventListener('click',()=>{
      let current=Number(amountInput.value||0);const firstService=byId(state.services,form.querySelector('#agService')?.value);
      if(box.querySelectorAll('.asaas-extra-item27').length===0&&Math.abs(current-gross)<.005&&Number(firstService?.default_price||0)>0&&Number(firstService.default_price)<gross){amountInput.value=Number(firstService.default_price).toFixed(2);current=Number(amountInput.value);}
      const used=allocationTotal27(form);newAllocationItem27(form,Math.max(gross-used,0));allocationTotal27(form);
    });
    form.querySelectorAll('input,select').forEach(x=>x.addEventListener('input',()=>allocationTotal27(form)));allocationTotal27(form);
  }

  async function submitAsaasMulti27(form){
    if(!requireReal())return;
    const id=form.dataset.entryId27||lastAsaasEntry27;if(!id){toast('Não foi possível identificar a entrada do Asaas. Volte à fila e abra novamente.','error');return;}
    const existing=form.querySelector('#agClient')?.value||null;const name=form.querySelector('#agName')?.value.trim()||'';const phone=form.querySelector('#agPhone')?.value.trim()||'';
    if(!existing&&!name){toast('Confirme o nome do cliente.','error');return;}if(!existing&&phone.replace(/\D/g,'').length<8){toast('Informe o telefone do novo cliente.','error');form.querySelector('#agPhone')?.focus();return;}
    const items=[];
    const first={service_id:form.querySelector('#agService')?.value||null,work_id:form.querySelector('#agWork')?.value||null,responsible_member_id:form.querySelector('#agResponsible')?.value||null,amount:Number(form.querySelector('#agAmount0')?.value||0),loved_person_name:form.querySelector('#agLoved')?.value.trim()||null,rival_name:form.querySelector('#agRival')?.value.trim()||null,notes:null};items.push(first);
    form.querySelectorAll('.asaas-extra-item27').forEach(x=>items.push({service_id:x.querySelector('.agExtraService27').value||null,work_id:x.querySelector('.agExtraWork27').value||null,responsible_member_id:x.querySelector('.agExtraResponsible27').value||null,amount:Number(x.querySelector('.agExtraAmount27').value||0),loved_person_name:x.querySelector('.agExtraLoved27').value.trim()||null,rival_name:x.querySelector('.agExtraRival27').value.trim()||null,notes:x.querySelector('.agExtraNotes27').value.trim()||null}));
    if(items.some(x=>(!x.service_id&&!x.work_id)||!x.responsible_member_id||!(x.amount>0))){toast('Preencha serviço/trabalho, responsável e valor em todas as partes.','error');return;}
    const gross=Number(form.dataset.gross27||0),total=items.reduce((s,x)=>s+x.amount,0);if(Math.abs(gross-total)>.009){toast(`Distribua exatamente ${fmtMoney(gross)}. Hoje a soma está em ${fmtMoney(total)}.`,'error');return;}
    const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Associando…';
    const {data,error}=await db.rpc('resolve_asaas_entry_multi',{p_entry_id:id,p_client_id:existing,p_client_name:name||null,p_client_phone:phone||null,p_client_email:form.querySelector('#agEmail')?.value.trim()||null,p_client_birth_date:form.querySelector('#agBirth')?.value||null,p_document_number:form.querySelector('#agDocument')?.value.trim()||null,p_items:items,p_notes:form.querySelector('#agNotes')?.value.trim()||null});
    btn.disabled=false;btn.textContent='Associar e concluir';if(error){toast(error.message,'error');return;}
    await loadReferenceData();document.getElementById('asaasGlobalOverlay')?.remove();toast(items.length>1?`Pagamento dividido em ${items.length} serviços e associado com sucesso.`:'Pagamento associado com sucesso.');if(window.refreshAsaasBell)await window.refreshAsaasBell();await render();
  }

  document.addEventListener('click',e=>{
    const asaas=e.target.closest('[data-asaas-resolve-global]');if(asaas)lastAsaasEntry27=asaas.dataset.asaasResolveGlobal;
    const edit=e.target.closest('[data-edit-client27]');if(edit){e.preventDefault();e.stopPropagation();openClientContextEditor27(edit.dataset.editClient27);}
  },true);
  document.addEventListener('submit',e=>{const form=e.target.closest('#asaasGlobalResolveForm');if(form?.dataset.multi27==='1'){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();submitAsaasMulti27(form);}},true);

  const observer27=new MutationObserver(()=>{ensureStyles27();decorateClientSelects27();const f=document.getElementById('asaasGlobalResolveForm');if(f)transformAsaasForm27(f);setTimeout(decorateVisibleClients27,0);});
  observer27.observe(document.body,{childList:true,subtree:true});
  ensureStyles27();setTimeout(()=>{decorateVisibleClients27();decorateClientSelects27();},100);
})();

;

/* ---- assets/v28.js ---- */
/* Sunshine v3.29 — status mensal + vencimento individual em Filhos da Casa */
(function(){
  function localDate28(){
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function dueLabel28(h){
    if(h.billing_exempt) return 'ISENTO';
    return h.billing_due_label||`Dia ${Number(h.billing_due_day||10)}`;
  }
  function paymentCell28(h){
    const st=h.payment_status;
    if(st==='ISENTO') return `<div><span class="pill gold">ISENTO</span><small style="display:block;margin-top:5px;color:#806b62">Sem cobrança mensal</small></div>`;
    const paid=Number(h.paid_amount||0), fee=Number(h.monthly_fee||0), missing=Math.max(fee-paid,0);
    if(st==='PAGO') return `<div><span class="pill ok">PAGO</span><small style="display:block;margin-top:5px;color:#806b62">${fmtMoney(paid)}${h.last_paid_at?` · ${fmtDate(h.last_paid_at)}`:''}</small></div>`;
    if(paid>0) return `<div><span class="pill red">PENDENTE</span><small style="display:block;margin-top:5px;color:#806b62">Recebido ${fmtMoney(paid)} · falta ${fmtMoney(missing)}</small></div>`;
    return `<div><span class="pill red">PENDENTE</span><small style="display:block;margin-top:5px;color:#806b62">Falta ${fmtMoney(missing||fee)} · vence ${escapeHtml(dueLabel28(h).toLowerCase())}</small></div>`;
  }

  const previousHouse28=renderHouse;
  renderHouse=async function(){
    if(state.demo)return previousHouse28();
    const q=await safeQuery(db.rpc('get_house_monthly_payment_status',{p_month:localDate28()}),[]);
    const list=q.data||[];
    if(!list.length)return previousHouse28();
    const active=list.length;
    const expected=list.reduce((s,h)=>s+(h.billing_exempt?0:Number(h.monthly_fee||0)),0);
    const received=list.reduce((s,h)=>s+Number(h.paid_amount||0),0);
    const pending=list.reduce((s,h)=>s+(h.billing_exempt?0:Math.max(Number(h.monthly_fee||0)-Number(h.paid_amount||0),0)),0);
    const rows=list.map(h=>`<tr>
      <td><b>${escapeHtml(h.full_name||'—')}</b><button type="button" class="inline-edit-client27" data-edit-client27="${h.client_id}">Editar</button>${h.house_notes?`<small style="display:block;margin-top:6px;max-width:360px;color:#806b62;line-height:1.35">${escapeHtml(h.house_notes)}</small>`:''}</td>
      <td>${h.birth_date?escapeHtml(String(h.birth_date).split('-').reverse().join('/')):'—'}</td>
      <td>${escapeHtml(h.phone||'—')}</td>
      <td>${paymentCell28(h)}</td>
      <td>${h.billing_exempt?'<span class="pill gold">ISENTO</span>':escapeHtml(dueLabel28(h))}</td>
      <td>${h.billing_exempt?'<span class="pill gold">ISENTO</span>':fmtMoney(h.monthly_fee)}</td>
      <td>${statusPill(h.house_status)}</td>
    </tr>`).join('');
    const monthLabel=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date());
    return `${kpis([
      ['Ativos',String(active),'Filhos da Casa ativos'],
      ['Previsto no mês',fmtMoney(expected),'Mensalidades dos não isentos'],
      ['Recebido no mês',fmtMoney(received),'Mensalidades efetivamente pagas'],
      ['Pendente no mês',fmtMoney(pending),'Saldo ainda não recebido']
    ])}<article class="panel"><div class="section-head"><div><h2>Filhos da Casa</h2><p>${active} pessoas ativas · situação de ${escapeHtml(monthLabel)}. O status de pagamento vem do Financeiro/Asaas.</p></div><div class="button-row"><button class="btn ghost" type="button" data-print-house>Imprimir nomes</button><button class="btn" data-action="new-house">+ Novo vínculo</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Nascimento</th><th>Telefone</th><th>Pagamento do mês</th><th>Vencimento</th><th>Mensalidade</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></article><article class="panel"><div class="note"><b>Como funciona:</b> só aparece <b>Pago</b> quando existe pagamento confirmado e associado a um serviço de mensalidade daquele cliente no mês. Pagamento parcial permanece <b>Pendente</b>. Isentos não entram na cobrança nem no valor previsto. O vencimento pode ser individual conforme o histórico de pagamento.</div></article>`;
  };
})();
;

/* ---- assets/v30.js ---- */
/* Sunshine v3.30 — baixa em lote de comissões */
(function(){
  const isAdmin30=()=>state.member?.role==='ADMIN';
  let observer30=null;

  function ensureStyles30(){
    if(document.getElementById('commissionBulkStyles30'))return;
    const s=document.createElement('style');
    s.id='commissionBulkStyles30';
    s.textContent=`
      .commission-bulk-bar30{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:14px 0 16px;padding:14px 16px;border:1px solid #eadbd1;border-radius:14px;background:#fff8f5}
      .commission-bulk-bar30>div{min-width:0}.commission-bulk-bar30 b{display:block;color:#5b2e20;font-size:13px}.commission-bulk-bar30 span{display:block;margin-top:3px;color:#806b62;font-size:12px;line-height:1.4}
      .commission-bulk-bar30 .btn{white-space:nowrap}
      @media(max-width:720px){.commission-bulk-bar30{align-items:stretch;display:grid}.commission-bulk-bar30 .btn{width:100%}}
    `;
    document.head.appendChild(s);
  }

  async function dueSummary30(){
    if(state.demo||!db)return {count:0,total:0};
    const {data,error}=await db.from('commission_entries').select('id,amount').eq('status','DUE').limit(10000);
    if(error)throw error;
    const rows=data||[];
    return {count:rows.length,total:rows.reduce((sum,x)=>sum+Number(x.amount||0),0)};
  }

  async function refreshBulkBar30(bar){
    const btn=bar?.querySelector('[data-pay-all-commissions30]');
    const copy=bar?.querySelector('[data-commission-bulk-copy30]');
    if(!btn||!copy)return;
    try{
      const s=await dueSummary30();
      btn.disabled=s.count===0;
      btn.textContent=s.count?`Marcar todos como pagos (${s.count})`:'Nenhuma comissão a pagar';
      copy.textContent=s.count
        ? `${s.count} comissões abertas · total ${fmtMoney(s.total)}. A baixa registra a mesma data e hora para todas.`
        : 'Não existe comissão operacional aguardando pagamento.';
    }catch(e){
      console.error(e); btn.disabled=true; copy.textContent='Não foi possível carregar o saldo das comissões.';
    }
  }

  function commissionPanel30(){
    const panels=[...document.querySelectorAll('#content article.panel')];
    return panels.find(p=>/^comiss[oõ]es$/i.test((p.querySelector('h2')?.textContent||'').trim()))||null;
  }

  function injectBulk30(){
    if(state.view!=='financeiro'||!isAdmin30()||state.demo)return;
    ensureStyles30();
    const panel=commissionPanel30();
    if(!panel||panel.querySelector('#commissionBulkBar30'))return;
    const h2=panel.querySelector('h2');
    if(!h2)return;
    const bar=document.createElement('div');
    bar.id='commissionBulkBar30';
    bar.className='commission-bulk-bar30';
    bar.innerHTML=`<div><b>Baixa em lote</b><span data-commission-bulk-copy30>Carregando comissões abertas…</span></div><button class="btn secondary" type="button" data-pay-all-commissions30>Carregando…</button>`;
    const anchor=h2.closest('.section-head')||h2;
    anchor.insertAdjacentElement('afterend',bar);
    refreshBulkBar30(bar);
  }

  async function payAll30(btn){
    if(!isAdmin30()){toast('Apenas a administradora pode dar baixa em todas as comissões.','error');return;}
    let s;
    try{s=await dueSummary30();}catch(e){toast(e.message||'Erro ao consultar comissões.','error');return;}
    if(!s.count){toast('Não há comissões a pagar.');return;}
    const ok=confirm(`Marcar como pagas todas as ${s.count} comissões abertas, no total de ${fmtMoney(s.total)}?\n\nEsta ação registra a baixa de todas com a data e hora atuais.`);
    if(!ok)return;
    btn.disabled=true; const old=btn.textContent; btn.textContent='Dando baixa…';
    const {data,error}=await db.rpc('admin_pay_all_due_commissions');
    if(error){btn.disabled=false;btn.textContent=old;toast(error.message,'error');return;}
    const qty=Number(data?.count||0), total=Number(data?.total||0);
    toast(`${qty} comissões marcadas como pagas · ${fmtMoney(total)}.`);
    await navigate('financeiro');
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-pay-all-commissions30]');
    if(!btn)return;
    e.preventDefault();e.stopPropagation();payAll30(btn);
  },true);

  function start30(){
    ensureStyles30();
    injectBulk30();
    if(observer30)return;
    observer30=new MutationObserver(()=>injectBulk30());
    observer30.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start30);else start30();
})();

;

/* ---- assets/v31.js ---- */
/* Sunshine v3.32 — fechamento de comissões + recebido no mês */
(function(){
  let observer31=null;

  function ensureStyles31(){
    if(document.getElementById('commissionCopyStyles31'))return;
    const s=document.createElement('style');
    s.id='commissionCopyStyles31';
    s.textContent=`
      .commission-copy-actions31{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
      .commission-copy-actions31 .btn{flex:1 1 220px}
      @media(max-width:720px){.commission-copy-actions31{display:grid}.commission-copy-actions31 .btn{width:100%}}
    `;
    document.head.appendChild(s);
  }

  function dateBR31(v){
    if(!v)return '—';
    const d=new Date(v);
    return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',timeZone:'America/Sao_Paulo'}).format(d);
  }

  function commissionPanel31(){
    const panels=[...document.querySelectorAll('#content article.panel')];
    return panels.find(p=>/^comiss[oõ]es$/i.test((p.querySelector('h2')?.textContent||'').trim()))||null;
  }

  async function receivedMonth31(){
    if(state.demo||!db)return 0;
    const [ms,me]=monthRange();
    const {data,error}=await db.from('payments')
      .select('gross_amount,paid_at')
      .eq('status','PAID')
      .gte('paid_at',ms)
      .lt('paid_at',me)
      .limit(10000);
    if(error)throw error;
    return (data||[]).reduce((sum,row)=>sum+Number(row.gross_amount||0),0);
  }

  function findCommissionKpis31(panel){
    const grids=[...panel.querySelectorAll('.kpi-grid')];
    return grids.find(g=>{
      const txt=(g.textContent||'').toLowerCase();
      return txt.includes('a pagar')&&txt.includes('pago no mês')&&txt.includes('pessoas com saldo');
    })||null;
  }

  async function injectReceived31(){
    if(state.view!=='financeiro')return;
    const panel=commissionPanel31();
    if(!panel)return;
    const grid=findCommissionKpis31(panel);
    if(!grid||grid.querySelector('#commissionReceivedMonth31'))return;

    const card=document.createElement('article');
    card.className='card';
    card.id='commissionReceivedMonth31';
    card.innerHTML='<div class="card-label">RECEBIDO NO MÊS</div><div class="value">Carregando…</div><div class="card-foot">Todos os pagamentos confirmados</div>';
    grid.insertAdjacentElement('afterbegin',card);

    try{
      const total=await receivedMonth31();
      if(card.isConnected){
        const value=card.querySelector('.value');
        if(value)value.textContent=fmtMoney(total);
      }
    }catch(e){
      console.error(e);
      if(card.isConnected){
        const value=card.querySelector('.value');
        if(value)value.textContent='—';
      }
    }
  }

  async function openCommissionData31(){
    if(state.demo||!db)return {rows:[],start:null,end:null,totals:{Yasmin:0,Lourdes:0,Rosely:0}};
    const ceq=await db.from('commission_entries')
      .select('id,amount,beneficiary_member_id,payment_allocation_id')
      .eq('status','DUE')
      .limit(10000);
    if(ceq.error)throw ceq.error;
    const rows=ceq.data||[];
    if(!rows.length)return {rows:[],start:null,end:null,totals:{Yasmin:0,Lourdes:0,Rosely:0}};

    const allocationIds=[...new Set(rows.map(x=>x.payment_allocation_id).filter(Boolean))];
    const aq=await db.from('payment_allocations').select('id,payment_id').in('id',allocationIds).limit(10000);
    if(aq.error)throw aq.error;
    const paymentByAllocation=Object.fromEntries((aq.data||[]).map(x=>[x.id,x.payment_id]));
    const paymentIds=[...new Set((aq.data||[]).map(x=>x.payment_id).filter(Boolean))];
    const pq=await db.from('payments').select('id,paid_at,created_at').in('id',paymentIds).limit(10000);
    if(pq.error)throw pq.error;
    const paymentMap=Object.fromEntries((pq.data||[]).map(x=>[x.id,x]));
    const teamMap=Object.fromEntries((state.team||[]).map(x=>[x.id,x.full_name]));

    const totals={Yasmin:0,Lourdes:0,Rosely:0};
    const dates=[];
    rows.forEach(x=>{
      const name=teamMap[x.beneficiary_member_id]||'Outros';
      if(!(name in totals))totals[name]=0;
      totals[name]+=Number(x.amount||0);
      const p=paymentMap[paymentByAllocation[x.payment_allocation_id]];
      const dt=p?.paid_at||p?.created_at;
      if(dt)dates.push(new Date(dt));
    });
    dates.sort((a,b)=>a-b);
    return {rows,start:dates[0]||null,end:dates[dates.length-1]||null,totals};
  }

  function buildMessage31(d){
    if(!d.rows.length)return 'SEM PENDÊNCIAS';
    const start=dateBR31(d.start),end=dateBR31(d.end);
    return `COMISSÃO DO PERÍODO: ${start} A ${end}\n\nYASMIN: ${fmtMoney(d.totals.Yasmin||0)}\nLOURDES: ${fmtMoney(d.totals.Lourdes||0)}\nROSELY: ${fmtMoney(d.totals.Rosely||0)}`;
  }

  async function copyText31(text){
    try{
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true;}
    }catch(_e){}
    const ta=document.createElement('textarea');
    ta.value=text;ta.style.position='fixed';ta.style.opacity='0';ta.style.pointerEvents='none';
    document.body.appendChild(ta);ta.focus();ta.select();
    let ok=false;try{ok=document.execCommand('copy');}catch(_e){}
    ta.remove();return ok;
  }

  async function copyClosing31(btn){
    const old=btn.textContent;btn.disabled=true;btn.textContent='Preparando mensagem…';
    try{
      const d=await openCommissionData31();
      const message=buildMessage31(d);
      const ok=await copyText31(message);
      if(!ok)throw new Error('O navegador não permitiu copiar automaticamente.');
      btn.textContent='Copiado ✓';
      toast(d.rows.length?'Fechamento copiado. Abra o WhatsApp e cole a mensagem.':'SEM PENDÊNCIAS copiado.');
      setTimeout(()=>{btn.disabled=false;btn.textContent=old;},1800);
    }catch(e){
      btn.disabled=false;btn.textContent=old;toast(e.message||'Não foi possível copiar o fechamento.','error');
    }
  }

  function injectCopy31(){
    if(state.view!=='financeiro'||state.demo)return;
    ensureStyles31();
    const bulk=document.getElementById('commissionBulkBar30');
    if(!bulk||bulk.querySelector('[data-copy-commission-closing31]'))return;
    const actions=document.createElement('div');
    actions.className='commission-copy-actions31';
    actions.innerHTML='<button class="btn ghost" type="button" data-copy-commission-closing31>Copiar fechamento para WhatsApp</button>';
    bulk.appendChild(actions);
  }

  function showVersion31(){
    const foot=document.querySelector('.sidebar-foot');
    if(foot)foot.innerHTML='<span class="dot"></span> Ecossistema Sunshine · v3.32';
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-copy-commission-closing31]');
    if(!btn)return;
    e.preventDefault();e.stopPropagation();copyClosing31(btn);
  },true);

  function injectAll31(){
    showVersion31();
    injectCopy31();
    injectReceived31();
  }

  function start31(){
    injectAll31();
    if(observer31)return;
    observer31=new MutationObserver(()=>injectAll31());
    observer31.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start31);else start31();
})();

;

/* ---- assets/v32.js ---- */
/* Sunshine v3.33 — filtros de período + baixa de comissão por período + UX sem falha silenciosa */
(function(){
  const PERIOD_KEY='sunshine.period.v33';
  let observer32=null;
  function localISODate(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function defaultPeriod(){const now=new Date();return {start:`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`,end:localISODate(now)};}
  function getPeriod(){try{return {...defaultPeriod(),...(JSON.parse(localStorage.getItem(PERIOD_KEY)||'{}'))};}catch(_e){return defaultPeriod();}}
  function setPeriod(p){localStorage.setItem(PERIOD_KEY,JSON.stringify(p));}
  function bounds(p){const start=new Date(`${p.start}T00:00:00-03:00`);const end=new Date(`${p.end}T00:00:00-03:00`);end.setDate(end.getDate()+1);return [start.toISOString(),end.toISOString()];}
  function validPeriod(p){return Boolean(p.start&&p.end&&p.start<=p.end);}
  function humanError(e,fallback='Não foi possível concluir a ação.'){const raw=String(e?.message||e||fallback);if(/respons/i.test(raw))return 'Falta definir o responsável. Selecione quem realizou o atendimento para calcular as comissões e concluir.';if(/service|servi[cç]o/i.test(raw))return 'Falta definir o serviço. Selecione qual serviço foi pago para concluir a associação.';if(/client|cliente/i.test(raw)&&/not|n[aã]o|null|missing|falt/i.test(raw))return 'Falta identificar o cliente. Selecione ou complete o cadastro do cliente para concluir.';if(/appointment|compromisso/i.test(raw)&&/not|n[aã]o|null|missing|falt/i.test(raw))return 'Falta um atendimento válido para concluir esta associação. Confira cliente, data, serviço e responsável.';return raw;}
  function ensureStyles32(){if(document.getElementById('v32styles'))return;const s=document.createElement('style');s.id='v32styles';s.textContent=`.period-bar32{display:flex;gap:10px;align-items:end;flex-wrap:wrap;padding:12px 14px;margin:0 0 14px;border:1px solid #eadbd1;border-radius:14px;background:#fffaf6}.period-bar32 label{display:grid;gap:5px;font-size:11px;font-weight:800;color:#6c5147}.period-bar32 input{min-width:150px}.period-summary32{font-size:12px;color:#806b62;flex:1 1 220px;align-self:center}.client-fold32{margin-top:14px}.client-fold32>button{width:100%;display:flex;justify-content:space-between;align-items:center;border:0;background:#fff8f5;border-radius:12px;padding:12px 14px;font-weight:800;color:#5b2e20;cursor:pointer}.client-fold32>button span:last-child{font-size:18px}.client-fold32-body[hidden]{display:none!important}.field-error32{outline:2px solid #b42318!important;outline-offset:1px}@media(max-width:720px){.period-bar32{display:grid;grid-template-columns:1fr 1fr}.period-bar32 label input{width:100%;min-width:0}.period-summary32,.period-bar32 .btn{grid-column:1/-1}.client-summary{display:block!important}.client-summary>.panel{width:100%!important}}`;document.head.appendChild(s);}
  function periodBar32(context){const p=getPeriod();return `<div class="period-bar32" data-period-context32="${context}"><label>De<input class="field" type="date" data-period-start32 value="${p.start}"></label><label>Até<input class="field" type="date" data-period-end32 value="${p.end}"></label><button type="button" class="btn secondary" data-apply-period32>Aplicar período</button><div class="period-summary32">Filtro aplicado aos registros desta tela e às baixas de comissão.</div></div>`;}
  async function reloadFinanceRows32(p){if(state.demo||!db)return;if(!validPeriod(p)){toast('Informe uma data inicial e uma data final válidas.','error');return;}const [start,end]=bounds(p);const [payments,sales]=await Promise.all([db.from('payments').select('*,clients(full_name)').gte('paid_at',start).lt('paid_at',end).order('paid_at',{ascending:false}).limit(5000),db.from('sales').select('*,clients(full_name),services(name)').gte('sold_at',start).lt('sold_at',end).order('sold_at',{ascending:false}).limit(5000)]);if(payments.error){toast(humanError(payments.error),'error');return;}if(sales.error){toast(humanError(sales.error),'error');return;}const panels=[...document.querySelectorAll('#content article.panel')];const pp=panels.find(x=>(x.querySelector('h2')?.textContent||'').trim()==='Pagamentos');const sp=panels.find(x=>(x.querySelector('h2')?.textContent||'').trim()==='Vendas');const pt=pp?.querySelector('tbody'),st=sp?.querySelector('tbody');if(pt)pt.innerHTML=(payments.data||[]).length?(payments.data||[]).map(x=>`<tr><td>${fmtDateTime(x.paid_at||x.created_at)}</td><td>${escapeHtml(x.clients?.full_name||'—')}</td><td>${escapeHtml(x.source||'—')}</td><td>${fmtMoney(x.gross_amount)}</td><td>${statusPill(x.status)}</td></tr>`).join(''):'<tr class="empty-row"><td colspan="5">Nenhum pagamento neste período.</td></tr>';if(st)st.innerHTML=(sales.data||[]).length?(sales.data||[]).map(x=>`<tr><td>${fmtDateTime(x.sold_at)}</td><td>${escapeHtml(x.clients?.full_name||'—')}</td><td>${escapeHtml(x.services?.name||x.sale_type||'—')}</td><td>${fmtMoney(x.total_amount)}</td><td>${statusPill(x.status)}</td></tr>`).join(''):'<tr class="empty-row"><td colspan="5">Nenhuma venda neste período.</td></tr>';toast(`Período financeiro carregado: ${p.start.split('-').reverse().join('/')} a ${p.end.split('-').reverse().join('/')}.`);}
  async function reloadConsultations32(p){if(state.demo||!db)return;if(!validPeriod(p)){toast('Informe uma data inicial e uma data final válidas.','error');return;}const [start,end]=bounds(p);const q=await db.from('appointments').select('*,clients(full_name),services(name),team_members:responsible_member_id(full_name)').in('event_type',['CONSULTA','PERGUNTA','RETORNO']).gte('starts_at',start).lt('starts_at',end).order('starts_at',{ascending:false}).limit(5000);if(q.error){toast(humanError(q.error),'error');return;}const tbody=document.querySelector('#content table tbody');if(!tbody)return;tbody.innerHTML=(q.data||[]).length?(q.data||[]).map(a=>`<tr class="clickable" data-appt-id="${a.id}"><td>${fmtDateTime(a.starts_at)}</td><td>${escapeHtml(a.clients?.full_name||'—')}</td><td>${escapeHtml(a.services?.name||a.consultation_method||a.event_type)}</td><td>${escapeHtml(a.team_members?.full_name||'—')}</td><td>${statusPill(a.status)}</td><td class="wrap-cell">${escapeHtml(a.guidance_summary||'—')}</td></tr>`).join(''):'<tr class="empty-row"><td colspan="6">Nenhuma consulta neste período.</td></tr>';tbody.querySelectorAll('[data-appt-id]').forEach(r=>r.addEventListener('click',()=>editAppointment(r.dataset.apptId)));toast(`Consultas carregadas: ${p.start.split('-').reverse().join('/')} a ${p.end.split('-').reverse().join('/')}.`);}
  async function commissionSummary32(p){if(state.demo||!db)return {count:0,total:0};const [start,end]=bounds(p);const ce=await db.from('commission_entries').select('id,amount,payment_allocation_id').eq('status','DUE').limit(10000);if(ce.error)throw ce.error;const ids=[...new Set((ce.data||[]).map(x=>x.payment_allocation_id).filter(Boolean))];if(!ids.length)return {count:0,total:0};const pa=await db.from('payment_allocations').select('id,payment_id').in('id',ids).limit(10000);if(pa.error)throw pa.error;const pids=[...new Set((pa.data||[]).map(x=>x.payment_id).filter(Boolean))];if(!pids.length)return {count:0,total:0};const pq=await db.from('payments').select('id,paid_at,created_at').in('id',pids).gte('paid_at',start).lt('paid_at',end).limit(10000);if(pq.error)throw pq.error;const okPayments=new Set((pq.data||[]).map(x=>x.id));const allocOk=new Set((pa.data||[]).filter(x=>okPayments.has(x.payment_id)).map(x=>x.id));const rows=(ce.data||[]).filter(x=>allocOk.has(x.payment_allocation_id));return {count:rows.length,total:rows.reduce((s,x)=>s+Number(x.amount||0),0)};}
  async function payPeriod32(btn){const p=getPeriod();if(!validPeriod(p)){toast('Defina o período antes de dar baixa nas comissões.','error');return;}let s;try{s=await commissionSummary32(p);}catch(e){toast(humanError(e),'error');return;}if(!s.count){toast('Não há comissões pendentes dentro do período selecionado.');return;}if(!confirm(`Marcar como pagas ${s.count} comissões do período ${p.start.split('-').reverse().join('/')} a ${p.end.split('-').reverse().join('/')} no total de ${fmtMoney(s.total)}?`))return;btn.disabled=true;btn.textContent='Dando baixa no período…';const [start,end]=bounds(p);const {data,error}=await db.rpc('admin_pay_due_commissions_between',{p_start:start,p_end:end});btn.disabled=false;btn.textContent='Marcar período como pago';if(error){toast(humanError(error),'error');return;}toast(`${Number(data?.count||0)} comissões do período marcadas como pagas · ${fmtMoney(data?.total||0)}.`);await navigate('financeiro');}
  function decorateFinance32(){if(state.view!=='financeiro')return;const content=document.getElementById('content');if(!content)return;if(!content.querySelector('[data-period-context32="financeiro"]'))content.insertAdjacentHTML('afterbegin',periodBar32('financeiro'));const old=document.querySelector('[data-pay-all-commissions30]');if(old&&!old.dataset.period32){old.removeAttribute('data-pay-all-commissions30');old.dataset.payPeriod32='1';old.dataset.period32='1';old.textContent='Marcar período como pago';}}
  function decorateConsultations32(){if(state.view!=='consultas')return;const content=document.getElementById('content');if(!content)return;if(!content.querySelector('[data-period-context32="consultas"]'))content.insertAdjacentHTML('afterbegin',periodBar32('consultas'));}
  function decorateClientFold32(){if(state.view!=='clientes')return;const summary=document.querySelector('#content .client-summary');if(!summary||summary.dataset.fold32==='1')return;summary.dataset.fold32='1';summary.classList.add('client-fold32-body');summary.hidden=true;const wrap=document.createElement('div');wrap.className='client-fold32';wrap.innerHTML='<button type="button" data-client-fold32 aria-expanded="false"><span>Dados do cliente selecionado</span><span aria-hidden="true">⌄</span></button>';summary.parentNode.insertBefore(wrap,summary);wrap.appendChild(summary);}
  function invalidMessage32(target){const label=target.closest('label')?.childNodes?.[0]?.textContent?.trim()||target.getAttribute('aria-label')||target.name||target.id||'campo obrigatório';target.classList.add('field-error32');setTimeout(()=>target.classList.remove('field-error32'),1800);toast(`Falta preencher: ${label}. Complete esse dado para concluir.`,'error');}
  document.addEventListener('invalid',e=>invalidMessage32(e.target),true);
  window.addEventListener('unhandledrejection',e=>{if(e.reason)toast(humanError(e.reason),'error');});
  document.addEventListener('click',async e=>{const apply=e.target.closest('[data-apply-period32]');if(apply){const bar=apply.closest('[data-period-context32]');const p={start:bar.querySelector('[data-period-start32]').value,end:bar.querySelector('[data-period-end32]').value};if(!validPeriod(p)){toast('A data inicial não pode ser posterior à data final.','error');return;}setPeriod(p);if(bar.dataset.periodContext32==='financeiro')await reloadFinanceRows32(p);else await reloadConsultations32(p);return;}const pay=e.target.closest('[data-pay-period32]');if(pay){e.preventDefault();e.stopPropagation();await payPeriod32(pay);return;}const fold=e.target.closest('[data-client-fold32]');if(fold){const body=fold.parentElement.querySelector('.client-fold32-body');const open=body.hidden;body.hidden=!open;fold.setAttribute('aria-expanded',String(open));fold.querySelector('span:last-child').textContent=open?'⌃':'⌄';return;}},true);
  function inject32(){ensureStyles32();decorateFinance32();decorateConsultations32();decorateClientFold32();const foot=document.querySelector('.sidebar-foot');if(foot)foot.innerHTML='<span class="dot"></span> Ecossistema Sunshine · v3.33';}
  function start32(){inject32();if(observer32)return;observer32=new MutationObserver(inject32);observer32.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start32);else start32();
})();

;

/* ---- assets/v33.js ---- */
/* Sunshine v3.33 mobile — Cliente 360 abre no próprio cliente selecionado */
(function(){
  let obs=null;
  function placeClientAccordion(){
    if(state.view!=='clientes'||!window.matchMedia('(max-width:720px)').matches||!state.selectedClient?.id)return;
    const row=document.querySelector(`#clientTable tbody tr[data-client-id="${state.selectedClient.id}"]`);
    const fold=document.querySelector('#content .client-fold32');
    if(!row||!fold||fold.closest('[data-client-inline33]'))return;
    document.querySelectorAll('[data-client-inline33]').forEach(x=>x.remove());
    const tr=document.createElement('tr');tr.dataset.clientInline33='1';
    const td=document.createElement('td');td.colSpan=5;td.style.padding='8px 0 12px';
    tr.appendChild(td);row.insertAdjacentElement('afterend',tr);td.appendChild(fold);
    const btn=fold.querySelector('[data-client-fold32]');
    if(btn){btn.querySelector('span:first-child').textContent=`Abrir dados de ${state.selectedClient.preferred_name||state.selectedClient.full_name||'cliente'}`;}
    row.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function start(){placeClientAccordion();if(obs)return;obs=new MutationObserver(placeClientAccordion);obs.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});}
  window.addEventListener('resize',placeClientAccordion);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();

;

/* ---- assets/v34.js ---- */
/* Sunshine v3.34 — período visível dentro de Comissões */
(function(){
  const KEY='sunshine.period.v33';
  let observer34=null;
  let refreshing34=false;

  function today34(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function default34(){const d=new Date();return {start:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`,end:today34()};}
  function period34(){try{return {...default34(),...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch(_e){return default34();}}
  function save34(p){localStorage.setItem(KEY,JSON.stringify(p));}
  function valid34(p){return Boolean(p.start&&p.end&&p.start<=p.end);}
  function bounds34(p){const a=new Date(`${p.start}T00:00:00-03:00`),b=new Date(`${p.end}T00:00:00-03:00`);b.setDate(b.getDate()+1);return [a.toISOString(),b.toISOString()];}
  function br34(v){return String(v||'').split('-').reverse().join('/');}

  function panel34(){return [...document.querySelectorAll('#content article.panel')].find(p=>/^comiss[oõ]es$/i.test((p.querySelector('h2')?.textContent||'').trim()))||null;}
  function ensureStyle34(){if(document.getElementById('v34style'))return;const s=document.createElement('style');s.id='v34style';s.textContent=`
    .commission-period34{border:1px solid #e5d5cb;background:#fffaf6;border-radius:16px;padding:14px 16px;margin:14px 0;display:grid;gap:12px}
    .commission-period34-head b{display:block;color:#5b2e20;font-size:14px}.commission-period34-head span{display:block;color:#806b62;font-size:12px;line-height:1.4;margin-top:3px}
    .commission-period34-fields{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end}.commission-period34-fields label{display:grid;gap:5px;font-size:11px;font-weight:800;color:#6c5147}.commission-period34-fields input{width:100%}
    .commission-period34-status{padding:10px 12px;border-radius:12px;background:#fff;color:#705d55;font-size:12px;line-height:1.4}.commission-period34-status b{color:#3c2017}
    @media(max-width:720px){.commission-period34-fields{grid-template-columns:1fr 1fr}.commission-period34-fields .btn{grid-column:1/-1;width:100%}}
  `;document.head.appendChild(s);}

  async function data34(p,status='DUE'){
    const [start,end]=bounds34(p);
    const cq=await db.from('commission_entries').select('id,amount,beneficiary_member_id,payment_allocation_id,status').eq('status',status).limit(10000);
    if(cq.error)throw cq.error;
    const entries=cq.data||[];if(!entries.length)return {rows:[],total:0,totals:{},count:0};
    const allocIds=[...new Set(entries.map(x=>x.payment_allocation_id).filter(Boolean))];if(!allocIds.length)return {rows:[],total:0,totals:{},count:0};
    const aq=await db.from('payment_allocations').select('id,payment_id').in('id',allocIds).limit(10000);if(aq.error)throw aq.error;
    const payByAlloc=Object.fromEntries((aq.data||[]).map(x=>[x.id,x.payment_id]));
    const payIds=[...new Set((aq.data||[]).map(x=>x.payment_id).filter(Boolean))];if(!payIds.length)return {rows:[],total:0,totals:{},count:0};
    const pq=await db.from('payments').select('id,paid_at,created_at').in('id',payIds).gte('paid_at',start).lt('paid_at',end).limit(10000);if(pq.error)throw pq.error;
    const ok=new Set((pq.data||[]).map(x=>x.id));
    const team=Object.fromEntries((state.team||[]).map(x=>[x.id,x.full_name]));
    const rows=entries.filter(x=>ok.has(payByAlloc[x.payment_allocation_id]));
    const totals={};rows.forEach(x=>{const name=team[x.beneficiary_member_id]||'Outros';totals[name]=(totals[name]||0)+Number(x.amount||0);});
    return {rows,count:rows.length,total:rows.reduce((s,x)=>s+Number(x.amount||0),0),totals};
  }

  function syncTopFilter34(p){document.querySelectorAll('[data-period-context32="financeiro"]').forEach(bar=>{const a=bar.querySelector('[data-period-start32]'),b=bar.querySelector('[data-period-end32]');if(a)a.value=p.start;if(b)b.value=p.end;});}

  async function refresh34(){
    if(refreshing34||state.view!=='financeiro'||state.demo||!db)return;
    const box=document.getElementById('commissionPeriod34'),bulk=document.getElementById('commissionBulkBar30');if(!box||!bulk)return;
    refreshing34=true;
    try{
      const p=period34(),d=await data34(p,'DUE');
      const status=box.querySelector('[data-period-status34]');
      if(status)status.innerHTML=d.count?`No período de <b>${br34(p.start)} a ${br34(p.end)}</b>: <b>${d.count}</b> comissões abertas · total <b>${fmtMoney(d.total)}</b>.`:`No período de <b>${br34(p.start)} a ${br34(p.end)}</b>: nenhuma comissão aberta.`;
      const title=bulk.querySelector('b');if(title&&title.textContent!=='Baixa do período')title.textContent='Baixa do período';
      const copy=bulk.querySelector('[data-commission-bulk-copy30]');if(copy){const txt=d.count?`${d.count} comissões do período · total ${fmtMoney(d.total)}. Somente este período será baixado.`:'Nenhuma comissão aberta no período selecionado.';if(copy.textContent!==txt)copy.textContent=txt;}
      let btn=bulk.querySelector('[data-pay-all-commissions30],[data-pay-period32],[data-pay-period34]');
      if(btn){btn.removeAttribute('data-pay-all-commissions30');btn.removeAttribute('data-pay-period32');btn.dataset.payPeriod34='1';btn.disabled=!d.count;const txt=d.count?`Marcar período como pago (${d.count})`:'Nenhuma comissão no período';if(btn.textContent!==txt)btn.textContent=txt;}
      const copyBtn=bulk.querySelector('[data-copy-commission-closing31],[data-copy-period34]');if(copyBtn){copyBtn.removeAttribute('data-copy-commission-closing31');copyBtn.dataset.copyPeriod34='1';copyBtn.textContent='Copiar fechamento deste período';}
    }catch(e){toast(e.message||'Não foi possível carregar as comissões do período.','error');}
    finally{refreshing34=false;}
  }

  function inject34(){
    if(state.view!=='financeiro')return;ensureStyle34();const p=panel34();if(!p)return;
    const bulk=document.getElementById('commissionBulkBar30');if(!bulk)return;
    let box=document.getElementById('commissionPeriod34');
    if(!box){const r=period34();box=document.createElement('div');box.id='commissionPeriod34';box.className='commission-period34';box.innerHTML=`<div class="commission-period34-head"><b>Filtrar período das comissões</b><span>Escolha o período antes da baixa. Agosto e setembro ficam separados.</span></div><div class="commission-period34-fields"><label>De<input class="field" type="date" data-start34 value="${r.start}"></label><label>Até<input class="field" type="date" data-end34 value="${r.end}"></label><button class="btn secondary" type="button" data-apply34>Aplicar filtro</button></div><div class="commission-period34-status" data-period-status34>Carregando período…</div>`;bulk.insertAdjacentElement('beforebegin',box);}
    setTimeout(refresh34,120);
  }

  async function apply34(btn){const box=btn.closest('#commissionPeriod34'),p={start:box.querySelector('[data-start34]').value,end:box.querySelector('[data-end34]').value};if(!valid34(p)){toast('A data inicial não pode ser posterior à data final. Corrija o período para continuar.','error');return;}save34(p);syncTopFilter34(p);const top=document.querySelector('[data-period-context32="financeiro"] [data-apply-period32]');if(top)top.click();await refresh34();}

  async function pay34(btn){const p=period34();if(!valid34(p)){toast('Falta definir um período válido antes da baixa.','error');return;}let d;try{d=await data34(p,'DUE');}catch(e){toast(e.message||'Não foi possível consultar as comissões.','error');return;}if(!d.count){toast('Não há comissões abertas no período selecionado.');return;}if(!confirm(`Marcar como pagas ${d.count} comissões de ${br34(p.start)} a ${br34(p.end)}, total ${fmtMoney(d.total)}?\n\nSomente este período será baixado.`))return;btn.disabled=true;btn.textContent='Dando baixa no período…';const [start,end]=bounds34(p);const q=await db.rpc('admin_pay_due_commissions_between',{p_start:start,p_end:end});if(q.error){btn.disabled=false;toast(q.error.message||'Não foi possível concluir a baixa.','error');await refresh34();return;}toast(`${Number(q.data?.count||0)} comissões do período marcadas como pagas · ${fmtMoney(q.data?.total||0)}.`);await navigate('financeiro');}

  async function copy34(btn){const p=period34();let d;try{d=await data34(p,'DUE');}catch(e){toast(e.message||'Não foi possível montar o fechamento.','error');return;}const names=['Yasmin','Lourdes','Rosely',...Object.keys(d.totals).filter(x=>!['Yasmin','Lourdes','Rosely'].includes(x))];const lines=d.count?[`COMISSÃO DO PERÍODO: ${br34(p.start)} A ${br34(p.end)}`,'',...names.filter(n=>d.totals[n]).map(n=>`${n.toUpperCase()}: ${fmtMoney(d.totals[n])}`)]:[`COMISSÃO DO PERÍODO: ${br34(p.start)} A ${br34(p.end)}`,'','SEM PENDÊNCIAS'];const text=lines.join('\n');try{await navigator.clipboard.writeText(text);toast('Fechamento do período copiado.');}catch(_e){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Fechamento do período copiado.');}}

  document.addEventListener('click',e=>{const a=e.target.closest('[data-apply34]');if(a){e.preventDefault();apply34(a);return;}const p=e.target.closest('[data-pay-period34]');if(p){e.preventDefault();e.stopPropagation();pay34(p);return;}const c=e.target.closest('[data-copy-period34]');if(c){e.preventDefault();e.stopPropagation();copy34(c);return;}},true);
  function start34(){inject34();if(observer34)return;observer34=new MutationObserver(inject34);observer34.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});const foot=document.querySelector('.sidebar-foot');if(foot)foot.innerHTML='<span class="dot"></span> Ecossistema Sunshine · v3.34';}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start34);else start34();
})();

;

/* ---- assets/v35.js ---- */
/* Sunshine v3.35 — filtro de período controla toda a visão de Comissões */
(function(){
  const KEY='sunshine.period.v33';
  let observer35=null;
  let busy35=false;
  let timer35=null;

  function today35(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function default35(){const d=new Date();return {start:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`,end:today35()};}
  function period35(){try{return {...default35(),...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch(_e){return default35();}}
  function valid35(p){return Boolean(p.start&&p.end&&p.start<=p.end);}
  function bounds35(p){const a=new Date(`${p.start}T00:00:00-03:00`),b=new Date(`${p.end}T00:00:00-03:00`);b.setDate(b.getDate()+1);return [a.toISOString(),b.toISOString()];}
  function br35(v){return String(v||'').split('-').reverse().join('/');}
  function panel35(){return document.getElementById('commissionControl');}
  function member35(id){return byId(state.team||[],id)?.full_name||'—';}

  function human35(e){
    const raw=String(e?.message||e||'Não foi possível concluir.');
    if(/respons/i.test(raw))return 'Falta definir o responsável para concluir esta comissão.';
    if(/payment|pagamento/i.test(raw)&&/not|n[aã]o|missing|falt/i.test(raw))return 'Falta um pagamento válido associado a esta comissão.';
    return raw;
  }

  async function load35(p){
    const [start,end]=bounds35(p);
    const [cq,receivedQ]=await Promise.all([
      db.from('commission_entries')
        .select('id,amount,percentage,beneficiary_member_id,responsible_member_id,payment_allocation_id,status,paid_at,created_at,calculation_source')
        .eq('calculation_source','RULE').in('status',['DUE','PAID']).limit(10000),
      db.from('payments').select('id,gross_amount,paid_at').eq('status','PAID').gte('paid_at',start).lt('paid_at',end).limit(10000)
    ]);
    if(cq.error)throw cq.error;if(receivedQ.error)throw receivedQ.error;
    const commissions=cq.data||[];
    const allocationIds=[...new Set(commissions.map(x=>x.payment_allocation_id).filter(Boolean))];
    if(!allocationIds.length)return {rows:[],due:[],paid:[],dueTotal:0,paidTotal:0,receivedTotal:(receivedQ.data||[]).reduce((s,x)=>s+Number(x.gross_amount||0),0),dueByPerson:{},duePeople:0};

    const aq=await db.from('payment_allocations').select('id,payment_id,sale_id').in('id',allocationIds).limit(10000);
    if(aq.error)throw aq.error;
    const allocations=aq.data||[];
    const allocById=Object.fromEntries(allocations.map(x=>[x.id,x]));
    const paymentIds=[...new Set(allocations.map(x=>x.payment_id).filter(Boolean))];
    const pq=paymentIds.length
      ?await db.from('payments').select('id,paid_at,created_at,gross_amount,client_id,status').in('id',paymentIds).gte('paid_at',start).lt('paid_at',end).limit(10000)
      :{data:[],error:null};
    if(pq.error)throw pq.error;
    const paymentById=Object.fromEntries((pq.data||[]).map(x=>[x.id,x]));
    const allowedPayments=new Set(Object.keys(paymentById));
    const rows=commissions.filter(c=>{
      const a=allocById[c.payment_allocation_id];return a&&allowedPayments.has(a.payment_id);
    });

    const saleIds=[...new Set(rows.map(c=>allocById[c.payment_allocation_id]?.sale_id).filter(Boolean))];
    const sq=saleIds.length
      ?await db.from('sales').select('id,client_id,service_id,work_id,sale_type,responsible_member_id').in('id',saleIds).limit(10000)
      :{data:[],error:null};
    if(sq.error)throw sq.error;
    const saleById=Object.fromEntries((sq.data||[]).map(x=>[x.id,x]));

    const enriched=rows.map(c=>{
      const a=allocById[c.payment_allocation_id]||{};
      const payment=paymentById[a.payment_id]||{};
      const sale=saleById[a.sale_id]||{};
      return {...c,allocation:a,payment,sale};
    }).sort((a,b)=>new Date(b.payment.paid_at||b.created_at)-new Date(a.payment.paid_at||a.created_at));
    const due=enriched.filter(x=>x.status==='DUE'),paid=enriched.filter(x=>x.status==='PAID');
    const dueByPerson={};due.forEach(x=>{dueByPerson[x.beneficiary_member_id]=(dueByPerson[x.beneficiary_member_id]||0)+Number(x.amount||0);});
    return {
      rows:enriched,due,paid,
      dueTotal:due.reduce((s,x)=>s+Number(x.amount||0),0),
      paidTotal:paid.reduce((s,x)=>s+Number(x.amount||0),0),
      receivedTotal:(receivedQ.data||[]).reduce((s,x)=>s+Number(x.gross_amount||0),0),
      dueByPerson,duePeople:Object.keys(dueByPerson).length
    };
  }

  function setText35(el,text){if(el&&el.textContent!==text)el.textContent=text;}
  function card35(panel,matcher){return [...panel.querySelectorAll('.kpi-grid .card')].find(c=>matcher((c.querySelector('.card-label')?.textContent||'').trim().toUpperCase()))||null;}
  function setCard35(card,label,value,foot){if(!card)return;setText35(card.querySelector('.card-label'),label);setText35(card.querySelector('.value'),value);setText35(card.querySelector('.card-foot'),foot);}

  function syncCards35(panel,d,p){
    setCard35(card35(panel,t=>t.includes('RECEBIDO')),'RECEBIDO NO PERÍODO',fmtMoney(d.receivedTotal),`${br35(p.start)} a ${br35(p.end)} · pagamentos confirmados`);
    setCard35(card35(panel,t=>t.includes('A PAGAR')),'A PAGAR NO PERÍODO',fmtMoney(d.dueTotal),'Comissões operacionais abertas do período');
    setCard35(card35(panel,t=>t.includes('PAGO')),'PAGO NO PERÍODO',fmtMoney(d.paidTotal),'Comissões deste período já baixadas');
    setCard35(card35(panel,t=>t.includes('PESSOAS')),'PESSOAS COM SALDO',String(d.duePeople),'Beneficiários com valor a receber no período');
    panel.querySelector('#paidMonthByPerson')?.remove();
  }

  function syncPeople35(panel,d){
    panel.querySelectorAll('.button-row').forEach(row=>{
      if(row.id==='commissionDueByPerson35'||row.closest('#commissionBulkBar30'))return;
      if(row.querySelector('.pill.red')&&!row.querySelector('button'))row.hidden=true;
    });
    let row=panel.querySelector('#commissionDueByPerson35');
    if(!row){row=document.createElement('div');row.id='commissionDueByPerson35';row.className='button-row';row.style.margin='14px 0';const grid=panel.querySelector('.kpi-grid');grid?.insertAdjacentElement('afterend',row);}
    const html=Object.entries(d.dueByPerson).sort((a,b)=>b[1]-a[1]).map(([id,total])=>`<span class="pill red">${escapeHtml(member35(id))}: ${fmtMoney(total)}</span>`).join(' ');
    row.hidden=!html;if(row.innerHTML!==html)row.innerHTML=html;
  }

  function rowHtml35(x){
    const sale=x.sale||{};
    const client=byId(state.clients||[],sale.client_id);
    const service=byId(state.services||[],sale.service_id);
    const work=(state.works||[]).find(w=>w.id===sale.work_id);
    const origin=work?.title||service?.name||(sale.sale_type?String(sale.sale_type).replaceAll('_',' '):'Venda relacionada');
    const responsible=x.responsible_member_id||sale.responsible_member_id;
    const competence=x.payment?.paid_at||x.payment?.created_at||x.created_at;
    const action=x.status==='DUE'
      ?`<button class="btn secondary" type="button" data-commission-toggle35="${x.id}" data-paid35="1">Marcar como pago</button>`
      :`<button class="btn ghost" type="button" data-commission-toggle35="${x.id}" data-paid35="0">Reabrir</button>`;
    return `<tr data-period-commission35="${x.id}">
      <td>${fmtDate(competence)}</td>
      <td><b>${escapeHtml(member35(x.beneficiary_member_id))}</b><small>Responsável: ${escapeHtml(member35(responsible))}</small></td>
      <td><b>${escapeHtml(origin)}</b><small>${escapeHtml(client?.full_name||'Cliente não identificado')}</small></td>
      <td>${Number(x.percentage||0).toLocaleString('pt-BR')}%</td>
      <td><b>${fmtMoney(x.amount)}</b></td>
      <td>${statusPill(x.status)}</td>
      <td>${x.paid_at?fmtDateTime(x.paid_at):'—'}</td>
      <td>${action}</td>
    </tr>`;
  }

  function syncTable35(panel,d,p){
    const table=[...panel.querySelectorAll('.table-wrap table')].find(t=>/BENEFICIÁRIO/i.test(t.querySelector('thead')?.textContent||'')&&/ORIGEM/i.test(t.querySelector('thead')?.textContent||''));
    if(!table)return;
    const tbody=table.querySelector('tbody');if(!tbody)return;
    const signature=`${p.start}|${p.end}|${d.rows.map(x=>`${x.id}:${x.status}:${x.paid_at||''}`).join(',')}`;
    if(tbody.dataset.signature35===signature)return;
    tbody.dataset.signature35=signature;
    tbody.innerHTML=d.rows.length?d.rows.map(rowHtml35).join(''):`<tr class="empty-row"><td colspan="8"><b>Nenhuma comissão neste período.</b><br><small>Altere as datas acima para consultar outro período.</small></td></tr>`;
  }

  function stopLegacyCopy35(panel){
    const bulk=panel.querySelector('#commissionBulkBar30');if(!bulk)return;
    if(!bulk.querySelector('#legacyCopyMarker35')){const marker=document.createElement('span');marker.id='legacyCopyMarker35';marker.hidden=true;marker.setAttribute('data-copy-commission-closing31','');bulk.appendChild(marker);}
    bulk.querySelectorAll('button').forEach(btn=>{if((btn.textContent||'').trim()==='Copiar fechamento para WhatsApp')btn.remove();});
  }

  async function refresh35(){
    if(busy35||state.view!=='financeiro'||state.demo||!db)return;
    const panel=panel35();if(!panel)return;
    const p=period35();if(!valid35(p))return;
    busy35=true;
    try{
      const d=await load35(p);
      syncCards35(panel,d,p);syncPeople35(panel,d);syncTable35(panel,d,p);stopLegacyCopy35(panel);
      const intro=panel.querySelector('.section-head p');
      if(intro)setText35(intro,`Comissões exibidas conforme o período selecionado: ${br35(p.start)} a ${br35(p.end)}. Setembro não entra quando agosto estiver filtrado.`);
    }catch(e){console.error(e);toast(human35(e),'error');}
    finally{busy35=false;}
  }

  function schedule35(delay=120){clearTimeout(timer35);timer35=setTimeout(refresh35,delay);}

  async function toggle35(btn){
    if(!requireReal())return;
    const paid=btn.dataset.paid35==='1';
    const msg=paid?'Marcar esta comissão como paga?':'Reabrir esta comissão como a pagar?';
    if(!confirm(msg))return;
    btn.disabled=true;btn.textContent=paid?'Marcando…':'Reabrindo…';
    const q=await db.rpc('set_commission_payment_status',{p_commission_id:btn.dataset.commissionToggle35,p_paid:paid});
    if(q.error){btn.disabled=false;toast(human35(q.error),'error');return;}
    toast(paid?'Comissão marcada como paga.':'Comissão reaberta como a pagar.');
    await refresh35();
  }

  document.addEventListener('click',e=>{
    const apply=e.target.closest('[data-apply34]');if(apply){setTimeout(()=>refresh35(),280);return;}
    const toggle=e.target.closest('[data-commission-toggle35]');if(toggle){e.preventDefault();e.stopPropagation();toggle35(toggle);}
  },true);

  function start35(){
    const foot=document.querySelector('.sidebar-foot');if(foot)foot.innerHTML='<span class="dot"></span> Ecossistema Sunshine · v3.35';
    schedule35(180);
    if(observer35)return;
    observer35=new MutationObserver(()=>{if(state.view==='financeiro')schedule35(140);});
    observer35.observe(document.getElementById('content')||document.body,{childList:true,subtree:true,characterData:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start35);else start35();
})();

;

/* ---- assets/v40.js ---- */
/* Sunshine v3.40 — financeiro unificado estável + comissões recolhíveis */
(function(){
  const PERIOD_KEY='sunshine.period.v33';
  const COMMISSION_KEY='sunshine.commissions.open.v40';
  let detail40={};
  let renderToken40=0;

  function style40(){
    if(document.getElementById('v40style'))return;
    const s=document.createElement('style');s.id='v40style';s.textContent=`
      .commission-toggle40{display:inline-flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid #dfcfc5;background:#fff;border-radius:11px;padding:9px 12px;font-weight:800;color:#5b2e20;cursor:pointer;white-space:nowrap}
      .finance-unified40 .section-head{align-items:center}.finance-unified40 .section-head p{margin-top:3px}.finance-unified40 td small{display:block;color:#806b62;margin-top:3px;line-height:1.35}
      .finance-status40{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:800;white-space:nowrap}.finance-status40.paid{background:#eaf5ef;color:#256044}.finance-status40.partial{background:#fff3d7;color:#745600}.finance-status40.pending{background:#fdebea;color:#a41f1f}.finance-status40.review{background:#f1ece8;color:#6f5e55}
      .finance-detail40{display:grid;gap:14px}.finance-detail-grid40{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.finance-detail-grid40>div{border:1px solid #eadfd8;border-radius:12px;padding:12px;background:#fffaf6}.finance-detail-grid40 span{display:block;font-size:10px;text-transform:uppercase;color:#8e776c}.finance-detail-grid40 b{display:block;margin-top:4px;font-size:16px}.finance-receipt40{display:flex;justify-content:space-between;gap:12px;border:1px solid #eadfd8;border-radius:12px;padding:11px 12px}.finance-receipt40 small{display:block;color:#806b62;margin-top:3px}
      @media(max-width:720px){.commission-toggle40{width:100%}.finance-unified40 .section-head{display:grid;gap:10px}.finance-unified40 .section-head .btn{width:100%}.finance-detail-grid40{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }
  function period40(){const d=new Date(),def={start:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`,end:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};try{return {...def,...JSON.parse(localStorage.getItem(PERIOD_KEY)||'{}')}}catch{return def}}
  function bounds40(p){const a=new Date(`${p.start}T00:00:00-03:00`),b=new Date(`${p.end}T00:00:00-03:00`);b.setDate(b.getDate()+1);return[a.toISOString(),b.toISOString()]}
  const br40=v=>String(v||'').split('-').reverse().join('/');
  const num40=v=>Number(v||0);
  const client40=id=>byId(state.clients||[],id)?.full_name||'Cliente não identificado';
  function label40(s){const service=byId(state.services||[],s.service_id),work=(state.works||[]).find(w=>w.id===s.work_id);return work?.title||service?.name||String(s.sale_type||'Venda').replaceAll('_',' ')}

  function commission40(){return document.getElementById('commissionControl')||[...document.querySelectorAll('#content article.panel')].find(p=>/^comiss[oõ]es$/i.test((p.querySelector('h2')?.textContent||'').trim()))||null}
  function applyCommission40(){
    if(state.view!=='financeiro')return;
    const panel=commission40();if(!panel)return;panel.id='commissionControl';
    const head=panel.querySelector('.section-head');if(!head)return;
    let btn=head.querySelector('[data-commission-toggle40]');if(!btn){btn=document.createElement('button');btn.type='button';btn.className='commission-toggle40';btn.dataset.commissionToggle40='1';head.appendChild(btn)}
    const open=localStorage.getItem(COMMISSION_KEY)==='1';btn.innerHTML=open?'<span>Recolher comissões</span><span>▲</span>':'<span>Abrir comissões</span><span>▼</span>';
    const summary=panel.querySelector('#commissionDueByPerson35');
    [...panel.children].forEach(ch=>{ch.hidden=!(open||ch===head||ch===summary)});if(summary)summary.hidden=false;
  }
  function toggleCommission40(){localStorage.setItem(COMMISSION_KEY,localStorage.getItem(COMMISSION_KEY)==='1'?'0':'1');applyCommission40()}
  function legacyPanels40(){const ps=[...document.querySelectorAll('#content article.panel')];return{payments:ps.find(p=>/^pagamentos$/i.test((p.querySelector('h2')?.textContent||'').trim())),sales:ps.find(p=>/^vendas$/i.test((p.querySelector('h2')?.textContent||'').trim()))}}

  async function load40(){
    const p=period40(),[start,end]=bounds40(p);
    const [pq,sq]=await Promise.all([
      db.from('payments').select('id,client_id,source,status,gross_amount,payment_method,paid_at,created_at').eq('status','PAID').gte('paid_at',start).lt('paid_at',end).order('paid_at',{ascending:false}).limit(5000),
      db.from('sales').select('id,client_id,service_id,work_id,responsible_member_id,sale_type,status,total_amount,unit_price,sold_at,created_at').gte('sold_at',start).lt('sold_at',end).order('sold_at',{ascending:false}).limit(5000)
    ]);if(pq.error)throw pq.error;if(sq.error)throw sq.error;
    const periodPayments=pq.data||[],periodSales=sq.data||[],payIds=periodPayments.map(x=>x.id);
    const paq=payIds.length?await db.from('payment_allocations').select('payment_id,sale_id,amount').in('payment_id',payIds).limit(10000):{data:[],error:null};if(paq.error)throw paq.error;
    const periodAlloc=paq.data||[],linked=[...new Set(periodAlloc.map(x=>x.sale_id).filter(Boolean))],have=new Set(periodSales.map(x=>x.id)),missing=linked.filter(x=>!have.has(x));
    let extraSales=[];if(missing.length){const q=await db.from('sales').select('id,client_id,service_id,work_id,responsible_member_id,sale_type,status,total_amount,unit_price,sold_at,created_at').in('id',missing).limit(5000);if(q.error)throw q.error;extraSales=q.data||[]}
    const sales=[...periodSales,...extraSales],saleIds=[...new Set(sales.map(x=>x.id))];
    const aq=saleIds.length?await db.from('payment_allocations').select('payment_id,sale_id,amount').in('sale_id',saleIds).limit(20000):{data:[],error:null};if(aq.error)throw aq.error;
    const alloc=aq.data||[],allPayIds=[...new Set(alloc.map(x=>x.payment_id).filter(Boolean))];
    let allPayments=[];if(allPayIds.length){const q=await db.from('payments').select('id,client_id,source,status,gross_amount,payment_method,paid_at,created_at').in('id',allPayIds).limit(10000);if(q.error)throw q.error;allPayments=q.data||[]}
    const payById=Object.fromEntries(allPayments.map(x=>[x.id,x])),receipts={};alloc.forEach(a=>{const pay=payById[a.payment_id];if(!pay||pay.status!=='PAID')return;(receipts[a.sale_id]||(receipts[a.sale_id]=[])).push({pay,amount:num40(a.amount)})});Object.values(receipts).forEach(x=>x.sort((a,b)=>new Date(b.pay.paid_at||b.pay.created_at)-new Date(a.pay.paid_at||a.pay.created_at)));
    const saleRows=sales.map(s=>{const rs=receipts[s.id]||[],total=num40(s.total_amount||s.unit_price),received=rs.reduce((a,x)=>a+x.amount,0),balance=Math.max(total-received,0),status=received<=.005?'PENDING':balance>.005?'PARTIAL':'PAID',last=rs[0]?.pay?.paid_at||rs[0]?.pay?.created_at||null;return{kind:'sale',sale:s,rs,total,received,balance,status,last,sort:last||s.sold_at||s.created_at}});
    const allocated=new Set(periodAlloc.map(x=>x.payment_id)),orphans=periodPayments.filter(x=>!allocated.has(x.id)).map(pay=>({kind:'payment',pay,sort:pay.paid_at||pay.created_at}));
    const rows=[...saleRows,...orphans].sort((a,b)=>new Date(b.sort)-new Date(a.sort));detail40=Object.fromEntries(saleRows.map(x=>[x.sale.id,x]));return{p,rows}
  }
  function status40(v){return v==='PAID'?'<span class="finance-status40 paid">Pago</span>':v==='PARTIAL'?'<span class="finance-status40 partial">Parcial</span>':v==='PENDING'?'<span class="finance-status40 pending">Pendente</span>':'<span class="finance-status40 review">A associar</span>'}
  function source40(rs){const a=[...new Set((rs||[]).map(x=>x.pay.source==='ASAAS'?'Asaas':x.pay.source==='MANUAL'?'Manual':x.pay.source||'Pagamento'))];return a.join(' + ')||'Sem recebimento'}
  function row40(r){
    if(r.kind==='payment')return`<tr><td>${fmtDateTime(r.pay.paid_at||r.pay.created_at)}</td><td><b>${escapeHtml(client40(r.pay.client_id))}</b></td><td><b>Pagamento sem venda associada</b><small>${escapeHtml(r.pay.source||'Pagamento')}</small></td><td>—</td><td><b>${fmtMoney(r.pay.gross_amount)}</b></td><td>—</td><td>${status40('REVIEW')}</td><td>—</td></tr>`;
    const s=r.sale;return`<tr><td>${fmtDate(s.sold_at||s.created_at)}${r.last?`<small>Último recebimento: ${fmtDate(r.last)}</small>`:''}</td><td><b>${escapeHtml(client40(s.client_id))}</b></td><td><b>${escapeHtml(label40(s))}</b><small>${escapeHtml(String(s.sale_type||'').replaceAll('_',' '))}</small></td><td><b>${fmtMoney(r.total)}</b><small>contratado</small></td><td><b>${fmtMoney(r.received)}</b><small>${r.rs.length} recebimento${r.rs.length===1?'':'s'} · ${escapeHtml(source40(r.rs))}</small></td><td><b>${fmtMoney(r.balance)}</b><small>${r.balance>.005?'a receber':'quitado'}</small></td><td>${status40(r.status)}</td><td><button type="button" class="link-btn" data-detail40="${s.id}">Ver recebimentos</button></td></tr>`
  }
  async function build40(){
    if(state.view!=='financeiro'||state.demo||!db)return;const token=++renderToken40,{payments,sales}=legacyPanels40();if(!payments||!sales)return;
    payments.hidden=true;sales.hidden=true;let panel=document.getElementById('financeUnified40');if(!panel){panel=document.createElement('article');panel.id='financeUnified40';panel.className='panel finance-unified40';payments.insertAdjacentElement('beforebegin',panel)}
    panel.innerHTML='<div class="empty-state"><span class="spinner"></span>Carregando lançamentos…</div>';
    try{const d=await load40();if(token!==renderToken40||state.view!=='financeiro')return;panel.innerHTML=`<div class="section-head"><div><h2>Lançamentos</h2><p>Venda e recebimentos em uma única visão · ${br40(d.p.start)} a ${br40(d.p.end)}</p></div><button class="btn" type="button" data-new-payment40>+ Pagamento</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Cliente</th><th>Serviço / trabalho</th><th>Valor contratado</th><th>Recebido</th><th>Saldo</th><th>Status</th><th>Ação</th></tr></thead><tbody>${d.rows.length?d.rows.map(row40).join(''):'<tr class="empty-row"><td colspan="8">Nenhum lançamento no período.</td></tr>'}</tbody></table></div>`}catch(e){console.error('v40',e);panel.innerHTML=`<div class="empty-state error">${escapeHtml(e.message||'Não foi possível carregar os lançamentos.')}</div>`}
  }
  function detailModal40(id){const r=detail40[id];if(!r)return;const s=r.sale,receipts=r.rs.length?r.rs.map(x=>`<div class="finance-receipt40"><div><b>${escapeHtml(x.pay.source==='ASAAS'?'Asaas':x.pay.source==='MANUAL'?'Manual':x.pay.source||'Pagamento')} · ${escapeHtml(x.pay.payment_method||'')}</b><small>${fmtDateTime(x.pay.paid_at||x.pay.created_at)}</small></div><b>${fmtMoney(x.amount)}</b></div>`).join(''):'<div class="empty-state compact">Nenhum recebimento associado.</div>';openModal('Venda e recebimentos',`<div class="finance-detail40"><div><b>${escapeHtml(client40(s.client_id))}</b><div class="muted">${escapeHtml(label40(s))}</div></div><div class="finance-detail-grid40"><div><span>Contratado</span><b>${fmtMoney(r.total)}</b></div><div><span>Recebido</span><b>${fmtMoney(r.received)}</b></div><div><span>Saldo</span><b>${fmtMoney(r.balance)}</b></div></div><div><h3>Histórico de recebimentos</h3>${receipts}</div></div>`,true)}

  function afterFinance40(){setTimeout(applyCommission40,80);setTimeout(applyCommission40,650);setTimeout(build40,180)}
  const prevRender40=render;render=async function(){await prevRender40();if(state.view==='financeiro')afterFinance40()};
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-commission-toggle40]');if(t){e.preventDefault();e.stopPropagation();toggleCommission40();return}
    const d=e.target.closest('[data-detail40]');if(d){e.preventDefault();detailModal40(d.dataset.detail40);return}
    const n=e.target.closest('[data-new-payment40]');if(n){e.preventDefault();const {payments}=legacyPanels40(),original=[...(payments?.querySelectorAll('button')||[])].find(b=>/pagamento/i.test(b.textContent||''));if(original)original.click();else if(typeof handleAction==='function')handleAction('new-payment');return}
    if(e.target.closest('[data-apply34],[data-apply-period32]')){setTimeout(applyCommission40,250);setTimeout(build40,550)}
  },true);
  style40();const foot=document.querySelector('.sidebar-foot');if(foot)foot.innerHTML='<span class="dot"></span> Ecossistema Sunshine · v3.40';if(state.view==='financeiro')afterFinance40();
})();

;

/* ---- assets/v41.js ---- */
/* Sunshine v3.41 — selecionar pagamentos do Asaas e associar a uma única venda */
(function(){
  let cache41=[];
  let busy41=false;
  let timer41=null;

  const digits41=v=>String(v||'').replace(/\D/g,'');
  const last1141=v=>digits41(v).slice(-11);
  const installment41=e=>e?.payment_snapshot?.installment||'';
  const payerKey41=e=>{
    if(e?.asaas_customer_id)return `asaas:${e.asaas_customer_id}`;
    const doc=digits41(e?.customer_document);if(doc)return `doc:${doc}`;
    const mail=String(e?.customer_email||'').trim().toLowerCase();if(mail)return `mail:${mail}`;
    const phone=last1141(e?.customer_mobile_phone||e?.customer_phone);if(phone.length>=8)return `phone:${phone}`;
    return `name:${String(e?.customer_name||'').trim().toLowerCase()}`;
  };

  function styles41(){
    if(document.getElementById('v41style'))return;
    const s=document.createElement('style');s.id='v41style';s.textContent=`
      .asaas-flag-row41{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 9px}.asaas-flag41{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:800;color:#5b2e20;cursor:pointer}.asaas-flag41 input{width:18px;height:18px;accent-color:#c00}.asaas-queue-card.selected41{outline:2px solid #c00;outline-offset:-2px;background:#fffaf8}.asaas-installment41{display:inline-flex;align-items:center;border-radius:999px;padding:5px 8px;background:#fff3d7;color:#745600;font-size:10px;font-weight:800}
      .asaas-group-bar41{border:1px solid #e6d5cb;background:#fffaf6;border-radius:14px;padding:12px 14px;margin:12px 0;display:grid;gap:10px}.asaas-group-main41{display:flex;align-items:center;justify-content:space-between;gap:12px}.asaas-group-main41 b{display:block;color:#4b281d}.asaas-group-main41 span{display:block;color:#806b62;font-size:12px;margin-top:3px}.asaas-group-main41 .btn{white-space:nowrap}.asaas-detected41{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid #eadfd8;padding-top:10px}.asaas-detected41 b{font-size:12px}.asaas-detected41 span{font-size:11px;color:#806b62}.asaas-detected41 button{border:0;background:#fff3d7;color:#745600;border-radius:999px;padding:7px 10px;font-weight:800;cursor:pointer}
      .asaas-group-form41{display:grid;gap:14px}.asaas-group-receipts41{display:grid;gap:7px}.asaas-group-receipt41{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #eadfd8;border-radius:10px;padding:9px 11px;background:#fff}.asaas-group-receipt41 small{display:block;color:#806b62;margin-top:2px}.asaas-group-summary41{border:1px solid #ead7c9;background:#fffaf6;border-radius:12px;padding:11px 12px;color:#705d55;font-size:12px;line-height:1.45}.asaas-group-summary41 b{color:#3c2017}
      @media(max-width:720px){.asaas-group-main41,.asaas-detected41{display:grid}.asaas-group-main41 .btn,.asaas-detected41 button{width:100%}}
    `;document.head.appendChild(s);
  }

  async function loadPending41(){
    if(!db||state.demo||!state.session)return [];
    const q=await db.from('asaas_incoming_payments').select('*').in('classification_status',['PENDING','REVIEW']).order('received_at',{ascending:false}).limit(250);
    if(q.error)throw q.error;cache41=q.data||[];return cache41;
  }

  function matchClient41(e){
    if(e?.matched_client_id)return byId(state.clients||[],e.matched_client_id)||null;
    const doc=digits41(e?.customer_document),mail=String(e?.customer_email||'').trim().toLowerCase(),phone=last1141(e?.customer_mobile_phone||e?.customer_phone);
    return (state.clients||[]).find(c=>e?.asaas_customer_id&&c.asaas_customer_id===e.asaas_customer_id)
      ||(state.clients||[]).find(c=>doc&&digits41(c.document_number)===doc)
      ||(state.clients||[]).find(c=>mail&&String(c.email||'').trim().toLowerCase()===mail)
      ||(state.clients||[]).find(c=>phone&&last1141(c.phone)===phone)
      ||null;
  }

  function selected41(){
    const ids=[...document.querySelectorAll('#asaasGlobalOverlay [data-group-entry41]:checked')].map(x=>x.dataset.groupEntry41);
    return ids.map(id=>cache41.find(e=>e.id===id)).filter(Boolean);
  }

  function syncBar41(){
    const bar=document.getElementById('asaasGroupBar41');if(!bar)return;
    const rows=selected41(),total=rows.reduce((s,x)=>s+Number(x.gross_amount||0),0),same=rows.length<2||new Set(rows.map(payerKey41)).size===1;
    const copy=bar.querySelector('[data-group-copy41]'),btn=bar.querySelector('[data-group-submit41]');
    if(copy)copy.innerHTML=rows.length?`<b>${rows.length} pagamento${rows.length===1?'':'s'} selecionado${rows.length===1?'':'s'} · ${fmtMoney(total)}</b><span>${rows.length<2?'Marque pelo menos 2 para associar juntos.':same?'Eles serão ligados a uma única venda/serviço.':'Os pagamentos marcados parecem ser de pessoas diferentes.'}</span>`:'<b>Nenhum pagamento selecionado</b><span>Marque as caixinhas dos pagamentos que pertencem ao mesmo serviço.</span>';
    if(btn){btn.disabled=rows.length<2||!same;btn.textContent=rows.length>=2?'Associar selecionados a um único serviço':'Selecione pelo menos 2';}
    document.querySelectorAll('#asaasGlobalOverlay .asaas-queue-card').forEach(card=>{const c=card.querySelector('[data-group-entry41]');card.classList.toggle('selected41',Boolean(c?.checked));});
  }

  function detectedHtml41(entries){
    const groups={};entries.forEach(e=>{const k=installment41(e);if(k)(groups[k]||(groups[k]=[])).push(e);});
    return Object.entries(groups).filter(([,arr])=>arr.length>1).map(([k,arr])=>{
      const total=arr.reduce((s,x)=>s+Number(x.gross_amount||0),0),name=arr[0]?.customer_name||'Cliente';
      return `<div class="asaas-detected41"><div><b>Parcelamento identificado automaticamente</b><span>${escapeHtml(name)} · ${arr.length} parcelas · ${fmtMoney(total)}</span></div><button type="button" data-select-installment41="${escapeHtml(k)}">Selecionar ${arr.length} parcelas</button></div>`;
    }).join('');
  }

  async function decorate41(){
    const overlay=document.getElementById('asaasGlobalOverlay'),list=overlay?.querySelector('.asaas-queue-list');
    if(!overlay||!list||overlay.querySelector('#asaasGroupForm41')||busy41)return;
    const cards=[...list.querySelectorAll('.asaas-queue-card')];if(!cards.length)return;
    busy41=true;
    try{
      await loadPending41();
      cards.forEach(card=>{
        if(card.querySelector('[data-group-entry41]'))return;
        const resolve=card.querySelector('[data-asaas-resolve-global]');if(!resolve)return;
        const id=resolve.dataset.asaasResolveGlobal,e=cache41.find(x=>x.id===id);if(!e)return;
        const row=document.createElement('div');row.className='asaas-flag-row41';
        const inst=installment41(e);row.innerHTML=`<label class="asaas-flag41"><input type="checkbox" data-group-entry41="${id}"><span>Selecionar</span></label>${inst?'<span class="asaas-installment41">PARCELA DO MESMO CARTÃO</span>':''}`;
        card.prepend(row);
      });
      let bar=overlay.querySelector('#asaasGroupBar41');
      if(!bar){
        bar=document.createElement('div');bar.id='asaasGroupBar41';bar.className='asaas-group-bar41';
        bar.innerHTML=`<div class="asaas-group-main41"><div data-group-copy41></div><button class="btn" type="button" data-group-submit41 disabled>Selecione pelo menos 2</button></div>${detectedHtml41(cache41)}`;
        const summary=overlay.querySelector('.asaas-queue-summary');summary?.insertAdjacentElement('afterend',bar);
      }
      syncBar41();
    }catch(e){console.error('v41',e);}finally{busy41=false;}
  }

  function setFormTotal41(form,force=false){
    const total=form.querySelector('#g41SaleTotal');if(!total||(!force&&total.dataset.touched41==='1'))return;
    const service=byId(state.services||[],form.querySelector('#g41Service')?.value),work=byId(state.works||[],form.querySelector('#g41Work')?.value);
    const received=Number(form.dataset.received41||0),normal=Number(work?.unit_price||service?.default_price||received);total.value=normal.toFixed(2);
    syncFormSummary41(form);
  }
  function syncFormSummary41(form){
    const received=Number(form.dataset.received41||0),sale=Number(form.querySelector('#g41SaleTotal')?.value||0),balance=Math.max(sale-received,0),excess=Math.max(received-sale,0),box=form.querySelector('#g41Summary');
    if(box)box.innerHTML=`Valor contratado: <b>${fmtMoney(sale)}</b> · Recebido nas parcelas: <b>${fmtMoney(received)}</b> · ${balance>0?`Saldo a receber: <b>${fmtMoney(balance)}</b>`:excess>0?`Diferença recebida: <b>${fmtMoney(excess)}</b> · não gera crédito`:'<b>Quitado</b>'}.`;
  }

  async function openGroup41(ids){
    if(ids.length<2)return;
    const q=await db.from('asaas_incoming_payments').select('*').in('id',ids).in('classification_status',['PENDING','REVIEW']);
    if(q.error){toast(q.error.message,'error');return;}const entries=q.data||[];
    if(entries.length!==ids.length){toast('Uma das parcelas já foi associada. Reabra a fila e tente novamente.','error');return;}
    if(new Set(entries.map(payerKey41)).size!==1){toast('Selecione somente pagamentos da mesma pessoa.','error');return;}
    const first=entries[0],match=matchClient41(first),total=entries.reduce((s,x)=>s+Number(x.gross_amount||0),0),sheet=document.querySelector('#asaasGlobalOverlay .asaas-global-sheet');
    if(!sheet)return;
    const receipts=entries.sort((a,b)=>Number(a.payment_snapshot?.installmentNumber||0)-Number(b.payment_snapshot?.installmentNumber||0)).map((e,i)=>`<div class="asaas-group-receipt41"><div><b>Recebimento ${e.payment_snapshot?.installmentNumber?`· parcela ${escapeHtml(e.payment_snapshot.installmentNumber)}`:`${i+1}`}</b><small>${fmtDateTime(e.payment_date||e.received_at)} · ${escapeHtml(e.billing_type||'Pagamento')}</small></div><b>${fmtMoney(e.gross_amount)}</b></div>`).join('');
    sheet.innerHTML=`<div class="asaas-sheet-head"><div><span class="eyebrow">Pagamentos selecionados</span><h2>Associar a um único serviço</h2><p><b>${entries.length} pagamentos · ${fmtMoney(total)}</b></p></div><button class="icon-btn" type="button" data-asaas-back-queue aria-label="Voltar">←</button></div>
      <form id="asaasGroupForm41" class="form-grid asaas-group-form41" data-received41="${total}">
        <div class="span-2 soft-box"><h3>1. Quem pagou?</h3><p>Os pagamentos selecionados pertencem à mesma pessoa. Confirme o Cliente 360 uma única vez.</p></div>
        <label class="span-2">Cliente existente<select id="g41Client">${optionList(state.clients,'full_name',match?.id||'')}</select></label>
        <label class="span-2">Nome<input id="g41Name" value="${escapeHtml(first.customer_name||'')}"></label>
        <label>Telefone<input id="g41Phone" value="${escapeHtml(first.customer_mobile_phone||first.customer_phone||'')}"></label><label>E-mail<input id="g41Email" type="email" value="${escapeHtml(first.customer_email||'')}"></label>
        <label>CPF/CNPJ<input id="g41Document" value="${escapeHtml(first.customer_document||'')}"></label><label>Nascimento<input id="g41Birth" type="date"></label>
        <div class="span-2 soft-box"><h3>2. Um único serviço / trabalho</h3><p>O sistema criará uma única venda e manterá cada pagamento como um recebimento separado dentro dela.</p></div>
        <label>Serviço<select id="g41Service">${optionList(state.services,'name')}</select></label><label>Trabalho<select id="g41Work">${optionList(state.works,'title')}</select></label>
        <label>Responsável<select id="g41Responsible" required>${optionList(state.team.filter(x=>x.is_practitioner),'full_name')}</select></label><label>Valor contratado<input id="g41SaleTotal" type="number" min="0.01" step="0.01" value="${total.toFixed(2)}" required></label>
        <label>Pessoa amada<input id="g41Loved" placeholder="Se aplicável"></label><label>Rival<input id="g41Rival" placeholder="Se aplicável"></label>
        <div id="g41Summary" class="span-2 asaas-group-summary41"></div>
        <div class="span-2"><h3>Recebimentos que serão ligados à venda</h3><div class="asaas-group-receipts41">${receipts}</div></div>
        <label class="span-2">Observações<textarea id="g41Notes" rows="2" placeholder="Opcional"></textarea></label>
        <div class="span-2 asaas-resolve-actions"><button type="button" class="btn ghost" data-asaas-back-queue>Voltar</button><button type="submit" class="btn">Associar ${entries.length} pagamentos a um serviço</button></div>
      </form>`;
    const form=sheet.querySelector('#asaasGroupForm41'),client=form.querySelector('#g41Client'),saleTotal=form.querySelector('#g41SaleTotal');
    const toggleClient=()=>{const existing=Boolean(client.value);['g41Name','g41Phone','g41Email','g41Document','g41Birth'].forEach(id=>{const el=form.querySelector('#'+id);if(el)el.disabled=existing;});};client.addEventListener('change',toggleClient);toggleClient();
    form.querySelector('#g41Service').addEventListener('change',()=>{if(form.querySelector('#g41Service').value)form.querySelector('#g41Work').value='';saleTotal.dataset.touched41='0';setFormTotal41(form,true);});
    form.querySelector('#g41Work').addEventListener('change',()=>{if(form.querySelector('#g41Work').value)form.querySelector('#g41Service').value='';saleTotal.dataset.touched41='0';setFormTotal41(form,true);});
    saleTotal.addEventListener('input',()=>{saleTotal.dataset.touched41='1';syncFormSummary41(form);});syncFormSummary41(form);
    form.addEventListener('submit',async ev=>{
      ev.preventDefault();if(!requireReal())return;
      const existing=client.value||null,name=form.querySelector('#g41Name').value.trim(),phone=form.querySelector('#g41Phone').value.trim(),service=form.querySelector('#g41Service').value||null,work=form.querySelector('#g41Work').value||null,responsible=form.querySelector('#g41Responsible').value||null,saleValue=Number(saleTotal.value||0);
      if(!existing&&!name){toast('Confirme o nome do cliente.','error');return;}if(!existing&&digits41(phone).length<8){toast('Informe o telefone do novo cliente.','error');return;}if(!service&&!work){toast('Selecione o serviço ou trabalho pago.','error');return;}if(!responsible){toast('Defina o responsável para calcular as comissões.','error');return;}if(!(saleValue>0)){toast('Informe o valor contratado.','error');return;}
      const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Associando pagamentos…';
      const {data,error}=await db.rpc('resolve_asaas_selected_entries',{p_entry_ids:ids,p_client_id:existing,p_client_name:name||null,p_client_phone:phone||null,p_client_email:form.querySelector('#g41Email').value.trim()||null,p_client_birth_date:form.querySelector('#g41Birth').value||null,p_document_number:form.querySelector('#g41Document').value.trim()||null,p_service_id:service,p_work_id:work,p_responsible_member_id:responsible,p_sale_total:saleValue,p_loved_person_name:form.querySelector('#g41Loved').value.trim()||null,p_rival_name:form.querySelector('#g41Rival').value.trim()||null,p_notes:form.querySelector('#g41Notes').value.trim()||null});
      btn.disabled=false;btn.textContent=`Associar ${entries.length} pagamentos a um serviço`;
      if(error){toast(error.message,'error');return;}
      await loadReferenceData();document.getElementById('asaasGlobalOverlay')?.remove();
      toast(`${Number(data?.payment_count||entries.length)} pagamentos associados a uma única venda · ${fmtMoney(data?.received_total||total)} recebido.`);
      if(window.refreshAsaasBell)await window.refreshAsaasBell();if(state.view==='financeiro')await render();
    });
  }

  document.addEventListener('change',e=>{if(e.target.matches('[data-group-entry41]'))syncBar41();},true);
  document.addEventListener('click',e=>{
    const select=e.target.closest('[data-select-installment41]');if(select){e.preventDefault();const id=select.dataset.selectInstallment41;document.querySelectorAll('#asaasGlobalOverlay [data-group-entry41]').forEach(c=>{const row=cache41.find(x=>x.id===c.dataset.groupEntry41);c.checked=installment41(row)===id;});syncBar41();return;}
    const go=e.target.closest('[data-group-submit41]');if(go){e.preventDefault();const rows=selected41();if(rows.length>=2&&new Set(rows.map(payerKey41)).size===1)openGroup41(rows.map(x=>x.id));}
  },true);

  function schedule41(){clearTimeout(timer41);timer41=setTimeout(decorate41,120);}
  const obs=new MutationObserver(schedule41);obs.observe(document.body,{childList:true,subtree:true});
  styles41();const foot=document.querySelector('.sidebar-foot');if(foot)foot.innerHTML='<span class="dot"></span> Ecossistema Sunshine · v3.41';schedule41();
})();

;

/* ---- assets/v42.js ---- */
/* Sunshine v3.42 — correções de agenda/trabalhos + regra global de lançamentos unificados + versão fixa */
(function(){
  const VERSION='v3.42';
  const PERIOD_KEY='sunshine.period.v33';
  let scanTimer42=null;
  let scanBusy42=false;

  function styles42(){
    if(document.getElementById('v42style'))return;
    const s=document.createElement('style');s.id='v42style';s.textContent=`
      .finance-unified42 .section-head{align-items:center}.finance-unified42 td small{display:block;color:#806b62;margin-top:3px;line-height:1.35}
      .finance-status42{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:800;white-space:nowrap}.finance-status42.paid{background:#eaf5ef;color:#256044}.finance-status42.partial{background:#fff3d7;color:#745600}.finance-status42.pending{background:#fdebea;color:#a41f1f}.finance-status42.review{background:#f1ece8;color:#6f5e55}
      @media(max-width:720px){.finance-unified42 .section-head{display:grid;gap:10px}.finance-unified42 .section-head .btn{width:100%}}
    `;document.head.appendChild(s);
  }

  function pinVersion42(){
    const foot=document.querySelector('.sidebar-foot');
    if(foot && !String(foot.textContent||'').includes(VERSION)) foot.innerHTML=`<span class="dot"></span> Ecossistema Sunshine · ${VERSION}`;
  }

  function toLocalInput42(v){
    if(!v)return '';
    const d=new Date(v);if(Number.isNaN(d.getTime()))return '';
    const z=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
  }
  function norm42(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();}
  function canonicalMethod42(v){
    const n=norm42(v).replaceAll(' ','_');
    if(n.includes('BUZ'))return 'BUZIOS';
    if(n.includes('PERGUNTA'))return 'PERGUNTA_OBJETIVA';
    if(n.includes('BARALHO'))return 'BARALHO';
    if(n==='OUTRO'||n==='OUTRA')return 'OUTRO';
    return '';
  }
  function inferMethod42(serviceId){
    const s=byId(state.services||[],serviceId);if(!s)return '';
    const n=norm42(s.name);
    if(n.includes('BUZ'))return 'BUZIOS';
    if(n.includes('PERGUNTA'))return 'PERGUNTA_OBJETIVA';
    if(n.includes('BARALHO'))return 'BARALHO';
    return '';
  }
  function eventFromService42(serviceId,current){
    const s=byId(state.services||[],serviceId);if(!s)return current||'OUTRO';
    if(s.category==='CONSULTA')return 'CONSULTA';
    if(s.category==='PERGUNTA')return 'PERGUNTA';
    if(String(s.category||'').startsWith('TRABALHO_'))return 'TRABALHO';
    return current||'OUTRO';
  }

  /* 1) Novo trabalho: valores canônicos no banco, rótulos em português na tela. */
  workModal=function(w={}){
    const editing=Boolean(w.id);
    openModal(editing?'Editar trabalho':'Novo trabalho',`<form id="workForm" class="form-grid">
      <label class="span-2">Nome do trabalho<input id="wTitle" required value="${escapeHtml(w.title||'')}"></label>
      <label>Tipo<select id="wType" required>
        <option value="COLETIVO">Coletivo</option><option value="COLETIVO_PREMIUM">Coletivo premium</option><option value="PARTICULAR">Particular</option>
      </select></label>
      <label>Entidade / detalhe<input id="wEntity" value="${escapeHtml(w.entity_detail||'')}"></label>
      <label>Data e hora<input id="wDate" type="datetime-local" value="${toLocalInput42(w.scheduled_at)}"></label>
      <label>Valor por participação<input id="wPrice" type="number" min="0" step="0.01" value="${w.unit_price!=null?Number(w.unit_price):''}"></label>
      <label>Responsável<select id="wResponsible">${optionList(state.team.filter(x=>x.is_practitioner),'full_name',w.responsible_member_id)}</select></label>
      <label>Status<select id="wStatus" required>
        <option value="PLANNED">Planejado</option><option value="OPEN">Aberto</option><option value="CLOSED">Fechado</option><option value="DONE">Concluído</option><option value="CANCELLED">Cancelado</option>
      </select></label>
      <label class="span-2">Observações<textarea id="wNotes" rows="3">${escapeHtml(w.notes||'')}</textarea></label>
      <div class="span-2">${formActions(editing?'Salvar trabalho':'Criar trabalho')}</div>
    </form>`);
    bindCancel();
    document.getElementById('wType').value=['COLETIVO','COLETIVO_PREMIUM','PARTICULAR'].includes(w.work_type)?w.work_type:'COLETIVO';
    document.getElementById('wStatus').value=['PLANNED','OPEN','CLOSED','DONE','CANCELLED'].includes(w.status)?w.status:'PLANNED';
    document.getElementById('workForm').addEventListener('submit',async e=>{
      e.preventDefault();if(!requireReal())return;
      const workType=['COLETIVO','COLETIVO_PREMIUM','PARTICULAR'].includes(val('wType'))?val('wType'):'COLETIVO';
      const status=['PLANNED','OPEN','CLOSED','DONE','CANCELLED'].includes(val('wStatus'))?val('wStatus'):'PLANNED';
      const payload={title:val('wTitle').trim(),work_type:workType,entity_detail:val('wEntity').trim()||null,scheduled_at:val('wDate')?new Date(val('wDate')).toISOString():null,unit_price:val('wPrice')!==''?Number(val('wPrice')):null,responsible_member_id:val('wResponsible')||null,status,notes:val('wNotes').trim()||null};
      const submit=e.currentTarget.querySelector('button[type=submit]');submit.disabled=true;submit.textContent=editing?'Salvando…':'Criando…';
      const q=editing?await db.from('works').update(payload).eq('id',w.id).select().single():await db.from('works').insert(payload).select().single();
      if(q.error){submit.disabled=false;submit.textContent=editing?'Salvar trabalho':'Criar trabalho';toast(q.error.message,'error');return;}
      toast(editing?'Trabalho atualizado.':'Trabalho criado.');closeModal();await loadReferenceData();state.selectedWork=q.data;await navigate('trabalhos');
    });
  };

  /* 2) Agenda: corrige método traduzido e falso “já associado” em compromisso novo. */
  async function paymentLinks42(clientId,appointmentId){
    if(!clientId||state.demo||!db)return [];
    const pq=await db.from('payments').select('id,client_id,source,status,gross_amount,payment_method,paid_at,created_at').eq('client_id',clientId).eq('status','PAID').order('paid_at',{ascending:false}).limit(200);
    if(pq.error)throw pq.error;const payments=pq.data||[];if(!payments.length)return [];
    const ids=payments.map(p=>p.id);const aq=await db.from('payment_allocations').select('payment_id,sale_id,amount').in('payment_id',ids).limit(5000);if(aq.error)throw aq.error;
    const alloc=aq.data||[],saleIds=[...new Set(alloc.map(x=>x.sale_id).filter(Boolean))];let sales=[];
    if(saleIds.length){const sq=await db.from('sales').select('id,client_id,service_id,work_id,appointment_id,responsible_member_id,sale_type,total_amount,source').in('id',saleIds).limit(5000);if(sq.error)throw sq.error;sales=sq.data||[];}
    const saleById=Object.fromEntries(sales.map(s=>[s.id,s]));
    return payments.map(p=>{
      const pa=alloc.filter(x=>x.payment_id===p.id),linked=pa.map(x=>saleById[x.sale_id]).filter(Boolean);
      const current=appointmentId?linked.find(s=>s.appointment_id===appointmentId):null;
      const unassigned=linked.find(s=>!s.appointment_id),used=pa.reduce((sum,x)=>sum+Number(x.amount||0),0),available=Math.max(Number(p.gross_amount||0)-used,0),sale=current||unassigned||null;
      return {payment:p,sale,current:Boolean(current),eligible:Boolean(current||unassigned||available>.005)};
    }).filter(x=>x.eligible);
  }
  function sourceLabel42(v){return v==='ASAAS'?'Asaas':v==='MANUAL'?'Manual':(v||'Pagamento');}
  function payOption42(x){const s=x.sale,service=s?.service_id?byId(state.services,s.service_id):null,work=s?.work_id?byId(state.works,s.work_id):null,what=service?.name||work?.title||'pagamento recebido';return `${sourceLabel42(x.payment.source)} · ${fmtDate(x.payment.paid_at||x.payment.created_at)} · ${fmtMoney(x.payment.gross_amount)} · ${what} · ${x.current?'já associado':s?'classificado':'saldo disponível'}`;}

  appointmentModal=function(a={}){
    const editing=Boolean(a.id);
    openModal(editing?'Editar compromisso':'Novo compromisso',`<form id="apptForm" class="form-grid">
      <label class="span-2">Cliente<select id="aClient" required>${optionList(state.clients,'full_name',a.client_id)}</select></label>
      <label>Evento<select id="aType"><option value="CONSULTA">Consulta</option><option value="PERGUNTA">Pergunta</option><option value="RETORNO">Retorno</option><option value="TRABALHO">Trabalho</option><option value="OUTRO">Outro</option></select></label>
      <label>Serviço<select id="aService">${optionList(state.services,'name',a.service_id)}</select></label>
      <label>Método<select id="aMethod"><option value="">—</option><option value="BARALHO">Baralho</option><option value="BUZIOS">Búzios</option><option value="PERGUNTA_OBJETIVA">Pergunta objetiva</option><option value="OUTRO">Outro</option></select></label>
      <label>Responsável<select id="aResponsible">${optionList(state.team.filter(x=>x.is_practitioner),'full_name',a.responsible_member_id)}</select></label>
      <label>Início<input id="aStarts" type="datetime-local" required value="${toLocalInput42(a.starts_at)}"></label>
      <label>Status<select id="aStatus"><option value="SCHEDULED">Agendado</option><option value="DONE">Concluído</option><option value="RESCHEDULED">Reagendado</option><option value="CANCELLED">Cancelado</option><option value="NO_SHOW">Não compareceu</option></select></label>
      <div class="span-2 agenda-payment-box26">
        <div class="agenda-payment-head26"><div><h3>Pagamento</h3><p>Se a pessoa já pagou, associe aqui. Não é necessário abrir o Financeiro depois.</p></div><span id="aPaymentBadge26" class="agenda-payment-badge26">A verificar</span></div>
        <label>Pagamento já recebido<select id="aPayment"><option value="">Carregando pagamentos…</option></select></label>
        <div id="aPaymentHelp26" class="agenda-payment-help26"><b>Fluxo único:</b> agenda, venda e recebimentos ficam conectados ao mesmo serviço.</div>
      </div>
      <label class="span-2">Orientação / resumo<textarea id="aGuidance" rows="3">${escapeHtml(a.guidance_summary||'')}</textarea></label>
      <label class="span-2">Follow-up<textarea id="aFollow" rows="2">${escapeHtml(a.follow_up_notes||'')}</textarea></label>
      <div class="span-2">${formActions(editing?'Atualizar':'Agendar')}</div>
    </form>`,true);
    bindCancel();
    document.getElementById('aType').value=['CONSULTA','PERGUNTA','RETORNO','TRABALHO','OUTRO'].includes(a.event_type)?a.event_type:'CONSULTA';
    document.getElementById('aMethod').value=canonicalMethod42(a.consultation_method);
    document.getElementById('aStatus').value=['SCHEDULED','DONE','RESCHEDULED','CANCELLED','NO_SHOW'].includes(a.status)?a.status:'SCHEDULED';
    const client=document.getElementById('aClient'),payment=document.getElementById('aPayment'),badge=document.getElementById('aPaymentBadge26'),help=document.getElementById('aPaymentHelp26'),serviceSel=document.getElementById('aService');let links=[];

    function syncServiceMethod42(){
      const service=byId(state.services||[],serviceSel.value);if(!service)return;
      document.getElementById('aType').value=eventFromService42(service.id,document.getElementById('aType').value);
      if(service.category==='CONSULTA'){const inferred=inferMethod42(service.id);if(inferred)document.getElementById('aMethod').value=inferred;}
      else if(service.category==='PERGUNTA')document.getElementById('aMethod').value='PERGUNTA_OBJETIVA';
      else document.getElementById('aMethod').value='';
    }
    function syncSelected42(){
      const x=links.find(i=>i.payment.id===payment.value);
      if(!x){badge.textContent='Não associado';badge.className='agenda-payment-badge26';help.innerHTML='<b>Sem duplicidade:</b> deixe em branco se o pagamento ainda não chegou.';return;}
      if(x.sale?.service_id)serviceSel.value=x.sale.service_id;
      if(x.sale?.responsible_member_id)document.getElementById('aResponsible').value=x.sale.responsible_member_id;
      if(x.sale?.sale_type&&['CONSULTA','PERGUNTA','TRABALHO'].includes(x.sale.sale_type))document.getElementById('aType').value=x.sale.sale_type;
      syncServiceMethod42();
      badge.textContent=x.current?'Pago':'Será associado';badge.className=`agenda-payment-badge26 ${x.current?'paid':'ready'}`;
      help.innerHTML=x.current?'<b>Pago:</b> este compromisso já está ligado a essa venda/recebimento.':'<b>Ao salvar:</b> a venda já classificada será ligada a este compromisso; as demais parcelas continuam dentro da mesma venda.';
    }
    async function refreshPayments42(){
      payment.disabled=true;payment.innerHTML='<option value="">Carregando pagamentos…</option>';
      try{links=await paymentLinks42(client.value,a.id||null);payment.innerHTML='<option value="">Não associar pagamento agora</option>'+links.map(x=>`<option value="${x.payment.id}">${escapeHtml(payOption42(x))}</option>`).join('');const current=links.find(x=>x.current);if(current)payment.value=current.payment.id;payment.disabled=false;syncSelected42();}catch(e){payment.innerHTML='<option value="">Não foi possível carregar</option>';payment.disabled=false;toast(e.message||'Erro ao carregar pagamentos.','error');}
    }
    client.addEventListener('change',refreshPayments42);payment.addEventListener('change',syncSelected42);serviceSel.addEventListener('change',syncServiceMethod42);refreshPayments42();

    document.getElementById('apptForm').addEventListener('submit',async e=>{
      e.preventDefault();if(!requireReal())return;
      const service=byId(state.services||[],val('aService'));
      let eventType=eventFromService42(val('aService'),val('aType'));
      if(!['CONSULTA','PERGUNTA','RETORNO','TRABALHO','OUTRO'].includes(eventType))eventType='OUTRO';
      let method=canonicalMethod42(val('aMethod'));
      if(service?.category==='CONSULTA'&&!method)method=inferMethod42(service.id)||'OUTRO';
      if(service?.category==='PERGUNTA')method='PERGUNTA_OBJETIVA';
      if(service && !['CONSULTA','PERGUNTA'].includes(service.category))method=null;
      if(method&&!['BARALHO','BUZIOS','PERGUNTA_OBJETIVA','OUTRO'].includes(method))method='OUTRO';
      const status=['SCHEDULED','DONE','RESCHEDULED','CANCELLED','NO_SHOW'].includes(val('aStatus'))?val('aStatus'):'SCHEDULED';
      const payload={client_id:val('aClient'),event_type:eventType,service_id:val('aService')||null,consultation_method:method||null,responsible_member_id:val('aResponsible')||null,starts_at:new Date(val('aStarts')).toISOString(),status,guidance_summary:val('aGuidance').trim()||null,follow_up_notes:val('aFollow').trim()||null};
      const submit=e.currentTarget.querySelector('button[type=submit]');submit.disabled=true;submit.textContent=editing?'Atualizando…':'Agendando…';
      const res=editing?await db.from('appointments').update(payload).eq('id',a.id).select().single():await db.from('appointments').insert(payload).select().single();
      if(res.error){submit.disabled=false;submit.textContent=editing?'Atualizar':'Agendar';toast(res.error.message,'error');return;}
      if(payment.value){const linked=await db.rpc('associate_payment_to_appointment',{p_appointment_id:res.data.id,p_payment_id:payment.value});if(linked.error){submit.disabled=false;submit.textContent=editing?'Atualizar':'Agendar';toast(`Compromisso salvo, mas a associação financeira precisa ser revisada: ${linked.error.message}`,'error');a=res.data;await refreshPayments42();return;}toast('Compromisso e pagamento associados com sucesso.');}else toast('Compromisso salvo.');
      closeModal();await loadReferenceData();await render();
    });
  };

  /* 3) Regra global: nunca exibir Pagamentos e Vendas como duas tabelas visíveis. */
  function period42(){const d=new Date(),def={start:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`,end:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};try{return {...def,...JSON.parse(localStorage.getItem(PERIOD_KEY)||'{}')}}catch{return def}}
  function bounds42(p){const a=new Date(`${p.start}T00:00:00-03:00`),b=new Date(`${p.end}T00:00:00-03:00`);b.setDate(b.getDate()+1);return[a.toISOString(),b.toISOString()]}
  function status42(received,total){if(received<=.005)return '<span class="finance-status42 pending">Pendente</span>';if(received+0.005<total)return '<span class="finance-status42 partial">Parcial</span>';return '<span class="finance-status42 paid">Pago</span>';}
  async function unifiedRows42(){
    const p=period42(),[start,end]=bounds42(p);const sq=await db.from('sales').select('id,client_id,service_id,work_id,sale_type,total_amount,unit_price,sold_at,created_at').gte('sold_at',start).lt('sold_at',end).order('sold_at',{ascending:false}).limit(3000);if(sq.error)throw sq.error;
    const sales=sq.data||[],saleIds=sales.map(x=>x.id);const aq=saleIds.length?await db.from('payment_allocations').select('payment_id,sale_id,amount').in('sale_id',saleIds).limit(10000):{data:[],error:null};if(aq.error)throw aq.error;const alloc=aq.data||[],payIds=[...new Set(alloc.map(x=>x.payment_id).filter(Boolean))];let pays=[];
    if(payIds.length){const pq=await db.from('payments').select('id,status,source,payment_method,paid_at,created_at').in('id',payIds).limit(10000);if(pq.error)throw pq.error;pays=pq.data||[];}
    const payById=Object.fromEntries(pays.map(x=>[x.id,x])),bySale={};alloc.forEach(a=>{const py=payById[a.payment_id];if(!py||py.status!=='PAID')return;(bySale[a.sale_id]||(bySale[a.sale_id]=[])).push({py,amount:Number(a.amount||0)});});
    return sales.map(s=>{const rs=bySale[s.id]||[],total=Number(s.total_amount||s.unit_price||0),received=rs.reduce((sum,x)=>sum+x.amount,0),balance=Math.max(total-received,0),client=byId(state.clients||[],s.client_id),service=byId(state.services||[],s.service_id),work=byId(state.works||[],s.work_id),label=work?.title||service?.name||String(s.sale_type||'Venda').replaceAll('_',' ');return {s,total,received,balance,client,label,rs};});
  }
  async function buildContextUnified42(anchor){
    if(!anchor||anchor.dataset.loading42==='1')return;anchor.dataset.loading42='1';
    let panel=document.createElement('article');panel.className='panel finance-unified42';panel.dataset.contextUnified42='1';panel.innerHTML='<div class="empty-state"><span class="spinner"></span>Unificando lançamentos…</div>';anchor.insertAdjacentElement('beforebegin',panel);
    try{const rows=await unifiedRows42();const html=rows.length?rows.map(r=>`<tr><td>${fmtDate(r.s.sold_at||r.s.created_at)}</td><td><b>${escapeHtml(r.client?.full_name||'Cliente não identificado')}</b></td><td><b>${escapeHtml(r.label)}</b><small>${escapeHtml(String(r.s.sale_type||'').replaceAll('_',' '))}</small></td><td><b>${fmtMoney(r.total)}</b></td><td><b>${fmtMoney(r.received)}</b><small>${r.rs.length} recebimento${r.rs.length===1?'':'s'}</small></td><td><b>${fmtMoney(r.balance)}</b></td><td>${status42(r.received,r.total)}</td></tr>`).join(''):'<tr class="empty-row"><td colspan="7">Nenhum lançamento no período.</td></tr>';panel.innerHTML=`<div class="section-head"><div><h2>Lançamentos</h2><p>Uma única visão de venda + recebimentos. Não existem duas listas separadas.</p></div><button class="btn ghost" type="button" data-go-finance42>Abrir Financeiro</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Cliente</th><th>Serviço / trabalho</th><th>Contratado</th><th>Recebido</th><th>Saldo</th><th>Status</th></tr></thead><tbody>${html}</tbody></table></div>`;}catch(e){panel.innerHTML=`<div class="empty-state error">${escapeHtml(e.message||'Não foi possível carregar os lançamentos.')}</div>`;}
  }
  async function unifyPairs42(){
    if(scanBusy42||state.demo||!db)return;scanBusy42=true;
    try{
      const panels=[...document.querySelectorAll('#content article.panel')];
      const payments=panels.filter(p=>/^pagamentos$/i.test((p.querySelector('h2')?.textContent||'').trim()));
      const sales=panels.filter(p=>/^vendas$/i.test((p.querySelector('h2')?.textContent||'').trim()));
      for(const pp of payments){
        const sp=sales.find(s=>s.parentElement===pp.parentElement)||sales[0];if(!sp)continue;
        const holder=pp.parentElement===sp.parentElement?pp.parentElement:null;
        const anchor=holder&&holder.classList.contains('two')?holder:pp;
        if(anchor.dataset.unified42==='1')continue;anchor.dataset.unified42='1';
        if(holder&&holder.classList.contains('two'))holder.hidden=true;else{pp.hidden=true;sp.hidden=true;}
        if(state.view==='financeiro'){
          if(!document.getElementById('financeUnified40'))setTimeout(()=>buildContextUnified42(anchor),180);
        }else await buildContextUnified42(anchor);
      }
    }finally{scanBusy42=false;}
  }
  function scheduleScan42(delay=80){clearTimeout(scanTimer42);scanTimer42=setTimeout(()=>{pinVersion42();unifyPairs42();},delay);}

  const prevRender42=render;render=async function(){await prevRender42();scheduleScan42(40);};
  document.addEventListener('click',e=>{if(e.target.closest('[data-go-finance42]')){e.preventDefault();navigate('financeiro');}},true);
  function start42(){styles42();pinVersion42();scheduleScan42(120);const obs=new MutationObserver(()=>scheduleScan42(30));obs.observe(document.body,{childList:true,subtree:true,characterData:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start42);else start42();
})();

;

/* ---- assets/v44.js ---- */
/* Sunshine v3.44 — reclassificação de lançamentos para serviço/trabalho específico */
(function(){
  let timer44=null;

  function styles44(){
    if(document.getElementById('v44style'))return;
    const s=document.createElement('style');s.id='v44style';s.textContent=`
      .finance-actions44{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.finance-edit44{white-space:nowrap}
      .sale-link-summary44{border:1px solid #eadfd8;background:#fffaf6;border-radius:12px;padding:12px 14px;line-height:1.5;color:#705d55}.sale-link-summary44 b{color:#3f241a}
      @media(max-width:720px){.finance-actions44{display:grid}.finance-actions44 button{width:100%;text-align:left}}
    `;document.head.appendChild(s);
  }

  function decorate44(){
    if(state.view!=='financeiro')return;
    const panel=document.getElementById('financeUnified40');if(!panel)return;
    panel.querySelectorAll('tbody tr').forEach(row=>{
      const detail=row.querySelector('[data-detail40]');if(!detail||row.querySelector('[data-reclassify-sale44]'))return;
      const saleId=detail.dataset.detail40;if(!saleId)return;
      const td=detail.closest('td');if(!td)return;
      let wrap=td.querySelector('.finance-actions44');
      if(!wrap){wrap=document.createElement('div');wrap.className='finance-actions44';td.appendChild(wrap);wrap.appendChild(detail);}
      const btn=document.createElement('button');btn.type='button';btn.className='link-btn finance-edit44';btn.dataset.reclassifySale44=saleId;btn.textContent='Editar vínculo';wrap.prepend(btn);
    });
  }

  async function open44(saleId){
    if(!requireReal())return;
    const q=await db.from('sales').select('id,client_id,service_id,work_id,total_amount,sale_type,responsible_member_id,clients(full_name)').eq('id',saleId).maybeSingle();
    if(q.error){toast(q.error.message,'error');return;}const sale=q.data;if(!sale){toast('Lançamento não encontrado.','error');return;}
    const client=sale.clients?.full_name||byId(state.clients||[],sale.client_id)?.full_name||'Cliente';
    openModal('Editar serviço / trabalho',`<form id="saleLinkForm44" class="form-grid">
      <div class="span-2 sale-link-summary44"><b>${escapeHtml(client)}</b><br>Valor contratado: <b>${fmtMoney(sale.total_amount)}</b><br><small>Use esta tela para corrigir um lançamento genérico e vinculá-lo ao trabalho correto. Os recebimentos permanecem na mesma venda.</small></div>
      <label class="span-2">Serviço<select id="slService44">${optionList(state.services||[],'name',sale.service_id)}</select></label>
      <label class="span-2">Trabalho específico<select id="slWork44"><option value="">Nenhum trabalho específico</option>${(state.works||[]).map(w=>`<option value="${w.id}" ${w.id===sale.work_id?'selected':''}>${escapeHtml(w.title)}</option>`).join('')}</select></label>
      <div class="span-2 note"><b>Como funciona:</b> se escolher um trabalho específico, o lançamento passa a compor arrecadação e lista de inscritos daquele trabalho. O pagamento não é recriado nem duplicado.</div>
      <div class="span-2">${formActions('Salvar vínculo')}</div>
    </form>`,true);
    bindCancel();
    document.getElementById('saleLinkForm44').addEventListener('submit',async e=>{
      e.preventDefault();
      const serviceId=document.getElementById('slService44').value||null;
      const workId=document.getElementById('slWork44').value||null;
      if(!serviceId&&!workId){toast('Selecione um serviço ou trabalho.','error');return;}
      const submit=e.currentTarget.querySelector('button[type=submit]');submit.disabled=true;submit.textContent='Salvando…';
      const r=await db.rpc('reclassify_sale',{p_sale_id:saleId,p_service_id:serviceId,p_work_id:workId});
      if(r.error){submit.disabled=false;submit.textContent='Salvar vínculo';toast(r.error.message,'error');return;}
      toast(workId?'Lançamento movido para o trabalho selecionado.':'Classificação do lançamento atualizada.');
      closeModal();await loadReferenceData();await render();
    });
  }

  function schedule44(delay=40){clearTimeout(timer44);timer44=setTimeout(decorate44,delay);}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-reclassify-sale44]');if(b){e.preventDefault();e.stopPropagation();open44(b.dataset.reclassifySale44);}},true);
  const prevRender44=render;render=async function(){await prevRender44();schedule44(30);setTimeout(decorate44,350);};
  function start44(){styles44();schedule44();const obs=new MutationObserver(()=>schedule44(35));obs.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start44);else start44();
})();

;

/* ---- assets/v45.js ---- */
/* Sunshine v3.45 — Home com todos os trabalhos em aberto + filtro de tipos funcional */
(function(){
  const VERSION='v3.45';
  let timer45=null;
  let homeToken45=0;
  let activeWorks45=[];

  function styles45(){
    if(document.getElementById('v45style'))return;
    const s=document.createElement('style');s.id='v45style';s.textContent=`
      .sidebar-foot{font-size:0!important}.sidebar-foot .dot{font-size:11px!important}.sidebar-foot::after{content:'Ecossistema Sunshine · v3.45';font-size:11px;color:inherit;margin-left:6px}
      .active-works45{margin-top:16px}.active-works45 .section-head{align-items:center}.active-grid45{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}
      .active-card45{border:1px solid #eadfd8;border-radius:14px;background:#fffaf6;padding:15px;display:grid;gap:11px;min-width:0}
      .active-top45{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.active-top45 h3{margin:0;font-size:18px;line-height:1.2}.active-type45{font-size:10px;font-weight:800;text-transform:uppercase;color:#8b4a35;background:#fdeee8;padding:5px 8px;border-radius:999px;white-space:nowrap}
      .active-meta45{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.active-meta45>div{border-top:1px solid #eadfd8;padding-top:8px}.active-meta45 span{display:block;font-size:9px;text-transform:uppercase;color:#8c746a;font-weight:700}.active-meta45 b{display:block;margin-top:3px;font-size:14px;color:#3d251c}
      .active-bottom45{display:flex;align-items:center;justify-content:space-between;gap:10px}.active-bottom45 small{color:#806b62}.active-empty45{padding:14px;border:1px dashed #dfcfc5;border-radius:12px;color:#806b62}
      #workType[data-fixed45="1"]{min-width:180px}
      @media(max-width:820px){.active-grid45{grid-template-columns:1fr}.active-meta45{grid-template-columns:1fr 1fr}.active-bottom45{align-items:stretch;flex-direction:column}.active-bottom45 button{width:100%}}
    `;document.head.appendChild(s);
  }

  function typeLabel45(v){return v==='COLETIVO_PREMIUM'?'Coletivo premium':v==='COLETIVO'?'Coletivo':v==='PARTICULAR'?'Particular':String(v||'Outro').replaceAll('_',' ')}

  async function loadActive45(){
    if(state.demo||!db)return [];
    const wq=await db.from('works').select('id,title,work_type,status,scheduled_at,unit_price,responsible_member_id,team_members:responsible_member_id(full_name)').eq('status','OPEN').order('scheduled_at',{ascending:true});
    if(wq.error)throw wq.error;
    const works=wq.data||[]; if(!works.length)return [];
    const ids=works.map(w=>w.id);
    const [rq,sq]=await Promise.all([
      db.from('work_registrations').select('work_id,status').in('work_id',ids).neq('status','CANCELLED'),
      db.from('sales').select('id,work_id,status').in('work_id',ids).neq('status','CANCELLED')
    ]);
    if(rq.error)throw rq.error;if(sq.error)throw sq.error;
    const regs=rq.data||[],sales=sq.data||[],saleIds=sales.map(s=>s.id);
    let alloc=[],paid=new Set();
    if(saleIds.length){
      const aq=await db.from('payment_allocations').select('sale_id,payment_id,amount').in('sale_id',saleIds).limit(10000);if(aq.error)throw aq.error;alloc=aq.data||[];
      const pids=[...new Set(alloc.map(a=>a.payment_id).filter(Boolean))];
      if(pids.length){const pq=await db.from('payments').select('id,status').in('id',pids).eq('status','PAID').limit(10000);if(pq.error)throw pq.error;paid=new Set((pq.data||[]).map(p=>p.id));}
    }
    return works.map(w=>{
      const workSaleIds=new Set(sales.filter(s=>s.work_id===w.id).map(s=>s.id));
      const received=alloc.filter(a=>workSaleIds.has(a.sale_id)&&paid.has(a.payment_id)).reduce((sum,a)=>sum+Number(a.amount||0),0);
      const registrations=regs.filter(r=>r.work_id===w.id).length;
      return {...w,registrations,received};
    });
  }

  function activePanel45(works){
    const cards=works.length?works.map(w=>`<div class="active-card45">
      <div class="active-top45"><div><h3>${escapeHtml(w.title)}</h3><div class="muted">${w.scheduled_at?fmtDateTime(w.scheduled_at):'Sem data definida'}</div></div><span class="active-type45">${escapeHtml(typeLabel45(w.work_type))}</span></div>
      <div class="active-meta45"><div><span>Inscritos</span><b>${w.registrations}</b></div><div><span>Arrecadado</span><b>${fmtMoney(w.received)}</b></div><div><span>Valor</span><b>${fmtMoney(w.unit_price)}</b></div></div>
      <div class="active-bottom45"><small>Responsável: <b>${escapeHtml(w.team_members?.full_name||byId(state.team||[],w.responsible_member_id)?.full_name||'—')}</b></small><button type="button" class="link-btn" data-open-work45="${w.id}">Abrir trabalho</button></div>
    </div>`).join(''):'<div class="active-empty45">Nenhum trabalho está em aberto neste momento.</div>';
    return `<article class="panel active-works45" id="activeWorks45"><div class="section-head"><div><h2>Trabalhos em aberto</h2><p>Todos os trabalhos ativos agora, com inscritos e arrecadação.</p></div><button type="button" class="link-btn" data-go-works45>Ver todos</button></div><div class="active-grid45">${cards}</div></article>`;
  }

  function updateHomeKpis45(works){
    const grid=document.querySelector('#content .kpi-grid');if(!grid)return;
    const cards=[...grid.querySelectorAll('.card')];if(cards.length<3)return;
    const totalRegs=works.reduce((s,w)=>s+Number(w.registrations||0),0),totalRaised=works.reduce((s,w)=>s+Number(w.received||0),0);
    const set=(card,label,value,foot)=>{const l=card.querySelector('.card-label'),v=card.querySelector('.value'),f=card.querySelector('.card-foot');if(l)l.textContent=label;if(v)v.textContent=value;if(f)f.textContent=foot;};
    set(cards[0],'TRABALHOS EM ABERTO',String(works.length),works.length?'Ativos agora':'Nenhum ativo');
    set(cards[1],'INSCRITOS NOS ATIVOS',String(totalRegs),'Somando todos os trabalhos em aberto');
    set(cards[2],'ARRECADADO NOS ATIVOS',fmtMoney(totalRaised),'Recebimentos confirmados');
  }

  async function decorateHome45(){
    if(state.view!=='home')return;
    const token=++homeToken45;
    try{
      const works=await loadActive45();if(token!==homeToken45||state.view!=='home')return;activeWorks45=works;
      updateHomeKpis45(works);
      document.getElementById('activeWorks45')?.remove();
      const grid=document.querySelector('#content .kpi-grid');if(!grid)return;
      grid.insertAdjacentHTML('afterend',activePanel45(works));
    }catch(e){console.error('v45 home',e);}
  }

  function prepareWorkFilter45(){
    if(state.view!=='trabalhos')return;
    const sel=document.getElementById('workType');if(!sel)return;
    const current=sel.value;
    sel.innerHTML='<option value="">Todos os tipos</option><option value="COLETIVO">Coletivo</option><option value="COLETIVO_PREMIUM">Coletivo premium</option><option value="PARTICULAR">Particular</option>';
    if([...sel.options].some(o=>o.value===current))sel.value=current;
    sel.dataset.fixed45='1';
    applyWorkFilter45();
  }

  function applyWorkFilter45(){
    if(state.view!=='trabalhos')return;
    const search=(document.getElementById('workSearch')?.value||'').trim().toLowerCase();
    const type=document.getElementById('workType')?.value||'';
    const rows=[...document.querySelectorAll('#content tr[data-work-id]')];let visible=0;
    rows.forEach(row=>{
      const w=(state.works||[]).find(x=>x.id===row.dataset.workId);
      const matchesText=!search||row.innerText.toLowerCase().includes(search);
      const matchesType=!type||w?.work_type===type;
      row.hidden=!(matchesText&&matchesType);if(!row.hidden)visible++;
    });
    let empty=document.getElementById('workFilterEmpty45');
    if(!visible&&rows.length){
      if(!empty){empty=document.createElement('tr');empty.id='workFilterEmpty45';empty.className='empty-row';empty.innerHTML='<td colspan="8">Nenhum trabalho encontrado com este filtro.</td>';rows[0].parentElement?.appendChild(empty)}empty.hidden=false;
    }else if(empty)empty.hidden=true;
  }

  function pinVisualVersion45(){
    document.documentElement.dataset.sunshineVersion=VERSION;
  }

  function run45(){
    styles45();pinVisualVersion45();
    if(state.view==='home')decorateHome45();
    if(state.view==='trabalhos')prepareWorkFilter45();
  }
  function schedule45(delay=60){clearTimeout(timer45);timer45=setTimeout(run45,delay)}

  const prevRender45=render;
  render=async function(){await prevRender45();schedule45(50)};

  document.addEventListener('input',e=>{if(e.target?.id==='workSearch')setTimeout(applyWorkFilter45,0)},false);
  document.addEventListener('change',e=>{if(e.target?.id==='workType')setTimeout(applyWorkFilter45,0)},false);
  document.addEventListener('click',async e=>{
    const open=e.target.closest('[data-open-work45]');if(open){e.preventDefault();const id=open.dataset.openWork45;state.selectedWork=(state.works||[]).find(w=>w.id===id)||activeWorks45.find(w=>w.id===id)||null;await navigate('trabalhos');return;}
    if(e.target.closest('[data-go-works45]')){e.preventDefault();await navigate('trabalhos');}
  },true);

  function start45(){styles45();pinVisualVersion45();schedule45(120);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start45);else start45();
})();

;

/* ---- assets/v46.js ---- */
/* Sunshine v3.46 — estabilidade/performance + autonomia ADMIN */
(function(){
  const VERSION='v3.46';
  const isAdmin46=()=>state.member?.role==='ADMIN';
  let renderSeq46=0;

  function styles46(){
    if(document.getElementById('v46style'))return;
    const s=document.createElement('style');s.id='v46style';s.textContent=`
      .sidebar-version-current{margin-top:auto;padding:16px 8px 5px;color:#9a8177;font-size:10px}
      .admin-tools46{display:flex;gap:7px;flex-wrap:wrap}.admin-tools46 .btn{white-space:nowrap}
      .admin-payment-list46{display:grid;gap:9px}.admin-payment-row46{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #eadfd8;border-radius:12px;padding:11px 12px;background:#fffaf6}.admin-payment-row46 small{display:block;color:#806b62;margin-top:3px}.admin-payment-row46 .button-row{flex-shrink:0}
      .admin-readonly46{border:1px solid #eadfd8;background:#f8f4f1;border-radius:10px;padding:10px 12px;color:#705d55;line-height:1.45}.admin-readonly46 b{color:#3f241a}
      .admin-service46,.admin-inline-work46{margin-left:8px}
      @media(max-width:720px){.sidebar-version-current{display:none}.admin-payment-row46{display:grid}.admin-payment-row46 .button-row,.admin-tools46{display:grid}.admin-payment-row46 button,.admin-tools46 button{width:100%}}
    `;document.head.appendChild(s);
  }

  function localInput46(v){
    if(!v)return '';
    const d=new Date(v);if(Number.isNaN(d.getTime()))return '';
    const z=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
  }

  function stabilizeFinance46(){
    if(state.view!=='financeiro')return;
    const unified=document.getElementById('financeUnified40');if(!unified)return;
    unified.hidden=false;if(unified.parentElement)unified.parentElement.hidden=false;
    [...document.querySelectorAll('#content article.panel')].forEach(p=>{
      if(p===unified)return;
      const t=(p.querySelector('h2')?.textContent||'').trim();
      if(/^pagamentos$/i.test(t)||/^vendas$/i.test(t))p.hidden=true;
    });
  }

  function decorateWork46(){
    if(!isAdmin46()||state.view!=='trabalhos')return;
    document.querySelectorAll('#content tr[data-work-id]').forEach(row=>{
      if(row.querySelector('[data-admin-edit-work46]'))return;
      const work=(state.works||[]).find(x=>x.id===row.dataset.workId);const td=row.querySelector('td:first-child');if(!work||!td)return;
      const b=document.createElement('button');b.type='button';b.className='link-btn admin-inline-work46';b.dataset.adminEditWork46=work.id;b.textContent='Editar';td.appendChild(b);
    });
    if(!state.selectedWork)return;
    const work=state.selectedWork;
    const panels=[...document.querySelectorAll('#content article.panel')];
    const detail=panels.find(p=>(p.querySelector('h2')?.textContent||'').trim()===String(work.title||'').trim());
    const head=detail?.querySelector('.section-head');if(!head)return;
    let actions=head.querySelector('.button-row');
    if(!actions){actions=document.createElement('div');actions.className='button-row';head.appendChild(actions)}
    if(!actions.querySelector('[data-admin-edit-work46]')){
      const b=document.createElement('button');b.type='button';b.className='btn ghost';b.dataset.adminEditWork46=work.id;b.textContent='Editar trabalho';actions.prepend(b);
    }
  }

  function decorateFinance46(){
    if(!isAdmin46()||state.view!=='financeiro')return;
    const panel=document.getElementById('financeUnified40');if(!panel)return;
    panel.querySelectorAll('tbody tr').forEach(row=>{
      const detail=row.querySelector('[data-detail40]');if(!detail||row.querySelector('[data-admin-payments46]'))return;
      const td=detail.closest('td');if(!td)return;
      let wrap=td.querySelector('.finance-actions44');
      if(!wrap){wrap=document.createElement('div');wrap.className='finance-actions44 admin-tools46';while(td.firstChild)wrap.appendChild(td.firstChild);td.appendChild(wrap)}
      const b=document.createElement('button');b.type='button';b.className='link-btn';b.dataset.adminPayments46=detail.dataset.detail40;b.textContent='Editar pagamentos';wrap.appendChild(b);
    });
  }

  function decorateConfig46(){
    if(!isAdmin46()||state.view!=='config')return;
    const panels=[...document.querySelectorAll('#content article.panel')];
    const servicesPanel=panels.find(p=>/cat[aá]logo de servi[cç]os/i.test(p.querySelector('h2')?.textContent||''));
    if(!servicesPanel)return;
    const rows=[...servicesPanel.querySelectorAll('tbody tr')];
    rows.forEach(row=>{
      if(row.querySelector('[data-admin-service46]'))return;
      const name=(row.querySelector('td')?.textContent||'').trim();const service=(state.services||[]).find(s=>String(s.name||'').trim()===name);if(!service)return;
      const td=row.querySelector('td:last-child');if(!td)return;
      const b=document.createElement('button');b.type='button';b.className='link-btn admin-service46';b.dataset.adminService46=service.id;b.textContent='Editar';td.appendChild(b);
    });
  }

  function decorate46(){styles46();stabilizeFinance46();decorateWork46();decorateFinance46();decorateConfig46()}

  async function openSalePayments46(saleId){
    if(!isAdmin46())return;
    openModal('Editar pagamentos da venda','<div class="empty-state"><span class="spinner"></span>Carregando recebimentos…</div>',true);
    try{
      const sq=await db.from('sales').select('id,client_id,total_amount,service_id,work_id,clients(full_name)').eq('id',saleId).maybeSingle();if(sq.error)throw sq.error;
      const aq=await db.from('payment_allocations').select('payment_id,amount').eq('sale_id',saleId);if(aq.error)throw aq.error;
      const ids=[...new Set((aq.data||[]).map(x=>x.payment_id).filter(Boolean))];let payments=[];
      if(ids.length){const pq=await db.from('payments').select('*').in('id',ids).order('paid_at',{ascending:false});if(pq.error)throw pq.error;payments=pq.data||[]}
      const allocBy=Object.fromEntries((aq.data||[]).map(x=>[x.payment_id,Number(x.amount||0)]));
      const service=byId(state.services||[],sq.data?.service_id),work=byId(state.works||[],sq.data?.work_id);
      const rows=payments.length?payments.map(p=>`<div class="admin-payment-row46"><div><b>${escapeHtml(p.source||'Pagamento')} · ${escapeHtml(p.payment_method||'')}</b><small>${fmtDateTime(p.paid_at||p.created_at)} · Alocado nesta venda: ${fmtMoney(allocBy[p.id]||0)}</small><small>${escapeHtml(p.external_ref?'Ref. '+p.external_ref:'Sem referência externa')}</small></div><div class="button-row"><b>${fmtMoney(p.gross_amount)}</b><button type="button" class="btn ghost" data-admin-edit-payment46="${p.id}">Editar</button></div></div>`).join(''):'<div class="empty-state compact">Nenhum pagamento associado a esta venda.</div>';
      const body=document.querySelector('#modalRoot .modal-body');if(!body)return;
      body.innerHTML=`<div class="admin-readonly46"><b>${escapeHtml(sq.data?.clients?.full_name||'Cliente')}</b><br>${escapeHtml(work?.title||service?.name||'Venda')} · contratado ${fmtMoney(sq.data?.total_amount||0)}</div><div class="admin-payment-list46" style="margin-top:12px">${rows}</div>`;
    }catch(e){closeModal();toast(e.message||'Não foi possível carregar os pagamentos.','error')}
  }

  async function openPayment46(paymentId){
    if(!isAdmin46())return;
    const q=await db.from('payments').select('*').eq('id',paymentId).maybeSingle();if(q.error){toast(q.error.message,'error');return}const p=q.data;if(!p){toast('Pagamento não encontrado.','error');return}
    openModal('Editar pagamento',`<form id="adminPaymentForm46" class="form-grid">
      <div class="span-2 admin-readonly46"><b>Origem: ${escapeHtml(p.source||'—')}</b>${p.external_ref?`<br>Referência externa: ${escapeHtml(p.external_ref)}`:''}<br><small>Origem e referência do Asaas não são alteradas para preservar a conciliação.</small></div>
      <label class="span-2">Cliente<select id="apClient46">${optionList(state.clients||[],'full_name',p.client_id)}</select></label>
      <label>Status<select id="apStatus46"><option value="PAID">Pago</option><option value="PENDING">Pendente</option><option value="OVERDUE">Vencido</option><option value="REFUNDED">Estornado</option><option value="CANCELLED">Cancelado</option></select></label>
      <label>Data e hora<input id="apPaid46" type="datetime-local" value="${localInput46(p.paid_at)}"></label>
      <label>Valor recebido<input id="apGross46" type="number" min="0" step="0.01" value="${Number(p.gross_amount||0).toFixed(2)}" required></label>
      <label>Taxas<input id="apFees46" type="number" min="0" step="0.01" value="${Number(p.fees_amount||0).toFixed(2)}"></label>
      <label>Valor líquido<input id="apNet46" type="number" min="0" step="0.01" value="${p.net_amount==null?'':Number(p.net_amount).toFixed(2)}"></label>
      <label>Método<input id="apMethod46" value="${escapeHtml(p.payment_method||'')}" placeholder="PIX, cartão, dinheiro…"></label>
      <label class="span-2">Observações<textarea id="apNotes46" rows="3">${escapeHtml(p.notes||'')}</textarea></label>
      <div class="span-2 note"><b>Proteção financeira:</b> se o pagamento estiver dividido entre mais de uma venda, o sistema bloqueia alteração de valor que deixaria as alocações inconsistentes.</div>
      <div class="span-2">${formActions('Salvar pagamento')}</div>
    </form>`,true);
    bindCancel();document.getElementById('apStatus46').value=p.status||'PAID';
    document.getElementById('adminPaymentForm46').addEventListener('submit',async e=>{
      e.preventDefault();const submit=e.currentTarget.querySelector('button[type=submit]');submit.disabled=true;submit.textContent='Salvando…';
      const gross=Number(val('apGross46')||0),fees=Number(val('apFees46')||0),net=val('apNet46')===''?null:Number(val('apNet46'));
      const r=await db.rpc('admin_update_payment',{p_payment_id:paymentId,p_client_id:val('apClient46')||null,p_status:val('apStatus46'),p_gross_amount:gross,p_fees_amount:fees,p_net_amount:net,p_payment_method:val('apMethod46')||null,p_paid_at:val('apPaid46')?new Date(val('apPaid46')).toISOString():null,p_notes:val('apNotes46')||null});
      if(r.error){submit.disabled=false;submit.textContent='Salvar pagamento';toast(r.error.message,'error');return}
      toast('Pagamento atualizado.');closeModal();await render();
    });
  }

  function serviceEdit46(service){
    if(!isAdmin46()||!service)return;
    openModal('Editar serviço',`<form id="adminServiceForm46" class="form-grid">
      <label class="span-2">Nome<input id="asName46" required value="${escapeHtml(service.name||'')}"></label>
      <label>Categoria<select id="asCategory46"><option value="CONSULTA">Consulta</option><option value="PERGUNTA">Pergunta</option><option value="MENSALIDADE">Mensalidade</option><option value="TRABALHO_COLETIVO">Trabalho coletivo</option><option value="TRABALHO_COLETIVO_PREMIUM">Trabalho coletivo premium</option><option value="TRABALHO_PARTICULAR">Trabalho particular</option><option value="OUTRO">Outro</option></select></label>
      <label>Preço padrão<input id="asPrice46" type="number" min="0" step="0.01" value="${service.default_price==null?'':Number(service.default_price)}"></label>
      <label>Duração em minutos<input id="asDuration46" type="number" min="1" value="${service.default_duration_minutes||''}"></label>
      <label>Ativo<select id="asActive46"><option value="1">Sim</option><option value="0">Não</option></select></label>
      <div class="span-2">${formActions('Salvar serviço')}</div>
    </form>`);bindCancel();document.getElementById('asCategory46').value=service.category||'OUTRO';document.getElementById('asActive46').value=service.active===false?'0':'1';
    document.getElementById('adminServiceForm46').addEventListener('submit',async e=>{
      e.preventDefault();const r=await db.from('services').update({name:val('asName46').trim(),category:val('asCategory46'),default_price:val('asPrice46')===''?null:Number(val('asPrice46')),default_duration_minutes:val('asDuration46')===''?null:Number(val('asDuration46')),active:val('asActive46')==='1',updated_at:new Date().toISOString()}).eq('id',service.id).select().single();
      if(r.error){toast(r.error.message,'error');return}toast('Serviço atualizado.');closeModal();await loadReferenceData();await render();
    });
  }

  document.addEventListener('click',async e=>{
    const w=e.target.closest('[data-admin-edit-work46]');if(w){e.preventDefault();e.stopPropagation();const work=(state.works||[]).find(x=>x.id===w.dataset.adminEditWork46)||state.selectedWork;if(work)workModal(work);return}
    const sp=e.target.closest('[data-admin-payments46]');if(sp){e.preventDefault();e.stopPropagation();openSalePayments46(sp.dataset.adminPayments46);return}
    const p=e.target.closest('[data-admin-edit-payment46]');if(p){e.preventDefault();e.stopPropagation();openPayment46(p.dataset.adminEditPayment46);return}
    const sv=e.target.closest('[data-admin-service46]');if(sv){e.preventDefault();e.stopPropagation();serviceEdit46((state.services||[]).find(x=>x.id===sv.dataset.adminService46));return}
  },true);

  const prevRender46=render;
  render=async function(){
    const seq=++renderSeq46,start=performance.now();await prevRender46();if(seq!==renderSeq46)return;
    [0,450,1200,2500].forEach(delay=>setTimeout(()=>{if(seq===renderSeq46)decorate46()},delay));
    const ms=Math.round(performance.now()-start);if(ms>800)console.debug(`[Sunshine ${VERSION}] ${state.view} renderizou em ${ms}ms`);
  };

  function start46(){styles46();document.documentElement.dataset.sunshineVersion=VERSION;[120,700,1800].forEach(d=>setTimeout(decorate46,d))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start46);else start46();
})();

;

/* ---- assets/v47.js ---- */
/* Sunshine v3.47 — associação segura pagador ≠ cliente + busca mobile no Cliente 360 */
(function(){
  const norm47=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const digits47=v=>String(v||'').replace(/\D/g,'');

  function ensureStyles47(){
    if(document.getElementById('sunshineV47Styles'))return;
    const s=document.createElement('style');
    s.id='sunshineV47Styles';
    s.textContent=`
      .asaas-beneficiary47{grid-column:1/-1;border:1px solid #e7d8cc;border-radius:14px;background:#fffaf6;padding:13px;display:grid;gap:9px}
      .asaas-beneficiary47 b{font-size:13px;color:#4a271c}.asaas-beneficiary47 p{margin:0;color:#78655c;font-size:12px;line-height:1.45}
      .asaas-beneficiary47 input{width:100%;min-height:44px}
      .asaas-beneficiary-status47{font-size:12px;font-weight:800;color:#256044;background:#eaf5ef;border-radius:10px;padding:9px 11px}
      .asaas-beneficiary-status47.wait{color:#875100;background:#fff3d7}
      .asaas-beneficiary-status47.warn{color:#9a2d19;background:#fff0ea}
      .asaas-payer-note47{grid-column:1/-1;border-left:4px solid #b9472d;background:#fff5ef;padding:10px 12px;border-radius:8px;color:#735e54;font-size:12px;line-height:1.45}
      @media(max-width:720px){.asaas-beneficiary47{padding:12px}.asaas-beneficiary47 input{font-size:16px}}
    `;
    document.head.appendChild(s);
  }

  function safeMatch47(entry,clients){
    if(entry?.matched_client_id){
      const c=clients.find(x=>x.id===entry.matched_client_id);
      if(c)return {client:c,reason:'associação indicada'};
    }
    const stages=[
      ['cadastro do Asaas',entry?.asaas_customer_id,c=>String(c.asaas_customer_id||'')===String(entry.asaas_customer_id||'')],
      ['documento',digits47(entry?.customer_document),c=>digits47(entry?.customer_document)&&digits47(c.document_number)===digits47(entry.customer_document)],
      ['e-mail',String(entry?.customer_email||'').trim().toLowerCase(),c=>String(entry?.customer_email||'').trim()&&String(c.email||'').trim().toLowerCase()===String(entry.customer_email||'').trim().toLowerCase()],
      ['telefone',digits47(entry?.customer_mobile_phone||entry?.customer_phone),c=>{const p=digits47(entry?.customer_mobile_phone||entry?.customer_phone);const cp=digits47(c.phone);return p.length>=8&&cp.length>=8&&cp.slice(-11)===p.slice(-11);}]
    ];
    for(const [reason,key,test] of stages){
      if(!key)continue;
      const matches=clients.filter(test);
      if(matches.length===1)return {client:matches[0],reason};
      if(matches.length>1)return {client:null,ambiguous:true,reason,count:matches.length};
    }
    return {client:null,ambiguous:false};
  }

  async function validateAutomaticChoice47(form,client,clients,sync,status){
    const entryId=form.dataset.entryId27||'';
    if(!entryId||state.demo||!db)return;
    try{
      const {data,error}=await db.from('asaas_incoming_payments')
        .select('id,matched_client_id,asaas_customer_id,customer_document,customer_email,customer_phone,customer_mobile_phone')
        .eq('id',entryId).maybeSingle();
      if(error||!data)return;
      const match=safeMatch47(data,clients);
      if(match.ambiguous){
        client.value='';client.dispatchEvent(new Event('change',{bubbles:true}));sync();
        status.className='asaas-beneficiary-status47 warn';
        status.textContent=`Há ${match.count} clientes com o mesmo ${match.reason}. Por segurança, escolha manualmente a pessoa atendida.`;
        return;
      }
      if(match.client&&client.value!==match.client.id){
        client.value=match.client.id;client.dispatchEvent(new Event('change',{bubbles:true}));sync();
      }
    }catch(e){console.error('asaas_safe_match47',e);}
  }

  function decorateResolve47(form){
    if(!form||form.dataset.safeBeneficiary47==='1')return;
    const client=form.querySelector('#agClient,#arClient');
    if(!client)return;
    form.dataset.safeBeneficiary47='1';
    ensureStyles47();

    const firstBox=form.querySelector('.soft-box');
    const h3=firstBox?.querySelector('h3');
    const p=firstBox?.querySelector('p');
    if(h3)h3.textContent='1. Para quem é este pagamento?';
    if(p)p.textContent='O pagador no Asaas e o cliente atendido podem ser pessoas diferentes. Selecione o Cliente 360 correto.';

    const clientLabel=client.closest('label');
    if(clientLabel){
      const textNode=[...clientLabel.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());
      if(textNode)textNode.nodeValue='Cliente que receberá o pagamento ';
    }

    const wrap=document.createElement('div');
    wrap.className='asaas-beneficiary47';
    const listId='asaasClientSearchList47-'+Math.random().toString(36).slice(2);
    const clients=[...(state?.clients||[])].sort((a,b)=>String(a.full_name||'').localeCompare(String(b.full_name||''),'pt-BR'));
    wrap.innerHTML=`<div><b>Buscar no Cliente 360</b><p>Use o nome da pessoa atendida, mesmo quando o PIX/cartão veio da conta de outra pessoa.</p></div>
      <input type="search" data-client-search47 list="${listId}" placeholder="Digite o nome do cliente" autocomplete="off">
      <datalist id="${listId}">${clients.map(c=>`<option value="${escapeHtml(c.full_name||'')}"></option>`).join('')}</datalist>
      <div class="asaas-beneficiary-status47 wait" data-beneficiary-status47>Escolha o cliente que deve receber este pagamento.</div>`;
    clientLabel?.insertAdjacentElement('beforebegin',wrap);

    const search=wrap.querySelector('[data-client-search47]');
    const status=wrap.querySelector('[data-beneficiary-status47]');
    const sync=()=>{
      const c=clients.find(x=>x.id===client.value);
      if(c){
        search.value=c.full_name||'';
        status.className='asaas-beneficiary-status47';
        status.textContent=`Será lançado para: ${c.full_name}. O cadastro desta pessoa não será substituído pelos dados do pagador.`;
      }else{
        status.className='asaas-beneficiary-status47 wait';
        status.textContent='Nenhum cliente existente selecionado. Se continuar assim, o sistema entenderá que é um novo cliente.';
      }
    };
    search.addEventListener('change',()=>{
      const q=norm47(search.value);
      if(!q)return;
      const exact=clients.find(c=>norm47(c.full_name)===q);
      const matches=clients.filter(c=>norm47(c.full_name).includes(q));
      const chosen=exact||(matches.length===1?matches[0]:null);
      if(chosen){client.value=chosen.id;client.dispatchEvent(new Event('change',{bubbles:true}));sync();}
      else if(matches.length>1){toast('Há mais de um cliente com esse trecho do nome. Selecione o nome completo na sugestão.','error');}
      else toast('Cliente não encontrado no Cliente 360.','error');
    });
    client.addEventListener('change',sync);
    sync();
    validateAutomaticChoice47(form,client,clients,sync,status);

    const divider=[...form.querySelectorAll('.form-divider')].find(x=>/criar|completar/i.test(x.textContent||''));
    if(divider)divider.textContent='Dados do pagador recebidos pelo Asaas (usados apenas se for criar um novo cliente)';
    const note=document.createElement('div');
    note.className='asaas-payer-note47';
    note.innerHTML='<b>Pagador ≠ cliente:</b> ao escolher um Cliente 360 existente, CPF, ID do Asaas, telefone e endereço do pagador ficam somente no histórico financeiro e não alteram o cadastro da pessoa atendida.';
    divider?.insertAdjacentElement('afterend',note);
  }

  function run47(){
    ensureStyles47();
    decorateResolve47(document.getElementById('asaasGlobalResolveForm'));
    decorateResolve47(document.getElementById('asaasResolveForm'));
  }

  const obs=new MutationObserver(run47);
  obs.observe(document.body,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run47);else run47();
})();

;

/* ---- assets/v48.js ---- */
/* Sunshine v3.48 — correção definitiva do valor recebido no Asaas.
   Evita que CPF/telefone desabilitados sejam confundidos com o campo monetário
   pelo fluxo multi-serviço legado da v27. */
(function(){
  const digits48=v=>String(v||'').replace(/\D/g,'');

  function formatCpfCnpj48(v){
    let d=digits48(v);
    if(d.length===13 && /00$/.test(d)) d=d.slice(0,-2); // recupera CPF convertido para number + .00
    if(d.length===16 && /00$/.test(d)) d=d.slice(0,-2); // recupera CNPJ convertido para number + .00
    if(d.length===11)return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
    if(d.length===14)return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5');
    return d;
  }

  function formatPhone48(v){
    const d=digits48(v);
    if(d.length===11)return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
    if(d.length===10)return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    if(d.length===13 && d.startsWith('55'))return `+55 (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
    if(d.length===12 && d.startsWith('55'))return `+55 (${d.slice(2,4)}) ${d.slice(4,8)}-${d.slice(8)}`;
    return v;
  }

  function labelText48(label,text){
    if(!label)return;
    const node=[...label.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());
    if(node)node.nodeValue=text;
  }

  function preflight48(){
    const form=document.getElementById('asaasGlobalResolveForm')||document.getElementById('asaasResolveForm');
    if(!form)return;
    const doc=form.querySelector('#agDocument,#arDocument');
    const phone=form.querySelector('#agPhone,#arPhone');
    if(doc && /^\d+$/.test(String(doc.value||''))) doc.value=formatCpfCnpj48(doc.value);
    if(phone && /^\d+$/.test(String(phone.value||''))) phone.value=formatPhone48(phone.value);
  }

  function recalc48(form){
    const gross=Number(form.dataset.gross27||0);
    let total=Number(form.querySelector('#agAmount0')?.value||0);
    form.querySelectorAll('.asaas-extra-item27').forEach(x=>{
      total+=Number(x.querySelector('.agExtraAmount27')?.value||0);
    });
    const el=form.querySelector('.asaas-total27');
    if(!el)return;
    const diff=Math.round((gross-total)*100)/100;
    el.className=`asaas-total27 ${Math.abs(diff)<.005?'ok':'bad'}`;
    el.innerHTML=`Recebido: <b>${fmtMoney(gross)}</b> · Associado: <b>${fmtMoney(total)}</b> · ${Math.abs(diff)<.005?'Fechou corretamente':`Falta distribuir ${fmtMoney(diff)}`}`;
  }

  function repairWrongAmount48(form){
    if(!form||form.dataset.multi27!=='1')return;
    const current=form.querySelector('#agAmount0');
    if(!current)return;

    // O campo monetário verdadeiro permanece no label "Valor recebido" quando a v27 captura CPF/telefone por engano.
    const realLabel=[...form.querySelectorAll('label')].find(l=>/^valor recebido/i.test((l.childNodes[0]?.textContent||'').trim()));
    const real=realLabel?.querySelector('input');
    if(!real||real===current)return;

    const badValue=Number(current.value||0);
    const realValue=Number(String(real.value||'').replace(',','.'));
    if(!(realValue>=0) || Math.abs(badValue-realValue)<.005)return;

    const badLabel=current.closest('label');
    const likelyDoc=badValue>=1000000000;
    const likelyPhone=badValue>=10000000 && badValue<1000000000;

    if(likelyDoc){
      current.id='agDocument';
      current.type='text';
      current.removeAttribute('step');current.removeAttribute('min');
      current.value=formatCpfCnpj48(String(Math.trunc(badValue)));
      current.disabled=Boolean(form.querySelector('#agClient')?.value);
      labelText48(badLabel,'CPF/CNPJ ');
    }else if(likelyPhone){
      current.id='agPhone';
      current.type='text';
      current.removeAttribute('step');current.removeAttribute('min');
      current.value=formatPhone48(String(Math.trunc(badValue)));
      current.disabled=Boolean(form.querySelector('#agClient')?.value);
      labelText48(badLabel,'Telefone ');
    }else{
      return;
    }

    real.disabled=false;
    real.type='number';
    real.step='0.01';
    real.min='0.01';
    real.id='agAmount0';
    real.value=realValue.toFixed(2);
    labelText48(realLabel,'Valor desta parte ');
    form.dataset.gross27=String(realValue);
    real.addEventListener('input',()=>recalc48(form));
    recalc48(form);
    toast('Valor recebido corrigido para '+fmtMoney(realValue)+'.','error');
  }

  function run48(){
    preflight48();
    const form=document.getElementById('asaasGlobalResolveForm')||document.getElementById('asaasResolveForm');
    if(form)repairWrongAmount48(form);
  }

  // O clique que abre a pendência cria o formulário de forma síncrona. Este listener roda
  // ainda no mesmo evento, antes dos MutationObservers da v27 tentarem descobrir o valor.
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-asaas-resolve-global]')) preflight48();
  },true);

  const obs=new MutationObserver(()=>run48());
  obs.observe(document.body,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run48);else run48();
})();

;

/* ---- assets/v49.js ---- */
/* Sunshine v3.49 — remediação integral da auditoria: UX, perguntas, financeiro, performance e consistência. */
(function(){
  const VERSION='v3.49';
  const clientDir49={query:'',status:'',page:1,pageSize:25,total:0};
  const workFilter49={query:'',type:''};
  const today49=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const first49=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`};
  const finance49={kind:'SALE',start:first49(),end:today49(),page:1,pageSize:50};
  const consult49={start:first49(),end:today49()};
  const perf49={start:null,end:null};
  let pickerSeq49=0,clientSaveCallback49=null;

  const statusLabels49={ACTIVE:'Ativo',INACTIVE:'Inativo',BLOCKED:'Bloqueado',DONE:'Concluído',PAID:'Pago',COMPLETED:'Concluído',CONFIRMED:'Confirmado',OPEN:'Aberto',SCHEDULED:'Agendado',PLANNED:'Planejado',PENDING:'Pendente',OVERDUE:'Vencido',CANCELLED:'Cancelado',REFUNDED:'Estornado',REGISTERED:'Inscrito',RESCHEDULED:'Reagendado',NO_SHOW:'Não compareceu',CLOSED:'Fechado',DUE:'A pagar',SUSPENDED:'Suspenso',AWAITING_RESPONSE:'Aguardando resposta',RESPONDED:'Respondida',NOT_ASSOCIATED:'Não associado',PARTIAL:'Parcial',OVERPAID:'Excesso recebido',CONNECTED:'Conectado',DELAYED:'Com atraso',ERROR:'Erro',NOT_CONFIGURED:'Não configurado'};
  const label49=v=>statusLabels49[String(v||'').toUpperCase()]||String(v||'—').replaceAll('_',' ');
  const civil49=v=>{if(!v)return '—';const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:fmtDate(v)};
  const localInput49=v=>{if(!v)return '';const d=new Date(v);if(Number.isNaN(d.getTime()))return '';const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`};
  const norm49=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const status49=v=>`<span class="pill ${['ACTIVE','DONE','PAID','COMPLETED','CONFIRMED','RESPONDED','CONNECTED'].includes(v)?'ok':['PENDING','OVERDUE','BLOCKED','ERROR','OVERPAID'].includes(v)?'red':['OPEN','SCHEDULED','AWAITING_RESPONSE','PARTIAL','DELAYED'].includes(v)?'gold':'neutral'}">${escapeHtml(label49(v))}</span>`;

  function styles49(){
    if(document.getElementById('v49style'))return;
    const s=document.createElement('style');s.id='v49style';s.textContent=`
      .client-picker49{position:relative;display:grid;grid-template-columns:1fr auto;gap:7px}.client-picker49 input{min-width:0}.client-picker49-clear{border:1px solid #dfcfc5;background:#fff;border-radius:10px;min-width:42px;cursor:pointer}.client-picker49-list{position:absolute;z-index:90;left:0;right:0;top:calc(100% + 5px);background:#fff;border:1px solid #dfcfc5;border-radius:12px;box-shadow:0 14px 34px rgba(52,31,24,.16);max-height:320px;overflow:auto;padding:5px}.client-picker49-list[hidden]{display:none}.client-option49{display:block;width:100%;border:0;background:#fff;text-align:left;padding:10px;border-radius:9px;cursor:pointer}.client-option49:hover,.client-option49.active{background:#fff3ed}.client-option49 b,.client-option49 small{display:block}.client-option49 small{color:#806b62;margin-top:2px}.client-new49{border-top:1px solid #eadfd8;margin-top:4px;padding-top:5px}.client-new49 button{width:100%;border:0;background:#fff8f5;color:#8b3e25;font-weight:800;padding:10px;border-radius:9px;cursor:pointer}
      .client-dir49 .toolbar{position:sticky;top:0;z-index:5;background:#fff;padding:4px 0 12px}.pagination49{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}.pagination49 .button-row{margin:0}.client-side49{position:fixed;z-index:150;inset:0;background:rgba(35,20,15,.32);display:flex;justify-content:flex-end}.client-side49-panel{width:min(620px,100%);height:100%;overflow:auto;background:#fff;padding:18px;box-shadow:-18px 0 48px rgba(35,20,15,.18)}.client-side49-head{display:flex;justify-content:space-between;gap:10px;align-items:start;position:sticky;top:-18px;background:#fff;padding:18px 0 12px;z-index:2}.client-side49-head h2{margin:0}.profile-grid49{display:grid;grid-template-columns:1fr 1fr;gap:10px}.profile-grid49>div{border:1px solid #eadfd8;border-radius:12px;padding:11px}.profile-grid49 span{display:block;color:#806b62;font-size:10px;text-transform:uppercase}.profile-grid49 b{display:block;margin-top:4px}.client-q49{border:1px solid #eadfd8;border-radius:12px;padding:11px;margin-top:8px}.client-q49 p{margin:5px 0}
      .question-field49[hidden]{display:none!important}.question-card49{cursor:pointer;outline:none}.question-card49:focus-visible{box-shadow:0 0 0 3px rgba(139,62,37,.25)}.question-queue49{display:grid;gap:10px}.question-row49{border:1px solid #eadfd8;border-radius:13px;padding:12px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px}.question-row49 p{margin:5px 0;color:#4e352c}.question-meta49{display:flex;gap:8px;flex-wrap:wrap;color:#806b62;font-size:11px}.question-original49{border:1px solid #eadfd8;background:#fffaf6;border-radius:12px;padding:13px;line-height:1.5}
      .finance49-filter,.consult49-filter,.perf49-filter{display:grid;grid-template-columns:1.2fr 1fr 1fr auto;gap:10px;align-items:end;border:1px solid #eadfd8;background:#fffaf6;padding:12px;border-radius:14px;margin-bottom:14px}.finance49-filter label,.consult49-filter label,.perf49-filter label{display:grid;gap:5px;font-size:11px;font-weight:800;color:#6c5147}.filter-state49{grid-column:1/-1;color:#806b62;font-size:11px}.filter-state49.pending{color:#9a5e00;font-weight:800}.finance49 td small{display:block;color:#806b62;margin-top:3px}.excess49{border-left:3px solid #b42318}.metric-grid49{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.metric49{border:1px solid #eadfd8;border-radius:14px;padding:13px;background:#fff}.metric49 span{display:block;font-size:10px;color:#806b62;text-transform:uppercase}.metric49 b{display:block;font-size:21px;margin:5px 0}.metric49 small{color:#806b62}.metric49 svg{width:100%;height:72px;margin-top:8px}.integration-state49{display:grid;gap:9px}.integration-row49{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #eadfd8;border-radius:12px;padding:12px}.integration-row49 small{display:block;color:#806b62;margin-top:3px}.house-actions49{white-space:nowrap}.house-history49{display:grid;gap:8px}.house-history49>div{border:1px solid #eadfd8;border-radius:10px;padding:10px}.asaas-guard49{border:1px solid #e7c6bc;background:#fff4f0;color:#6d2d1d;border-radius:10px;padding:9px 11px;font-size:11px;margin-top:8px}
      @media(max-width:820px){.metric-grid49{grid-template-columns:1fr 1fr}.finance49-filter,.consult49-filter,.perf49-filter{grid-template-columns:1fr 1fr}.finance49-filter .btn,.consult49-filter .btn,.perf49-filter .btn{grid-column:1/-1;width:100%}.question-row49{grid-template-columns:1fr}.question-row49 .btn{width:100%}.profile-grid49{grid-template-columns:1fr}.pagination49{align-items:stretch;flex-direction:column}.pagination49 .button-row{display:grid;grid-template-columns:1fr 1fr}.metric-grid49{grid-template-columns:1fr}.client-dir49 .toolbar{position:static}}
    `;document.head.appendChild(s);
  }

  async function searchClients49(q='',status='',limit=15,offset=0){
    if(state.demo||!db)return [];
    const r=await db.rpc('search_clients_v349',{p_query:q||null,p_status:status||null,p_limit:limit,p_offset:offset});
    if(r.error)throw r.error;return r.data||[];
  }

  function enhanceClientSelect49(select,onNewSelected){
    if(!select||select.dataset.picker49==='1')return;
    const selectedId=select.value||'';const selectedOpt=[...select.options].find(o=>o.value===selectedId);const selectedName=selectedOpt?.textContent?.trim()||byId(state.clients||[],selectedId)?.full_name||'';
    select.dataset.picker49='1';select.hidden=true;select.removeAttribute('size');select.innerHTML=selectedId?`<option value="${escapeHtml(selectedId)}" selected>${escapeHtml(selectedName)}</option>`:'<option value=""></option>';
    const wrap=document.createElement('div');wrap.className='client-picker49';wrap.dataset.pickerFor49=select.id||String(++pickerSeq49);wrap.innerHTML=`<input type="search" class="field" autocomplete="off" placeholder="Digite ao menos 2 caracteres" value="${escapeHtml(selectedName)}" aria-label="Buscar cliente" aria-expanded="false"><button type="button" class="client-picker49-clear" aria-label="Limpar cliente">×</button><div class="client-picker49-list" role="listbox" hidden></div>`;select.insertAdjacentElement('afterend',wrap);
    const input=wrap.querySelector('input'),list=wrap.querySelector('.client-picker49-list');let rows=[],active=-1,timer=null;
    const choose=(c)=>{select.innerHTML=`<option value="${c.id}" selected>${escapeHtml(c.full_name)}</option>`;select.value=c.id;input.value=c.full_name;list.hidden=true;input.setAttribute('aria-expanded','false');select.dispatchEvent(new Event('change',{bubbles:true}));if(onNewSelected)onNewSelected(c);};
    const paint=()=>{const q=input.value.trim();if(q.length<2){list.innerHTML='<div class="client-option49"><small>Digite pelo menos 2 caracteres para pesquisar.</small></div>';list.hidden=false;return;}list.innerHTML=rows.length?rows.map((c,i)=>`<button type="button" class="client-option49 ${i===active?'active':''}" data-pick-client49="${c.id}" role="option"><b>${escapeHtml(c.full_name)}${c.preferred_name?` · ${escapeHtml(c.preferred_name)}`:''}</b><small>${escapeHtml(c.phone||c.email||'Sem telefone/e-mail')}</small></button>`).join(''):`<div class="client-option49"><small>Nenhum cliente encontrado.</small></div><div class="client-new49"><button type="button" data-new-client49>Cadastrar novo cliente</button></div>`;list.hidden=false;input.setAttribute('aria-expanded','true');};
    const run=async()=>{const q=input.value.trim();if(q.length<2){rows=[];paint();return;}try{rows=await searchClients49(q,'',15,0);active=-1;paint();}catch(e){list.innerHTML=`<div class="client-option49"><small>${escapeHtml(e.message||'Erro na busca')}</small></div>`;list.hidden=false;}};
    input.addEventListener('input',()=>{select.value='';clearTimeout(timer);timer=setTimeout(run,180)});
    input.addEventListener('focus',()=>{if(input.value.trim().length>=2)run()});
    input.addEventListener('keydown',e=>{if(list.hidden)return;if(e.key==='ArrowDown'){e.preventDefault();active=Math.min(active+1,rows.length-1);paint();}else if(e.key==='ArrowUp'){e.preventDefault();active=Math.max(active-1,0);paint();}else if(e.key==='Enter'&&active>=0){e.preventDefault();choose(rows[active]);}else if(e.key==='Escape'){list.hidden=true;}});
    wrap.addEventListener('click',e=>{const b=e.target.closest('[data-pick-client49]');if(b){const c=rows.find(x=>x.id===b.dataset.pickClient49);if(c)choose(c);return;}if(e.target.closest('.client-picker49-clear')){select.innerHTML='<option value=""></option>';select.value='';input.value='';rows=[];list.hidden=true;select.dispatchEvent(new Event('change',{bubbles:true}));return;}if(e.target.closest('[data-new-client49]')){clientModal({},c=>choose(c));}});
    document.addEventListener('click',e=>{if(!wrap.contains(e.target))list.hidden=true},{capture:true,once:false});
  }

  function enhanceAllClientSelects49(){
    const known=new Set(['aClient','pClient','sClient','rClient','hClient','agClient','arClient','g41Client','apClient46']);
    document.querySelectorAll('select').forEach(sel=>{if(known.has(sel.id)||(/client/i.test(sel.id||'')&&sel.options.length>20))enhanceClientSelect49(sel)});
  }

  clientModal=function(c={},afterSave=null){
    clientSaveCallback49=typeof afterSave==='function'?afterSave:null;
    openModal(c.id?'Editar cliente':'Novo cliente',`<form id="clientForm49" class="form-grid">
      <label class="span-2">Nome completo<input id="fFull49" required value="${escapeHtml(c.full_name||'')}"></label><label>Nome preferido<input id="fPreferred49" value="${escapeHtml(c.preferred_name||'')}"></label><label>Telefone<input id="fPhone49" value="${escapeHtml(c.phone||'')}"></label><label>E-mail<input id="fEmail49" type="email" value="${escapeHtml(c.email||'')}"></label><label>Nascimento<input id="fBirth49" type="date" value="${escapeHtml(c.birth_date||'')}"></label><label>Cidade<input id="fCity49" value="${escapeHtml(c.city||'')}"></label><label>Estado<input id="fState49" maxlength="2" value="${escapeHtml(c.state||'')}"></label><label>Status<select id="fStatus49"><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option><option value="BLOCKED">Bloqueado</option></select></label><label class="checkbox"><input id="fOpt49" type="checkbox" ${c.marketing_opt_in?'checked':''}> Aceita comunicações</label><label class="span-2">Observações<textarea id="fNotes49" rows="3">${escapeHtml(c.notes||'')}</textarea></label><div class="span-2">${formActions(c.id?'Atualizar':'Criar cliente')}</div>
    </form>`);bindCancel();document.getElementById('fStatus49').value=c.status||'ACTIVE';
    document.getElementById('clientForm49').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Salvando…';const payload={full_name:val('fFull49').trim(),preferred_name:val('fPreferred49').trim()||null,phone:val('fPhone49').trim()||null,email:val('fEmail49').trim()||null,birth_date:val('fBirth49')||null,city:val('fCity49').trim()||null,state:val('fState49').trim().toUpperCase()||null,status:val('fStatus49'),marketing_opt_in:checked('fOpt49'),notes:val('fNotes49').trim()||null,source:c.source||'MANUAL'};const r=c.id?await db.from('clients').update(payload).eq('id',c.id).select().single():await db.from('clients').insert(payload).select().single();if(r.error){btn.disabled=false;btn.textContent='Salvar';toast(r.error.message,'error');return;}toast('Cliente salvo.');closeModal();const cb=clientSaveCallback49;clientSaveCallback49=null;if(cb)cb(r.data);if(state.view==='clientes'){clientDir49.page=1;await refreshClientDirectory49();if(c.id)openClientPanel49(r.data.id);}});
  };

  async function clientPage49(){
    if(state.demo)return [];
    const offset=(clientDir49.page-1)*clientDir49.pageSize;const rows=await searchClients49(clientDir49.query,clientDir49.status,clientDir49.pageSize,offset);clientDir49.total=Number(rows[0]?.total_count||0);return rows;
  }
  function clientRows49(rows){return rows.length?rows.map(c=>`<tr class="clickable" data-client49="${c.id}"><td><b>${escapeHtml(c.full_name)}</b>${c.preferred_name?`<small>${escapeHtml(c.preferred_name)}</small>`:''}</td><td>${escapeHtml(c.phone||'—')}</td><td>${escapeHtml(c.email||'—')}</td><td>${civil49(c.birth_date)}</td><td>${status49(c.status)}</td></tr>`).join(''):'<tr class="empty-row"><td colspan="5">Nenhum cliente encontrado.</td></tr>'}
  renderClients=async function(){
    const rows=await clientPage49();const pages=Math.max(1,Math.ceil(clientDir49.total/clientDir49.pageSize));
    return `<article class="panel client-dir49"><div class="toolbar"><input id="clientSearch49" class="field grow" placeholder="Buscar por nome, nome preferido, telefone ou e-mail" value="${escapeHtml(clientDir49.query)}"><select id="clientStatus49" class="select"><option value="">Todos os status</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option><option value="BLOCKED">Bloqueados</option></select><button class="btn" data-action="new-client">+ Novo cliente</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th>Telefone</th><th>E-mail</th><th>Nascimento</th><th>Status</th></tr></thead><tbody id="clientBody49">${clientRows49(rows)}</tbody></table></div><div class="pagination49"><span id="clientCount49">${clientDir49.total} cliente${clientDir49.total===1?'':'s'} · página ${clientDir49.page} de ${pages}</span><div class="button-row"><button class="btn ghost" type="button" data-client-prev49 ${clientDir49.page<=1?'disabled':''}>← Anterior</button><button class="btn ghost" type="button" data-client-next49 ${clientDir49.page>=pages?'disabled':''}>Próxima →</button></div></div></article>`;
  };
  async function refreshClientDirectory49(){if(state.view!=='clientes')return;const rows=await clientPage49();const body=document.getElementById('clientBody49');if(body)body.innerHTML=clientRows49(rows);const pages=Math.max(1,Math.ceil(clientDir49.total/clientDir49.pageSize));const count=document.getElementById('clientCount49');if(count)count.textContent=`${clientDir49.total} cliente${clientDir49.total===1?'':'s'} · página ${clientDir49.page} de ${pages}`;const prev=document.querySelector('[data-client-prev49]'),next=document.querySelector('[data-client-next49]');if(prev)prev.disabled=clientDir49.page<=1;if(next)next.disabled=clientDir49.page>=pages;}
  async function openClientPanel49(id){
    if(!id)return;let root=document.getElementById('clientSide49');if(root)root.remove();root=document.createElement('div');root.id='clientSide49';root.className='client-side49';root.innerHTML='<section class="client-side49-panel"><div class="empty-state"><span class="spinner"></span>Carregando Cliente 360…</div></section>';document.body.appendChild(root);
    try{const [cq,tq,aq,sq,qq]=await Promise.all([db.from('clients').select('*').eq('id',id).single(),db.from('client_timeline_events').select('*').eq('client_id',id).order('occurred_at',{ascending:false}).limit(30),db.from('appointments').select('id,starts_at,event_type,status,question_text,answer_text,question_status').eq('client_id',id).order('starts_at',{ascending:false}).limit(12),db.from('sales').select('id,sale_type,total_amount,status,sold_at').eq('client_id',id).order('sold_at',{ascending:false}).limit(12),db.from('appointments').select('id,question_text,answer_text,question_status,created_at,answered_at').eq('client_id',id).not('question_status','is',null).order('created_at',{ascending:false}).limit(20)]);if(cq.error)throw cq.error;const c=cq.data;const timeline=(tq.data||[]).map(x=>`<div class="timeline-item"><div class="timeline-dot"></div><div><b>${escapeHtml(x.title)}</b><p>${fmtDateTime(x.occurred_at)}${x.summary?` · ${escapeHtml(x.summary)}`:''}</p></div></div>`).join('')||'<div class="empty-state compact">Sem eventos registrados.</div>';const questions=(qq.data||[]).map(q=>`<div class="client-q49"><b>${escapeHtml(q.question_text||'Pergunta')}</b><p>${q.answer_text?escapeHtml(q.answer_text):'<span class="muted">Ainda sem resposta.</span>'}</p><small>${status49(q.question_status)} · ${fmtDateTime(q.created_at)}</small></div>`).join('')||'<div class="empty-state compact">Nenhuma Pergunta Objetiva registrada.</div>';
      root.querySelector('.client-side49-panel').innerHTML=`<div class="client-side49-head"><div><span class="eyebrow">Cliente 360</span><h2>${escapeHtml(c.full_name)}</h2></div><button class="icon-btn" type="button" data-close-client49 aria-label="Fechar">×</button></div><div class="button-row"><button class="btn secondary" type="button" data-edit-client49="${c.id}">Editar cliente</button><button class="btn ghost" type="button" data-action="odu-client" data-id="${c.id}">Odu</button></div><div class="profile-grid49" style="margin-top:12px"><div><span>Telefone</span><b>${escapeHtml(c.phone||'—')}</b></div><div><span>E-mail</span><b>${escapeHtml(c.email||'—')}</b></div><div><span>Nascimento</span><b>${civil49(c.birth_date)}</b></div><div><span>Localidade</span><b>${escapeHtml([c.city,c.state].filter(Boolean).join(' / ')||'—')}</b></div></div><article class="panel" style="margin-top:14px"><h3>Perguntas objetivas</h3>${questions}</article><article class="panel" style="margin-top:14px"><h3>Linha do tempo</h3><div class="timeline">${timeline}</div></article><div class="subgrid"><div><h3>Atendimentos recentes</h3><p class="metric-line"><b>${aq.data?.length||0}</b> carregados</p></div><div><h3>Vendas recentes</h3><p class="metric-line"><b>${sq.data?.length||0}</b> carregadas</p></div></div>`;
    }catch(e){root.querySelector('.client-side49-panel').innerHTML=`<div class="empty-state error">${escapeHtml(e.message||'Não foi possível abrir o cliente.')}</div>`;}
  }

  async function recentPayments49(clientId,select,appointmentId){
    if(!clientId){select.innerHTML='<option value="">Selecione o cliente primeiro</option>';return;}
    select.disabled=true;const p=await db.from('payments').select('id,gross_amount,source,payment_method,paid_at,created_at,status').eq('client_id',clientId).eq('status','PAID').order('paid_at',{ascending:false}).limit(40);if(p.error){select.disabled=false;toast(p.error.message,'error');return;}let current=null;if(appointmentId){const s=await db.from('sales').select('id').eq('appointment_id',appointmentId);const ids=(s.data||[]).map(x=>x.id);if(ids.length){const a=await db.from('payment_allocations').select('payment_id').in('sale_id',ids);current=a.data?.[0]?.payment_id||null;}}
    select.innerHTML='<option value="">Não associar pagamento agora</option>'+(p.data||[]).map(x=>`<option value="${x.id}" ${x.id===current?'selected':''}>${escapeHtml((x.source==='ASAAS'?'Asaas':x.source||'Pagamento')+' · '+fmtMoney(x.gross_amount)+' · '+fmtDateTime(x.paid_at||x.created_at))}</option>`).join('');select.disabled=false;
  }
  appointmentModal=function(a={}){
    const editing=Boolean(a.id),selectedClient=byId(state.clients||[],a.client_id);openModal(editing?'Editar compromisso':'Novo compromisso',`<form id="apptForm49" class="form-grid">
      <label class="span-2">Cliente<select id="aClient" required>${a.client_id?`<option value="${a.client_id}" selected>${escapeHtml(selectedClient?.full_name||'Cliente selecionado')}</option>`:'<option value=""></option>'}</select></label><label>Evento<select id="aType49"><option value="CONSULTA">Consulta</option><option value="PERGUNTA">Pergunta</option><option value="RETORNO">Retorno</option><option value="TRABALHO">Trabalho</option><option value="OUTRO">Outro</option></select></label><label>Serviço<select id="aService49">${optionList(state.services,'name',a.service_id)}</select></label><label>Método<select id="aMethod49"><option value="">—</option><option value="BARALHO">Baralho</option><option value="BUZIOS">Búzios</option><option value="PERGUNTA_OBJETIVA">Pergunta objetiva</option><option value="OUTRO">Outro</option></select></label><label>Responsável<select id="aResponsible49">${optionList(state.team.filter(x=>x.is_practitioner),'full_name',a.responsible_member_id)}</select></label><label>Início<input id="aStarts49" type="datetime-local" required value="${localInput49(a.starts_at)}"></label><label>Status da agenda<select id="aStatus49"><option value="SCHEDULED">Agendado</option><option value="DONE">Concluído</option><option value="RESCHEDULED">Reagendado</option><option value="CANCELLED">Cancelado</option><option value="NO_SHOW">Não compareceu</option></select></label>
      <label class="span-2 question-field49" id="questionField49" hidden>Pergunta da cliente<textarea id="aQuestion49" rows="4" placeholder="Digite exatamente a pergunta que será respondida">${escapeHtml(a.question_text||'')}</textarea><small>Ao salvar, o status operacional será “Aguardando resposta”. Pagamento continua separado.</small></label>
      <div class="span-2 agenda-payment-box26"><div class="agenda-payment-head26"><div><h3>Pagamento</h3><p>Associe se já foi recebido. Isso não responde a pergunta.</p></div></div><label>Pagamento já recebido<select id="aPayment49"><option value="">Selecione o cliente primeiro</option></select></label></div>
      <label class="span-2">Orientação / resumo<textarea id="aGuidance49" rows="3">${escapeHtml(a.guidance_summary||'')}</textarea></label><label class="span-2">Follow-up<textarea id="aFollow49" rows="2">${escapeHtml(a.follow_up_notes||'')}</textarea></label><div class="span-2">${formActions(editing?'Atualizar':'Agendar')}</div></form>`,true);bindCancel();enhanceClientSelect49(document.getElementById('aClient'));
    const type=document.getElementById('aType49'),service=document.getElementById('aService49'),method=document.getElementById('aMethod49'),question=document.getElementById('questionField49'),qInput=document.getElementById('aQuestion49'),client=document.getElementById('aClient'),pay=document.getElementById('aPayment49');type.value=a.event_type||'CONSULTA';method.value=a.consultation_method||'';document.getElementById('aStatus49').value=a.status||'SCHEDULED';
    const syncQuestion=()=>{const sv=byId(state.services||[],service.value),isQ=type.value==='PERGUNTA'||method.value==='PERGUNTA_OBJETIVA'||sv?.category==='PERGUNTA';question.hidden=!isQ;qInput.required=isQ;if(sv?.category==='PERGUNTA'){type.value='PERGUNTA';method.value='PERGUNTA_OBJETIVA';}};service.addEventListener('change',syncQuestion);type.addEventListener('change',syncQuestion);method.addEventListener('change',syncQuestion);client.addEventListener('change',()=>recentPayments49(client.value,pay,a.id||null));syncQuestion();if(client.value)recentPayments49(client.value,pay,a.id||null);
    document.getElementById('apptForm49').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const sv=byId(state.services||[],service.value);const isQ=type.value==='PERGUNTA'||method.value==='PERGUNTA_OBJETIVA'||sv?.category==='PERGUNTA';if(isQ&&!qInput.value.trim()){toast('Preencha a pergunta da cliente.','error');qInput.focus();return;}const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Salvando…';const payload={client_id:client.value,event_type:isQ?'PERGUNTA':type.value,service_id:service.value||null,consultation_method:isQ?'PERGUNTA_OBJETIVA':method.value||null,responsible_member_id:val('aResponsible49')||null,starts_at:new Date(val('aStarts49')).toISOString(),status:val('aStatus49'),guidance_summary:val('aGuidance49').trim()||null,follow_up_notes:val('aFollow49').trim()||null,question_text:isQ?qInput.value.trim():null,question_status:isQ?(a.question_status||'AWAITING_RESPONSE'):null,answer_text:isQ?(a.answer_text||null):null,answered_by:isQ?(a.answered_by||null):null,answered_at:isQ?(a.answered_at||null):null};const r=editing?await db.from('appointments').update(payload).eq('id',a.id).select().single():await db.from('appointments').insert(payload).select().single();if(r.error){btn.disabled=false;btn.textContent='Salvar';toast(r.error.message,'error');return;}if(pay.value){const link=await db.rpc('associate_payment_to_appointment',{p_appointment_id:r.data.id,p_payment_id:pay.value});if(link.error){toast('Compromisso salvo; associação financeira precisa de revisão: '+link.error.message,'error');btn.disabled=false;return;}}toast(isQ?'Pergunta salva como Aguardando resposta.':'Compromisso salvo.');closeModal();await render();});
  };

  async function questionCount49(){const q=await db.from('appointments').select('id',{count:'exact',head:true}).eq('question_status','AWAITING_RESPONSE');if(q.error)throw q.error;return q.count||0;}
  async function refreshQuestionKpi49(){if(state.view!=='home'||state.demo||!db)return;try{const n=await questionCount49();const grid=document.querySelector('#content .kpi-grid');const cards=[...(grid?.querySelectorAll('.card')||[])];if(cards.length<4)return;const c=cards[3];c.classList.add('question-card49');c.dataset.questionQueue49='1';c.setAttribute('role','button');c.setAttribute('tabindex','0');c.setAttribute('aria-label',`${n} perguntas aguardando resposta`);const l=c.querySelector('.card-label'),v=c.querySelector('.value'),f=c.querySelector('.card-foot');if(l)l.textContent='PERGUNTAS AGUARDANDO RESPOSTA';if(v)v.textContent=String(n);if(f)f.textContent=n?'Clique para abrir a fila':'Nenhuma pergunta pendente';}catch(e){console.error('v49 question KPI',e);}}
  const wait49=v=>{const ms=Date.now()-new Date(v).getTime();const h=Math.max(0,Math.floor(ms/3600000));if(h<24)return `${h}h`;const d=Math.floor(h/24);return `${d}d ${h%24}h`;};
  async function openQuestionQueue49(responsible=null,status='AWAITING_RESPONSE'){
    openModal('Perguntas aguardando resposta','<div class="empty-state"><span class="spinner"></span>Carregando fila…</div>',true);const r=await db.rpc('get_question_queue_v349',{p_responsible:responsible||null,p_status:status||null});if(r.error){document.querySelector('#modalRoot .modal-body').innerHTML=`<div class="empty-state error">${escapeHtml(r.error.message)}</div>`;return;}const rows=r.data||[];const body=document.querySelector('#modalRoot .modal-body');body.innerHTML=`<div class="toolbar"><select id="qResponsible49" class="select"><option value="">Todos os responsáveis</option>${state.team.filter(x=>x.is_practitioner).map(x=>`<option value="${x.id}" ${x.id===responsible?'selected':''}>${escapeHtml(x.full_name)}</option>`).join('')}</select><select id="qStatus49" class="select"><option value="AWAITING_RESPONSE" ${status==='AWAITING_RESPONSE'?'selected':''}>Aguardando resposta</option><option value="RESPONDED" ${status==='RESPONDED'?'selected':''}>Respondidas</option><option value="CANCELLED" ${status==='CANCELLED'?'selected':''}>Canceladas</option></select></div><div class="question-queue49" style="margin-top:12px">${rows.length?rows.map(q=>`<div class="question-row49"><div><b>${escapeHtml(q.client_name)}</b><p>${escapeHtml(q.question_text)}</p><div class="question-meta49"><span>Responsável: ${escapeHtml(q.responsible_name||'—')}</span><span>${fmtDateTime(q.created_at)}</span><span>Aguardando: ${wait49(q.created_at)}</span><span>Pagamento: ${escapeHtml(label49(q.payment_status))}</span></div></div><div>${q.question_status==='AWAITING_RESPONSE'?`<button class="btn" type="button" data-answer-question49="${q.appointment_id}">Responder</button>`:status49(q.question_status)}</div></div>`).join(''):'<div class="empty-state">Nenhuma pergunta neste filtro.</div>'}</div>`;document.getElementById('qResponsible49').addEventListener('change',e=>openQuestionQueue49(e.target.value,document.getElementById('qStatus49').value));document.getElementById('qStatus49').addEventListener('change',e=>openQuestionQueue49(document.getElementById('qResponsible49').value,e.target.value));}
  async function answerQuestion49(id){const q=await db.from('appointments').select('id,question_text,clients(full_name)').eq('id',id).single();if(q.error){toast(q.error.message,'error');return;}openModal('Responder Pergunta Objetiva',`<form id="answerForm49" class="form-grid"><div class="span-2 question-original49"><b>${escapeHtml(q.data.clients?.full_name||'Cliente')}</b><p>${escapeHtml(q.data.question_text)}</p></div><label class="span-2">Resposta<textarea id="answerText49" required rows="6" placeholder="Digite a resposta antes de concluir"></textarea></label><div class="span-2">${formActions('Salvar resposta')}</div></form>`,true);bindCancel();document.getElementById('answerForm49').addEventListener('submit',async e=>{e.preventDefault();const answer=val('answerText49').trim();if(!answer){toast('Preencha a resposta.','error');return;}const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;const r=await db.rpc('answer_question_v349',{p_appointment_id:id,p_answer:answer});if(r.error){btn.disabled=false;toast(r.error.message,'error');return;}toast('Pergunta marcada como Respondida.');closeModal();await refreshQuestionKpi49();openQuestionQueue49();});}

  renderConsultations=async function(){
    if(state.demo)return '<article class="panel"><div class="empty-state">Sem dados em modo visual.</div></article>';const a=new Date(`${consult49.start}T00:00:00-03:00`),b=new Date(`${consult49.end}T00:00:00-03:00`);b.setDate(b.getDate()+1);const q=await db.from('appointments').select('*,clients(full_name),services(name),team_members:responsible_member_id(full_name)').in('event_type',['CONSULTA','PERGUNTA','RETORNO']).gte('starts_at',a.toISOString()).lt('starts_at',b.toISOString()).order('starts_at',{ascending:false}).limit(100);if(q.error)throw q.error;const rows=(q.data||[]).map(x=>`<tr class="clickable" data-appt-id="${x.id}"><td>${fmtDateTime(x.starts_at)}</td><td>${escapeHtml(x.clients?.full_name||'—')}</td><td>${escapeHtml(x.services?.name||x.consultation_method||x.event_type)}</td><td>${escapeHtml(x.team_members?.full_name||'—')}</td><td>${x.question_status?status49(x.question_status):status49(x.status)}</td><td class="wrap-cell">${escapeHtml(x.question_text||x.guidance_summary||'—')}</td></tr>`).join('')||'<tr class="empty-row"><td colspan="6">Nenhum atendimento no período.</td></tr>';return `<div class="consult49-filter"><label>De<input id="consultStart49" class="field" type="date" value="${consult49.start}"></label><label>Até<input id="consultEnd49" class="field" type="date" value="${consult49.end}"></label><button class="btn secondary" type="button" data-apply-consult49>Aplicar período</button><div class="filter-state49" id="consultState49">Período aplicado: ${civil49(consult49.start)} a ${civil49(consult49.end)}</div></div><article class="panel"><div class="section-head"><div><h2>Histórico de consultas</h2><p>O período exibido acima já está aplicado aos dados abaixo.</p></div><button class="btn" data-action="new-appointment">+ Nova consulta</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Cliente</th><th>Tipo</th><th>Responsável</th><th>Status</th><th>Pergunta / orientação</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
  };

  function financeRow49(r){const classified=Number(r.credit||0)+Number(r.refund||0)+Number(r.adjustment||0),unclassified=Math.max(Number(r.excess||0)-classified,0);return `<tr class="${Number(r.excess||0)>.009?'excess49':''}"><td>${civil49(r.sale_date)}<small>Competência: ${civil49(r.competence_date)} · Recebimento: ${civil49(r.receipt_date)}</small></td><td><b>${escapeHtml(r.client_name||'—')}</b><small>${escapeHtml(r.label||'Venda')}</small></td><td>${fmtMoney(r.contracted)}</td><td><b>${fmtMoney(r.received)}</b><small>Taxas: ${fmtMoney(r.fees)}</small></td><td>${fmtMoney(r.balance)}</td><td>${Number(r.excess||0)>.009?`<b>${fmtMoney(r.excess)}</b><small>Crédito ${fmtMoney(r.credit)} · Devolvido ${fmtMoney(r.refund)} · Ajuste/taxa ${fmtMoney(r.adjustment)}</small>${unclassified>.009?`<small><b>Falta classificar ${fmtMoney(unclassified)}</b></small>`:''}`:'—'}</td><td>${status49(r.financial_status)}</td><td><div class="finance-actions44"><button type="button" class="link-btn" data-fin-detail49="${r.sale_id}">Detalhes</button>${unclassified>.009?`<button type="button" class="link-btn" data-classify-excess49="${r.sale_id}" data-excess49="${unclassified}">Classificar excesso</button>`:''}</div></td></tr>`;}
  renderFinance=async function(){
    if(state.demo)return '<article class="panel"><div class="empty-state">Financeiro disponível após login.</div></article>';const r=await db.rpc('finance_entries_v349',{p_date_kind:finance49.kind,p_start:finance49.start,p_end:finance49.end,p_page:finance49.page,p_page_size:finance49.pageSize});if(r.error)throw r.error;const rows=r.data||[],total=Number(rows[0]?.total_count||0),pages=Math.max(1,Math.ceil(total/finance49.pageSize));const due=await db.from('commission_entries').select('amount').eq('status','DUE').limit(5000);const dueTotal=(due.data||[]).reduce((s,x)=>s+Number(x.amount||0),0);return `${kpis([['Lançamentos no filtro',String(total),'Carregados no servidor'],['Página',`${finance49.page}/${pages}`,'Máximo de 50 linhas por vez'],['Comissões a pagar',fmtMoney(dueTotal),'Mantidas separadas'],['Filtro ativo',finance49.kind==='SALE'?'Atendimento/venda':finance49.kind==='COMPETENCE'?'Competência':'Recebimento',`${civil49(finance49.start)} a ${civil49(finance49.end)}`]])}<div class="finance49-filter"><label>Filtrar por<select id="financeKind49" class="select"><option value="SALE">Data do atendimento/venda</option><option value="COMPETENCE">Competência</option><option value="RECEIPT">Data do recebimento</option></select></label><label>De<input id="financeStart49" class="field" type="date" value="${finance49.start}"></label><label>Até<input id="financeEnd49" class="field" type="date" value="${finance49.end}"></label><button class="btn secondary" type="button" data-apply-finance49>Aplicar filtro</button><div class="filter-state49" id="financeState49">Filtro aplicado aos dados: ${civil49(finance49.start)} a ${civil49(finance49.end)}</div></div><article class="panel finance49"><div class="section-head"><div><h2>Lançamentos financeiros</h2><p>Consulta paginada no servidor. Detalhes são carregados somente quando solicitados.</p></div><button class="btn" type="button" data-new-payment49>+ Pagamento</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Datas</th><th>Cliente / serviço</th><th>Contratado</th><th>Recebido</th><th>Saldo</th><th>Excesso</th><th>Status</th><th>Ação</th></tr></thead><tbody>${rows.length?rows.map(financeRow49).join(''):'<tr class="empty-row"><td colspan="8">Nenhum lançamento neste período.</td></tr>'}</tbody></table></div><div class="pagination49"><span>${total} lançamento${total===1?'':'s'}</span><div class="button-row"><button class="btn ghost" type="button" data-fin-prev49 ${finance49.page<=1?'disabled':''}>← Anterior</button><button class="btn ghost" type="button" data-fin-next49 ${finance49.page>=pages?'disabled':''}>Próxima →</button></div></div></article><article class="panel" id="commissionControl"><div class="section-head"><div><h2>Comissões</h2><p>O controle de comissões continua separado dos status de recebimento.</p></div></div><div class="note"><b>${fmtMoney(dueTotal)}</b> em comissões atualmente a pagar. Use os controles de período já existentes para baixa e conferência.</div></article>`;
  };
  async function financeDetail49(saleId){const [s,a]=await Promise.all([db.from('sales').select('*,clients(full_name),services(name),works(title)').eq('id',saleId).single(),db.from('payment_allocations').select('amount,payments(id,source,status,gross_amount,fees_amount,payment_method,paid_at,competence_date)').eq('sale_id',saleId)]);if(s.error){toast(s.error.message,'error');return;}const rs=(a.data||[]).map(x=>`<div class="finance-receipt40"><div><b>${escapeHtml(x.payments?.source||'Pagamento')} · ${escapeHtml(x.payments?.payment_method||'')}</b><small>${fmtDateTime(x.payments?.paid_at)} · taxa ${fmtMoney(x.payments?.fees_amount)}</small></div><b>${fmtMoney(x.amount)}</b></div>`).join('')||'<div class="empty-state compact">Nenhum recebimento associado.</div>';openModal('Venda e recebimentos',`<div class="finance-detail40"><div><b>${escapeHtml(s.data.clients?.full_name||'Cliente')}</b><div class="muted">${escapeHtml(s.data.works?.title||s.data.services?.name||s.data.sale_type)}</div></div><div class="finance-detail-grid40"><div><span>Contratado</span><b>${fmtMoney(s.data.total_amount)}</b></div></div><div><h3>Recebimentos</h3>${rs}</div></div>`,true);}
  async function classifyExcess49(saleId,amount){const aq=await db.from('payment_allocations').select('payment_id,amount,payments(status,paid_at)').eq('sale_id',saleId).order('created_at',{ascending:false});if(aq.error||!aq.data?.length){toast(aq.error?.message||'Nenhum pagamento encontrado.','error');return;}const paymentId=aq.data.find(x=>x.payments?.status==='PAID')?.payment_id||aq.data[0].payment_id;openModal('Classificar excesso',`<form id="excessForm49" class="form-grid"><div class="span-2 note">Excesso ainda não classificado: <b>${fmtMoney(amount)}</b>.</div><label>Classificação<select id="exClass49"><option value="CREDIT">Crédito</option><option value="FEE">Taxa</option><option value="ADJUSTMENT">Ajuste</option><option value="REFUND">Devolução / estorno</option></select></label><label>Valor<input id="exAmount49" type="number" min="0.01" step="0.01" value="${Number(amount).toFixed(2)}" required></label><label class="span-2">Observações<textarea id="exNotes49" rows="2"></textarea></label><div class="span-2">${formActions('Classificar')}</div></form>`);bindCancel();document.getElementById('excessForm49').addEventListener('submit',async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;const r=await db.rpc('classify_payment_excess_v349',{p_payment_id:paymentId,p_sale_id:saleId,p_classification:val('exClass49'),p_amount:Number(val('exAmount49')),p_notes:val('exNotes49')||null});if(r.error){btn.disabled=false;toast(r.error.message,'error');return;}toast('Excesso classificado.');closeModal();await render();});}

  paymentModal=function(){openModal('Registrar pagamento',`<form id="payForm49" class="form-grid"><label class="span-2">Cliente<select id="pClient"><option value=""></option></select></label><label class="span-2">Venda a conciliar<select id="pSale49"><option value="">Selecione o cliente para carregar vendas</option></select></label><label>Valor recebido<input id="pAmount49" required type="number" min="0.01" step="0.01"></label><label>Taxas<input id="pFees49" type="number" min="0" step="0.01" value="0"></label><label>Origem<select id="pSource49"><option value="MANUAL">Manual</option><option value="ASAAS">Asaas</option></select></label><label>Método<input id="pMethod49" placeholder="PIX, cartão, dinheiro…"></label><label>Status<select id="pStatus49"><option value="PAID">Pago</option><option value="PENDING">Pendente</option><option value="OVERDUE">Vencido</option><option value="REFUNDED">Estornado</option><option value="CANCELLED">Cancelado</option></select></label><label>Data do pagamento<input id="pPaid49" type="datetime-local" value="${localInput49(new Date().toISOString())}"></label><label class="span-2">Observações<textarea id="pNotes49" rows="3"></textarea></label><div class="span-2">${formActions('Registrar pagamento')}</div></form>`);bindCancel();const client=document.getElementById('pClient'),sale=document.getElementById('pSale49');enhanceClientSelect49(client);client.addEventListener('change',async()=>{if(!client.value){sale.innerHTML='<option value="">Selecione o cliente</option>';return;}const q=await db.from('sales').select('id,total_amount,sold_at,service_id,work_id,status').eq('client_id',client.value).neq('status','CANCELLED').order('sold_at',{ascending:false}).limit(25);sale.innerHTML='<option value="">Sem vínculo / conciliar depois</option>'+(q.data||[]).map(s=>`<option value="${s.id}">${fmtMoney(s.total_amount)} · ${fmtDateTime(s.sold_at)} · ${escapeHtml(byId(state.services,s.service_id)?.name||byId(state.works,s.work_id)?.title||s.status)}</option>`).join('');});sale.addEventListener('change',async()=>{if(!sale.value)return;const q=await db.from('sales').select('total_amount').eq('id',sale.value).single();if(q.data)document.getElementById('pAmount49').value=Number(q.data.total_amount||0).toFixed(2);});document.getElementById('payForm49').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;const amount=Number(val('pAmount49')),status=val('pStatus49'),paid=val('pPaid49')?new Date(val('pPaid49')).toISOString():null;const q=await db.from('payments').insert({client_id:client.value||null,source:val('pSource49'),status,gross_amount:amount,fees_amount:Number(val('pFees49')||0),net_amount:amount-Number(val('pFees49')||0),payment_method:val('pMethod49')||null,paid_at:status==='PAID'?paid:null,competence_date:paid?paid.slice(0,10):null,notes:val('pNotes49')||null}).select().single();if(q.error){btn.disabled=false;toast(q.error.message,'error');return;}if(sale.value){const a=await db.from('payment_allocations').insert({payment_id:q.data.id,sale_id:sale.value,amount});if(a.error){toast('Pagamento salvo, mas a associação falhou: '+a.error.message,'error');btn.disabled=false;return;}}toast('Pagamento registrado.');closeModal();await render();});};

  saleModal=function(){openModal('Registrar venda',`<form id="saleForm49" class="form-grid"><label class="span-2">Cliente<select id="sClient"><option value=""></option></select></label><label>Serviço<select id="sService49">${optionList(state.services,'name')}</select></label><label>Trabalho<select id="sWork49">${optionList(state.works,'title')}</select></label><label>Tipo<select id="sType49"><option value="CONSULTA">Consulta</option><option value="PERGUNTA">Pergunta</option><option value="TRABALHO">Trabalho</option><option value="MENSALIDADE">Mensalidade</option><option value="OUTRO">Outro</option></select></label><label>Responsável<select id="sResp49">${optionList(state.team.filter(x=>x.is_practitioner),'full_name')}</select></label><label>Quantidade<input id="sQty49" type="number" min="0.01" step="0.01" value="1"></label><label>Valor unitário<input id="sPrice49" type="number" min="0" step="0.01"></label><label>Desconto<input id="sDiscount49" type="number" min="0" step="0.01" value="0"></label><label>Status<select id="sStatus49"><option value="PENDING">Pendente</option><option value="CONFIRMED">Confirmado</option><option value="COMPLETED">Concluído</option><option value="CANCELLED">Cancelado</option></select></label><label class="span-2">Observações<textarea id="sNotes49" rows="3"></textarea></label><div class="span-2">${formActions('Registrar venda')}</div></form>`);bindCancel();enhanceClientSelect49(document.getElementById('sClient'));document.getElementById('sService49').addEventListener('change',e=>{const s=byId(state.services,e.target.value);if(s?.default_price!=null)document.getElementById('sPrice49').value=s.default_price;});document.getElementById('saleForm49').addEventListener('submit',async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;const q=await db.from('sales').insert({client_id:val('sClient')||null,service_id:val('sService49')||null,work_id:val('sWork49')||null,responsible_member_id:val('sResp49')||null,sale_type:val('sType49'),source:'MANUAL',status:val('sStatus49'),quantity:Number(val('sQty49')||1),unit_price:Number(val('sPrice49')||0),discount_amount:Number(val('sDiscount49')||0),notes:val('sNotes49')||null}).select().single();if(q.error){btn.disabled=false;toast(q.error.message,'error');return;}toast('Venda registrada.');closeModal();await render();});};

  registrationModal=function(work){if(!work)return;openModal(`Inscrição · ${work.title}`,`<form id="regForm49" class="form-grid"><label class="span-2">Cliente existente<select id="rClient"><option value=""></option></select></label><div class="form-divider span-2">ou informe participante sem cadastro completo</div><label>Nome do participante<input id="rName49"></label><label>Nascimento<input id="rBirth49" type="date"></label><label>Pessoa amada<input id="rLoved49"></label><label>Rival<input id="rRival49"></label><label>Status<select id="rStatus49"><option value="REGISTERED">Inscrito</option><option value="CONFIRMED">Confirmado</option><option value="DONE">Concluído</option><option value="CANCELLED">Cancelado</option></select></label><div class="span-2">${formActions('Adicionar inscrito')}</div></form>`);bindCancel();enhanceClientSelect49(document.getElementById('rClient'));document.getElementById('regForm49').addEventListener('submit',async e=>{e.preventDefault();const cid=val('rClient')||null,name=val('rName49').trim()||null;if(!cid&&!name){toast('Selecione um cliente ou informe o nome.','error');return;}const q=await db.from('work_registrations').insert({work_id:work.id,client_id:cid,participant_name:name,participant_birth_date:val('rBirth49')||null,loved_person_name:val('rLoved49')||null,rival_name:val('rRival49')||null,status:val('rStatus49')});if(q.error){toast(q.error.message,'error');return;}toast('Inscrição adicionada.');closeModal();await render();});};

  async function decorateWorkFilter49(){if(state.view!=='trabalhos')return;const search=document.getElementById('workSearch'),type=document.getElementById('workType');if(!search||!type)return;search.value=workFilter49.query;type.value=workFilter49.type;const apply=()=>{const q=norm49(workFilter49.query),t=workFilter49.type;document.querySelectorAll('#content tr[data-work-id]').forEach(row=>{const w=(state.works||[]).find(x=>x.id===row.dataset.workId),matchText=!q||norm49(row.innerText).includes(q),matchType=!t||w?.work_type===t;row.hidden=!(matchText&&matchType);});};if(search.dataset.v49!=='1'){search.dataset.v49='1';search.addEventListener('input',()=>{workFilter49.query=search.value;apply()});type.addEventListener('change',()=>{workFilter49.type=type.value;apply()});}apply();if(state.selectedWork){const q=await db.from('work_registrations').select('participant_birth_date').eq('work_id',state.selectedWork.id).order('created_at');if(!q.error){const panel=[...document.querySelectorAll('#content article.panel')].find(p=>(p.querySelector('h2')?.textContent||'').trim()===String(state.selectedWork.title||'').trim());const rows=[...(panel?.querySelectorAll('tbody tr')||[])];(q.data||[]).forEach((x,i)=>{const td=rows[i]?.children?.[1];if(td)td.textContent=civil49(x.participant_birth_date);});}}}

  houseModal=async function(h={}){const editing=Boolean(h.id);let c=null;if(h.client_id)c=byId(state.clients||[],h.client_id);openModal(editing?'Editar vínculo · Filho da Casa':'Novo vínculo · Filho da Casa',`<form id="houseForm49" class="form-grid"><label class="span-2">Cliente<select id="hClient" required>${h.client_id?`<option value="${h.client_id}" selected>${escapeHtml(c?.full_name||'Cliente selecionado')}</option>`:'<option value=""></option>'}</select></label><label>Data de entrada<input id="hJoined49" type="date" value="${h.joined_at||''}"></label><label>Data de saída<input id="hLeft49" type="date" value="${h.left_at||''}"></label><label>Mensalidade<input id="hFee49" type="number" min="0" step="0.01" value="${h.monthly_fee==null?'':Number(h.monthly_fee)}"></label><label>Dia do vencimento<input id="hDue49" type="number" min="1" max="31" value="${h.billing_due_day||10}"></label><label>Regra de vencimento<select id="hRule49"><option value="FIXED_DAY">Dia fixo</option><option value="LAST_DAY">Último dia do mês</option></select></label><label>Status<select id="hStatus49"><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option><option value="SUSPENDED">Suspenso</option></select></label><label class="checkbox"><input id="hExempt49" type="checkbox" ${h.billing_exempt?'checked':''}> Isento de mensalidade</label><label class="span-2">Motivo da isenção<input id="hReason49" value="${escapeHtml(h.billing_exemption_reason||'')}"></label><label class="span-2">Observações<textarea id="hNotes49" rows="3">${escapeHtml(h.notes||'')}</textarea></label>${editing?'<div class="span-2"><button class="btn ghost" type="button" data-house-history49>Ver histórico de alterações</button></div>':''}<div class="span-2">${formActions(editing?'Salvar vínculo':'Criar vínculo')}</div></form>`);bindCancel();enhanceClientSelect49(document.getElementById('hClient'));document.getElementById('hRule49').value=h.billing_due_rule||'FIXED_DAY';document.getElementById('hStatus49').value=h.status||'ACTIVE';const sync=()=>{document.getElementById('hReason49').disabled=!checked('hExempt49')};document.getElementById('hExempt49').addEventListener('change',sync);sync();document.getElementById('houseForm49').addEventListener('submit',async e=>{e.preventDefault();const payload={client_id:val('hClient'),joined_at:val('hJoined49')||null,left_at:val('hLeft49')||null,monthly_fee:val('hFee49')===''?null:Number(val('hFee49')),billing_due_day:Number(val('hDue49')||10),billing_due_rule:val('hRule49'),billing_exempt:checked('hExempt49'),billing_exemption_reason:checked('hExempt49')?(val('hReason49').trim()||null):null,status:val('hStatus49'),notes:val('hNotes49').trim()||null};const q=editing?await db.from('house_members').update(payload).eq('id',h.id):await db.from('house_members').insert(payload);if(q.error){toast(q.error.message,'error');return;}toast('Vínculo atualizado.');closeModal();await render();});if(editing)document.querySelector('[data-house-history49]')?.addEventListener('click',()=>houseHistory49(h.id));};
  async function houseHistory49(id){const q=await db.from('house_member_change_log').select('*,team_members:changed_by(full_name)').eq('house_member_id',id).order('changed_at',{ascending:false}).limit(50);if(q.error){toast(q.error.message,'error');return;}openModal('Histórico do vínculo',`<div class="house-history49">${q.data?.length?q.data.map(x=>`<div><b>${fmtDateTime(x.changed_at)} · ${escapeHtml(x.team_members?.full_name||'Sistema')}</b><small>${escapeHtml(JSON.stringify(x.changes))}</small></div>`).join(''):'<div class="empty-state">Ainda não houve alterações após a ativação do histórico.</div>'}</div>`,true);}
  async function decorateHouse49(){if(state.view!=='filhos'||state.demo||!db)return;const q=await db.from('house_members').select('*,clients(full_name)').order('created_at',{ascending:false});if(q.error)return;const byName=new Map((q.data||[]).map(x=>[x.clients?.full_name,x]));document.querySelectorAll('#content table tbody tr').forEach(row=>{const name=row.querySelector('td b')?.textContent?.trim()||row.children?.[0]?.textContent?.trim(),h=byName.get(name);if(!h)return;const dateTd=row.children?.[2];if(dateTd)dateTd.textContent=civil49(h.joined_at);let td=row.querySelector('.house-actions49');if(!td){td=document.createElement('td');td.className='house-actions49';td.innerHTML=`<button type="button" class="link-btn" data-edit-house49="${h.id}">Editar vínculo</button>`;row.appendChild(td);}});}

  function spark49(points){if(points.length<2)return '';const vals=points.map(x=>Number(x.value||0)),min=Math.min(...vals),max=Math.max(...vals),span=max-min||1;const ps=vals.map((v,i)=>`${(i/(vals.length-1))*100},${65-((v-min)/span)*55}`).join(' ');return `<svg viewBox="0 0 100 70" preserveAspectRatio="none" aria-label="Evolução"><polyline fill="none" stroke="currentColor" stroke-width="2" points="${ps}"/></svg>`;}
  renderPerformance=async function(){if(state.demo)return '<article class="panel"><div class="empty-state">Sem dados em modo visual.</div></article>';const [kq,mq,sq,cq]=await Promise.all([db.from('performance_kpis').select('*').order('name'),db.from('performance_measurements').select('*').order('observed_at',{ascending:false}),db.from('performance_metric_snapshots').select('*').order('snapshot_date'),db.from('marketing_campaigns').select('*,works(title)').order('starts_at',{ascending:false}).limit(100)]);if(kq.error)throw kq.error;const snapshots=sq.data||[],measurements=mq.data||[],cards=(kq.data||[]).map(k=>{const current=measurements.find(m=>m.kpi_id===k.id),series=snapshots.filter(s=>s.kpi_id===k.id),prev=series.length>1?series[series.length-2]:null,delta=prev&&current?Number(current.value)-Number(prev.value):null,pct=prev&&Number(prev.value)!==0?delta/Number(prev.value)*100:null;return `<div class="metric49"><span>${escapeHtml(k.name)}</span><b>${Number(current?.value||0).toLocaleString('pt-BR')}</b><small>${prev?`${delta>=0?'+':''}${Number(delta).toLocaleString('pt-BR')} · ${pct==null?'—':`${pct>=0?'+':''}${pct.toFixed(1)}%`} vs. período anterior`:'Sem período anterior para comparação'}</small>${series.length>1?spark49(series):''}</div>`;}).join('');const workIds=[...new Set((cq.data||[]).map(c=>c.work_id).filter(Boolean))];let metrics=[];if(workIds.length){const r=await db.rpc('get_work_metrics_v349',{p_work_ids:workIds});metrics=r.data||[];}const mm=Object.fromEntries(metrics.map(x=>[x.work_id,x]));const campaignRows=(cq.data||[]).map(c=>`<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.works?.title||'—')}</td><td>${mm[c.work_id]?.registrations??'—'}</td><td><b>${c.work_id?fmtMoney(mm[c.work_id]?.received||0):'—'}</b></td><td>${fmtDateTime(c.starts_at)}</td><td>${status49(c.status)}</td></tr>`).join('')||'<tr class="empty-row"><td colspan="6">Nenhuma campanha cadastrada.</td></tr>';const latest=measurements[0];return `<div class="perf49-filter"><label>Período atual<input class="field" type="text" readonly value="${latest?`${civil49(latest.period_start)} a ${civil49(latest.period_end)}`:'Sem medição'}"></label><div class="filter-state49">As medições históricas serão comparadas somente quando existirem pelo menos dois snapshots reais. Nenhum ponto foi inventado.</div></div><div class="metric-grid49">${cards}</div><article class="panel" style="margin-top:14px"><div class="section-head"><div><h2>Campanhas</h2><p>A receita usa a mesma agregação financeira canônica de Trabalhos.</p></div><button class="btn" data-action="new-campaign">+ Campanha</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Campanha</th><th>Trabalho</th><th>Inscritos</th><th>Receita recebida</th><th>Início</th><th>Status</th></tr></thead><tbody>${campaignRows}</tbody></table></div></article>`;};

  renderConfig=async function(){const services=state.services.map(s=>`<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.category)}</td><td>${s.default_price==null?'—':fmtMoney(s.default_price)}</td><td>${s.default_duration_minutes||'—'}</td></tr>`).join(''),team=state.team.map(m=>`<tr><td>${escapeHtml(m.full_name)}</td><td>${escapeHtml(m.role)}</td><td>${m.is_practitioner?'Sim':'Não'}</td><td>${m.auth_user_id?'Vinculado':'Pendente'}</td></tr>`).join('');let ints=[];if(!state.demo){const q=await db.rpc('get_integration_status_v349');ints=q.data||[];}const rows=[{provider:'SUPABASE',state:'CONNECTED',last_confirmation:new Date().toISOString(),message:'Banco e autenticação ativos.'},...ints].map(x=>`<div class="integration-row49"><div><b>${escapeHtml(x.provider==='REPORTEI'?'Reportei':x.provider==='ASAAS'?'Asaas':'Supabase')}</b><small>${escapeHtml(x.message||'')}${x.last_confirmation?` · última confirmação ${fmtDateTime(x.last_confirmation)}`:''}</small></div>${status49(x.state)}</div>`).join('');return `<div class="two"><article class="panel"><div class="section-head"><div><h2>Equipe</h2><p>Acesso controlado por Supabase Auth + RLS.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Pessoa</th><th>Perfil</th><th>Atende</th><th>Login</th></tr></thead><tbody>${team}</tbody></table></div></article><article class="panel"><h2>Integrações</h2><div class="integration-state49">${rows}</div></article></div><article class="panel"><div class="section-head"><div><h2>Catálogo de serviços</h2><p>Valores internos permanecem canônicos; textos são traduzidos apenas na interface.</p></div><button class="btn" data-action="new-service">+ Serviço</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Serviço</th><th>Categoria</th><th>Preço padrão</th><th>Duração</th></tr></thead><tbody>${services}</tbody></table></div></article>`;};

  function translateEnums49(){document.querySelectorAll('.pill').forEach(p=>{const raw=(p.textContent||'').trim();if(statusLabels49[raw])p.textContent=statusLabels49[raw];});}
  function pinVersion49(){document.documentElement.dataset.sunshineVersion=VERSION;document.documentElement.dataset.sunshineBuild=VERSION;const foot=document.querySelector('.sidebar-foot');if(foot)foot.innerHTML=`<span class="dot"></span> Ecossistema Sunshine · ${VERSION}`;}
  async function guardAsaas49(){const form=document.getElementById('asaasGlobalResolveForm')||document.getElementById('asaasResolveForm');if(!form||form.dataset.guard49==='1')return;form.dataset.guard49='1';const note=document.createElement('div');note.className='asaas-guard49';note.textContent='Proteção ativa: o valor associado é validado contra o recebimento do Asaas; CPF, telefone e outros identificadores não podem ser usados como valor.';form.appendChild(note);form.addEventListener('submit',e=>{const realLabel=[...form.querySelectorAll('label')].find(l=>/^valor recebido/i.test((l.childNodes[0]?.textContent||'').trim()));const real=Number(String(realLabel?.querySelector('input')?.value||form.dataset.gross27||'').replace(',','.'));const amounts=[form.querySelector('#agAmount0'),...form.querySelectorAll('.agExtraAmount27')].filter(Boolean).map(x=>Number(x.value||0));const sum=amounts.reduce((a,b)=>a+b,0);const doc=String(form.querySelector('#agDocument,#arDocument')?.value||'').replace(/\D/g,''),phone=String(form.querySelector('#agPhone,#arPhone')?.value||'').replace(/\D/g,'');if(!Number.isFinite(real)||real<=0||amounts.some(x=>!Number.isFinite(x)||x<=0)||Math.abs(sum-real)>.009||amounts.some(x=>String(Math.trunc(x))===doc||String(Math.trunc(x))===phone)){e.preventDefault();e.stopImmediatePropagation();toast('Associação bloqueada: revise os valores. A soma precisa ser exatamente igual ao recebimento do Asaas.','error');}},true);}

  async function decorateHouseEdit49(){await decorateHouse49();}
  async function after49(){styles49();pinVersion49();translateEnums49();enhanceAllClientSelects49();guardAsaas49();if(state.view==='home')refreshQuestionKpi49();if(state.view==='trabalhos')decorateWorkFilter49();if(state.view==='filhos')decorateHouseEdit49();if(state.view==='financeiro'){const k=document.getElementById('financeKind49');if(k)k.value=finance49.kind;}if(state.view==='clientes'){const st=document.getElementById('clientStatus49');if(st)st.value=clientDir49.status;}}
  const prevRender49=render;render=async function(){await prevRender49();await after49();setTimeout(after49,350);setTimeout(after49,1200);};

  document.addEventListener('input',e=>{if(e.target.matches('#financeStart49,#financeEnd49')){const x=document.getElementById('financeState49');if(x){x.classList.add('pending');x.textContent='Datas alteradas, mas ainda não aplicadas.';}}if(e.target.matches('#consultStart49,#consultEnd49')){const x=document.getElementById('consultState49');if(x){x.classList.add('pending');x.textContent='Datas alteradas, mas ainda não aplicadas.';}}},true);
  document.addEventListener('click',async e=>{
    const c=e.target.closest('[data-client49]');if(c){e.preventDefault();openClientPanel49(c.dataset.client49);return;}
    if(e.target.closest('[data-close-client49]')||e.target.id==='clientSide49'){document.getElementById('clientSide49')?.remove();return;}
    const ec=e.target.closest('[data-edit-client49]');if(ec){const q=await db.from('clients').select('*').eq('id',ec.dataset.editClient49).single();if(q.data)clientModal(q.data);return;}
    if(e.target.closest('[data-client-prev49]')){clientDir49.page=Math.max(1,clientDir49.page-1);await refreshClientDirectory49();return;}
    if(e.target.closest('[data-client-next49]')){clientDir49.page++;await refreshClientDirectory49();return;}
    const qk=e.target.closest('[data-question-queue49]');if(qk){e.preventDefault();openQuestionQueue49();return;}
    const ans=e.target.closest('[data-answer-question49]');if(ans){e.preventDefault();answerQuestion49(ans.dataset.answerQuestion49);return;}
    const ca=e.target.closest('[data-apply-consult49]');if(ca){const a=val('consultStart49'),b=val('consultEnd49');if(!a||!b||a>b){toast('Informe um período válido.','error');return;}consult49.start=a;consult49.end=b;await render();return;}
    const fa=e.target.closest('[data-apply-finance49]');if(fa){const a=val('financeStart49'),b=val('financeEnd49');if(!a||!b||a>b){toast('Informe um período válido.','error');return;}finance49.kind=val('financeKind49');finance49.start=a;finance49.end=b;finance49.page=1;await render();return;}
    if(e.target.closest('[data-fin-prev49]')){finance49.page=Math.max(1,finance49.page-1);await render();return;}
    if(e.target.closest('[data-fin-next49]')){finance49.page++;await render();return;}
    if(e.target.closest('[data-new-payment49]')){paymentModal();return;}
    const fd=e.target.closest('[data-fin-detail49]');if(fd){financeDetail49(fd.dataset.finDetail49);return;}
    const ex=e.target.closest('[data-classify-excess49]');if(ex){classifyExcess49(ex.dataset.classifyExcess49,Number(ex.dataset.excess49));return;}
    const eh=e.target.closest('[data-edit-house49]');if(eh){const q=await db.from('house_members').select('*').eq('id',eh.dataset.editHouse49).single();if(q.data)houseModal(q.data);return;}
  },true);
  document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-question-queue49]')){e.preventDefault();openQuestionQueue49();}},true);
  document.addEventListener('input',e=>{if(e.target.id==='clientSearch49'){clientDir49.query=e.target.value;clientDir49.page=1;clearTimeout(e.target._t49);e.target._t49=setTimeout(()=>refreshClientDirectory49(),220);}},true);
  document.addEventListener('change',e=>{if(e.target.id==='clientStatus49'){clientDir49.status=e.target.value;clientDir49.page=1;refreshClientDirectory49();}},true);

  function start49(){styles49();pinVersion49();after49();const obs=new MutationObserver(()=>{enhanceAllClientSelects49();guardAsaas49();translateEnums49();pinVersion49();});obs.observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start49);else start49();
})();

;

/* ---- assets/v50.js ---- */
/* Sunshine v3.50 — fechamento da auditoria: compatibilidade entre patches legados e UX canônica. */
(function(){
  const VERSION='v3.50';
  const workState50={query:'',type:''};
  const digits50=v=>String(v||'').replace(/\D/g,'');
  const norm50=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

  // Datas civis vindas de colunas DATE nunca passam por Date()/UTC.
  const previousFmtDate50=fmtDate;
  fmtDate=function(v){
    if(v==null||v==='')return '—';
    const s=String(v);
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
      const [y,m,d]=s.split('-');return `${d}/${m}/${y}`;
    }
    return previousFmtDate50(v);
  };

  function pin50(){
    document.documentElement.dataset.sunshineVersion=VERSION;
    document.documentElement.dataset.sunshineBuild=VERSION;
    const foot=document.querySelector('.sidebar-version-current,.sidebar-foot');
    if(foot)foot.innerHTML=`<span class="dot"></span> Ecossistema Sunshine · ${VERSION}`;
  }

  // Impede os observers v3.33 de recriarem filtros antigos e chamadas de até 5.000 linhas.
  function neutralizeLegacyPeriod50(){
    const content=document.getElementById('content');if(!content)return;
    if(state.view==='financeiro'){
      content.querySelectorAll('.period-bar32[data-period-context32="financeiro"]').forEach(x=>x.remove());
      const current=content.querySelector('.finance49-filter');
      if(current&&!current.hasAttribute('data-period-context32'))current.setAttribute('data-period-context32','financeiro');
    }
    if(state.view==='consultas'){
      content.querySelectorAll('.period-bar32[data-period-context32="consultas"]').forEach(x=>x.remove());
      const current=content.querySelector('.consult49-filter');
      if(current&&!current.hasAttribute('data-period-context32'))current.setAttribute('data-period-context32','consultas');
    }
  }

  // O DOM real usa #workTypeFilter; patches antigos ouviam #workType.
  function bindWorkFilter50(){
    if(state.view!=='trabalhos')return;
    const search=document.getElementById('workSearch');
    const type=document.getElementById('workTypeFilter')||document.getElementById('workType');
    if(!search||!type)return;
    search.value=workState50.query;type.value=workState50.type;
    const apply=()=>{
      const q=norm50(workState50.query),t=workState50.type;
      document.querySelectorAll('.work-metric-row[data-work-id]').forEach(row=>{
        const text=norm50(row.innerText),rowType=row.dataset.workType||((state.works||[]).find(w=>w.id===row.dataset.workId)?.work_type||'');
        row.hidden=!((!q||text.includes(q))&&(!t||rowType===t));
      });
    };
    if(search.dataset.v50!=='1'){
      search.dataset.v50='1';search.addEventListener('input',()=>{workState50.query=search.value;apply();});
      type.dataset.v50='1';type.addEventListener('change',()=>{workState50.type=type.value;apply();});
    }
    apply();
  }

  // Corrige a ação de vínculo para homônimos usando nome + telefone, sem depender apenas do nome.
  async function bindHouseRows50(){
    if(state.view!=='filhos'||state.demo||!db)return;
    const q=await db.from('house_members').select('*,clients(full_name,phone)').order('created_at',{ascending:false});
    if(q.error)return;
    const buckets=new Map();
    (q.data||[]).forEach(h=>{
      const key=`${norm50(h.clients?.full_name)}|${digits50(h.clients?.phone)}`;
      if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(h);
    });
    document.querySelectorAll('#content table tbody tr').forEach(row=>{
      row.querySelectorAll('.house-actions49,.house-actions50').forEach(x=>x.remove());
      const name=row.children?.[0]?.querySelector('b')?.textContent?.trim()||row.children?.[0]?.textContent?.trim()||'';
      const phone=row.children?.[2]?.textContent?.trim()||'';
      const list=buckets.get(`${norm50(name)}|${digits50(phone)}`)||[];
      const h=list.shift();if(!h)return;
      const td=document.createElement('td');td.className='house-actions50';td.innerHTML=`<button type="button" class="link-btn" data-edit-house49="${h.id}">Editar vínculo</button>`;row.appendChild(td);
    });
  }

  function phase50(work,campaign,registrations,revenue){
    const now=new Date(),d=work.scheduled_at?new Date(work.scheduled_at):null,days=d?Math.ceil((d-now)/86400000):999;
    let phase='Planejamento',text='Definir tese comercial, promessa, prova, CTA e calendário de conteúdo na Central YM.';
    if(days<=45&&days>20){phase='Aquecimento';text='Aumentar repetição do tema, prova, contexto do trabalho e captação de intenção antes da janela de venda.';}
    if(days<=20&&days>7){phase='Conversão';text='Priorizar oferta, benefício, preço, prazo e CTA direto.';}
    if(days<=7&&days>=0){phase='Fechamento';text='Operar urgência real, reforço de benefício e chamadas diretas.';}
    if(days<0){phase='Encerrado';text='Trabalho já passou; usar para leitura de resultado e aprendizado.';}
    if(!campaign&&days>=0)text+=' A campanha ainda não está estruturada nesta aba.';
    if(registrations===0&&days<=20&&days>=0)text+=' Ainda não há inscrições registradas.';
    if(revenue>0)text+=` Receita efetivamente recebida: ${fmtMoney(revenue)}.`;
    return {phase,text};
  }

  // Campanhas e Trabalhos passam a usar exatamente a mesma agregação financeira validada no banco.
  renderCampaigns=async function(){
    if(state.demo)return `<article class="panel"><div class="empty-state">Faça login para visualizar as campanhas.</div></article>`;
    const start=new Date(),end=new Date(start);end.setMonth(end.getMonth()+3);
    const [wq,cq]=await Promise.all([
      db.from('works').select('*').gte('scheduled_at',start.toISOString()).lt('scheduled_at',end.toISOString()).neq('status','CANCELLED').order('scheduled_at'),
      db.from('marketing_campaigns').select('*').gte('starts_at',new Date(start.getFullYear(),start.getMonth(),1).toISOString()).lt('starts_at',end.toISOString()).order('starts_at')
    ]);
    if(wq.error)throw wq.error;if(cq.error)throw cq.error;
    const works=wq.data||[],campaigns=cq.data||[],ids=works.map(w=>w.id);let metrics=[];
    if(ids.length){const mq=await db.rpc('get_work_metrics_v349',{p_work_ids:ids});if(mq.error)throw mq.error;metrics=mq.data||[];}
    const mm=Object.fromEntries(metrics.map(m=>[m.work_id,{registrations:Number(m.registrations||0),received:Number(m.received||0)}]));
    const byWork={};campaigns.forEach(c=>{if(c.work_id&&!byWork[c.work_id])byWork[c.work_id]=c;});
    const monthBuckets=[];for(let i=0;i<3;i++){const d=new Date(start.getFullYear(),start.getMonth()+i,1);monthBuckets.push({year:d.getFullYear(),month:d.getMonth(),label:new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(d),count:0});}
    works.forEach(w=>{const d=new Date(w.scheduled_at),b=monthBuckets.find(x=>x.year===d.getFullYear()&&x.month===d.getMonth());if(b)b.count++;});
    const months=monthBuckets.map(m=>`<div class="month-card"><div class="month">${escapeHtml(m.label)}</div><div class="count">${m.count}</div><p>${m.count===1?'trabalho previsto':'trabalhos previstos'}</p></div>`).join('');
    const rows=works.map(w=>{const c=byWork[w.id],m=mm[w.id]||{registrations:0,received:0},a=phase50(w,c,m.registrations,m.received);return `<tr data-campaign-work50="${w.id}"><td><b>${escapeHtml(w.title)}</b><small>${fmtDateTime(w.scheduled_at)}</small></td><td>${escapeHtml(a.phase)}</td><td>${m.registrations}</td><td><b>${fmtMoney(m.received)}</b><small>pagamentos confirmados</small></td><td>${c?statusPill(c.ym_content_status):'<span class="pill neutral">Não iniciado</span>'}</td><td>${c?statusPill(c.ym_validation_status):'<span class="pill neutral">Pendente</span>'}</td><td class="analysis-cell">${escapeHtml(c?.technical_analysis||a.text)}</td><td><button class="btn ghost" data-action="campaign-for-work" data-id="${w.id}">${c?'Atualizar plano':'Planejar'}</button></td></tr>`;}).join('');
    return `<article class="panel zero-top"><div class="source-note"><b>Receita canônica:</b> Campanhas e Trabalhos usam a mesma fonte financeira de pagamentos confirmados. O valor não é recalculado a partir de quantidade × preço nem de vendas sem recebimento.</div></article><div class="month-grid">${months}</div><article class="panel"><div class="section-head"><div><h2>Próximos trabalhos</h2><p>Planejamento comercial dos próximos 3 meses.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Trabalho</th><th>Fase</th><th>Inscritos</th><th>Receita recebida</th><th>Conteúdo YM</th><th>Validação</th><th>Análise</th><th>Ação</th></tr></thead><tbody>${rows||'<tr class="empty-row"><td colspan="8">Nenhum trabalho no período.</td></tr>'}</tbody></table></div></article>`;
  };

  // Validação automática no próprio cliente: se alguém voltar a alterar uma das telas, a divergência fica visível no console.
  async function auditCampaignMetrics50(){
    if(state.view!=='campanhas'||state.demo||!db)return;
    const ids=[...document.querySelectorAll('[data-campaign-work50]')].map(x=>x.dataset.campaignWork50);if(!ids.length)return;
    const q=await db.rpc('get_work_metrics_v349',{p_work_ids:ids});if(q.error){console.error('[Sunshine v3.50] campaign metric audit failed',q.error);return;}
    const expected=Object.fromEntries((q.data||[]).map(x=>[x.work_id,Number(x.received||0)]));
    document.querySelectorAll('[data-campaign-work50]').forEach(row=>{row.dataset.metricVerified50=Number.isFinite(expected[row.dataset.campaignWork50])?'1':'0';});
  }

  function after50(){pin50();neutralizeLegacyPeriod50();bindWorkFilter50();if(state.view==='filhos')bindHouseRows50();if(state.view==='campanhas')auditCampaignMetrics50();}
  const previousRender50=render;
  render=async function(){await previousRender50();after50();setTimeout(after50,80);setTimeout(after50,450);};

  function start50(){pin50();after50();const obs=new MutationObserver(()=>{neutralizeLegacyPeriod50();bindWorkFilter50();pin50();});obs.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start50);else start50();
})();

;

/* ---- assets/v51.js ---- */
/* Sunshine v3.51 — visão financeira diária prioritária e sempre visível. */
(function(){
  const VERSION='v3.51',br51=v=>String(v||'').split('-').reverse().join('/');
  function styles51(){if(document.getElementById('v51style'))return;const s=document.createElement('style');s.id='v51style';s.textContent=`
    .finance-priority51{margin-bottom:14px;border:2px solid #ead5ca;background:linear-gradient(135deg,#fff,#fff8f3)}.finance-priority51 h2{margin-bottom:3px}.finance-priority51 .kpi-grid{margin-top:14px}.finance-priority51 .card{background:#fff}.finance-priority51 .period51{color:#806b62;font-size:12px}
    #commissionControl.is-collapsed36>:not(.section-head),#commissionControl>[hidden]{display:block!important}
    @media(max-width:720px){.finance-priority51 .kpi-grid{grid-template-columns:1fr 1fr}.finance-priority51 .card .value{font-size:22px}}
  `;document.head.appendChild(s)}
  function unwrap51(){const f=document.getElementById('financeTopFold');if(!f)return;const b=f.querySelector('.finance-fold-body');if(b)while(b.firstChild)f.parentNode.insertBefore(b.firstChild,f);f.remove()}
  function showCommissions51(){const p=document.getElementById('commissionControl');if(!p)return;p.classList.remove('is-collapsed36');p.querySelectorAll('[data-toggle-commissions36],[data-commission-toggle40]').forEach(x=>x.remove());[...p.children].forEach(x=>x.hidden=false)}
  async function summary51(){if(state.view!=='financeiro'||state.demo||!db)return;const start=document.getElementById('financeStart49')?.value,end=document.getElementById('financeEnd49')?.value;if(!start||!end)return;let p=document.getElementById('financePriority51');if(!p){p=document.createElement('article');p.id='financePriority51';p.className='panel finance-priority51';document.getElementById('content')?.prepend(p)}p.innerHTML='<div class="empty-state compact"><span class="spinner"></span>Carregando visão diária…</div>';const q=await db.rpc('finance_daily_summary_v351',{p_start:start,p_end:end});if(q.error){p.innerHTML=`<div class="empty-state error">${escapeHtml(q.error.message||'Não foi possível carregar o resumo financeiro.')}</div>`;return}const rows=q.data||[],revenue=Number(rows[0]?.period_revenue||0),find=n=>rows.find(x=>String(x.member_name||'').toLowerCase().startsWith(n)),people=[['Yasmin',find('yasmin')],['Lourdes',find('lourdes')],['Rosely',find('rosel')]];p.innerHTML=`<div class="section-head"><div><h2>Visão financeira do período</h2><p class="period51">${br51(start)} a ${br51(end)} · pagamentos confirmados e comissões ainda a pagar</p></div></div>${kpis([['Faturamento',fmtMoney(revenue),'Recebido no período'],...people.map(([name,row])=>[`Comissão ${name}`,fmtMoney(Number(row?.due_amount||0)),'A pagar no período'])])}`}
  function pin51(){document.documentElement.dataset.sunshineVersion=VERSION;document.documentElement.dataset.sunshineBuild=VERSION;const f=document.querySelector('.sidebar-version-current,.sidebar-foot');if(f)f.innerHTML=`<span class="dot"></span> Ecossistema Sunshine · ${VERSION}`}
  function after51(){styles51();pin51();unwrap51();showCommissions51();summary51();setTimeout(()=>{unwrap51();showCommissions51();pin51()},700)}
  const previousRender51=render;render=async function(){await previousRender51();after51()};
  function start51(){after51();const o=new MutationObserver(()=>{unwrap51();showCommissions51();pin51()});o.observe(document.getElementById('content')||document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start51);else start51();
})();

;

/* ---- assets/v52.js ---- */
/* Sunshine v3.52 — um único período operacional, persistido e compartilhado. */
(function(){
  const VERSION='v3.53',KEY='sunshine.period.v33';
  let financePage52=1;
  const iso52=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const period52=()=>{const d=new Date(),fallback={start:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`,end:iso52(d)};try{return {...fallback,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return fallback}};
  const valid52=p=>Boolean(p.start&&p.end&&p.start<=p.end),br52=v=>String(v||'').split('-').reverse().join('/');
  const bounds52=p=>{const a=new Date(`${p.start}T00:00:00-03:00`),b=new Date(`${p.end}T00:00:00-03:00`);b.setDate(b.getDate()+1);return[a.toISOString(),b.toISOString()]};
  function styles52(){if(document.getElementById('v52style'))return;const s=document.createElement('style');s.id='v52style';s.textContent=`.global-period52{display:flex;gap:10px;align-items:end;flex-wrap:wrap;padding:12px 14px;margin:0 0 14px;border:1px solid #eadbd1;border-radius:14px;background:#fffaf6}.global-period52 label{display:grid;gap:5px;font-size:11px;font-weight:800;color:#6c5147}.global-period52 input{min-width:150px}.global-period52 .period-summary32{font-size:12px;color:#806b62;flex:1 1 220px;align-self:center}@media(max-width:720px){.global-period52{display:grid;grid-template-columns:1fr 1fr}.global-period52 label input{width:100%;min-width:0}.global-period52 .period-summary32,.global-period52 .btn{grid-column:1/-1}}`;document.head.appendChild(s)}
  function bar52(context){const p=period52();return `<div class="global-period52" data-period-context32="${context}"><label>De<input class="field" type="date" data-global-start52 value="${p.start}"></label><label>Até<input class="field" type="date" data-global-end52 value="${p.end}"></label><button type="button" class="btn secondary" data-apply-global52>Aplicar período</button><div class="period-summary32">Período único da plataforma: ${br52(p.start)} a ${br52(p.end)}.</div></div>`}
  function status52(v){const label={PAID:'Pago',PARTIAL:'Parcial',PENDING:'Pendente',OVERPAID:'Excesso recebido'}[v]||String(v||'—').replaceAll('_',' ');return `<span class="pill ${v==='PAID'?'ok':v==='PENDING'||v==='OVERPAID'?'red':'gold'}">${label}</span>`}
  function row52(r){const classified=Number(r.credit||0)+Number(r.refund||0)+Number(r.adjustment||0),unclassified=Math.max(Number(r.excess||0)-classified,0);return `<tr class="${Number(r.excess||0)>.009?'excess49':''}"><td>${fmtDate(r.receipt_date)}<small>Venda: ${fmtDate(r.sale_date)} · competência: ${fmtDate(r.competence_date)}</small></td><td><b>${escapeHtml(r.client_name||'—')}</b><small>${escapeHtml(r.label||'Venda')}</small></td><td>${fmtMoney(r.contracted)}</td><td><b>${fmtMoney(r.received)}</b><small>Taxas: ${fmtMoney(r.fees)}</small></td><td>${fmtMoney(r.balance)}</td><td>${Number(r.excess||0)>.009?`<b>${fmtMoney(r.excess)}</b>${unclassified>.009?`<small><b>Falta classificar ${fmtMoney(unclassified)}</b></small>`:''}`:'—'}</td><td>${status52(r.financial_status)}</td><td><button type="button" class="link-btn" data-fin-detail49="${r.sale_id}">Detalhes</button></td></tr>`}
  renderFinance=async function(){
    if(state.demo)return `${bar52('financeiro')}<article class="panel"><div class="empty-state">Financeiro disponível após login.</div></article>`;
    const p=period52(),size=50,[entries,summary]=await Promise.all([
      db.rpc('finance_entries_v349',{p_date_kind:'RECEIPT',p_start:p.start,p_end:p.end,p_page:financePage52,p_page_size:size}),
      db.rpc('finance_daily_summary_v351',{p_start:p.start,p_end:p.end})
    ]);if(entries.error)throw entries.error;if(summary.error)throw summary.error;
    const rows=entries.data||[],people=summary.data||[],total=Number(rows[0]?.total_count||0),pages=Math.max(1,Math.ceil(total/size)),revenue=Number(people[0]?.period_revenue||0);
    const person=n=>people.find(x=>String(x.member_name||'').toLowerCase().startsWith(n));
    const cards=[['Faturamento',fmtMoney(revenue),'Recebido de fato no período'],['Comissão Yasmin',fmtMoney(person('yasmin')?.due_amount||0),'Pendente no período'],['Comissão Lourdes',fmtMoney(person('lourdes')?.due_amount||0),'Pendente no período'],['Comissão Rosely',fmtMoney(person('rosel')?.due_amount||0),'Pendente no período']];
    return `${bar52('financeiro')}<article class="panel finance-priority51"><div class="section-head"><div><h2>Visão financeira do período</h2><p>${br52(p.start)} a ${br52(p.end)}</p></div></div>${kpis(cards)}</article><article class="panel finance49"><div class="section-head"><div><h2>Recebimentos e vendas</h2><p>Valores recebidos dentro do período global. ${total} lançamento${total===1?'':'s'}.</p></div><button class="btn" type="button" data-new-payment49>+ Pagamento</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Recebimento</th><th>Cliente / serviço</th><th>Contratado</th><th>Recebido</th><th>Saldo</th><th>Excesso</th><th>Status</th><th>Ação</th></tr></thead><tbody>${rows.length?rows.map(row52).join(''):'<tr class="empty-row"><td colspan="8">Nenhum recebimento neste período.</td></tr>'}</tbody></table></div><div class="pagination49"><span>Página ${financePage52} de ${pages}</span><div class="button-row"><button class="btn ghost" type="button" data-fin-prev52 ${financePage52<=1?'disabled':''}>← Anterior</button><button class="btn ghost" type="button" data-fin-next52 ${financePage52>=pages?'disabled':''}>Próxima →</button></div></div></article><article class="panel" id="commissionControl"><div class="section-head"><div><h2>Comissões</h2><p>Conferência e baixa obedecem ao mesmo período global acima.</p></div></div><div class="note"><b>${fmtMoney(people.reduce((s,x)=>s+Number(x.due_amount||0),0))}</b> em comissões pendentes no período.</div></article>`;
  };
  renderConsultations=async function(){const p=period52();if(state.demo)return `${bar52('consultas')}<article class="panel"><div class="empty-state">Sem dados em modo visual.</div></article>`;const [a,b]=bounds52(p),q=await db.from('appointments').select('*,clients(full_name),services(name),team_members:responsible_member_id(full_name)').in('event_type',['CONSULTA','PERGUNTA','RETORNO']).gte('starts_at',a).lt('starts_at',b).order('starts_at',{ascending:false}).limit(100);if(q.error)throw q.error;const rows=(q.data||[]).map(x=>`<tr class="clickable" data-appt-id="${x.id}"><td>${fmtDateTime(x.starts_at)}</td><td>${escapeHtml(x.clients?.full_name||'—')}</td><td>${escapeHtml(x.services?.name||x.consultation_method||x.event_type)}</td><td>${escapeHtml(x.team_members?.full_name||'—')}</td><td>${status52(x.question_status||x.status)}</td><td class="wrap-cell">${escapeHtml(x.question_text||x.guidance_summary||'—')}</td></tr>`).join('')||'<tr class="empty-row"><td colspan="6">Nenhuma consulta neste período.</td></tr>';return `${bar52('consultas')}<article class="panel"><div class="section-head"><div><h2>Histórico de consultas</h2><p>Período global: ${br52(p.start)} a ${br52(p.end)}.</p></div><button class="btn" data-action="new-appointment">+ Nova consulta</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Cliente</th><th>Tipo</th><th>Responsável</th><th>Status</th><th>Pergunta / orientação</th></tr></thead><tbody>${rows}</tbody></table></div></article>`};
  function works52(){if(state.view!=='trabalhos')return;const content=document.getElementById('content');if(!content)return;if(!content.querySelector('.global-period52'))content.insertAdjacentHTML('afterbegin',bar52('trabalhos'));const p=period52();document.querySelectorAll('[data-work-id]').forEach(row=>{const w=(state.works||[]).find(x=>x.id===row.dataset.workId),day=String(w?.scheduled_at||'').slice(0,10);row.hidden=Boolean(day&&(day<p.start||day>p.end))})}
  function clean52(){document.querySelectorAll('.finance49-filter,.consult49-filter').forEach(x=>x.remove());const cp=document.getElementById('commissionPeriod34');if(cp)cp.style.display='none'}
  function pin52(){document.documentElement.dataset.sunshineVersion=VERSION;document.documentElement.dataset.sunshineBuild=VERSION;const f=document.querySelector('.sidebar-version-current,.sidebar-foot');if(f)f.innerHTML=`<span class="dot"></span> Ecossistema Sunshine · ${VERSION}`}
  const oldRender52=render;render=async function(){await oldRender52();clean52();works52();pin52();setTimeout(()=>{clean52();works52();pin52()},500)};
  document.addEventListener('click',async e=>{const apply=e.target.closest('[data-apply-global52]');if(apply){const bar=apply.closest('.global-period52'),p={start:bar.querySelector('[data-global-start52]').value,end:bar.querySelector('[data-global-end52]').value};if(!valid52(p)){toast('A data inicial não pode ser posterior à data final.','error');return}localStorage.setItem(KEY,JSON.stringify(p));financePage52=1;await render();return}if(e.target.closest('[data-fin-prev52]')){financePage52=Math.max(1,financePage52-1);await render();return}if(e.target.closest('[data-fin-next52]')){financePage52++;await render()}},true);
  function start52(){styles52();pin52();clean52();works52();const o=new MutationObserver(()=>{clean52();pin52()});o.observe(document.getElementById('content')||document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start52);else start52();
})();

;

/* ---- assets/password-guard.js ---- */
// Obriga a troca da senha inicial compartilhada no primeiro acesso.
(function(){
  if(typeof db==='undefined' || !db) return;
  let showing=false;

  function removeGuard(){
    document.getElementById('initialPasswordGuard')?.remove();
    showing=false;
  }

  function showGuard(session){
    if(!session?.user?.user_metadata?.must_change_password || showing) return;
    showing=true;
    const root=document.createElement('div');
    root.id='initialPasswordGuard';
    root.className='modal-backdrop';
    root.innerHTML=`<div class="modal" style="max-width:430px">
      <div class="modal-head"><h2>Crie sua senha pessoal</h2></div>
      <div class="modal-body">
        <div class="note"><b>Primeiro acesso.</b><br>A senha recebida é temporária. Defina uma senha pessoal antes de continuar.</div>
        <form id="initialPasswordForm" class="form-grid" style="margin-top:14px">
          <label class="span-2">Nova senha<input id="initialNewPassword" type="password" minlength="8" autocomplete="new-password" required placeholder="Mínimo de 8 caracteres"></label>
          <label class="span-2">Confirmar nova senha<input id="initialNewPassword2" type="password" minlength="8" autocomplete="new-password" required></label>
          <div class="span-2" id="initialPasswordError" style="color:var(--red);font-size:11px;min-height:16px"></div>
          <div class="form-actions span-2"><button class="btn" id="initialPasswordSave" type="submit">Salvar nova senha</button></div>
        </form>
      </div>
    </div>`;
    document.body.appendChild(root);
    document.getElementById('initialPasswordForm')?.addEventListener('submit',async e=>{
      e.preventDefault();
      const p1=document.getElementById('initialNewPassword').value;
      const p2=document.getElementById('initialNewPassword2').value;
      const errorEl=document.getElementById('initialPasswordError');
      if(p1.length<8){errorEl.textContent='Use pelo menos 8 caracteres.';return;}
      if(p1!==p2){errorEl.textContent='As senhas não coincidem.';return;}
      const btn=document.getElementById('initialPasswordSave');btn.disabled=true;btn.textContent='Salvando…';
      const {error}=await db.auth.updateUser({password:p1,data:{must_change_password:false}});
      if(error){btn.disabled=false;btn.textContent='Salvar nova senha';errorEl.textContent=error.message||'Não foi possível alterar a senha.';return;}
      removeGuard();
      if(typeof toast==='function') toast('Senha pessoal criada com sucesso.');
    });
  }

  db.auth.getSession().then(({data})=>showGuard(data?.session)).catch(()=>{});
  db.auth.onAuthStateChange((_event,session)=>showGuard(session));
})();

;

/* ---- assets/v53.js ---- */
/* Sunshine v3.54 — lançamento manual completo e recuperação de pagamentos órfãos. */
(function(){
  const VERSION='v3.57';
  const uuid53=()=>crypto.randomUUID();
  const local53=v=>{const d=v?new Date(v):new Date(),z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`};
  const saleType53=s=>({CONSULTA:'CONSULTA',PERGUNTA:'PERGUNTA',MENSALIDADE:'MENSALIDADE'}[s?.category]||'OUTRO');
  function pin53(){document.documentElement.dataset.sunshineVersion=VERSION;document.documentElement.dataset.sunshineBuild=VERSION;const n=document.querySelector('.sidebar-version-current,.sidebar-foot');if(n&&!n.textContent.includes(VERSION))n.innerHTML=`<span class="dot"></span> Ecossistema Sunshine · ${VERSION}`}
  function style53(){if(document.getElementById('style53'))return;const s=document.createElement('style');s.id='style53';s.textContent=`.flow53{display:grid;gap:14px}.step53{border:1px solid #eadfd8;border-radius:14px;padding:13px;background:#fffaf6}.step53 h3{margin:0 0 4px}.step53>p{margin:0 0 12px;color:#806b62}.grid53,.part-grid53{display:grid;grid-template-columns:1fr 1fr;gap:10px}.grid53 label,.part-grid53 label{display:grid;gap:5px}.wide53{grid-column:1/-1}.picker53{position:relative}.picker53-list{position:absolute;z-index:300;left:0;right:0;top:100%;background:#fff;border:1px solid #dfcfc5;border-radius:12px;box-shadow:0 12px 30px #3b211a22;max-height:280px;overflow:auto;padding:5px}.picker53-list[hidden]{display:none}.picker53-list button{display:block;width:100%;border:0;background:#fff;text-align:left;padding:10px;border-radius:8px}.picker53-list button:hover{background:#fff3ed}.picker53-list small{display:block;color:#806b62}.part53{border:1px solid #eadfd8;border-radius:12px;background:#fff;padding:11px;margin-top:9px}.part-head53{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:9px}.orphan53{border-left:4px solid #b42318}.orphan-list53{display:grid;gap:8px}.orphan-row53{display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid #eadfd8;border-radius:12px;padding:11px}.orphan-row53 small{display:block;color:#806b62;margin-top:3px}@media(max-width:720px){.grid53,.part-grid53{grid-template-columns:1fr}.wide53{grid-column:auto}.orphan-row53{align-items:stretch;flex-direction:column}.orphan-row53 .btn{width:100%}}`;document.head.appendChild(s)}
  async function picker53(select){
    select.hidden=true;select.innerHTML='<option value=""></option>';
    const box=document.createElement('div');box.className='picker53';box.innerHTML='<input class="field" type="search" placeholder="Digite ao menos 2 caracteres"><button class="link-btn" type="button" data-clear53>Limpar</button><div class="picker53-list" hidden></div>';select.after(box);
    const input=box.querySelector('input'),list=box.querySelector('.picker53-list');let timer;
    input.addEventListener('input',()=>{select.value='';clearTimeout(timer);timer=setTimeout(async()=>{const q=input.value.trim();if(q.length<2){list.hidden=true;return}const r=await db.rpc('search_clients_v349',{p_query:q,p_status:null,p_limit:15,p_offset:0});if(r.error){toast(r.error.message,'error');return}list.innerHTML=(r.data||[]).map(c=>`<button type="button" data-id="${c.id}" data-name="${escapeHtml(c.full_name)}"><b>${escapeHtml(c.full_name)}</b><small>${escapeHtml(c.phone||c.email||'Sem telefone/e-mail')}</small></button>`).join('')||'<small style="display:block;padding:10px">Nenhum cliente encontrado. Preencha o cadastro novo abaixo.</small>';list.hidden=false},180)});
    box.addEventListener('click',e=>{const b=e.target.closest('[data-id]');if(b){select.innerHTML=`<option value="${b.dataset.id}" selected></option>`;select.value=b.dataset.id;input.value=b.dataset.name;list.hidden=true;select.dispatchEvent(new Event('change'))}if(e.target.closest('[data-clear53]')){select.innerHTML='<option value=""></option>';select.value='';input.value='';list.hidden=true;select.dispatchEvent(new Event('change'))}});
  }
  function part53(i){return `<div class="part53" data-part53><div class="part-head53"><b>Pessoa inscrita ${i+1}</b>${i?'<button class="link-btn" type="button" data-remove53>Remover</button>':''}</div><div class="part-grid53"><label>Nome completo<input data-name53 required></label><label>Nascimento<input data-birth53 type="date"></label><label>Pessoa amada<input data-loved53></label><label>Rival<input data-rival53></label></div></div>`}
  function renumber53(root){root.querySelectorAll('[data-part53]').forEach((x,i)=>x.querySelector('b').textContent=`Pessoa inscrita ${i+1}`)}
  async function orphans53(){const p=await db.from('payments').select('id,gross_amount,fees_amount,status,payment_method,paid_at,created_at,notes').eq('source','MANUAL').order('created_at',{ascending:false}).limit(60);if(p.error||!p.data?.length)return[];const a=await db.from('payment_allocations').select('payment_id').in('payment_id',p.data.map(x=>x.id));if(a.error)return[];const linked=new Set((a.data||[]).map(x=>x.payment_id));return p.data.filter(x=>!linked.has(x.id)).slice(0,15)}
  function orphanHtml53(rows){return rows.length?`<article class="panel orphan53"><div class="section-head"><div><h2>Pagamentos que precisam ser completados</h2><p>O dinheiro foi salvo, mas falta cliente, contratação e inscritos. Complete o registro existente; não lance o valor novamente.</p></div><span class="pill red">${rows.length}</span></div><div class="orphan-list53">${rows.map(x=>`<div class="orphan-row53"><div><b>${fmtMoney(x.gross_amount)} · ${escapeHtml(x.payment_method||'Manual')}</b><small>${fmtDateTime(x.paid_at||x.created_at)} · ${escapeHtml(x.notes||'Sem observação')}</small><small>ID ${x.id}</small></div><button class="btn" type="button" data-complete53="${x.id}">Completar lançamento</button></div>`).join('')}</div></article>`:''}
  const finance53=renderFinance;renderFinance=async()=>{const [base,rows]=await Promise.all([finance53(),orphans53()]);return base+orphanHtml53(rows)};
  paymentModal=async function(existingId=''){
    let old=null;if(existingId){const q=await db.from('payments').select('*').eq('id',existingId).single();if(q.error){toast(q.error.message,'error');return}old=q.data}
    openModal(old?'Completar lançamento existente':'Novo lançamento completo',`<form id="form53" class="flow53">${old?`<div class="asaas-guard49"><b>Pagamento já salvo:</b> ${fmtMoney(old.gross_amount)}. Nenhum novo pagamento será criado.</div>`:''}<section class="step53"><h3>1. Cliente</h3><p>Busque o cliente. Se não existir, preencha o cadastro novo.</p><div class="grid53"><label class="wide53">Cliente existente<select id="client53"></select></label><div class="wide53" id="new53"><label>Nome do novo cliente<input id="name53"></label><div class="grid53"><label>Telefone<input id="phone53"></label><label>E-mail<input id="email53" type="email"></label><label>Nascimento<input id="birth53" type="date"></label></div></div></div></section><section class="step53"><h3>2. Contratação</h3><p>Escolha o serviço ou trabalho. Em trabalho, adicione todas as pessoas pagas.</p><div class="grid53"><label>Serviço<select id="service53">${optionList((state.services||[]).filter(x=>x.active!==false),'name')}</select></label><label>Trabalho<select id="work53">${optionList((state.works||[]).filter(x=>x.status!=='CANCELLED'),'title')}</select></label><label>Responsável<select id="responsible53">${optionList((state.team||[]).filter(x=>x.is_practitioner),'full_name')}</select></label><label>Valor recebido<input id="amount53" type="number" min=".01" step=".01" required ${old?'readonly':''} value="${old?Number(old.gross_amount).toFixed(2):''}"></label></div><div id="partsWrap53" hidden><div class="part-head53" style="margin-top:12px"><b>Pessoas deste trabalho</b><button class="btn ghost" type="button" data-add53>+ Adicionar pessoa</button></div><div id="parts53"></div></div></section><section class="step53"><h3>3. Pagamento</h3><p>Venda, pagamento, inscrições e comissões serão salvos juntos.</p><div class="grid53"><label>Status<select id="status53" ${old?'disabled':''}><option value="PAID">Pago</option><option value="PENDING">Pendente</option><option value="OVERDUE">Vencido</option></select></label><label>Método<input id="method53" value="${escapeHtml(old?.payment_method||'')}"></label><label>Taxas<input id="fees53" type="number" min="0" step=".01" ${old?'readonly':''} value="${Number(old?.fees_amount||0).toFixed(2)}"></label><label>Data<input id="paid53" type="datetime-local" ${old?'readonly':''} value="${local53(old?.paid_at)}"></label><label class="wide53">Observações<textarea id="notes53">${escapeHtml(old?.notes||'')}</textarea></label></div></section><div>${formActions(old?'Completar sem duplicar':'Salvar lançamento completo')}</div></form>`,true);
    bindCancel();const form=document.getElementById('form53'),client=document.getElementById('client53'),work=document.getElementById('work53'),service=document.getElementById('service53'),parts=document.getElementById('parts53'),wrap=document.getElementById('partsWrap53');await picker53(client);
    const syncClient=()=>{const selected=!!client.value;document.getElementById('new53').hidden=selected;document.getElementById('name53').required=!selected};client.addEventListener('change',syncClient);syncClient();
    const syncWork=()=>{wrap.hidden=!work.value;if(work.value&&!parts.children.length)parts.insertAdjacentHTML('beforeend',part53(0));if(work.value){service.value='';const w=byId(state.works,work.value);if(!old&&w?.unit_price!=null)document.getElementById('amount53').value=Number(w.unit_price).toFixed(2)}};work.addEventListener('change',syncWork);service.addEventListener('change',()=>{if(service.value){work.value='';syncWork();const s=byId(state.services,service.value);if(!old&&s?.default_price!=null)document.getElementById('amount53').value=Number(s.default_price).toFixed(2)}});
    form.addEventListener('click',e=>{if(e.target.closest('[data-add53]'))parts.insertAdjacentHTML('beforeend',part53(parts.children.length));const r=e.target.closest('[data-remove53]');if(r){r.closest('[data-part53]').remove();renumber53(parts)}});
    form.addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;if(!client.value&&!val('name53').trim()){toast('Selecione um cliente ou informe o novo cliente.','error');return}if(!service.value&&!work.value){toast('Selecione o serviço ou o trabalho.','error');return}const ps=[...parts.querySelectorAll('[data-part53]')].map(x=>({name:x.querySelector('[data-name53]').value.trim(),birth_date:x.querySelector('[data-birth53]').value||null,loved_person_name:x.querySelector('[data-loved53]').value.trim()||null,rival_name:x.querySelector('[data-rival53]').value.trim()||null}));if(work.value&&(!ps.length||ps.some(x=>!x.name))){toast('Informe o nome de todas as pessoas inscritas.','error');return}const btn=form.querySelector('[type=submit]');btn.disabled=true;btn.textContent='Salvando tudo…';const key=form.dataset.key||(form.dataset.key=uuid53()),paid=new Date(val('paid53')).toISOString(),r=await db.rpc('complete_manual_entry_v354',{p_idempotency_key:key,p_existing_payment_id:old?.id||null,p_client_id:client.value||null,p_client_name:val('name53').trim()||null,p_client_phone:val('phone53').trim()||null,p_client_email:val('email53').trim()||null,p_client_birth_date:val('birth53')||null,p_service_id:service.value||null,p_work_id:work.value||null,p_responsible_member_id:val('responsible53')||null,p_sale_type:work.value?'TRABALHO':saleType53(byId(state.services,service.value)),p_amount:Number(val('amount53')),p_fees:Number(val('fees53')||0),p_payment_status:old?.status||val('status53'),p_payment_method:val('method53').trim()||null,p_paid_at:paid,p_notes:val('notes53').trim()||null,p_participants:ps});if(r.error){btn.disabled=false;btn.textContent=old?'Completar sem duplicar':'Salvar lançamento completo';toast(r.error.message,'error');return}toast(work.value?`${ps.length} inscrição(ões), venda, pagamento e comissões registrados.`:'Cliente, venda e pagamento registrados.');closeModal();await loadReferenceData();await navigate('financeiro')});
  };
  document.addEventListener('click',e=>{const c=e.target.closest('[data-complete53]');if(c){e.preventDefault();e.stopImmediatePropagation();paymentModal(c.dataset.complete53);return}if(e.target.closest('[data-new-payment49],[data-action="new-payment"],[data-new-payment40],[data-unified-new-payment39]')){e.preventDefault();e.stopImmediatePropagation();paymentModal()}},true);
  function start(){style53();pin53();new MutationObserver(pin53).observe(document.body,{childList:true,subtree:true})}document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start):start();
})();

;

/* ---- assets/v54.js ---- */
/* Sunshine v3.56 — recebimento manual com múltiplas partes, como no Asaas. */
(function(){
 const VERSION='v3.56',money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),uid=()=>crypto.randomUUID();
 const local=v=>{const d=v?new Date(v):new Date(),z=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`};
 const typeOf=s=>({CONSULTA:'CONSULTA',PERGUNTA:'PERGUNTA',MENSALIDADE:'MENSALIDADE'}[s?.category]||'OUTRO');
 function pin(){document.documentElement.dataset.sunshineVersion=VERSION;document.documentElement.dataset.sunshineBuild=VERSION;const n=document.querySelector('.sidebar-version-current,.sidebar-foot');if(n&&!n.textContent.includes(VERSION))n.innerHTML=`<span class="dot"></span> Ecossistema Sunshine · ${VERSION}`}
 function css(){if(document.getElementById('style54'))return;const s=document.createElement('style');s.id='style54';s.textContent=`.flow54{display:grid;gap:14px}.step54,.part54{border:1px solid #eadfd8;border-radius:14px;padding:13px;background:#fffaf6}.step54 h3{margin:0 0 4px}.step54>p{margin:0 0 12px;color:#806b62}.grid54{display:grid;grid-template-columns:1fr 1fr;gap:10px}.grid54 label{display:grid;gap:5px}.wide54{grid-column:1/-1}.picker54{position:relative}.picker54-list{position:absolute;z-index:300;left:0;right:0;top:100%;background:#fff;border:1px solid #dfcfc5;border-radius:12px;box-shadow:0 12px 30px #3b211a22;max-height:280px;overflow:auto;padding:5px}.picker54-list[hidden]{display:none}.picker54-list button{display:block;width:100%;border:0;background:#fff;text-align:left;padding:10px;border-radius:8px}.picker54-list button:hover{background:#fff3ed}.picker54-list small{display:block;color:#806b62}.parts54{display:grid;gap:10px}.part54{background:#fff}.part-head54{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}.participants54{border-top:1px solid #eadfd8;margin-top:10px;padding-top:10px}.participant54{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr auto;gap:7px;margin-top:7px;align-items:end}.sum54{display:flex;justify-content:space-between;gap:10px;border-radius:12px;padding:11px;background:#edf9f0;color:#246537;font-weight:800}.sum54.bad{background:#fff0ed;color:#a22f20}@media(max-width:720px){.grid54,.participant54{grid-template-columns:1fr}.wide54{grid-column:auto}.participant54 .link-btn{width:100%}.part-head54{align-items:stretch;flex-direction:column}.part-head54 .link-btn{align-self:flex-end}}`;document.head.appendChild(s)}
 async function picker(select){select.hidden=true;select.innerHTML='<option value=""></option>';const b=document.createElement('div');b.className='picker54';b.innerHTML='<input class="field" type="search" placeholder="Digite ao menos 2 caracteres"><button class="link-btn" type="button" data-clear54>Limpar</button><div class="picker54-list" hidden></div>';select.after(b);const i=b.querySelector('input'),l=b.querySelector('.picker54-list');let timer;i.addEventListener('input',()=>{select.value='';select.dispatchEvent(new Event('change'));clearTimeout(timer);timer=setTimeout(async()=>{const q=i.value.trim();if(q.length<2){l.hidden=true;return}const r=await db.rpc('search_clients_v349',{p_query:q,p_status:null,p_limit:15,p_offset:0});if(r.error){toast(r.error.message,'error');return}l.innerHTML=(r.data||[]).map(c=>`<button type="button" data-id="${c.id}" data-name="${escapeHtml(c.full_name)}"><b>${escapeHtml(c.full_name)}</b><small>${escapeHtml(c.phone||c.email||'Sem telefone/e-mail')}</small></button>`).join('')||'<small style="display:block;padding:10px">Não encontrado. Preencha o novo cadastro.</small>';l.hidden=false},180)});b.addEventListener('click',e=>{const x=e.target.closest('[data-id]');if(x){select.innerHTML=`<option value="${x.dataset.id}" selected></option>`;select.value=x.dataset.id;i.value=x.dataset.name;l.hidden=true;select.dispatchEvent(new Event('change'))}if(e.target.closest('[data-clear54]')){select.innerHTML='<option value=""></option>';select.value='';i.value='';l.hidden=true;select.dispatchEvent(new Event('change'))}})}
 function participant(){return`<div class="participant54" data-person54><label>Nome do inscrito<input data-person-name54 required></label><label>Nascimento<input type="date" data-person-birth54></label><label>Pessoa amada<input data-person-loved54></label><label>Rival<input data-person-rival54></label><button class="link-btn" type="button" data-remove-person54>Remover</button></div>`}
 function part(i){return`<section class="part54" data-part54><div class="part-head54"><b>Parte ${i+1}</b>${i?'<button class="link-btn" type="button" data-remove-part54>Remover parte</button>':''}</div><div class="grid54"><label>Serviço<select data-service54>${optionList((state.services||[]).filter(x=>x.active!==false),'name')}</select></label><label>Trabalho<select data-work54>${optionList((state.works||[]).filter(x=>x.status!=='CANCELLED'),'title')}</select></label><label>Valor desta parte<input data-amount54 type="number" min=".01" step=".01" required></label><label>Responsável<select data-responsible54>${optionList((state.team||[]).filter(x=>x.is_practitioner),'full_name')}</select></label><label data-quantity-box54>Quantidade<input data-quantity54 type="number" min="1" step="1" value="1"></label><label class="wide54">Observação da parte<input data-notes54></label></div><div class="participants54" data-participants-box54 hidden><div class="part-head54"><b>Pessoas inscritas nesta parte</b><button class="btn ghost" type="button" data-add-person54>+ Pessoa</button></div><div data-people54></div></div></section>`}
 function renumber(root){root.querySelectorAll('[data-part54]').forEach((x,i)=>x.querySelector('.part-head54>b').textContent=`Parte ${i+1}`)}
 function syncPart(p){const s=p.querySelector('[data-service54]'),w=p.querySelector('[data-work54]'),box=p.querySelector('[data-participants-box54]'),people=p.querySelector('[data-people54]'),qty=p.querySelector('[data-quantity-box54]');box.hidden=!w.value;qty.hidden=!!w.value;if(w.value&&!people.children.length)people.insertAdjacentHTML('beforeend',participant());if(w.value)s.value=''}
 function recalc(form){const total=Number(val('total54')||0),sum=[...form.querySelectorAll('[data-amount54]')].reduce((a,x)=>a+Number(x.value||0),0),out=document.getElementById('sum54');out.classList.toggle('bad',Math.abs(total-sum)>.009);out.innerHTML=`<span>Soma das partes: ${money(sum)}</span><span>Total recebido: ${money(total)}</span>`}
 paymentModal=async function(){openModal('Novo lançamento completo',`<form id="form54" class="flow54"><section class="step54"><h3>1. Cliente</h3><p>Busque o cliente. Se não existir, cadastre sem sair do pagamento.</p><div class="grid54"><label class="wide54">Cliente existente<select id="client54"></select></label><div class="wide54" id="newClient54"><label>Nome do novo cliente<input id="name54"></label><div class="grid54"><label>Telefone<input id="phone54"></label><label>E-mail<input id="email54" type="email"></label><label>Nascimento<input id="birth54" type="date"></label></div></div></div></section><section class="step54"><h3>2. Recebimento</h3><p>Informe o dinheiro que entrou uma única vez.</p><div class="grid54"><label>Total recebido<input id="total54" type="number" min=".01" step=".01" required></label><label>Taxas<input id="fees54" type="number" min="0" step=".01" value="0"></label><label>Método<input id="method54" placeholder="PIX, cartão, dinheiro…"></label><label>Data<input id="paid54" type="datetime-local" value="${local()}"></label><label>Status<select id="status54"><option value="PAID">Pago</option><option value="PENDING">Pendente</option><option value="OVERDUE">Vencido</option></select></label><label class="wide54">Observações<textarea id="notes54"></textarea></label></div></section><section class="step54"><div class="part-head54"><div><h3>3. Para onde vai o pagamento</h3><p>Separe entre serviços e trabalhos ou some tudo em uma única parte.</p></div><button class="btn ghost" type="button" data-add-part54>+ Adicionar parte</button></div><div class="parts54" id="parts54">${part(0)}</div><div class="sum54 bad" id="sum54"><span>Soma das partes: R$ 0,00</span><span>Total recebido: R$ 0,00</span></div></section><div>${formActions('Salvar tudo junto')}</div></form>`,true);bindCancel();const form=document.getElementById('form54'),client=document.getElementById('client54'),parts=document.getElementById('parts54');await picker(client);const syncClient=()=>{const ok=!!client.value;document.getElementById('newClient54').hidden=ok;document.getElementById('name54').required=!ok};client.addEventListener('change',syncClient);syncClient();syncPart(parts.firstElementChild);form.addEventListener('change',e=>{const p=e.target.closest('[data-part54]');if(p&&e.target.matches('[data-work54]'))syncPart(p);if(p&&e.target.matches('[data-service54]')&&e.target.value){p.querySelector('[data-work54]').value='';syncPart(p)}recalc(form)});form.addEventListener('input',()=>recalc(form));form.addEventListener('click',e=>{if(e.target.closest('[data-add-part54]')){parts.insertAdjacentHTML('beforeend',part(parts.children.length));syncPart(parts.lastElementChild)}const rp=e.target.closest('[data-remove-part54]');if(rp){rp.closest('[data-part54]').remove();renumber(parts);recalc(form)}const ap=e.target.closest('[data-add-person54]');if(ap)ap.closest('[data-part54]').querySelector('[data-people54]').insertAdjacentHTML('beforeend',participant());const rr=e.target.closest('[data-remove-person54]');if(rr){const list=rr.closest('[data-people54]');if(list.children.length>1)rr.closest('[data-person54]').remove();else toast('Cada trabalho precisa de ao menos uma pessoa inscrita.','error')}});form.addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;if(!client.value&&!val('name54').trim()){toast('Selecione um cliente ou informe o novo cliente.','error');return}const total=Number(val('total54')),items=[...parts.querySelectorAll('[data-part54]')].map(p=>{const sid=p.querySelector('[data-service54]').value,wid=p.querySelector('[data-work54]').value,ps=[...p.querySelectorAll('[data-person54]')].map(x=>({name:x.querySelector('[data-person-name54]').value.trim(),birth_date:x.querySelector('[data-person-birth54]').value||null,loved_person_name:x.querySelector('[data-person-loved54]').value.trim()||null,rival_name:x.querySelector('[data-person-rival54]').value.trim()||null}));return{service_id:sid||null,work_id:wid||null,responsible_member_id:p.querySelector('[data-responsible54]').value||null,amount:Number(p.querySelector('[data-amount54]').value||0),quantity:Number(p.querySelector('[data-quantity54]').value||1),sale_type:wid?'TRABALHO':typeOf(byId(state.services,sid)),notes:p.querySelector('[data-notes54]').value.trim()||null,participants:wid?ps:[]}});if(items.some(x=>(!x.service_id&&!x.work_id)||(x.service_id&&x.work_id))){toast('Escolha um serviço ou um trabalho em cada parte.','error');return}if(items.some(x=>x.work_id&&(!x.participants.length||x.participants.some(p=>!p.name)))){toast('Informe os inscritos de cada trabalho.','error');return}const sum=items.reduce((a,x)=>a+x.amount,0);if(Math.abs(sum-total)>.009){toast(`A soma das partes (${money(sum)}) deve ser igual ao total recebido (${money(total)}).`,'error');return}const btn=form.querySelector('[type=submit]');btn.disabled=true;btn.textContent='Salvando tudo…';const key=form.dataset.key||(form.dataset.key=uid()),r=await db.rpc('register_manual_entry_multi_v356',{p_idempotency_key:key,p_client_id:client.value||null,p_client_name:val('name54').trim()||null,p_client_phone:val('phone54').trim()||null,p_client_email:val('email54').trim()||null,p_client_birth_date:val('birth54')||null,p_gross_amount:total,p_fees:Number(val('fees54')||0),p_payment_status:val('status54'),p_payment_method:val('method54').trim()||null,p_paid_at:new Date(val('paid54')).toISOString(),p_notes:val('notes54').trim()||null,p_items:items});if(r.error){btn.disabled=false;btn.textContent='Salvar tudo junto';toast(r.error.message,'error');return}toast(`${items.length} parte(s) registradas no mesmo pagamento.`);closeModal();await loadReferenceData();await navigate('financeiro')})};
 function start(){css();pin()}document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start):start();
})();

;

/* ---- assets/v55.js ---- */
/* Sunshine v3.57 — cadastro manual simples e inscritos com histórico financeiro. */
(function(){
 const VERSION='v3.57', money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}), uid=()=>crypto.randomUUID();
 const civil=v=>{if(!v)return'—';const p=String(v).slice(0,10).split('-');return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:'—'};
 const dateTime=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
 const status=v=>({PAID:'Completo',PENDING:'Pendente',OVERDUE:'Vencido',CONFIRMED:'Confirmado',REGISTERED:'Pendente'}[v]||String(v||'—').replaceAll('_',' '));
 const local=()=>{const d=new Date(),z=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`};

 function styles(){if(document.getElementById('style55'))return;const s=document.createElement('style');s.id='style55';s.textContent=`
 .simple55{display:grid;gap:13px}.question55{border:1px solid #eadfd8;border-radius:15px;padding:14px;background:#fffaf6}.question55>label,.question55 .title55{display:block;font-size:17px;font-weight:800;margin-bottom:8px}.sub55{color:#806b62;font-size:13px;margin:3px 0 10px}.grid55{display:grid;grid-template-columns:1fr 1fr;gap:10px}.grid55 label{display:grid;gap:5px}.wide55{grid-column:1/-1}.picker55{position:relative;display:grid;grid-template-columns:1fr auto;gap:7px}.picker55-results{position:absolute;z-index:400;top:100%;left:0;right:0;background:white;border:1px solid #dbc9bf;border-radius:12px;box-shadow:0 12px 28px #351d1528;max-height:260px;overflow:auto;padding:5px}.picker55-results[hidden]{display:none}.picker55-results button{border:0;background:white;text-align:left;width:100%;padding:10px;border-radius:8px}.picker55-results small{display:block;color:#806b62}.target55{border-top:1px solid #eadfd8;padding-top:11px;margin-top:11px}.target55:first-child{border-top:0;padding-top:0;margin-top:0}.target-head55{display:flex;align-items:center;justify-content:space-between;gap:8px}.people55{display:grid;gap:8px;margin-top:10px}.person55{display:grid;grid-template-columns:1.5fr 1fr;gap:8px}.summary55{padding:12px;border-radius:12px;background:#edf8ef;color:#245e31;font-weight:800}.summary55.bad{background:#fff0ed;color:#a22f20}.finance-list55{display:grid;gap:10px}.finance-row55{border:1px solid #eadfd8;border-radius:13px;padding:12px;background:#fff;display:grid;grid-template-columns:1.4fr repeat(4,1fr);gap:10px}.finance-row55 small{display:block;color:#806b62;margin-bottom:3px}.finance-row55 b{overflow-wrap:anywhere}@media(max-width:720px){.grid55,.person55,.finance-row55{grid-template-columns:1fr}.target-head55{align-items:stretch;flex-direction:column}.finance-row55{gap:8px}.finance-row55>div{border-top:1px solid #f0e8e3;padding-top:7px}.finance-row55>div:first-child{border-top:0;padding-top:0}}
 `;document.head.appendChild(s)}

 function targetOptions(selected=''){const services=(state.services||[]).filter(x=>x.active!==false).map(x=>`<option value="service:${x.id}" ${selected===`service:${x.id}`?'selected':''}>${escapeHtml(x.name)}</option>`).join('');const works=(state.works||[]).filter(x=>x.status!=='CANCELLED').map(x=>`<option value="work:${x.id}" ${selected===`work:${x.id}`?'selected':''}>${escapeHtml(x.title)}</option>`).join('');return`<option value="">Selecione</option><optgroup label="Trabalhos">${works}</optgroup><optgroup label="Consultas e serviços">${services}</optgroup>`}
 function person(i,name=''){return`<div class="person55"><label>Nome da pessoa ${i+1}<input data-person55 required value="${escapeHtml(name)}"></label><label>Data de nascimento<input data-birth55 type="date"></label></div>`}
 function target(i,selected=''){return`<div class="target55" data-target55><div class="target-head55"><b>${i?'Outro serviço/trabalho':'O que vamos cadastrar?'}</b>${i?'<button type="button" class="link-btn" data-remove-target55>Remover</button>':''}</div><select data-choice55>${targetOptions(selected)}</select><div class="grid55" data-target-detail55 hidden><label data-part55 hidden>Quanto deste pagamento vai para este item?<input type="number" min="0.01" step="0.01" data-part-amount55></label><label data-qty-box55>É inscrição de quantas pessoas?<input type="number" min="1" max="50" step="1" value="1" data-qty55></label></div><div class="people55" data-people55></div></div>`}

 async function clientPicker(select){select.hidden=true;const box=document.createElement('div');box.className='picker55';box.innerHTML='<input type="search" placeholder="Digite nome, telefone ou e-mail"><button type="button" class="link-btn" data-clear55>Limpar</button><div class="picker55-results" hidden></div>';select.after(box);const input=box.querySelector('input'),list=box.querySelector('.picker55-results');let timer;input.addEventListener('input',()=>{select.value='';select.dispatchEvent(new Event('change'));clearTimeout(timer);timer=setTimeout(async()=>{const q=input.value.trim();if(q.length<2){list.hidden=true;return}const r=await db.rpc('search_clients_v349',{p_query:q,p_status:null,p_limit:15,p_offset:0});if(r.error){toast(r.error.message,'error');return}list.innerHTML=(r.data||[]).map(c=>`<button type="button" data-client55="${c.id}" data-name55="${escapeHtml(c.full_name)}"><b>${escapeHtml(c.full_name)}</b><small>${escapeHtml(c.phone||c.email||'Sem telefone/e-mail')}</small></button>`).join('')||'<small style="display:block;padding:10px">Cliente não encontrado. Cadastre abaixo.</small>';list.hidden=false},180)});box.addEventListener('click',e=>{const pick=e.target.closest('[data-client55]');if(pick){select.innerHTML=`<option value="${pick.dataset.client55}" selected></option>`;select.value=pick.dataset.client55;input.value=pick.dataset.name55;list.hidden=true;select.dispatchEvent(new Event('change'))}if(e.target.closest('[data-clear55]')){select.innerHTML='<option value=""></option>';select.value='';input.value='';list.hidden=true;select.dispatchEvent(new Event('change'))}})}
 function syncTarget(t){const choice=t.querySelector('[data-choice55]').value,isWork=choice.startsWith('work:'),detail=t.querySelector('[data-target-detail55]'),qtyBox=t.querySelector('[data-qty-box55]'),people=t.querySelector('[data-people55]');detail.hidden=!choice;qtyBox.hidden=!isWork;if(!isWork){people.innerHTML='';return}const n=Math.max(1,Number(t.querySelector('[data-qty55]').value||1)),old=[...people.querySelectorAll('.person55')].map(x=>({name:x.querySelector('[data-person55]').value,birth:x.querySelector('[data-birth55]').value}));people.innerHTML=Array.from({length:n},(_,i)=>person(i,old[i]?.name||'')).join('');old.forEach((x,i)=>{const row=people.children[i];if(row&&x.birth)row.querySelector('[data-birth55]').value=x.birth})}
 function syncParts(form){const targets=[...form.querySelectorAll('[data-target55]')],multi=targets.length>1,total=Number(document.getElementById('paidAmount55').value||0);targets.forEach(t=>{const l=t.querySelector('[data-part55]');l.hidden=!multi;if(!multi)t.querySelector('[data-part-amount55]').value=total||''});const sum=targets.reduce((a,t)=>a+Number(t.querySelector('[data-part-amount55]').value||0),0),out=document.getElementById('sum55');out.classList.toggle('bad',Math.abs(sum-total)>.009);out.textContent=multi?`Distribuído: ${money(sum)} de ${money(total)}`:`Valor do lançamento: ${money(total)}`}

 paymentModal=async function(preselectedWorkId){openModal('Novo lançamento',`<form id="simpleForm55" class="simple55">
 <section class="question55"><span class="title55">Quem está pagando?</span><div class="sub55">Busque a cliente. Se ela não existir, preencha somente os dados abaixo.</div><select id="client55"><option value=""></option></select><div id="newClient55" class="grid55" style="margin-top:10px"><label class="wide55">Nome da nova cliente<input id="newName55"></label><label>Telefone<input id="newPhone55"></label><label>Data de nascimento<input id="newBirth55" type="date"></label></div></section>
 <section class="question55"><div id="targets55">${target(0,preselectedWorkId?`work:${preselectedWorkId}`:'')}</div><button type="button" class="link-btn" data-add-target55 style="margin-top:10px">+ Dividir com outro serviço ou trabalho</button></section>
 <section class="question55"><label for="paidAmount55">Pagou quanto?</label><input id="paidAmount55" type="number" min="0.01" step="0.01" required><div id="sum55" class="summary55" style="margin-top:10px">Valor do lançamento: R$ 0,00</div></section>
 <section class="question55"><label for="complete55">O pagamento está completo ou pendente?</label><select id="complete55"><option value="PAID">Completo</option><option value="PENDING">Pendente</option></select><div class="sub55">Completo registra o recebimento. Pendente mantém o valor em aberto.</div></section>
 <details><summary>Informações opcionais</summary><div class="grid55" style="margin-top:10px"><label>Como pagou?<input id="method55" placeholder="PIX, cartão, dinheiro…"></label><label>Data<input id="date55" type="datetime-local" value="${local()}"></label><label class="wide55">Observação<textarea id="notes55"></textarea></label></div></details>
 <div>${formActions('Registrar')}</div></form>`,true);bindCancel();const form=document.getElementById('simpleForm55'),client=document.getElementById('client55'),targets=document.getElementById('targets55');await clientPicker(client);const syncClient=()=>{const fresh=!client.value;document.getElementById('newClient55').hidden=!fresh;document.getElementById('newName55').required=fresh};client.addEventListener('change',syncClient);syncClient();syncTarget(targets.firstElementChild);syncParts(form);
 form.addEventListener('input',e=>{const t=e.target.closest('[data-target55]');if(t&&e.target.matches('[data-qty55]'))syncTarget(t);syncParts(form)});form.addEventListener('change',e=>{const t=e.target.closest('[data-target55]');if(t&&e.target.matches('[data-choice55]'))syncTarget(t);syncParts(form)});form.addEventListener('click',e=>{if(e.target.closest('[data-add-target55]')){targets.insertAdjacentHTML('beforeend',target(targets.children.length));syncParts(form)}const rm=e.target.closest('[data-remove-target55]');if(rm){rm.closest('[data-target55]').remove();syncParts(form)}});
 form.addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const clientId=client.value||null,newName=document.getElementById('newName55').value.trim();if(!clientId&&!newName){toast('Busque uma cliente ou informe o nome da nova cliente.','error');return}const gross=Number(document.getElementById('paidAmount55').value||0),rows=[...targets.querySelectorAll('[data-target55]')];if(gross<=0){toast('Informe quanto foi pago.','error');return}const items=rows.map(t=>{const [kind,id]=t.querySelector('[data-choice55]').value.split(':'),isWork=kind==='work',people=isWork?[...t.querySelectorAll('.person55')].map(p=>({name:p.querySelector('[data-person55]').value.trim(),birth_date:p.querySelector('[data-birth55]').value||null})):[];return{service_id:kind==='service'?id:null,work_id:isWork?id:null,responsible_member_id:isWork?byId(state.works,id)?.responsible_member_id:null,amount:Number(t.querySelector('[data-part-amount55]').value||0),quantity:isWork?people.length:1,sale_type:isWork?'TRABALHO':({CONSULTA:'CONSULTA',PERGUNTA:'PERGUNTA',MENSALIDADE:'MENSALIDADE'}[byId(state.services,id)?.category]||'OUTRO'),participants:people}});if(items.some(x=>!x.service_id&&!x.work_id)){toast('Escolha o que vamos cadastrar.','error');return}if(items.some(x=>x.work_id&&x.participants.some(p=>!p.name))){toast('Informe o nome de todas as pessoas inscritas.','error');return}const sum=items.reduce((a,x)=>a+x.amount,0);if(Math.abs(sum-gross)>.009){toast(`Distribua exatamente ${money(gross)} entre os itens.`,'error');return}const btn=form.querySelector('[type=submit]');btn.disabled=true;btn.textContent='Registrando…';const key=form.dataset.key||(form.dataset.key=uid()),r=await db.rpc('register_manual_entry_multi_v356',{p_idempotency_key:key,p_client_id:clientId,p_client_name:newName||null,p_client_phone:document.getElementById('newPhone55').value.trim()||null,p_client_email:null,p_client_birth_date:document.getElementById('newBirth55').value||null,p_gross_amount:gross,p_fees:0,p_payment_status:document.getElementById('complete55').value,p_payment_method:document.getElementById('method55').value.trim()||null,p_paid_at:new Date(document.getElementById('date55').value).toISOString(),p_notes:document.getElementById('notes55').value.trim()||null,p_items:items});if(r.error){btn.disabled=false;btn.textContent='Registrar';toast(r.error.message,'error');return}toast('Lançamento registrado com as inscrições e o financeiro.');closeModal();await loadReferenceData();await navigate('financeiro')})}

 async function financeRows(workId){const rq=await db.from('work_registrations').select('id,sale_id,participant_name,participant_birth_date,status,created_at,clients(full_name)').eq('work_id',workId).neq('status','CANCELLED').order('created_at');if(rq.error)throw rq.error;const regs=rq.data||[],saleIds=[...new Set(regs.map(r=>r.sale_id).filter(Boolean))];let alloc=[];if(saleIds.length){const aq=await db.from('payment_allocations').select('sale_id,amount,payments(id,status,gross_amount,payment_method,paid_at,created_at)').in('sale_id',saleIds);if(aq.error)throw aq.error;alloc=aq.data||[]}const bySale={};alloc.forEach(a=>(bySale[a.sale_id]||(bySale[a.sale_id]=[])).push(a));return regs.map(r=>{const matches=bySale[r.sale_id]||[],a=matches[0],p=a?.payments,count=Math.max(1,regs.filter(x=>x.sale_id===r.sale_id).length);return{...r,payer:r.clients?.full_name||'—',amount:a?Number(a.amount||0)/count:0,payment:p}})}
 function rowsHtml(rows){return rows.length?rows.map(r=>`<div class="finance-row55"><div><small>Inscrito</small><b>${escapeHtml(r.participant_name||r.payer)}</b>${r.participant_name&&r.payer!==r.participant_name?`<small>Pagador: ${escapeHtml(r.payer)}</small>`:''}</div><div><small>Inscrição</small><b>${dateTime(r.created_at)}</b></div><div><small>Pagamento</small><b>${r.payment?.paid_at?dateTime(r.payment.paid_at):'Ainda não pago'}</b></div><div><small>Valor</small><b>${money(r.amount)}</b><small>${escapeHtml(r.payment?.payment_method||'Forma não informada')}</small></div><div><small>Situação</small><b>${escapeHtml(status(r.payment?.status||r.status))}</b></div></div>`).join(''):'<div class="empty-state">Nenhuma pessoa inscrita neste trabalho.</div>'}
 async function enhanceWork(){const panel=document.querySelector('#modalRoot .work-registrations-panel');const workId=state.selectedWork?.id;if(!panel||!workId||panel.dataset.v55===workId)return;panel.dataset.v55=workId;panel.innerHTML='<div class="empty-state"><span class="spinner"></span>Carregando inscritos e pagamentos…</div>';try{const rows=await financeRows(workId);if(panel.dataset.v55!==workId)return;panel.innerHTML=`<div class="section-head"><div><h2>Inscritos e pagamentos</h2><p>Quem está inscrito, quando entrou e como está o pagamento.</p></div></div><div class="finance-list55">${rowsHtml(rows)}</div>`}catch(e){panel.innerHTML=`<div class="empty-state">${escapeHtml(e.message||'Erro ao carregar inscritos.')}</div>`}}
 function printable(title,rows){const body=rows.map(r=>`<tr><td>${escapeHtml(r.participant_name||r.payer)}</td><td>${civil(r.participant_birth_date)}</td><td>${dateTime(r.created_at)}</td><td>${r.payment?.paid_at?dateTime(r.payment.paid_at):'Pendente'}</td><td>${money(r.amount)}</td><td>${escapeHtml(r.payment?.payment_method||'—')}</td></tr>`).join('');return`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:A4;margin:12mm}body{font:12px Arial;color:#24110b}h1{color:#8f1717}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}</style></head><body><h1>${escapeHtml(title)}</h1><table><thead><tr><th>Inscrito</th><th>Nascimento</th><th>Inscrição</th><th>Pagamento</th><th>Valor</th><th>Forma</th></tr></thead><tbody>${body}</tbody></table></body></html>`}
 async function print55(workId){const win=window.open('','_blank');if(!win){toast('Permita a janela de impressão.','error');return}win.document.write('Preparando…');try{const rows=await financeRows(workId),work=byId(state.works,workId)||state.selectedWork||{};win.document.open();win.document.write(printable(work.title||'Trabalho',rows));win.document.close();setTimeout(()=>{win.focus();win.print()},250)}catch(e){win.close();toast(e.message,'error')}}
 const obs=new MutationObserver(()=>enhanceWork());function start(){styles();document.documentElement.dataset.sunshineVersion=VERSION;obs.observe(document.getElementById('modalRoot')||document.body,{childList:true,subtree:true})}document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start):start();
 window.addEventListener('click',e=>{const reg=e.target.closest('[data-v20-register],[data-action="new-registration"]');if(reg){e.preventDefault();e.stopImmediatePropagation();const workId=reg.dataset.v20Register||reg.dataset.id;closeModal();setTimeout(()=>paymentModal(workId),0);return}const pr=e.target.closest('[data-print-work]');if(pr){e.preventDefault();e.stopImmediatePropagation();print55(pr.dataset.printWork)}},true);
})();

;

/* ---- assets/v56.js ---- */
/* Sunshine v3.58 — lançamento manual sem burocracia: total, parcial, fiado e novas parcelas. */
(function(){
  const VERSION='v3.58';
  const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const uid=()=>crypto.randomUUID();
  const local=v=>{const d=v?new Date(v):new Date(),z=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`};
  const dateTime=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
  const practitioners=()=> (state.team||[]).filter(x=>x.is_practitioner&&x.active!==false);

  function styles(){
    if(document.getElementById('style56'))return;
    const s=document.createElement('style');
    s.id='style56';
    s.textContent=`
      .simple56{display:grid;gap:14px}.block56,.item56{border:1px solid #eadfd8;border-radius:15px;padding:14px;background:#fffaf6}.block56>h3,.item56 h3{margin:0 0 5px;font-size:17px}.help56{margin:0 0 11px;color:#806b62;font-size:13px;line-height:1.45}.grid56{display:grid;grid-template-columns:1fr 1fr;gap:10px}.grid56 label{display:grid;gap:5px}.wide56{grid-column:1/-1}.picker56{position:relative;display:grid;grid-template-columns:1fr auto;gap:7px}.picker-results56{position:absolute;z-index:450;top:100%;left:0;right:0;background:#fff;border:1px solid #dbc9bf;border-radius:12px;box-shadow:0 12px 28px #351d1528;max-height:270px;overflow:auto;padding:5px}.picker-results56[hidden]{display:none}.picker-results56 button{border:0;background:#fff;text-align:left;width:100%;padding:10px;border-radius:8px}.picker-results56 button:hover{background:#fff3ed}.picker-results56 small{display:block;color:#806b62;margin-top:2px}.new-client56{margin-top:10px}.new-client56 summary,.extra56 summary{cursor:pointer;color:#8f1717;font-weight:800}.items56{display:grid;gap:12px}.item-head56{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.amounts56{margin-top:10px}.quick56{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.quick56 button{border:1px solid #d9c6bb;background:#fff;border-radius:999px;padding:7px 10px;color:#6f4d41;font-weight:700}.quick56 button:hover{border-color:#f28a1b;background:#fff6ed}.people56{display:grid;gap:8px;margin-top:10px}.person56{display:grid;grid-template-columns:1.5fr 1fr;gap:8px}.status56{margin-top:10px;border-radius:12px;padding:11px 12px;background:#edf8ef;color:#245e31;font-weight:800}.status56.partial{background:#fff4d8;color:#755400}.status56.pending{background:#fdebea;color:#98251f}.status56.excess{background:#eef2ff;color:#344a90}.total56{border-radius:14px;padding:13px;background:#2f5f3a;color:#fff;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.total56 span{display:block;font-size:11px;opacity:.82}.total56 b{display:block;margin-top:3px;font-size:16px}.receipt-list56{display:grid;gap:8px}.receipt56{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border:1px solid #eadfd8;border-radius:12px;padding:11px 12px;background:#fff}.receipt56 small{display:block;color:#806b62;margin-top:3px}.detail-total56{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.detail-total56>div{border:1px solid #eadfd8;border-radius:12px;padding:11px;background:#fffaf6}.detail-total56 span{display:block;color:#806b62;font-size:11px}.detail-total56 b{display:block;margin-top:3px;font-size:16px}
      @media(max-width:720px){.grid56,.person56,.total56,.detail-total56{grid-template-columns:1fr}.item-head56{align-items:stretch;flex-direction:column}.item-head56 .link-btn{align-self:flex-end}.receipt56{align-items:stretch}.total56{gap:7px}.total56>div{border-top:1px solid #ffffff35;padding-top:7px}.total56>div:first-child{border-top:0;padding-top:0}}
    `;
    document.head.appendChild(s);
  }

  function options56(selected=''){
    const works=(state.works||[]).filter(x=>x.status!=='CANCELLED').map(x=>`<option value="work:${x.id}" ${selected===`work:${x.id}`?'selected':''}>${escapeHtml(x.title)}</option>`).join('');
    const services=(state.services||[]).filter(x=>x.active!==false).map(x=>`<option value="service:${x.id}" ${selected===`service:${x.id}`?'selected':''}>${escapeHtml(x.name)}</option>`).join('');
    return`<option value="">Selecione</option><optgroup label="Trabalhos">${works}</optgroup><optgroup label="Consultas e serviços">${services}</optgroup>`;
  }

  function responsibleOptions56(selected=''){
    return`<option value="">Automático</option>${practitioners().map(x=>`<option value="${x.id}" ${x.id===selected?'selected':''}>${escapeHtml(x.full_name)}</option>`).join('')}`;
  }

  function participant56(i,old={}){
    return`<div class="person56"><label>Nome da pessoa ${i+1}<input data-person56 value="${escapeHtml(old.name||'')}"></label><label>Nascimento <small>(opcional)</small><input type="date" data-birth56 value="${escapeHtml(old.birth||'')}"></label></div>`;
  }

  function item56(i,selected=''){
    return`<section class="item56" data-item56><div class="item-head56"><div><h3>${i?'Outro serviço ou trabalho':'O que vamos cadastrar?'}</h3><p class="help56">Escolha o item e informe o valor total e o que entrou agora.</p></div>${i?'<button type="button" class="link-btn" data-remove-item56>Remover</button>':''}</div><label>Serviço ou trabalho<select data-choice56>${options56(selected)}</select></label><div data-details56 hidden><div class="grid56 amounts56"><label data-qty-box56 hidden>É inscrição de quantas pessoas?<input data-qty56 type="number" min="1" max="50" step="1" value="1"></label><label>Valor total da contratação<input data-total56 type="number" min="0.01" step="0.01" inputmode="decimal"></label><label>Quanto entrou agora?<input data-received56 type="number" min="0" step="0.01" inputmode="decimal"></label></div><div class="quick56"><button type="button" data-mode56="all">Pagou tudo</button><button type="button" data-mode56="part">Pagou uma parte</button><button type="button" data-mode56="later">Vai pagar depois</button></div><div class="people56" data-people56></div><div class="status56" data-status56>Informe os valores.</div><details class="extra56" style="margin-top:10px"><summary>Responsável e observação</summary><div class="grid56" style="margin-top:9px"><label>Responsável<select data-responsible56>${responsibleOptions56()}</select></label><label>Observação deste item<input data-item-notes56></label></div></details></div></section>`;
  }

  async function picker56(select){
    select.hidden=true;
    const box=document.createElement('div');
    box.className='picker56';
    box.innerHTML='<input type="search" placeholder="Digite nome, telefone ou e-mail" autocomplete="off"><button type="button" class="link-btn" data-clear56>Limpar</button><div class="picker-results56" hidden></div>';
    select.after(box);
    const input=box.querySelector('input'),list=box.querySelector('.picker-results56');
    let timer;
    input.addEventListener('input',()=>{
      select.value='';select.dispatchEvent(new Event('change'));clearTimeout(timer);
      timer=setTimeout(async()=>{
        const q=input.value.trim();
        if(q.length<2){list.hidden=true;return}
        const r=await db.rpc('search_clients_v349',{p_query:q,p_status:null,p_limit:15,p_offset:0});
        if(r.error){toast(r.error.message,'error');return}
        list.innerHTML=(r.data||[]).map(c=>`<button type="button" data-client56="${c.id}" data-name56="${escapeHtml(c.full_name)}"><b>${escapeHtml(c.full_name)}</b><small>${escapeHtml(c.phone||c.email||'Sem telefone/e-mail')}</small></button>`).join('')||'<small style="display:block;padding:10px">Não encontramos. Use “Cadastrar cliente nova” abaixo.</small>';
        list.hidden=false;
      },180);
    });
    box.addEventListener('click',e=>{
      const pick=e.target.closest('[data-client56]');
      if(pick){select.innerHTML=`<option value="${pick.dataset.client56}" selected></option>`;select.value=pick.dataset.client56;input.value=pick.dataset.name56;list.hidden=true;select.dispatchEvent(new Event('change'))}
      if(e.target.closest('[data-clear56]')){select.innerHTML='<option value=""></option>';select.value='';input.value='';list.hidden=true;select.dispatchEvent(new Event('change'))}
    });
  }

  function inferResponsible56(kind,id){
    if(kind==='work')return byId(state.works,id)?.responsible_member_id||'';
    const recent=(state.sales||[]).filter(x=>x.service_id===id&&x.responsible_member_id&&x.source!=='IMPORT').sort((a,b)=>new Date(b.sold_at||b.created_at)-new Date(a.sold_at||a.created_at))[0];
    return recent?.responsible_member_id||(practitioners().length===1?practitioners()[0].id:'');
  }

  function defaultTotal56(kind,id,quantity){
    const row=kind==='work'?byId(state.works,id):byId(state.services,id);
    const unit=Number(kind==='work'?row?.unit_price:row?.default_price)||0;
    return kind==='work'?unit*Math.max(quantity,1):unit;
  }

  function syncPeople56(item){
    const choice=item.querySelector('[data-choice56]').value,[kind]=choice.split(':'),people=item.querySelector('[data-people56]');
    if(kind!=='work'){people.innerHTML='';return}
    const qty=Math.max(1,Number(item.querySelector('[data-qty56]').value||1));
    const old=[...people.querySelectorAll('.person56')].map(x=>({name:x.querySelector('[data-person56]').value,birth:x.querySelector('[data-birth56]').value}));
    people.innerHTML=Array.from({length:qty},(_,i)=>participant56(i,old[i])).join('');
  }

  function syncItem56(item,choiceChanged=false){
    const choice=item.querySelector('[data-choice56]').value,[kind,id]=choice.split(':'),details=item.querySelector('[data-details56]'),qty=item.querySelector('[data-qty56]'),qtyBox=item.querySelector('[data-qty-box56]'),total=item.querySelector('[data-total56]'),received=item.querySelector('[data-received56]'),responsible=item.querySelector('[data-responsible56]');
    details.hidden=!id;
    if(!id)return;
    qtyBox.hidden=kind!=='work';
    syncPeople56(item);
    const previousDefault=Number(item.dataset.default56||0),nextDefault=defaultTotal56(kind,id,Number(qty.value||1));
    const totalWasAutomatic=!total.value||Math.abs(Number(total.value)-previousDefault)<.009;
    const receivedWasAutomatic=!received.value||Math.abs(Number(received.value)-Number(total.value||0))<.009;
    if(nextDefault>0&&totalWasAutomatic)total.value=nextDefault.toFixed(2);
    if(nextDefault>0&&(choiceChanged||receivedWasAutomatic))received.value=Number(total.value||nextDefault).toFixed(2);
    item.dataset.default56=String(nextDefault);
    if(choiceChanged)responsible.value=inferResponsible56(kind,id);
    statusItem56(item);
  }

  function statusItem56(item){
    const out=item.querySelector('[data-status56]'),total=Number(item.querySelector('[data-total56]').value||0),received=Number(item.querySelector('[data-received56]').value||0);
    out.className='status56';
    if(total<=0){out.textContent='Informe o valor total.';return}
    if(received<=0){out.classList.add('pending');out.textContent=`Vai pagar depois · pendente ${money(total)}`;return}
    if(received+0.005<total){out.classList.add('partial');out.textContent=`Pagamento parcial · recebeu ${money(received)} · falta ${money(total-received)}`;return}
    if(received>total+0.005){out.classList.add('excess');out.textContent=`Pago com diferença de ${money(received-total)} a maior`;return}
    out.textContent=`Pagamento completo · ${money(received)}`;
  }

  function summary56(form){
    const items=[...form.querySelectorAll('[data-item56]')],contracted=items.reduce((s,x)=>s+Number(x.querySelector('[data-total56]').value||0),0),received=items.reduce((s,x)=>s+Number(x.querySelector('[data-received56]').value||0),0),pending=Math.max(contracted-received,0),out=document.getElementById('total56');
    out.innerHTML=`<div><span>Total contratado</span><b>${money(contracted)}</b></div><div><span>Entrou agora</span><b>${money(received)}</b></div><div><span>Ficou pendente</span><b>${money(pending)}</b></div>`;
    document.getElementById('paymentDetails56').hidden=received<=0;
  }

  paymentModal=async function(preselectedWorkId){
    openModal('Novo lançamento',`<form id="simpleForm56" class="simple56"><section class="block56"><h3>1. Quem é a cliente?</h3><p class="help56">Busque antes de cadastrar. Assim o histórico fica no mesmo perfil.</p><select id="client56"><option value=""></option></select><details id="newClient56" class="new-client56"><summary>Cliente nova? Cadastrar somente o essencial</summary><div class="grid56" style="margin-top:10px"><label class="wide56">Nome<input id="newName56"></label><label>Telefone <small>(opcional)</small><input id="newPhone56"></label><label>Nascimento <small>(opcional)</small><input id="newBirth56" type="date"></label></div></details></section><section class="block56"><div id="items56" class="items56">${item56(0,preselectedWorkId?`work:${preselectedWorkId}`:'')}</div><button type="button" class="link-btn" data-add-item56 style="margin-top:11px">+ Adicionar outro serviço ou trabalho</button></section><div id="total56" class="total56"></div><details id="paymentDetails56" class="block56"><summary><b>Como pagou e quando?</b> <span class="help56">(opcional)</span></summary><div class="grid56" style="margin-top:10px"><label>Forma<input id="method56" placeholder="PIX, cartão, dinheiro…"></label><label>Data<input id="date56" type="datetime-local" value="${local()}"></label><label class="wide56">Observação geral<textarea id="notes56"></textarea></label></div></details><div>${formActions('Registrar lançamento')}</div></form>`,true);
    bindCancel();
    const form=document.getElementById('simpleForm56'),client=document.getElementById('client56'),items=document.getElementById('items56');
    await picker56(client);
    const syncClient=()=>{const n=document.getElementById('newClient56');n.hidden=!!client.value;if(client.value)n.open=false};
    client.addEventListener('change',syncClient);syncClient();
    syncItem56(items.firstElementChild,true);summary56(form);
    form.addEventListener('input',e=>{const item=e.target.closest('[data-item56]');if(item){if(e.target.matches('[data-qty56]'))syncItem56(item);else statusItem56(item)}summary56(form)});
    form.addEventListener('change',e=>{const item=e.target.closest('[data-item56]');if(item&&e.target.matches('[data-choice56]'))syncItem56(item,true);summary56(form)});
    form.addEventListener('click',e=>{
      if(e.target.closest('[data-add-item56]')){items.insertAdjacentHTML('beforeend',item56(items.children.length));summary56(form)}
      const rm=e.target.closest('[data-remove-item56]');if(rm){rm.closest('[data-item56]').remove();summary56(form)}
      const mode=e.target.closest('[data-mode56]');if(mode){const item=mode.closest('[data-item56]'),total=item.querySelector('[data-total56]'),received=item.querySelector('[data-received56]');if(mode.dataset.mode56==='all')received.value=total.value||'';if(mode.dataset.mode56==='later')received.value='0.00';if(mode.dataset.mode56==='part'){received.value='';received.focus()}statusItem56(item);summary56(form)}
    });
    form.addEventListener('submit',async e=>{
      e.preventDefault();if(!requireReal())return;
      const clientId=client.value||null,newName=document.getElementById('newName56').value.trim();
      if(!clientId&&!newName){toast('Busque uma cliente existente ou abra “Cliente nova” e informe o nome.','error');return}
      const rows=[...items.querySelectorAll('[data-item56]')],payload=[];
      for(const item of rows){
        const [kind,id]=item.querySelector('[data-choice56]').value.split(':'),isWork=kind==='work',total=Number(item.querySelector('[data-total56]').value||0),received=Number(item.querySelector('[data-received56]').value||0),people=isWork?[...item.querySelectorAll('.person56')].map(p=>({name:p.querySelector('[data-person56]').value.trim(),birth_date:p.querySelector('[data-birth56]').value||null})):[];
        if(!id){toast('Escolha o que vamos cadastrar em todos os itens.','error');return}
        if(total<=0){toast('Informe o valor total de cada contratação.','error');return}
        if(received<0){toast('O valor pago não pode ser negativo.','error');return}
        if(isWork&&(!people.length||people.some(p=>!p.name))){toast('Informe o nome de todas as pessoas inscritas.','error');return}
        payload.push({service_id:isWork?null:id,work_id:isWork?id:null,responsible_member_id:item.querySelector('[data-responsible56]').value||inferResponsible56(kind,id)||null,total_amount:total,received_amount:received,quantity:isWork?people.length:1,participants:people,notes:item.querySelector('[data-item-notes56]').value.trim()||null});
      }
      const receivedTotal=payload.reduce((s,x)=>s+x.received_amount,0),contracted=payload.reduce((s,x)=>s+x.total_amount,0),pending=Math.max(contracted-receivedTotal,0),btn=form.querySelector('button[type=submit]');
      btn.disabled=true;btn.textContent='Registrando…';
      const key=form.dataset.key||(form.dataset.key=uid()),date=document.getElementById('date56').value;
      const r=await db.rpc('register_manual_sale_v358',{p_idempotency_key:key,p_client_id:clientId,p_client_name:newName||null,p_client_phone:document.getElementById('newPhone56').value.trim()||null,p_client_email:null,p_client_birth_date:document.getElementById('newBirth56').value||null,p_received_total:receivedTotal,p_payment_method:receivedTotal>0?document.getElementById('method56').value.trim()||null:null,p_paid_at:date?new Date(date).toISOString():new Date().toISOString(),p_notes:document.getElementById('notes56').value.trim()||null,p_items:payload});
      if(r.error){btn.disabled=false;btn.textContent='Registrar lançamento';toast(r.error.message,'error');return}
      const message=receivedTotal<=0?`Cadastro feito. Ficou ${money(contracted)} pendente; nenhum recebimento ou comissão foi criado.`:pending>0?`Recebemos ${money(receivedTotal)} e ficou ${money(pending)} pendente.`:`Lançamento completo de ${money(receivedTotal)} registrado.`;
      toast(message);closeModal();await loadReferenceData();await navigate('financeiro');
    });
  };

  async function saleData56(saleId){
    const [sq,aq]=await Promise.all([
      db.from('sales').select('id,total_amount,status,client_id,service_id,work_id,clients(full_name),services(name),works(title)').eq('id',saleId).single(),
      db.from('payment_allocations').select('amount,payments(id,status,source,payment_method,paid_at,created_at)').eq('sale_id',saleId)
    ]);
    if(sq.error)throw sq.error;if(aq.error)throw aq.error;
    const receipts=(aq.data||[]).filter(x=>x.payments?.status==='PAID').sort((a,b)=>new Date(b.payments.paid_at||b.payments.created_at)-new Date(a.payments.paid_at||a.payments.created_at));
    const total=Number(sq.data.total_amount||0),received=receipts.reduce((s,x)=>s+Number(x.amount||0),0);
    return{sale:sq.data,receipts,total,received,remaining:Math.max(total-received,0)};
  }

  async function detail56(saleId){
    openModal('Venda e recebimentos','<div class="empty-state"><span class="spinner"></span>Carregando…</div>',true);
    try{
      const d=await saleData56(saleId),label=d.sale.works?.title||d.sale.services?.name||'Serviço',receipts=d.receipts.length?d.receipts.map(x=>`<div class="receipt56"><div><b>${escapeHtml(x.payments.source==='ASAAS'?'Asaas':'Manual')} · ${escapeHtml(x.payments.payment_method||'Forma não informada')}</b><small>${dateTime(x.payments.paid_at||x.payments.created_at)}</small></div><b>${money(x.amount)}</b></div>`).join(''):'<div class="empty-state compact">Ainda não houve pagamento.</div>';
      openModal('Venda e recebimentos',`<div class="simple56"><div><b>${escapeHtml(d.sale.clients?.full_name||'Cliente')}</b><div class="help56">${escapeHtml(label)}</div></div><div class="detail-total56"><div><span>Contratado</span><b>${money(d.total)}</b></div><div><span>Recebido</span><b>${money(d.received)}</b></div><div><span>Falta</span><b>${money(d.remaining)}</b></div></div><div><h3>Histórico</h3><div class="receipt-list56">${receipts}</div></div>${d.remaining>.005?`<button type="button" class="btn" data-receive56="${saleId}">+ Registrar parcela / recebimento</button>`:'<div class="status56">Pagamento completo</div>'}</div>`,true);
    }catch(e){openModal('Venda e recebimentos',`<div class="empty-state error">${escapeHtml(e.message||'Não foi possível carregar a venda.')}</div>`,true)}
  }

  async function receipt56(saleId){
    try{
      const d=await saleData56(saleId);if(d.remaining<=.005){toast('Esta venda já está totalmente paga.');return}
      const label=d.sale.works?.title||d.sale.services?.name||'Serviço';
      openModal('Registrar parcela / recebimento',`<form id="receiptForm56" class="simple56"><section class="block56"><h3>${escapeHtml(d.sale.clients?.full_name||'Cliente')}</h3><p class="help56">${escapeHtml(label)} · total ${money(d.total)} · recebido ${money(d.received)}</p><div class="status56 partial">Falta ${money(d.remaining)}</div></section><section class="block56"><div class="grid56"><label>Quanto recebeu agora?<input id="receiptAmount56" type="number" min="0.01" max="${d.remaining.toFixed(2)}" step="0.01" value="${d.remaining.toFixed(2)}" required></label><label>Como pagou? <small>(opcional)</small><input id="receiptMethod56" placeholder="PIX, cartão, dinheiro…"></label><label>Data<input id="receiptDate56" type="datetime-local" value="${local()}"></label><label>Observação <small>(opcional)</small><input id="receiptNotes56"></label></div></section><div>${formActions('Registrar recebimento')}</div></form>`,true);bindCancel();
      document.getElementById('receiptForm56').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button[type=submit]'),amount=Number(document.getElementById('receiptAmount56').value||0),date=document.getElementById('receiptDate56').value;if(amount<=0||amount>d.remaining+.005){toast(`Informe um valor entre R$ 0,01 e ${money(d.remaining)}.`,'error');return}btn.disabled=true;btn.textContent='Registrando…';const r=await db.rpc('record_sale_receipt',{p_sale_id:saleId,p_amount:amount,p_paid_at:new Date(date).toISOString(),p_competence_date:date.slice(0,10),p_payment_method:document.getElementById('receiptMethod56').value.trim()||null,p_notes:document.getElementById('receiptNotes56').value.trim()||null});if(r.error){btn.disabled=false;btn.textContent='Registrar recebimento';toast(r.error.message,'error');return}const remaining=Number(r.data?.remaining||0);toast(remaining>.005?`Recebimento registrado. Ainda falta ${money(remaining)}.`:'Recebimento registrado. Venda quitada.');closeModal();await loadReferenceData();await navigate('financeiro')});
    }catch(e){toast(e.message||'Não foi possível abrir o recebimento.','error')}
  }

  function pin56(){
    document.documentElement.dataset.sunshineVersion=VERSION;
    document.documentElement.dataset.sunshineBuild=VERSION;
    const meta=document.querySelector('meta[name="sunshine-version"]');if(meta)meta.content=VERSION;
    const n=document.querySelector('.sidebar-version-current');if(n)n.innerHTML=`<span class="dot"></span> Ecossistema Sunshine · ${VERSION}`;
  }

  function start56(){styles();pin56()}
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start56):start56();
  window.addEventListener('click',e=>{
    const detail=e.target.closest('[data-fin-detail49]');if(detail){e.preventDefault();e.stopImmediatePropagation();detail56(detail.dataset.finDetail49);return}
    const receive=e.target.closest('[data-receive56]');if(receive){e.preventDefault();e.stopImmediatePropagation();receipt56(receive.dataset.receive56)}
  },true);
})();

;

/* ---- assets/v57.js ---- */
/* Sunshine v3.60 — associação definitiva de clientes existentes em pagamentos Asaas. */
(function(){
  const VERSION='v3.60';
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const digits=v=>String(v||'').replace(/\D/g,'');

  function matchesClient(c,q){
    const text=norm(q), num=digits(q);
    if(!text)return false;
    if(norm(c.full_name).includes(text))return true;
    if(norm(c.preferred_name).includes(text))return true;
    if(norm(c.email).includes(text))return true;
    return num.length>=2 && digits(c.phone).includes(num);
  }

  function localSearch(q,limit=15,offset=0){
    const all=[...(state.clients||[])].filter(c=>matchesClient(c,q)).sort((a,b)=>String(a.full_name||'').localeCompare(String(b.full_name||''),'pt-BR'));
    return all.slice(offset,offset+limit).map(c=>({
      id:c.id,full_name:c.full_name,preferred_name:c.preferred_name||null,phone:c.phone||null,email:c.email||null,
      status:c.status||null,birth_date:c.birth_date||null,total_count:all.length
    }));
  }

  function patchSearchRpc(){
    if(!db||db.__sunshineSearch360)return;
    db.__sunshineSearch360=true;
    const original=db.rpc.bind(db);
    db.rpc=async function(fn,args={},options){
      if(fn!=='search_clients_v349')return original(fn,args,options);
      const q=String(args?.p_query||'').trim();
      if(q.length<2)return original(fn,args,options);
      const limit=Math.min(Math.max(Number(args?.p_limit||15),1),50);
      const offset=Math.max(Number(args?.p_offset||0),0);
      try{
        const res=await original(fn,args,options);
        if(res?.error)return res;
        const filtered=(res?.data||[]).filter(c=>matchesClient(c,q));
        if(filtered.length)return {...res,data:filtered};
        const fallback=localSearch(q,limit,offset);
        if(fallback.length || (res?.data||[]).length)return {...res,data:fallback};
        return res;
      }catch(e){
        const fallback=localSearch(q,limit,offset);
        if(fallback.length)return {data:fallback,error:null};
        throw e;
      }
    };
  }

  function findPicker(select){
    const next=select?.nextElementSibling;
    if(next?.classList?.contains('client-picker49'))return next;
    return select?.parentElement?.querySelector('.client-picker49')||select?.closest('form')?.querySelector(`.client-picker49[data-picker-for49="${select?.id||''}"]`)||null;
  }

  function decorateAsaasForm(form){
    if(!form)return;
    const select=form.querySelector('#agClient,#arClient');
    if(!select)return;

    form.querySelectorAll('.asaas-beneficiary47').forEach(el=>{el.hidden=true;el.style.display='none';});
    const picker=findPicker(select);
    if(!picker)return;
    const input=picker.querySelector('input[type="search"]');
    if(!input)return;

    if(!picker.querySelector('[data-association-help360]')){
      const help=document.createElement('div');
      help.dataset.associationHelp359='1';
      help.style.gridColumn='1/-1';
      help.style.fontSize='12px';
      help.style.lineHeight='1.45';
      help.style.color='#6f5a50';
      help.style.marginTop='2px';
      help.innerHTML='<b>Cliente já cadastrado:</b> digite nome, nome preferido, telefone ou e-mail e toque na pessoa correta. O cadastro do pagador não substitui o cadastro da cliente.';
      picker.appendChild(help);
    }

    let status=picker.parentElement?.querySelector('[data-association-status360]');
    if(!status){
      status=document.createElement('div');
      status.dataset.associationStatus359='1';
      status.style.marginTop='8px';
      status.style.padding='9px 11px';
      status.style.borderRadius='10px';
      status.style.fontSize='12px';
      status.style.fontWeight='800';
      picker.insertAdjacentElement('afterend',status);
    }

    const sync=()=>{
      const c=(state.clients||[]).find(x=>x.id===select.value);
      if(c){
        status.textContent=`Associar a: ${c.full_name}`;
        status.style.background='#eaf5ef';status.style.color='#256044';
      }else if(input.value.trim().length>=2){
        status.textContent='Nome digitado, mas nenhuma cliente foi selecionada. Toque no resultado correto antes de concluir.';
        status.style.background='#fff3d7';status.style.color='#875100';
      }else{
        status.textContent='Pesquise e selecione a cliente que receberá este pagamento.';
        status.style.background='#fff3d7';status.style.color='#875100';
      }
    };
    if(!picker.dataset.sync360){
      picker.dataset.sync360='1';
      input.addEventListener('input',sync);
      select.addEventListener('change',sync);
    }
    sync();

    if(!form.dataset.guard360){
      form.dataset.guard360='1';
      form.addEventListener('submit',e=>{
        const typed=input.value.trim();
        if(typed.length>=2 && !select.value){
          e.preventDefault();
          e.stopImmediatePropagation();
          toast('Selecione a cliente na lista antes de concluir. O sistema não vai criar outro cadastro a partir apenas do nome digitado.','error');
          input.focus();
        }
      },true);
    }
  }

  function run(){
    patchSearchRpc();
    decorateAsaasForm(document.getElementById('asaasGlobalResolveForm'));
    decorateAsaasForm(document.getElementById('asaasResolveForm'));
  }

  function pinVersion(){
    document.documentElement.dataset.sunshineVersion=VERSION;
    document.querySelectorAll('.sidebar-version-current').forEach(el=>{el.innerHTML='<span class="dot"></span> Ecossistema Sunshine · v3.60';});
  }

  const obs=new MutationObserver(()=>{run();pinVersion();});
  obs.observe(document.body,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{run();pinVersion();});else{run();pinVersion();}
})();

;
