(function () {
  'use strict';
  window.SunshineOperations = function (api) {
    var el=api.el, esc=api.esc, money=api.money, cents=api.cents, rpc=api.rpc, state=api.state;
    var management=null, cash=null, expenses=[], destinations=[], birthdays=[], report=null;
    var attemptKey='sunshine.pendingEntry.v1';
    var receiptModule=window.SunshineExpenseReceipts?window.SunshineExpenseReceipts(api):null;
    var recurringModule=window.SunshineRecurringCosts?window.SunshineRecurringCosts(Object.assign({},api,{refreshCosts:loadCosts})):null;
    function localDay() { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
    function decimal(v) { return (Number(v||0)/100).toFixed(2).replace('.',','); }
    function percent(v) { return v==null?'Sem receita':(Number(v)/100).toLocaleString('pt-BR')+'%'; }
    function field(id,label,type,value,extra) { return '<div class="field"><label for="'+id+'">'+esc(label)+'</label><input id="'+id+'" type="'+(type||'text')+'" value="'+esc(value||'')+'" '+(extra||'')+'></div>'; }
    function select(id,label,options) { return '<div class="field"><label for="'+id+'">'+esc(label)+'</label><select id="'+id+'">'+options+'</select></div>'; }
    function option(value,label) { return '<option value="'+esc(value)+'">'+esc(label)+'</option>'; }
    function button(label,attr) { return '<button type="button" class="secondary" '+attr+'>'+esc(label)+'</button>'; }
    function message(id,error) { if(el(id)) el(id).innerHTML='<div class="formError">'+esc(error.message||error)+'</div>'; }
    function guarded(id,fn) { return async function(ev) { if(ev)ev.preventDefault();var btn=ev&&ev.submitter;if(btn)btn.disabled=true;try { await fn(); } catch(e) { message(id,e); } finally { if(btn&&btn.isConnected)btn.disabled=false; } }; }
    function period(prefix) { return {p_start:el(prefix+'Start').value,p_end:el(prefix+'End').value,p_year:Number(el('managementYear').value)}; }
    function periodFields(prefix) { return '<div class="filters">'+field(prefix+'Start','Início','date')+field(prefix+'End','Fim','date')+'<button class="primary" id="'+prefix+'Apply" type="button">Aplicar</button></div>'; }
    function dates(prefix) { var day=localDay();el(prefix+'Start').value=day.slice(0,7)+'-01';el(prefix+'End').value=day; }
    function row(title,amount,detail,actions) { return '<div class="row"><div class="rowHead"><div><strong>'+esc(title)+'</strong><p>'+esc(detail||'')+'</p></div><b>'+money(amount)+'</b></div>'+(actions?'<div class="inlineActions">'+actions+'</div>':'')+'</div>'; }
    function kpi(label,value,detail,target,currency) { return '<button type="button" class="metric" data-management-detail="'+target+'"><span>'+esc(label)+'</span><b>'+(currency===false?esc(value):money(value))+'</b><small>'+esc(detail||'Ver detalhamento')+'</small></button>'; }
    function openEvidence(title,html) { api.openDrawer(title,html||api.empty('Nenhum registro no período.')); }
    function allWorks() { return state.allWorks.length?state.allWorks:state.works; }
    function worksOptions(selected,openOnly) { var works=allWorks().filter(function(w){return !openOnly||w.status==='OPEN'||w.work_id===selected;});return option('','Nenhum / não se aplica')+works.map(function(w){return option(w.work_id,w.title)}).join(''); }
    function destinationKey(a) { return a.workId?'WORK:'+a.workId:a.itemId?'ITEM:'+a.itemId:a.serviceId?'SERVICE:'+a.serviceId:''; }
    function destinationOptions(query,selected) {
      var q=(query||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      return option('','Selecione um destino')+[['WORK','Trabalhos cadastrados'],['ITEM','Trabalhos particulares por pessoa'],['SERVICE','Serviços']].map(function(group){
        var options=destinations.filter(function(d){return d.kind===group[0]&&(d.kind+':'+d.id===selected||!q||d.label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q));}).map(function(d){return option(d.kind+':'+d.id,d.label);}).join('');
        return options?'<optgroup label="'+group[1]+'">'+options+'</optgroup>':'';
      }).join('');
    }
    function disclosure(id,title) {
      var list=el(id),heading=list.previousElementSibling;
      if(heading&&heading.classList.contains('sectionTitle'))heading.remove();
      var box=document.createElement('details');box.id=id+'Disclosure';box.className='listDisclosure';
      box.innerHTML='<summary><span class="sectionTitle">'+esc(title)+'</span><span class="disclosureArrow" aria-hidden="true">⌄</span></summary>';
      list.before(box);box.appendChild(list);
    }
    function expandList(id) { var box=el(id+'Disclosure');if(box)box.open=true; }
    function init() {
      document.querySelector('main').insertAdjacentHTML('beforeend',
        '<section id="custos" class="page"><div class="pageHead"><div><h1>Custos</h1><p>Custos fixos ou destinados a trabalhos e serviços, inclusive estoque.</p></div><button class="primary" id="newExpense">+ Custo</button></div><div class="panel">'+periodFields('cost')+'</div><div id="costMetrics" class="metrics"></div><div class="panel"><div id="expenseList" class="grid"></div></div></section>'+
        '<section id="faturamento" class="page"><div class="pageHead"><div><h1>Faturamento</h1><p>Faturamento recebido, custos do período e margem de contribuição.</p></div></div><div class="panel">'+periodFields('management')+field('managementYear','Ano das metas','number',localDay().slice(0,4),'min="2000" max="2100"')+'<p class="note">Venda é o valor contratado. Receita é o recebimento bruto confirmado, inclusive Asaas aguardando repasse. Disponibilidade é informada separadamente. Margem de contribuição = faturamento recebido menos custos do período, pagos ou pendentes. Comissões ficam fora dos custos desta margem. A reserva é uma distribuição do recebimento; não é uma despesa. Saldos bancários a negociar ficam à parte.</p></div><div id="managementMetrics" class="metrics"></div><div class="panel"><p class="sectionTitle">METAS E REALIZADO NO ANO</p><div id="annualTotals" class="moneyGroup"></div><div style="overflow-x:auto"><table class="financeTable"><thead><tr><th>Mês</th><th>Receita / meta</th><th>Custos / meta</th><th>Margem de contribuição / meta</th><th>Vendas / meta</th><th>Margem (%) / meta</th><th>Ação</th></tr></thead><tbody id="annualRows"></tbody></table></div></div><div class="panel"><p class="sectionTitle">PARTICIPAÇÃO E PERFIL</p><div id="profileSummary"></div><div id="participantRanking" class="grid"></div></div><div class="panel"><p class="sectionTitle">PRÓ-LABORE</p><p class="note">R$ 1.620 por mês para Yasmin e R$ 1.620 para Lourdes, preservados. São gerados automaticamente como custos pendentes. Em Custos, registre a data do pagamento; o saldo não pago continua pendente.</p></div><div class="panel"><p class="sectionTitle">FECHAMENTO PARA CONTABILIDADE</p><button id="accountantReport" class="primary">Preparar fechamento do período</button><button id="configureMail" class="ghost">Configurar Resend</button><div id="mailState" class="hint"></div></div><div class="panel"><p class="sectionTitle">EXCLUSÕES REVERSÍVEIS</p><div id="financialVoids" class="grid"></div></div></section>');
      document.querySelector('.menuGrid').insertAdjacentHTML('beforeend','<button data-go="custos">R$ Custos</button><button data-go="faturamento">↗ Faturamento</button>');
      el('financeSummary').parentElement.insertAdjacentHTML('afterend','<div class="panel"><p class="sectionTitle">DISPONIBILIDADE DOS RECEBIMENTOS</p><p class="hint">Pelo intervalo da data de recebimento. Inclui a fila Asaas; os filtros de serviço/responsável não se aplicam ao repasse.</p><div id="cashSummary" class="moneyGroup"></div><div id="cashError"></div></div>');
      el('pessoas').querySelector('.filters').insertAdjacentHTML('afterend','<details id="birthdayDisclosure" class="listDisclosure"><summary><span class="sectionTitle">ANIVERSARIANTES</span><span class="disclosureArrow" aria-hidden="true">⌄</span></summary>'+select('birthdayMonth','Mês',Array.from({length:12},function(_,i){return option(i+1,api.monthBR('2026-'+String(i+1).padStart(2,'0')+'-01').split('/')[0]);}).join(''))+'<div id="birthdayList" class="grid"></div><p class="hint">Confira os contatos e selecione as pessoas antes de enviar parabéns. Nenhuma mensagem é enviada automaticamente.</p><button id="copyBirthdays" class="secondary">Copiar selecionados</button></details>');
      el('annualRows').closest('div').id='annualTable';
      [['annualTable','METAS MENSAIS — DETALHAMENTO'],['paymentList','PAGAMENTOS DO PERÍODO — MAIS RECENTE PRIMEIRO'],['peopleList','PESSOAS ENCONTRADAS'],['openWorks','TRABALHOS EM ABERTO'],['workList','TRABALHOS CADASTRADOS'],['questionList','PERGUNTAS DO FILTRO'],['houseList','CONTROLE MENSAL — PENDÊNCIAS PRIMEIRO'],['receivableList','OBRIGAÇÕES / SALDOS'],['collectionList','AÇÕES DE COBRANÇA'],['expenseList','CUSTOS DO PERÍODO'],['participantRanking','PARTICIPANTES DO PERÍODO'],['financialVoids','EXCLUSÕES REVERSÍVEIS']].forEach(function(x){disclosure(x[0],x[1]);});
      document.addEventListener('input',function(ev){if(ev.target.id==='peopleQuery')expandList('peopleList');});
      document.addEventListener('change',function(ev){var targets={peopleBalanceFilter:'peopleList',workFilter:'workList',questionFilter:'questionList'};if(targets[ev.target.id])expandList(targets[ev.target.id]);});
      dates('cost');dates('management');el('birthdayMonth').value=Number(localDay().slice(5,7));
      el('costApply').onclick=guarded('expenseList',loadCosts);el('managementApply').onclick=guarded('managementMetrics',loadManagement);
      el('managementYear').onchange=guarded('managementMetrics',loadManagement);el('newExpense').onclick=function(){return openExpense();};
      el('birthdayMonth').onchange=guarded('birthdayList',loadBirthdays);el('copyBirthdays').onclick=copyBirthdays;
      el('accountantReport').onclick=openReport;el('configureMail').onclick=configureMail;
      var brand=document.querySelector('#app .top .brand');brand.setAttribute('role','button');brand.setAttribute('tabindex','0');brand.setAttribute('aria-label','Voltar para Home');brand.style.cursor='pointer';brand.onclick=function(){api.go('home');};brand.onkeydown=function(ev){if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();api.go('home');}};
      var style=document.createElement('style');style.textContent='.financeTable{width:100%;border-collapse:collapse;font-size:12px}.financeTable th,.financeTable td{padding:9px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}.financeTable small{display:block;color:var(--muted)}.rateRow{display:grid;grid-template-columns:minmax(0,1fr) 110px;gap:8px}.brand[role=button]:focus-visible{outline:2px solid var(--dark);border-radius:10px}.reportBody{white-space:pre-wrap;font-size:12px}.listDisclosure{margin-top:8px}.listDisclosure>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;cursor:pointer;list-style:none}.listDisclosure>summary::-webkit-details-marker{display:none}.listDisclosure>summary .sectionTitle{margin:0}.disclosureArrow{display:grid;place-items:center;min-width:38px;min-height:38px;border:1px solid var(--line);border-radius:10px;font-size:22px;line-height:1}.listDisclosure[open]>summary{margin-bottom:10px}.listDisclosure[open]>summary .disclosureArrow{transform:rotate(180deg)}.listDisclosure>summary:focus-visible{outline:2px solid var(--dark);border-radius:10px}#birthdayList small{display:block;margin-top:4px}.destinationSearch{grid-column:1/-1}';document.head.appendChild(style);
      document.addEventListener('click',function(ev){
        var expense=ev.target.closest('[data-edit-expense]');if(expense)openExpense(expenses.find(function(x){return x.id===expense.dataset.editExpense;}));
        var status=ev.target.closest('[data-expense-status]');if(status)expenseStatus(status.dataset.id,status.dataset.expenseStatus);
        var paid=ev.target.closest('[data-pay-expense]');if(paid)payExpense(paid.dataset.payExpense);
        var goal=ev.target.closest('[data-edit-goal]');if(goal)openGoal(goal.dataset.editGoal);
        var detail=ev.target.closest('[data-management-detail]');if(detail)managementDetail(detail.dataset.managementDetail);
        var evidence=ev.target.closest('[data-cash-detail]');if(evidence)cashEvidence(evidence.dataset.cashDetail);
        var voidButton=ev.target.closest('[data-void-payment]');if(voidButton)voidRecord(voidButton.dataset.voidPayment,voidButton.dataset.allocationId||null);
        var restore=ev.target.closest('[data-restore-void]');if(restore)restoreRecord(restore.dataset.restoreVoid);
        var receipt=ev.target.closest('[data-edit-receipt]');if(receipt)editReceipt(receipt.dataset.editReceipt);
      });
      if(receiptModule)receiptModule.init();
      if(recurringModule)recurringModule.init();
    }
    async function onPage(id) { if(id==='custos')await loadCosts();if(id==='faturamento')await loadManagement();if(receiptModule)await receiptModule.onPage(id); }
    async function loadCash() {
      try {
        cash=await rpc('v4_cash_availability',{p_start:el('dateStart').value,p_end:el('dateEnd').value});
        el('cashError').innerHTML='';
        el('cashSummary').innerHTML=[['BRUTO CONFIRMADO','grossCents','ALL'],['LÍQUIDO LIBERADO','availableCents','AVAILABLE'],['ASAAS — AGUARDANDO REPASSE','pendingTransferCents','PENDING_TRANSFER'],['DISPONIBILIDADE NÃO CONFERIDA','unknownCents','UNKNOWN']].map(function(x){return '<button class="moneyCard" type="button" data-cash-detail="'+x[2]+'"><span>'+x[0]+'</span><b>'+money(cash[x[1]])+'</b><small>Ver comprovantes</small></button>';}).join('');
      } catch(e) { el('cashSummary').innerHTML='';message('cashError',e); }
    }
    function cashEvidence(kind) { if(!cash)return;openEvidence('Disponibilidade dos recebimentos',(cash.evidence||[]).filter(function(r){return kind==='ALL'||r.availability===kind;}).map(function(r){return row(r.payer_name,r.net_cents,api.dateBR(r.paid_on)+' · '+r.source+' · '+({AVAILABLE:'Disponível',PENDING_TRANSFER:'Aguardando repasse',UNKNOWN:'Disponibilidade não conferida'}[r.availability])+(r.credit_on?' · Crédito previsto '+api.dateBR(r.credit_on):''),r.payment_id?button('Ver associação','data-payment-link="'+r.payment_id+'"'):'');}).join(''));
      document.querySelectorAll('[data-payment-link]').forEach(function(b){b.onclick=function(){api.openPaymentDetail(b.dataset.paymentLink);};});
    }
    async function loadCosts() {
      var args=period('cost');if(receiptModule)await receiptModule.loadCostTotals(args.p_start,args.p_end);var loaded=await Promise.all([rpc('v4_finance_management',args),rpc('v4_cost_destinations')]),data=loaded[0];management=data;destinations=loaded[1]||[];expenses=data.expenses||[];
      el('costMetrics').innerHTML=kpi('CUSTOS DO PERÍODO',data.costsCents,'Pagos + pendentes; sem comissões','costs')+kpi('CUSTOS PAGOS',data.paidCostsCents,'Do período selecionado','paid-costs')+kpi('CUSTOS PENDENTES',data.pendingCostsCents,'Já considerados na margem','pending-costs')+kpi('SALDOS BANCÁRIOS',data.liabilitiesCents,'Saldos a negociar; fora dos custos mensais','liabilities');
      el('expenseList').innerHTML=expenses.map(function(x){var rate=(x.allocations||[]).map(function(a){var d=destinations.find(function(d){return d.kind+':'+d.id===destinationKey(a);});return (d?d.label:'Destino cadastrado')+': '+money(a.amountCents);}).join(' · ');
        var liability=x.cost_kind==='LIABILITY',actions=api.has('record.update')?(x.status==='PENDING'&&!liability?button('Dar baixa: pago','data-pay-expense="'+x.id+'"'):'')+button('Editar','data-edit-expense="'+x.id+'"')+(x.status==='PAID'?button('Voltar para pendente','data-expense-status="PENDING" data-id="'+x.id+'"'):'')+button(x.status==='CANCELLED'?'Restaurar como pendente':'Excluir só este lançamento','data-expense-status="'+(x.status==='CANCELLED'?'PENDING':'CANCELLED')+'" data-id="'+x.id+'"'):'';
        return row(x.description,x.amount_cents,api.dateBR(x.occurred_on)+' · '+x.category+' · '+({PAID:'Pago em '+api.dateBR(x.paid_on),PENDING:liability?'Saldo em negociação':'A pagar',CANCELLED:'Excluído'}[x.status])+(liability?' · Fora da margem':rate?' · '+rate:x.scope==='FIXED'?' · Custo fixo'+(x.recurring_cost_id?' recorrente':''):' · Destino pendente'),actions);
      }).join('')||api.empty('Nenhum custo cadastrado neste período.');
      if(recurringModule)await recurringModule.load();
    }
    async function openExpense(expense) {
      try {destinations=await rpc('v4_cost_destinations')||[];}catch(e){api.toast('Não foi possível carregar os destinos: '+e.message);return;}
      var x=expense||{},key=x.idempotency_key||'expense-'+crypto.randomUUID();
      api.openDrawer(x.id?'Editar custo':'Cadastrar custo','<form id="expenseForm">'+field('expenseDescription','Descrição','text',x.description,'required minlength="2"')+select('expenseCategory','Categoria',Array.from(new Set(['MATERIAIS','CONTABILIDADE','PROLABORE','OPERACIONAL','IMPOSTO','FINANCIAMENTO','ESTOQUE','OUTRO',x.category].filter(Boolean))).map(function(c){return option(c,c);}).join(''))+select('expenseScope','Aplicação do custo',option('WORK','Um trabalho ou serviço')+option('SHARED','Dividir entre destinos')+option('FIXED','Custo fixo'))+field('expenseAmount','Valor total (R$)','text',decimal(x.amount_cents),'inputmode="decimal" required')+'<div id="expenseAllocations" class="summaryBox"></div><div class="grid2">'+field('expenseDate','Data da despesa','date',x.occurred_on||localDay(),'required')+select('expenseStatus','Situação',option('PENDING','A pagar')+option('PAID','Pago')+(x.status==='CANCELLED'?option('CANCELLED','Excluído'):''))+field('expensePaidOn','Data do pagamento','date',x.paid_on||'')+'</div>'+field('expenseReceipt','Comprovante (link HTTPS)','url',x.receipt_url)+field('expenseNotes','Observações','text',x.notes)+'<div id="expenseMsg"></div><button class="primary" type="submit">Salvar custo</button></form>');
      el('expenseCategory').value=x.category||'OUTRO';el('expenseScope').value=x.scope==='STOCK'?'WORK':x.scope||'WORK';el('expenseStatus').value=x.status||'PENDING';
      function allocationRows(values) {
        var scope=el('expenseScope').value,qty=scope==='WORK'?1:scope==='SHARED'?Math.max(2,(values||[]).length):0;
        el('expenseAllocations').classList.toggle('hidden',qty===0);
        el('expenseAllocations').innerHTML=Array.from({length:qty},function(_,i){var a=(values||[])[i]||{};return '<div class="rateRow" data-expense-rate>'+field('expenseSearch'+i,'Buscar destino (trabalho, pessoa ou serviço)','search')+select('expenseWork'+i,'Destino',destinationOptions('',destinationKey(a)))+field('expenseRate'+i,'Valor (R$)','text',decimal(a.amountCents),'inputmode="decimal"')+'</div>';}).join('')+(scope==='SHARED'?button('+ Destino','id="addExpenseWork"'):'')+'<p class="hint">Todo custo não fixo, inclusive estoque, precisa de destino. No rateio, os valores devem somar o total.</p>';
        Array.from({length:qty},function(_,i){var a=(values||[])[i]||{},work=el('expenseWork'+i),rate=el('expenseRate'+i);work.value=destinationKey(a);work.required=true;work.closest('.field').classList.toggle('destinationSearch',scope==='WORK');rate.closest('.field').classList.toggle('hidden',scope==='WORK');el('expenseSearch'+i).closest('.field').classList.add('destinationSearch');el('expenseSearch'+i).oninput=function(){var selected=work.value;work.innerHTML=destinationOptions(this.value,selected);work.value=selected;};});
        if(el('addExpenseWork'))el('addExpenseWork').onclick=function(){var current=readRates();current.push({});allocationRows(current);};
      }
      function readRates(){return Array.from(document.querySelectorAll('[data-expense-rate]')).map(function(_,i){var parts=el('expenseWork'+i).value.split(':'),a={amountCents:cents(el('expenseRate'+i).value)};if(parts[1])a[{WORK:'workId',ITEM:'itemId',SERVICE:'serviceId'}[parts[0]]]=parts[1];return a;});}
      el('expenseScope').onchange=function(){allocationRows([]);};allocationRows(x.allocations||[]);
      el('expenseForm').onsubmit=guarded('expenseMsg',async function(){
        var amount=cents(el('expenseAmount').value),rates=readRates();if(el('expenseScope').value==='WORK'&&rates.length)rates[0].amountCents=amount;
        if(rates.some(function(a){return !destinationKey(a);}))throw new Error('Selecione o destino de cada custo não fixo.');
        if(rates.length&&rates.reduce(function(n,a){return n+a.amountCents;},0)!==amount)throw new Error('O rateio precisa somar exatamente o valor total.');
        await rpc('v4_api_save_expense',{p_id:x.id||null,p_data:{description:el('expenseDescription').value,category:el('expenseCategory').value,scope:el('expenseScope').value,amountCents:amount,allocations:rates,occurredOn:el('expenseDate').value,status:el('expenseStatus').value,paidOn:el('expensePaidOn').value||null,receiptUrl:el('expenseReceipt').value||null,notes:el('expenseNotes').value,idempotencyKey:key}});
        api.closeDrawer();api.toast('Custo salvo.');await loadCosts();
      });
    }
    async function expenseStatus(id,status) {var reason=prompt(status==='CANCELLED'?'Justificativa da exclusão do custo:':'Justificativa para restaurar o custo:');if(!reason)return;try{await rpc('v4_api_set_expense_status',{p_id:id,p_status:status,p_reason:reason});await loadCosts();api.toast('Custo atualizado.');}catch(e){api.toast(e.message);}}
    function payExpense(id) {
      var x=expenses.find(function(e){return e.id===id;});if(!x)return;
      api.openDrawer('Dar baixa no custo','<form id="expensePaymentForm"><p class="note">'+esc(x.description)+' · '+money(x.amount_cents)+'. A baixa altera somente este mês.</p>'+field('expensePaymentDate','Data do pagamento','date',localDay(),'required max="'+localDay()+'"')+'<div id="expensePaymentMsg"></div><button type="submit" class="primary">Confirmar pagamento realizado</button></form>');
      el('expensePaymentForm').onsubmit=guarded('expensePaymentMsg',async function(){await rpc('v4_api_pay_expense',{p_id:id,p_paid_on:el('expensePaymentDate').value});api.closeDrawer();await loadCosts();api.toast('Pagamento registrado.');});
    }
    async function loadManagement() {
      management=await rpc('v4_finance_management',period('management'));
      var m=management;
      el('managementMetrics').innerHTML=kpi('VENDAS',m.salesCents,'Contratado pela data da venda','sales')+kpi('RECEITA BRUTA',m.revenueCents,'Recebimentos confirmados','revenue')+kpi('CUSTOS DO PERÍODO',m.costsCents,'Pagos + pendentes; sem comissões','costs')+kpi('CUSTOS PAGOS',m.paidCostsCents,'Dentro dos custos do período','paid-costs')+kpi('CUSTOS PENDENTES',m.pendingCostsCents,'Dentro dos custos do período','pending-costs')+kpi('MARGEM DE CONTRIBUIÇÃO',m.profitCents,'Faturamento menos custos, sem comissões','profit')+kpi('MARGEM (%)',percent(m.marginBp),'Margem de contribuição / faturamento','profit',false)+kpi('RESERVA PARA CUSTOS',m.reserveCents,'Alocações pela regra desde 01/10/2026; não é despesa','reserve')+kpi('ASAAS A REPASSAR',m.cash.pendingTransferCents,'Valor líquido ainda indisponível','revenue')+kpi('PESSOAS / PARTICIPAÇÕES',m.profile.peopleCount+' / '+m.profile.participations,'Beneficiários distintos / serviços contratados','profile',false);
      var sum=function(key){return m.annual.reduce(function(n,r){return n+Number(r[key]||0);},0);},goal=function(key){return m.annual.reduce(function(n,r){return n+Number((r.goals||{})[key]||0);},0);};
      el('annualTotals').innerHTML=['revenue','costs','profit','sales'].map(function(k,i){return '<div class="moneyCard"><span>'+['FATURAMENTO','CUSTOS','MARGEM DE CONTRIBUIÇÃO','VENDAS'][i]+' NO ANO</span><b>'+money(sum(k+'Cents'))+'</b><small>Meta anual: '+money(goal(k+'_cents'))+' (soma das metas mensais)</small></div>';}).join('');
      el('annualRows').innerHTML=m.annual.map(function(r){var g=r.goals||{};return '<tr><td>'+esc(api.monthBR(r.month))+'</td>'+['revenue','costs','profit','sales'].map(function(k){return '<td>'+money(r[k+'Cents'])+'<small>Meta '+(g[k+'_cents']==null?'não definida':money(g[k+'_cents']))+'</small></td>';}).join('')+'<td>'+percent(r.marginBp)+'<small>Meta '+(g.margin_bp==null?'não definida':percent(g.margin_bp))+'</small></td><td>'+button('Editar metas','data-edit-goal="'+r.month+'"')+'</td></tr>';}).join('');
      var p=m.profile;el('profileSummary').innerHTML='<div class="grid2">'+[['Idade',p.ageGroups,'age_group'],['Sexo informado',p.sexGroups,'sex'],['Tipo de participação',p.serviceGroups,'service_category']].map(function(group){return '<div class="summaryBox"><strong>'+group[0]+'</strong>'+group[1].map(function(v){return '<p>'+esc(api.categoryLabel(v[group[2]])||'Não informado')+': '+Number(v.total)+'</p>';}).join('')+'</div>';}).join('')+'</div>';
      el('participantRanking').innerHTML=p.topPeople.map(function(v){return '<div class="row"><strong>'+esc(v.full_name)+'</strong><p>'+Number(v.participations)+' participações · '+esc(v.categories)+'</p></div>';}).join('')||api.empty('Sem participações neste período.');
      el('financialVoids').innerHTML=m.voids.map(function(v){return '<div class="row"><strong>'+esc(v.reason)+'</strong><p>'+api.dateBR(v.createdAt)+'</p>'+button('Restaurar','data-restore-void="'+v.id+'"')+'</div>';}).join('')||api.empty('Nenhuma exclusão ativa.');
      var config=await rpc('v4_mail_configuration');el('mailState').textContent=config.configured?'Resend configurado: '+config.sender:'Envio direto ainda requer configuração do Resend. O rascunho para Gmail está disponível.';
      el('configureMail').classList.toggle('hidden',!api.has('integration.configure'));
      if(recurringModule)await recurringModule.load();
    }
    function managementDetail(kind) {
      if(!management)return;
      if(['costs','profit','paid-costs','pending-costs'].includes(kind))openEvidence('Custos e margem de contribuição','<div class="summaryBox">Faturamento '+money(management.revenueCents)+' − custos '+money(management.costsCents)+' = margem de contribuição '+money(management.profitCents)+'. Comissões excluídas. Custos pagos '+money(management.paidCostsCents)+' + pendentes '+money(management.pendingCostsCents)+' = custos do período '+money(management.costsCents)+'.</div>'+management.costEvidence.filter(function(x){return kind==='paid-costs'?x.status==='PAID':kind==='pending-costs'?x.status==='PENDING':true;}).map(function(x){return row(x.description,x.amount_cents,api.dateBR(x.occurred_on)+' · '+x.category+' · '+(x.status==='PAID'?'Pago em '+api.dateBR(x.paid_on):'Pendente'));}).join(''));
      if(kind==='liabilities')openEvidence('Saldos bancários em negociação','<p class="note">Saldos originais a negociar. Não representam parcelas mensais nem quitação imediata e ficam fora da margem de contribuição.</p>'+(management.expenses||[]).filter(function(x){return x.cost_kind==='LIABILITY'&&x.status!=='CANCELLED';}).map(function(x){return row(x.description,x.amount_cents,x.notes);}).join(''));
      if(kind==='revenue')openEvidence('Recebimentos do período',management.cash.evidence.map(function(x){return row(x.payer_name,x.gross_cents,api.dateBR(x.paid_on)+' · '+x.source+' · Líquido '+money(x.net_cents)+(x.availability==='PENDING_TRANSFER'?' · Aguardando repasse Asaas':''));}).join('')+'<p class="sectionTitle">RECEITA ASSOCIADA POR SERVIÇO</p>'+management.incomeCategories.map(function(x){return row(api.categoryLabel(x.category),x.amount_cents);}).join(''));
      if(kind==='sales')openEvidence('Vendas do período',(management.salesEvidence||[]).map(function(x){return row(x.name,x.amountCents,api.dateBR(x.date)+' · '+x.service);}).join(''));
      if(kind==='profile')el('profileSummary').scrollIntoView({behavior:'smooth'});
      if(kind==='reserve')openEvidence('Reserva para custos','<p class="note">'+money(management.reserveCents)+' reservado nas associações recebidas do período. Regra padrão: 30% do bruto para a Sunshine; outubro: 49% responsável e 10,5% para cada outra integrante. Desde novembro: 40% responsável e 15% para cada outra integrante. Desde 08/10, consultas e perguntas não retiram caixa: outubro, 79% responsável e 10,5% para cada outra integrante; desde novembro, 70% responsável e 15% para cada outra integrante. Todos os percentuais são sobre o recebimento integral e somam 100%. Divisões individuais substituem a regra apenas no lançamento escolhido. Custos e pró-labore, pagos ou pendentes, entram na margem. Comissões ficam fora dessa margem.</p>'+(management.reserveEvidence||[]).map(function(x){return row(x.payer,x.amountCents,api.dateBR(x.paidOn));}).join(''));
    }
    function openGoal(month) {
      var g=(management.annual.find(function(r){return r.month===month;})||{}).goals||{};
      api.openDrawer('Metas — '+api.monthBR(month),'<form id="goalForm">'+[['goalRevenue','Receita (R$)','revenue_cents'],['goalCosts','Custos máximos (R$)','costs_cents'],['goalProfit','Margem de contribuição (R$)','profit_cents'],['goalSales','Vendas (R$)','sales_cents'],['goalMargin','Margem de contribuição (%)','margin_bp']].map(function(x){return field(x[0],x[1],'text',g[x[2]]==null?'':decimal(g[x[2]]),'inputmode="decimal"');}).join('')+'<p class="hint">Deixe em branco para remover uma meta. A meta anual soma as metas mensais em reais.</p><div id="goalMsg"></div><button class="primary" type="submit">Salvar metas</button></form>');
      el('goalForm').onsubmit=guarded('goalMsg',async function(){function value(id){return el(id).value.trim()===''?null:cents(el(id).value);}await rpc('v4_api_save_finance_goal',{p_month:month,p_data:{revenueCents:value('goalRevenue'),costsCents:value('goalCosts'),profitCents:value('goalProfit'),salesCents:value('goalSales'),marginBp:value('goalMargin')}});api.closeDrawer();await loadManagement();api.toast('Metas salvas.');});
    }
    async function loadBirthdays() {
      birthdays=await rpc('v4_birthdays',{p_reference:localDay(),p_month:Number(el('birthdayMonth').value)});
      el('birthdayList').innerHTML=birthdays.map(function(p){return '<label class="row paymentChoice"><input type="checkbox" data-birthday-id="'+p.id+'"><span><strong>'+esc(p.name)+'</strong><small>'+api.dateBR(p.birthday)+' · '+esc(p.phone||'Sem telefone')+(p.isToday?' · ANIVERSÁRIO HOJE':'')+'</small></span></label>';}).join('')||api.empty('Nenhum aniversário cadastrado neste mês.');
    }
    async function copyBirthdays() {try{var ids=Array.from(document.querySelectorAll('[data-birthday-id]:checked')).map(function(x){return x.dataset.birthdayId;});if(!ids.length)throw new Error('Selecione as pessoas que deseja cumprimentar.');await navigator.clipboard.writeText(birthdays.filter(function(p){return ids.includes(p.id);}).map(function(p){return p.name+' — '+api.dateBR(p.birthday)+' — '+(p.phone||'Sem telefone');}).join('\n'));api.toast('Selecionados copiados. Nenhuma mensagem foi enviada.');}catch(e){api.toast(e.message);}}
    function configureMail() {
      api.openDrawer('Configurar envio pelo Resend','<form id="mailConfigForm"><p class="note">Use um remetente com domínio verificado no Resend. A chave é armazenada criptografada no servidor e não é exibida novamente.</p>'+field('mailSender','Remetente verificado','email','','required')+field('mailApiKey','Chave API do Resend','password','','required autocomplete="off"')+'<div id="mailConfigMsg"></div><button class="primary" type="submit">Salvar configuração</button></form>');
      el('mailConfigForm').onsubmit=guarded('mailConfigMsg',async function(){await rpc('v4_configure_accountant_mail',{p_sender:el('mailSender').value.trim(),p_api_key:el('mailApiKey').value.trim()});el('mailApiKey').value='';api.closeDrawer();await loadManagement();api.toast('Remetente configurado.');});
    }
    function openReport() {
      report=null;api.openDrawer('Fechamento para contabilidade','<form id="reportForm"><p class="note">Período: '+api.dateBR(el('managementStart').value)+' a '+api.dateBR(el('managementEnd').value)+'. Destinatário: bksm00@gmail.com.</p>'+field('reportDrive','Notas fiscais no Google Drive','url','','required placeholder="https://drive.google.com/..."')+'<div id="reportMsg"></div><button class="primary" type="submit">Gerar e conferir rascunho</button></form>');
      el('reportForm').onsubmit=guarded('reportMsg',async function(){var args=period('management'),url=el('reportDrive').value.trim(),key='closing:'+args.p_start+':'+args.p_end+':'+url;report=await rpc('v4_prepare_accountant_report',{p_start:args.p_start,p_end:args.p_end,p_documents_url:url,p_key:key});showReport();});
    }
    function showReport() {
      var gmail='https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(report.recipient)+'&su='+encodeURIComponent(report.subject)+'&body='+encodeURIComponent(report.body);
      api.openDrawer('Conferir fechamento','<p><strong>'+esc(report.subject)+'</strong></p><p>Para: '+esc(report.recipient)+'</p><div class="summaryBox reportBody">'+esc(report.body)+'</div><p class="hint">O rascunho mantém os valores apurados na geração. Enviar pelo Gmail exige concluir o envio na própria conta.</p><div id="reportSendMsg">'+(report.status==='SENT'?'<div class="formSuccess">Este fechamento já foi enviado pelo Resend.</div>':'')+'</div><div class="inlineActions"><button id="sendReport" class="primary" '+(['SENT','SENDING'].includes(report.status)?'disabled':'')+'>Enviar pelo Resend</button><a class="secondary" href="'+esc(gmail)+'" target="_blank" rel="noopener noreferrer">Abrir Gmail</a></div>');
      el('sendReport').onclick=async function(){var btn=el('sendReport');btn.disabled=true;try{var result=await api.client().functions.invoke('accountant-report',{body:{reportId:report.id}});if(result.error){var detail;try{detail=await result.error.context.json();}catch(_){}throw new Error(detail&&detail.error||result.error.message);}if(result.data.error)throw new Error(result.data.error);report.status='SENT';el('reportSendMsg').innerHTML='<div class="formSuccess">Fechamento aceito pelo Resend. Identificador: '+esc(result.data.id)+'</div>';}catch(e){message('reportSendMsg',e);btn.disabled=false;}};
    }
    function paymentActions(id,p) { return '<div class="inlineActions">'+(p.source==='ASAAS'?'':button('Editar recebimento','data-edit-receipt="'+id+'"')+button('Excluir recebimento','data-void-payment="'+id+'"'))+'</div>'; }
    async function voidRecord(paymentId,allocationId) {
      var reason=prompt(allocationId?'Justificativa para remover a associação deste pagamento:':'Justificativa para excluir o recebimento e suas associações:');if(!reason)return;
      try{await rpc('v4_api_void_financial_record',{p_payment_id:paymentId,p_allocation_id:allocationId,p_reason:reason});api.closeDrawer();await api.refresh();api.toast('Registro excluído. Pode ser restaurado em Faturamento.');}catch(e){api.toast(e.message);}
    }
    async function restoreRecord(id) {var reason=prompt('Justificativa da restauração:');if(!reason)return;try{await rpc('v4_api_restore_financial_record',{p_void_id:id,p_reason:reason});await api.refresh();await loadManagement();api.toast('Registro restaurado.');}catch(e){api.toast(e.message);}}
    function editReceipt(id) {
      var p=state.paymentDetails[id].payment;
      api.openDrawer('Corrigir recebimento manual','<form id="receiptEditForm">'+select('receiptPerson','Pagador',api.personOptions(p.payerPersonId))+field('receiptAmount','Recebido (R$)','text',decimal(p.amountCents),'inputmode="decimal" required')+field('receiptDate','Data','date',String(p.paidAt).slice(0,10),'required')+field('receiptMethod','Meio de pagamento','text',p.paymentMethod)+field('receiptReason','Justificativa','text','','required minlength="3"')+'<div id="receiptEditMsg"></div><button class="primary" type="submit">Salvar correção</button></form>');
      el('receiptEditForm').onsubmit=guarded('receiptEditMsg',async function(){await rpc('v4_api_edit_receipt',{p_payment_id:id,p_reason:el('receiptReason').value,p_data:{payerPersonId:el('receiptPerson').value,amountCents:cents(el('receiptAmount').value),paidAt:el('receiptDate').value+'T12:00:00-03:00',paymentMethod:el('receiptMethod').value}});await api.refresh();await api.openPaymentDetail(id);api.toast('Recebimento corrigido.');});
    }
    function editItem(paymentId,itemId) {
      var x=(state.paymentDetails[paymentId].allocations||[]).find(function(a){return a.itemId===itemId;});if(!x)return;
      var receivedOn=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(state.paymentDetails[paymentId].payment.paidAt)),otherBp=receivedOn>='2026-11-01'?1500:1050,reserveBp=receivedOn>='2026-10-08'&&['CONSULTA','PERGUNTA'].includes(x.serviceCategory)?0:3000,responsibleBp=10000-reserveBp-2*otherBp,overrideReserve=x.commissionOverride?Number(x.commissionOverride.costBp):reserveBp;
      api.openDrawer('Corrigir lançamento','<form id="financialItemForm"><p class="note">O comprovante é preservado. Alterações de divisão/responsável recalculam apenas comissões ainda não pagas, respeitando a data de cada recebimento.</p>'+select('itemPerson','Beneficiário',api.personOptions(x.beneficiaryPersonId))+field('itemAmount','Valor total do serviço (R$)','text',decimal(x.totalCents),'inputmode="decimal" required')+select('itemWork','Trabalho associado',worksOptions(x.workId,false))+field('itemEvent','Evento / referência','text',x.eventName)+field('itemService','Nome do serviço','text',x.serviceName,'required')+select('itemCategory','Tipo',api.serviceCategoryOptions(x.serviceCategory))+select('itemResponsible','Responsável',api.teamOptions())+field('itemReference','Referência mensal','month',String(x.referenceMonth||'').slice(0,7))+field('itemQuestion','Pergunta objetiva','text',x.questionText)+'<label class="row paymentChoice"><input id="customCommission" type="checkbox"><span>Usar divisão individual neste lançamento</span></label><div id="commissionSplitFields" class="summaryBox hidden">'+field('splitCost','Reserva Sunshine (%)','text',decimal(reserveBp===0?0:overrideReserve),'inputmode="decimal"')+state.team.map(function(t){var share=x.commissionOverride&&(x.commissionOverride.shares||[]).find(function(s){return s.memberId===t.member_id;});return field('split'+t.member_id,t.full_name+' (%)','text',decimal(share?Number(share.basisPoints)+(reserveBp===0&&t.member_id===x.responsibleMemberId?overrideReserve:0):(t.member_id===x.responsibleMemberId?responsibleBp:otherBp)),'inputmode="decimal"');}).join('')+'<p class="hint">Percentuais sobre o recebimento integral, somando 100%. Desde 08/10, consultas e perguntas não retiram reserva. Desmarcar restaura a regra vigente na data de cada recebimento.</p></div>'+field('itemReason','Justificativa','text','','required minlength="3"')+'<div id="financialItemMsg"></div><button class="primary" type="submit">Salvar correção</button></form>');
      el('itemWork').value=x.workId||'';el('itemResponsible').value=x.responsibleMemberId||'';el('customCommission').checked=!!x.commissionOverride;el('commissionSplitFields').classList.toggle('hidden',!x.commissionOverride);el('customCommission').onchange=function(){el('commissionSplitFields').classList.toggle('hidden',!this.checked);};
      function syncSplitCategory(){
        var exempt=receivedOn>='2026-10-08'&&['CONSULTA','PERGUNTA'].includes(el('itemCategory').value),responsible=el('itemResponsible').value;
        if(!x.commissionOverride){var cost=exempt?0:3000;el('splitCost').value=decimal(cost);state.team.forEach(function(t){el('split'+t.member_id).value=decimal(t.member_id===responsible?10000-cost-2*otherBp:otherBp);});}
        else if(exempt){var released=cents(el('splitCost').value);el('split'+responsible).value=decimal(cents(el('split'+responsible).value)+released);el('splitCost').value='0,00';}
        el('splitCost').readOnly=exempt;
      }
      el('itemCategory').onchange=syncSplitCategory;el('itemResponsible').onchange=syncSplitCategory;syncSplitCategory();
      el('financialItemForm').onsubmit=guarded('financialItemMsg',async function(){var override=el('customCommission').checked?{costBp:cents(el('splitCost').value),shares:state.team.map(function(t){return {memberId:t.member_id,basisPoints:cents(el('split'+t.member_id).value)};})}:null;
        await rpc('v4_api_edit_financial_item',{p_item_id:itemId,p_reason:el('itemReason').value,p_data:{beneficiaryPersonId:el('itemPerson').value,amountCents:cents(el('itemAmount').value),workId:el('itemWork').value||null,eventName:el('itemEvent').value,serviceName:el('itemService').value,serviceCategory:el('itemCategory').value,responsibleMemberId:el('itemResponsible').value,referenceMonth:el('itemReference').value?el('itemReference').value+'-01':null,questionText:el('itemQuestion').value,commissionOverride:override}});
        await api.refresh();await api.openPaymentDetail(paymentId);api.toast('Lançamento corrigido.');
      });
    }
    function pendingAttempt() { try{return JSON.parse(sessionStorage.getItem(attemptKey)||'null');}catch(_){return null;} }
    async function saveEntry(payload,context) {
      var attempt=pendingAttempt();if(!attempt){var name=context&&context.kind==='GROUP'?'v4_api_associate_payment_group_operational':context&&context.kind==='ASAAS'?'v4_api_register_asaas_entry_operational':context&&context.kind==='EXISTING'?'v4_api_associate_existing_payment_operational':'v4_api_register_manual_entry_operational';var args={p_payload:payload};if(context&&context.kind==='GROUP'){args.p_payment_ids=context.paymentIds;args.p_asaas_entry_ids=context.asaasEntryIds;}if(context&&context.kind==='ASAAS')args.p_entry_id=context.entryId;if(context&&context.kind==='EXISTING')args.p_payment_id=context.paymentId;attempt={name:name,args:args,createdAt:new Date().toISOString()};sessionStorage.setItem(attemptKey,JSON.stringify(attempt));}
      var result;
      try { result=await rpc(attempt.name,attempt.args); }
      catch(e) {
        // A PostgreSQL validation/permission error rolls back the transaction. Allow correction.
        if (/^(P0001|23\d{3}|22\d{3}|42501|PGRST)/.test(String(e.code||''))) {
          sessionStorage.removeItem(attemptKey);
          document.querySelectorAll('#entryForm [data-frozen]').forEach(function(input){input.disabled=input.dataset.frozen==='true';delete input.dataset.frozen;});
        }
        throw e;
      }
      var contractId=result&&result.contractId;
      if(!contractId)throw new Error('O servidor não confirmou o lançamento. Tente confirmar novamente nesta mesma tela.');
      var proof=await rpc('v4_entry_receipt',{p_contract_id:contractId});
      var expected=attempt.args.p_payload.items;
      if(!proof||!proof.items||proof.items.length!==expected.length||expected.some(function(x){return !proof.items.some(function(p){return p.beneficiaryPersonId===x.beneficiaryPersonId&&Number(p.amountCents)===x.amountCents&&Number(p.allocatedCents)>=x.allocateCents&&(!x.referenceMonth||p.referenceMonth===x.referenceMonth)&&(!x.workId||p.workId===x.workId&&p.registrationId);});}))throw new Error('A confirmação dos vínculos ficou incompleta. Mantenha esta tentativa para conferir novamente.');
      sessionStorage.removeItem(attemptKey);state.entryContext=null;
      if(el('entryMsg'))el('entryMsg').innerHTML='<div class="formSuccess">Lançamento salvo e vínculos conferidos no banco. Referência: '+esc(contractId)+'</div>';
      try{await api.refresh();}catch(e){api.toast('Salvo no banco. Atualize a tela para recarregar os dados.');return result;}
      api.toast('Lançamento salvo e conferido.');setTimeout(api.closeDrawer,900);return result;
    }
    function recoverEntry() {
      var attempt=pendingAttempt();if(!attempt)return false;
      api.openDrawer('Confirmar gravação anterior','<p class="note">Uma tentativa anterior ficou sem confirmação. Confira e repita a mesma gravação para evitar duplicidade.</p><div class="summaryBox">'+attempt.args.p_payload.items.map(function(x){return row(x.participantName||'Beneficiário',x.amountCents,x.serviceName);}).join('')+'</div><div id="entryMsg"></div><button id="retryPendingEntry" class="primary">Confirmar novamente</button>');
      el('retryPendingEntry').onclick=guarded('entryMsg',async function(){await saveEntry(null,null);});return true;
    }
    return {receiptModule:receiptModule,loadWorkCosts:receiptModule?receiptModule.loadWorkCosts:async function(){},localDay:localDay,init:init,onPage:onPage,loadCash:loadCash,loadBirthdays:loadBirthdays,editItem:editItem,paymentActions:paymentActions,saveEntry:saveEntry,recoverEntry:recoverEntry,pendingAttempt:pendingAttempt};
  };
})();
