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
