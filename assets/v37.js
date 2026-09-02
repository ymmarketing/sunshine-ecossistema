/* Sunshine v3.37 — parcela do Asaas completa a mesma venda */
(function(){
  let lastEntry37='';
  let openSales37=[];
  let decorating37=false;

  function moneyN37(v){return Number(v||0);}
  function saleLabel37(s){
    const service=byId(state.services||[],s.service_id);
    const work=byId(state.works||[],s.work_id);
    return service?.name||work?.title||String(s.sale_type||'Venda').replaceAll('_',' ');
  }
  function ensureStyles37(){
    if(document.getElementById('sunshineV37Styles'))return;
    const st=document.createElement('style');st.id='sunshineV37Styles';st.textContent=`
      .asaas-sale-mode37{border:1px solid #e4d3c8;border-radius:14px;padding:13px;background:#fffaf6;display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:2px 0}
      .asaas-sale-mode37 h3{margin:0 0 2px;font-size:14px}.asaas-sale-mode37 p{margin:0;color:#806b62;font-size:11px;line-height:1.45}.asaas-sale-mode37 .span-2{grid-column:1/-1}
      .asaas-sale-progress37{grid-column:1/-1;border-radius:10px;padding:9px 10px;background:#fff;border:1px solid #eadfd8;color:#715f56;font-size:11px}.asaas-sale-progress37 b{color:#3c2017}
      .asaas-sale-progress37.is-open{background:#fff3d7;border-color:#efdcae;color:#715500}.asaas-sale-progress37.is-paid{background:#eaf5ef;border-color:#cfe8da;color:#256044}
      @media(max-width:720px){.asaas-sale-mode37{grid-template-columns:1fr}.asaas-sale-mode37 .span-2{grid-column:auto}}
    `;document.head.appendChild(st);
  }

  async function loadOpenSales37(clientId){
    openSales37=[];
    if(!clientId||!db||state.demo)return openSales37;
    const sq=await db.from('sales').select('id,client_id,service_id,work_id,responsible_member_id,sale_type,status,total_amount,sold_at').eq('client_id',clientId).order('sold_at',{ascending:false}).limit(250);
    if(sq.error){console.error('open sales v37',sq.error);return openSales37;}
    const sales=(sq.data||[]).filter(s=>!['CANCELLED','REFUNDED'].includes(s.status));
    if(!sales.length)return openSales37;
    const ids=sales.map(s=>s.id);
    const aq=await db.from('payment_allocations').select('sale_id,payment_id,amount').in('sale_id',ids).limit(5000);
    if(aq.error){console.error('open allocations v37',aq.error);return openSales37;}
    const alloc=aq.data||[];const paymentIds=[...new Set(alloc.map(a=>a.payment_id).filter(Boolean))];
    let payments=[];
    if(paymentIds.length){const pq=await db.from('payments').select('id,status').in('id',paymentIds).limit(5000);if(!pq.error)payments=pq.data||[];}
    const paidSet=new Set(payments.filter(p=>p.status==='PAID').map(p=>p.id));
    const paidBySale={};alloc.forEach(a=>{if(paidSet.has(a.payment_id))paidBySale[a.sale_id]=(paidBySale[a.sale_id]||0)+moneyN37(a.amount);});
    openSales37=sales.map(s=>{
      const total=moneyN37(s.total_amount),received=moneyN37(paidBySale[s.id]),remaining=Math.max(total-received,0);
      return {...s,total,received,remaining,label:saleLabel37(s)};
    }).filter(s=>s.total>0&&s.remaining>.005);
    return openSales37;
  }

  function saleOptions37(){
    return '<option value="">Não — criar uma nova venda</option>'+openSales37.map(s=>`<option value="${s.id}">${escapeHtml(s.label)} · ${fmtMoney(s.total)} · recebido ${fmtMoney(s.received)} · falta ${fmtMoney(s.remaining)}</option>`).join('');
  }
  function suggestedTotal37(form){
    const work=byId(state.works||[],form.querySelector('#agWork')?.value);
    const service=byId(state.services||[],form.querySelector('#agService')?.value);
    const amount=moneyN37(form.querySelector('#agAmount0')?.value);
    return Math.max(amount,moneyN37(work?.unit_price||service?.default_price||0));
  }
  function setNewSaleMode37(form){
    const sel=form.querySelector('#agExistingSale37');const total=form.querySelector('#agSaleTotal37');const progress=form.querySelector('#agSaleProgress37');const amount=form.querySelector('#agAmount0');
    const sale=openSales37.find(s=>s.id===sel?.value);
    ['agService','agWork','agResponsible'].forEach(id=>{const el=form.querySelector('#'+id);if(el)el.disabled=Boolean(sale);});
    if(!sale){
      if(amount)amount.removeAttribute('max');
      if(total){total.disabled=false;if(total.dataset.touched37!=='1')total.value=suggestedTotal37(form).toFixed(2);}
      if(progress){progress.className='asaas-sale-progress37';progress.innerHTML='<b>Nova venda:</b> se este recebimento for só a primeira parcela, informe abaixo o valor total contratado. Os próximos pagamentos poderão ser adicionados à mesma venda.';}
      return;
    }
    if(form.querySelector('#agService'))form.querySelector('#agService').value=sale.service_id||'';
    if(form.querySelector('#agWork'))form.querySelector('#agWork').value=sale.work_id||'';
    if(form.querySelector('#agResponsible'))form.querySelector('#agResponsible').value=sale.responsible_member_id||'';
    if(total){total.value=sale.total.toFixed(2);total.disabled=true;}
    if(amount){amount.max=sale.remaining.toFixed(2);if(moneyN37(amount.value)>sale.remaining+.005){amount.value=sale.remaining.toFixed(2);amount.dispatchEvent(new Event('input',{bubbles:true}));}}
    if(progress){progress.className='asaas-sale-progress37 is-open';progress.innerHTML=`<b>Venda em aberto:</b> total ${fmtMoney(sale.total)} · já recebido ${fmtMoney(sale.received)} · saldo ${fmtMoney(sale.remaining)}. Este pagamento será somado a ela, sem criar outra venda.`;}
  }

  async function refreshOpenSaleOptions37(form){
    const sel=form.querySelector('#agExistingSale37');if(!sel)return;
    const clientId=form.querySelector('#agClient')?.value||'';
    const keep=sel.value;sel.disabled=true;sel.innerHTML='<option>Buscando vendas em aberto…</option>';
    await loadOpenSales37(clientId);
    sel.innerHTML=saleOptions37();sel.disabled=false;
    if(keep&&openSales37.some(s=>s.id===keep))sel.value=keep;
    setNewSaleMode37(form);
  }

  function decorate37(form){
    if(decorating37||!form||form.dataset.multi27!=='1'||form.dataset.unified37==='1')return;
    decorating37=true;
    try{
      form.dataset.unified37='1';
      const amount=form.querySelector('#agAmount0');if(!amount)return;
      const anchor=form.querySelector('.asaas-multi-tools27')||form.querySelector('#agNotes')?.closest('label');
      const box=document.createElement('div');box.className='span-2 asaas-sale-mode37';
      box.innerHTML=`<div class="span-2"><h3>Venda + recebimento no mesmo fluxo</h3><p>Se este pagamento é uma parcela de algo já vendido, escolha a venda em aberto. Se é a primeira parcela, crie a venda pelo valor total contratado — não apenas pelo valor recebido hoje.</p></div>
        <label class="span-2">Adicionar a uma venda em aberto<select id="agExistingSale37"><option value="">Não — criar uma nova venda</option></select></label>
        <label>Valor total da venda<input id="agSaleTotal37" type="number" min="0.01" step="0.01" value="${moneyN37(amount.value).toFixed(2)}"></label>
        <div id="agSaleProgress37" class="asaas-sale-progress37"><b>Nova venda:</b> informe o valor total contratado.</div>`;
      if(anchor)anchor.insertAdjacentElement('beforebegin',box);else form.appendChild(box);
      const total=box.querySelector('#agSaleTotal37');total.addEventListener('input',()=>total.dataset.touched37='1');
      box.querySelector('#agExistingSale37').addEventListener('change',()=>setNewSaleMode37(form));
      amount.addEventListener('input',()=>{if(!box.querySelector('#agExistingSale37').value&&total.dataset.touched37!=='1')total.value=suggestedTotal37(form).toFixed(2);});
      ['agService','agWork'].forEach(id=>form.querySelector('#'+id)?.addEventListener('change',()=>{if(!box.querySelector('#agExistingSale37').value&&total.dataset.touched37!=='1')total.value=suggestedTotal37(form).toFixed(2);}));
      form.querySelector('#agClient')?.addEventListener('change',()=>refreshOpenSaleOptions37(form));
      refreshOpenSaleOptions37(form);
    }finally{decorating37=false;}
  }

  function extraItems37(form){
    return [...form.querySelectorAll('.asaas-extra-item27')].map(x=>({
      existing_sale_id:null,
      service_id:x.querySelector('.agExtraService27')?.value||null,
      work_id:x.querySelector('.agExtraWork27')?.value||null,
      responsible_member_id:x.querySelector('.agExtraResponsible27')?.value||null,
      received_amount:moneyN37(x.querySelector('.agExtraAmount27')?.value),
      sale_total:moneyN37(x.querySelector('.agExtraAmount27')?.value),
      loved_person_name:x.querySelector('.agExtraLoved27')?.value.trim()||null,
      rival_name:x.querySelector('.agExtraRival27')?.value.trim()||null,
      notes:x.querySelector('.agExtraNotes27')?.value.trim()||null
    }));
  }

  async function submit37(form){
    if(!requireReal())return;
    const entryId=form.dataset.entryId27||lastEntry37;
    if(!entryId){toast('Não foi possível identificar a entrada do Asaas. Volte à fila e abra novamente.','error');return;}
    const existingClient=form.querySelector('#agClient')?.value||null;
    const name=form.querySelector('#agName')?.value.trim()||'';
    const phone=form.querySelector('#agPhone')?.value.trim()||'';
    if(!existingClient&&!name){toast('Confirme o nome do cliente.','error');return;}
    if(!existingClient&&phone.replace(/\D/g,'').length<8){toast('Informe o telefone do novo cliente.','error');form.querySelector('#agPhone')?.focus();return;}

    const existingSale=form.querySelector('#agExistingSale37')?.value||null;
    const received=moneyN37(form.querySelector('#agAmount0')?.value);
    const first={
      existing_sale_id:existingSale,
      service_id:form.querySelector('#agService')?.value||null,
      work_id:form.querySelector('#agWork')?.value||null,
      responsible_member_id:form.querySelector('#agResponsible')?.value||null,
      received_amount:received,
      sale_total:existingSale?null:moneyN37(form.querySelector('#agSaleTotal37')?.value),
      loved_person_name:form.querySelector('#agLoved')?.value.trim()||null,
      rival_name:form.querySelector('#agRival')?.value.trim()||null,
      notes:null
    };
    const items=[first,...extraItems37(form)];
    for(const item of items){
      if(!(item.received_amount>0)){toast('Informe um valor recebido maior que zero em todas as partes.','error');return;}
      if(!item.existing_sale_id){
        if(!item.service_id&&!item.work_id){toast('Selecione serviço ou trabalho em todas as novas vendas.','error');return;}
        if(!item.responsible_member_id){toast('Defina o responsável em todas as novas vendas.','error');return;}
        if(!(item.sale_total>0)||item.sale_total+0.009<item.received_amount){toast('O valor total da venda deve ser igual ou maior que o valor recebido.','error');return;}
      }
    }
    const gross=moneyN37(form.dataset.gross27);const total=items.reduce((s,x)=>s+x.received_amount,0);
    if(Math.abs(gross-total)>.009){toast(`Distribua exatamente ${fmtMoney(gross)}. Hoje a soma está em ${fmtMoney(total)}.`,'error');return;}

    const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Associando…';
    const {data,error}=await db.rpc('resolve_asaas_entry_unified',{
      p_entry_id:entryId,p_client_id:existingClient,p_client_name:name||null,p_client_phone:phone||null,
      p_client_email:form.querySelector('#agEmail')?.value.trim()||null,p_client_birth_date:form.querySelector('#agBirth')?.value||null,
      p_document_number:form.querySelector('#agDocument')?.value.trim()||null,p_items:items,p_notes:form.querySelector('#agNotes')?.value.trim()||null
    });
    btn.disabled=false;btn.textContent='Associar e concluir';
    if(error){toast(error.message,'error');return;}
    await loadReferenceData();document.getElementById('asaasGlobalOverlay')?.remove();
    const reused=(data?.sales||[]).some(x=>x.existing_sale);const partial=(data?.sales||[]).some(x=>moneyN37(x.sale_total)>moneyN37(x.received_amount)+.005);
    toast(reused?'Pagamento adicionado à venda existente. Saldo atualizado.':partial?'Venda criada pelo valor total e primeira parcela registrada.':'Pagamento associado com sucesso.');
    if(window.refreshAsaasBell)await window.refreshAsaasBell();await render();
  }

  ensureStyles37();
  document.addEventListener('click',e=>{const b=e.target.closest('[data-asaas-resolve-global]');if(b)lastEntry37=b.dataset.asaasResolveGlobal||'';},true);
  document.addEventListener('submit',e=>{
    const form=e.target.closest('#asaasGlobalResolveForm');
    if(!form||form.dataset.multi27!=='1')return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();submit37(form);
  },true);
  const observer=new MutationObserver(()=>{const form=document.getElementById('asaasGlobalResolveForm');if(form)setTimeout(()=>decorate37(form),0);});
  observer.observe(document.body,{childList:true,subtree:true});
})();
