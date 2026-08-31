/* Sunshine v3.28 — status mensal individual em Filhos da Casa */
(function(){
  function localDate28(){
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function paymentCell28(h){
    const st=h.payment_status;
    if(st==='ISENTO') return `<div><span class="pill gold">ISENTO</span><small style="display:block;margin-top:5px;color:#806b62">Sem cobrança mensal</small></div>`;
    const paid=Number(h.paid_amount||0), fee=Number(h.monthly_fee||0), missing=Math.max(fee-paid,0);
    if(st==='PAGO') return `<div><span class="pill ok">PAGO</span><small style="display:block;margin-top:5px;color:#806b62">${fmtMoney(paid)}${h.last_paid_at?` · ${fmtDate(h.last_paid_at)}`:''}</small></div>`;
    if(paid>0) return `<div><span class="pill red">PENDENTE</span><small style="display:block;margin-top:5px;color:#806b62">Recebido ${fmtMoney(paid)} · falta ${fmtMoney(missing)}</small></div>`;
    return `<div><span class="pill red">PENDENTE</span><small style="display:block;margin-top:5px;color:#806b62">Falta ${fmtMoney(missing||fee)} · vence dia ${Number(h.billing_due_day||10)}</small></div>`;
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
      <td><b>${escapeHtml(h.full_name||'—')}</b><button type="button" class="inline-edit-client27" data-edit-client27="${h.client_id}">Editar</button></td>
      <td>${h.birth_date?escapeHtml(String(h.birth_date).split('-').reverse().join('/')):'—'}</td>
      <td>${escapeHtml(h.phone||'—')}</td>
      <td>${paymentCell28(h)}</td>
      <td>${h.billing_exempt?'<span class="pill gold">ISENTO</span>':`Dia ${Number(h.billing_due_day||10)}`}</td>
      <td>${h.billing_exempt?'<span class="pill gold">ISENTO</span>':fmtMoney(h.monthly_fee)}</td>
      <td>${statusPill(h.house_status)}</td>
    </tr>`).join('');
    const monthLabel=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date());
    return `${kpis([
      ['Ativos',String(active),'Filhos da Casa ativos'],
      ['Previsto no mês',fmtMoney(expected),'Mensalidades dos não isentos'],
      ['Recebido no mês',fmtMoney(received),'Mensalidades efetivamente pagas'],
      ['Pendente no mês',fmtMoney(pending),'Saldo ainda não recebido']
    ])}<article class="panel"><div class="section-head"><div><h2>Filhos da Casa</h2><p>${active} pessoas ativas · situação de ${escapeHtml(monthLabel)}. O status de pagamento vem do Financeiro/Asaas.</p></div><div class="button-row"><button class="btn ghost" type="button" data-print-house>Imprimir nomes</button><button class="btn" data-action="new-house">+ Novo vínculo</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Nascimento</th><th>Telefone</th><th>Pagamento do mês</th><th>Vencimento</th><th>Mensalidade</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></article><article class="panel"><div class="note"><b>Como funciona:</b> só aparece <b>Pago</b> quando existe pagamento confirmado e associado a um serviço de mensalidade daquele cliente no mês. Pagamento parcial permanece <b>Pendente</b>. Isentos não entram na cobrança nem no valor previsto.</div></article>`;
  };
})();
