/* Sunshine v3.38 — parcelamentos Asaas aparecem como um único pagamento operacional */
(function(){
  let observer38=null;
  let busy38=false;
  let timer38=null;
  let cache38=[];
  let lastPaint38='';

  const digits38=v=>String(v||'').replace(/\D/g,'');
  const last11_38=v=>digits38(v).slice(-11);
  const installmentId38=e=>e?.payment_snapshot?.installment||null;
  const method38=v=>({CREDIT_CARD:'Cartão',PIX:'PIX',BOLETO:'Boleto'}[v]||v||'Pagamento');
  const setText38=(el,v)=>{if(el&&el.textContent!==String(v))el.textContent=String(v);};

  function ensureStyles38(){
    if(document.getElementById('sunshineV38Styles'))return;
    const st=document.createElement('style');st.id='sunshineV38Styles';st.textContent=`
      .installment-pill38{display:inline-flex;align-items:center;border-radius:999px;padding:5px 8px;background:#fff3d7;color:#745600;font-size:10px;font-weight:800}
      .installment-info38{border:1px solid #eed7b4;background:#fff8ed;border-radius:14px;padding:12px 14px;margin-bottom:12px}.installment-info38 b{display:block;color:#5b2e20}.installment-info38 span{display:block;margin-top:4px;color:#806b62;font-size:12px;line-height:1.45}
      .installment-summary38{border:1px solid #eadbd1;background:#fffaf6;border-radius:12px;padding:10px 12px;font-size:12px;color:#715d54}.installment-summary38 b{color:#3c2017}
    `;document.head.appendChild(st);
  }

  function matchClient38(e){
    const doc=digits38(e.customer_document),email=String(e.customer_email||'').trim().toLowerCase(),phone=last11_38(e.customer_mobile_phone||e.customer_phone);
    return (state.clients||[]).find(c=>e.asaas_customer_id&&c.asaas_customer_id===e.asaas_customer_id)
      ||(state.clients||[]).find(c=>doc&&digits38(c.document_number)===doc)
      ||(state.clients||[]).find(c=>email&&String(c.email||'').trim().toLowerCase()===email)
      ||(state.clients||[]).find(c=>phone&&last11_38(c.phone)===phone)
      ||null;
  }

  function groups38(entries){
    const map=new Map();
    entries.forEach(e=>{
      const inst=installmentId38(e),key=inst?`installment:${inst}`:`payment:${e.id}`;
      if(!map.has(key))map.set(key,{key,installment:inst,entries:[]});
      map.get(key).entries.push(e);
    });
    return [...map.values()].map(g=>({...g,first:g.entries[0],total:g.entries.reduce((s,e)=>s+Number(e.gross_amount||0),0),net:g.entries.reduce((s,e)=>s+Number(e.net_amount||0),0),isInstallment:Boolean(g.installment&&g.entries.length>1)})).sort((a,b)=>new Date(b.first.received_at)-new Date(a.first.received_at));
  }

  async function load38(){
    if(state.demo||!db||!state.session)return [];
    const q=await db.from('asaas_incoming_payments').select('*').in('classification_status',['PENDING','REVIEW']).order('received_at',{ascending:false}).limit(250);
    if(q.error)throw q.error;
    cache38=groups38(q.data||[]);return cache38;
  }

  function queueCard38(g){
    const e=g.first,match=matchClient38(e);
    const contact=[e.customer_email,e.customer_mobile_phone||e.customer_phone,e.customer_document].filter(Boolean).join(' · ');
    const action=g.isInstallment?`data-resolve-installment38="${escapeHtml(g.installment)}"`:`data-asaas-resolve-global="${e.id}"`;
    return `<article class="asaas-queue-card"><div class="asaas-queue-top"><div><b>${escapeHtml(e.customer_name||'Cliente não identificado')}</b><span>${escapeHtml(contact||'Dados cadastrais serão confirmados na associação')}</span></div><strong>${fmtMoney(g.total)}</strong></div><div class="asaas-queue-meta"><span>${fmtDateTime(e.payment_date||e.received_at)}</span><span>${g.isInstallment?`Cartão · ${g.entries.length}x`:escapeHtml(method38(e.billing_type))}</span>${g.isInstallment?'<span class="installment-pill38">1 PAGAMENTO COMPLETO</span>':''}${match?`<span class="pill gold">Cliente: ${escapeHtml(match.full_name)}</span>`:'<span class="pill red">Cliente a confirmar</span>'}</div><button type="button" class="btn" ${action}>${g.isInstallment?'Associar pagamento completo':'Associar cliente e serviço'}</button></article>`;
  }

  function paintGlobal38(gs){
    const count=gs.length,total=gs.reduce((s,g)=>s+g.total,0);
    const signature=gs.map(g=>`${g.key}:${g.entries.length}:${g.total}`).join('|');
    const bell=document.getElementById('asaasBellCount');if(bell){setText38(bell,count);if(bell.hidden!==(count===0))bell.hidden=count===0;}
    const bar=document.getElementById('globalAsaasPendingBar');
    if(bar&&count){
      const strong=bar.querySelector('strong'),copy=bar.querySelectorAll('.asaas-global-bar-copy>span');
      const title=count===1?(gs[0].isInstallment?`${gs[0].first.customer_name||'Cliente'} · pagamento parcelado`:(gs[0].first.customer_name||'Cliente não identificado')):`${count} pagamentos aguardando associação`;
      const line=`Total pendente de classificação: ${fmtMoney(total)}. ${gs.some(g=>g.isInstallment)?'Parcelas do mesmo cartão são agrupadas em um único pagamento.':''}`;
      setText38(strong,title);setText38(copy[1],line);
    }
    const list=document.querySelector('#asaasGlobalOverlay .asaas-queue-list');
    if(list&&list.dataset.groupSignature38!==signature){list.dataset.groupSignature38=signature;list.innerHTML=gs.map(queueCard38).join('');}
    const summary=document.querySelector('#asaasGlobalOverlay .asaas-queue-summary');
    if(summary){const values=summary.querySelectorAll('div b');setText38(values[0],count);setText38(values[1],fmtMoney(total));}
    const foot=document.querySelector('.sidebar-foot');if(foot&&!/v3\.38/.test(foot.textContent||''))foot.innerHTML='<span class="dot"></span> Ecossistema Sunshine · v3.38';
    lastPaint38=signature;
  }

  async function refresh38(){
    if(busy38)return;busy38=true;
    try{ensureStyles38();const gs=await load38();paintGlobal38(gs);}catch(e){console.error('v38 pending groups',e);}finally{busy38=false;}
  }
  function schedule38(delay=180){clearTimeout(timer38);timer38=setTimeout(refresh38,delay);}

  function serviceOptions38(){return '<option value="">Selecione</option>'+(state.services||[]).filter(x=>x.active!==false).map(s=>`<option value="${s.id}">${escapeHtml(s.name)}${Number(s.default_price||0)>0?` · ${fmtMoney(s.default_price)}`:''}</option>`).join('');}
  function workOptions38(){return '<option value="">Selecione</option>'+(state.works||[]).filter(x=>x.status!=='CANCELLED').map(w=>`<option value="${w.id}">${escapeHtml(w.title)}${Number(w.unit_price||0)>0?` · ${fmtMoney(w.unit_price)}`:''}</option>`).join('');}

  function expected38(form,total){
    const sid=form.querySelector('#i38Service')?.value,wid=form.querySelector('#i38Work')?.value;
    const service=byId(state.services||[],sid),work=byId(state.works||[],wid),normal=Number(work?.unit_price||service?.default_price||0),box=form.querySelector('#i38Expected');if(!box)return;
    if(!normal){box.innerHTML=`Recebido: <b>${fmtMoney(total)}</b>. Se o serviço não tiver valor padrão, o sistema usará o recebido como valor da venda.`;return;}
    const diff=Math.max(total-normal,0);box.innerHTML=`Valor do serviço: <b>${fmtMoney(normal)}</b> · Recebido: <b>${fmtMoney(total)}</b>${diff>0?` · Diferença recebida: <b>${fmtMoney(diff)}</b>`:''}. Comissão sobre <b>${fmtMoney(total)}</b>.`;
  }

  async function openInstallment38(id){
    let g=cache38.find(x=>x.installment===id);if(!g){await refresh38();g=cache38.find(x=>x.installment===id);}
    if(!g||!g.isInstallment){toast('Este parcelamento não está mais pendente.','error');return;}
    const sheet=document.querySelector('#asaasGlobalOverlay .asaas-global-sheet');if(!sheet){toast('Abra novamente a fila de pagamentos.','error');return;}
    const e=g.first,match=matchClient38(e);
    sheet.innerHTML=`<div class="asaas-sheet-head"><div><span class="eyebrow">Pagamento recebido</span><h2>${escapeHtml(e.customer_name||'Cliente')}</h2><p><b>${fmtMoney(g.total)}</b> · cartão em ${g.entries.length}x</p></div><button class="icon-btn" type="button" data-asaas-back-queue aria-label="Voltar">←</button></div><div class="installment-info38"><b>As ${g.entries.length} parcelas serão tratadas como um único pagamento.</b><span>O Asaas continua guardando cada parcela no histórico técnico, mas você associa apenas o total de ${fmtMoney(g.total)} à venda/consulta.</span></div><form id="asaasInstallmentForm38" class="form-grid"><div class="span-2 soft-box"><h3>1. Quem pagou?</h3><p>O telefone também é comparado pelos últimos 11 dígitos, então números com +55 são reconhecidos corretamente.</p></div><label class="span-2">Cliente existente<select id="i38Client">${optionList(state.clients,'full_name',match?.id||'')}</select></label><div class="span-2 form-divider">ou confirmar dados para criar/completar Cliente 360</div><label class="span-2">Nome<input id="i38Name" value="${escapeHtml(e.customer_name||'')}"></label><label>Telefone<input id="i38Phone" value="${escapeHtml(e.customer_mobile_phone||e.customer_phone||'')}"></label><label>E-mail<input id="i38Email" type="email" value="${escapeHtml(e.customer_email||'')}"></label><label>CPF/CNPJ<input id="i38Document" value="${escapeHtml(e.customer_document||'')}"></label><label>Nascimento<input id="i38Birth" type="date"></label><div class="span-2 soft-box"><h3>2. O que foi pago?</h3><p>Selecione a consulta, serviço ou trabalho. O valor recebido pode ser maior que o valor padrão e não gera crédito.</p></div><label>Serviço<select id="i38Service">${serviceOptions38()}</select></label><label>Trabalho<select id="i38Work">${workOptions38()}</select></label><label>Responsável<select id="i38Responsible" required>${optionList(state.team.filter(x=>x.is_practitioner),'full_name')}</select></label><label>Valor recebido<input value="${g.total.toFixed(2)}" disabled></label><div id="i38Expected" class="span-2 installment-summary38">Selecione o serviço ou trabalho para conferir os valores.</div><label class="span-2">Observação<textarea id="i38Notes" rows="2" placeholder="Opcional"></textarea></label><div class="span-2 asaas-resolve-actions"><button type="button" class="btn ghost" data-asaas-back-queue>Voltar</button><button type="submit" class="btn">Associar ${fmtMoney(g.total)}</button></div></form>`;
    const form=sheet.querySelector('#asaasInstallmentForm38'),client=form.querySelector('#i38Client');
    const toggle=()=>{const existing=Boolean(client.value);['i38Name','i38Phone','i38Email','i38Document','i38Birth'].forEach(k=>{const el=form.querySelector('#'+k);if(el)el.disabled=existing;});};client.addEventListener('change',toggle);toggle();
    form.querySelector('#i38Service').addEventListener('change',()=>{if(form.querySelector('#i38Service').value)form.querySelector('#i38Work').value='';expected38(form,g.total);});
    form.querySelector('#i38Work').addEventListener('change',()=>{if(form.querySelector('#i38Work').value)form.querySelector('#i38Service').value='';expected38(form,g.total);});
    form.addEventListener('submit',async ev=>{
      ev.preventDefault();if(!requireReal())return;
      const existing=client.value||null,name=form.querySelector('#i38Name').value.trim(),service=form.querySelector('#i38Service').value||null,work=form.querySelector('#i38Work').value||null,responsible=form.querySelector('#i38Responsible').value||null;
      if(!existing&&!name){toast('Falta confirmar o cliente para concluir.','error');return;}
      if(!existing&&digits38(form.querySelector('#i38Phone').value).length<8){toast('Falta o telefone do novo cliente para concluir.','error');return;}
      if(!service&&!work){toast('Falta selecionar a consulta, serviço ou trabalho para concluir.','error');return;}
      if(!responsible){toast('Falta definir o responsável para calcular a comissão.','error');return;}
      const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Associando pagamento completo…';
      const {data,error}=await db.rpc('resolve_asaas_installment_group',{p_installment_id:id,p_client_id:existing,p_client_name:name||null,p_client_phone:form.querySelector('#i38Phone').value.trim()||null,p_client_email:form.querySelector('#i38Email').value.trim()||null,p_client_birth_date:form.querySelector('#i38Birth').value||null,p_document_number:form.querySelector('#i38Document').value.trim()||null,p_service_id:service,p_work_id:work,p_responsible_member_id:responsible,p_notes:form.querySelector('#i38Notes').value.trim()||null});
      btn.disabled=false;btn.textContent=`Associar ${fmtMoney(g.total)}`;
      if(error){toast(error.message||'Não foi possível associar o parcelamento.','error');return;}
      await loadReferenceData();document.getElementById('asaasGlobalOverlay')?.remove();const diff=Number(data?.retained_excess_amount||0);
      toast(diff>0?`${g.entries.length} parcelas consolidadas em ${fmtMoney(g.total)}. Diferença de ${fmtMoney(diff)} recebida sem gerar crédito.`:`${g.entries.length} parcelas consolidadas em um pagamento de ${fmtMoney(g.total)}.`);
      if(window.refreshAsaasBell)await window.refreshAsaasBell();await render();lastPaint38='';schedule38(250);
    });
  }

  document.addEventListener('click',e=>{const btn=e.target.closest('[data-resolve-installment38]');if(btn){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openInstallment38(btn.dataset.resolveInstallment38);}},true);

  function start38(){ensureStyles38();schedule38(350);if(observer38)return;observer38=new MutationObserver(()=>schedule38(260));observer38.observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start38);else start38();
})();
