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
