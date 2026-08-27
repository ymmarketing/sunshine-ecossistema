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
