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
