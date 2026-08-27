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
