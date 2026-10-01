(function () {
  'use strict';
  window.SunshineOperations = function (api) {
    var el=api.el, esc=api.esc, money=api.money, cents=api.cents, rpc=api.rpc, state=api.state;
    var management=null, cash=null, expenses=[], birthdays=[], report=null;
    var attemptKey='sunshine.pendingEntry.v1';
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
    function init() {
      document.querySelector('main').insertAdjacentHTML('beforeend',
        '<section id="custos" class="page"><div class="pageHead"><div><h1>Custos</h1><p>Despesas por trabalho, rateio, operação e estoque.</p></div><button class="primary" id="newExpense">+ Custo</button></div><div class="panel">'+periodFields('cost')+'</div><div id="costMetrics" class="metrics"></div><div class="panel"><div id="expenseList" class="grid"></div></div></section>'+
        '<section id="faturamento" class="page"><div class="pageHead"><div><h1>Faturamento</h1><p>Receita bruta recebida, despesas pagas, resultado e metas.</p></div></div><div class="panel">'+periodFields('management')+field('managementYear','Ano das metas','number',localDay().slice(0,4),'min="2000" max="2100"')+'<p class="note">Venda é o valor contratado. Receita é o recebimento bruto confirmado, inclusive Asaas aguardando repasse. Disponibilidade é informada separadamente. Custos incluem taxas Asaas e comissões efetivamente pagas; a reserva de 30% não é uma despesa.</p></div><div id="managementMetrics" class="metrics"></div><div class="panel"><p class="sectionTitle">METAS E REALIZADO NO ANO</p><div id="annualTotals" class="moneyGroup"></div><div style="overflow-x:auto"><table class="financeTable"><thead><tr><th>Mês</th><th>Receita / meta</th><th>Custos / meta</th><th>Resultado / meta</th><th>Vendas / meta</th><th>Margem / meta</th><th>Ação</th></tr></thead><tbody id="annualRows"></tbody></table></div></div><div class="panel"><p class="sectionTitle">PARTICIPAÇÃO E PERFIL</p><div id="profileSummary"></div><div id="participantRanking" class="grid"></div></div><div class="panel"><p class="sectionTitle">PRÓ-LABORE</p><p class="note">A partir de outubro/2026: R$ 1.620 por mês para Yasmin e R$ 1.620 para Lourdes, previstos na reserva. Registre cada pagamento em Custos; previsão não reduz o caixa nem o resultado.</p><button id="planProlabore" class="secondary">Criar previsões do mês selecionado</button></div><div class="panel"><p class="sectionTitle">FECHAMENTO PARA CONTABILIDADE</p><button id="accountantReport" class="primary">Preparar fechamento do período</button><button id="configureMail" class="ghost">Configurar Resend</button><div id="mailState" class="hint"></div></div><div class="panel"><p class="sectionTitle">EXCLUSÕES REVERSÍVEIS</p><div id="financialVoids" class="grid"></div></div></section>');
      document.querySelector('.menuGrid').insertAdjacentHTML('beforeend','<button data-go="custos">R$ Custos</button><button data-go="faturamento">↗ Faturamento</button>');
      el('financeSummary').parentElement.insertAdjacentHTML('afterend','<div class="panel"><p class="sectionTitle">DISPONIBILIDADE DOS RECEBIMENTOS</p><p class="hint">Pelo intervalo da data de recebimento. Inclui a fila Asaas; os filtros de serviço/responsável não se aplicam ao repasse.</p><div id="cashSummary" class="moneyGroup"></div><div id="cashError"></div></div>');
      el('pessoas').querySelector('.pageHead').insertAdjacentHTML('afterend','<div class="panel"><p class="sectionTitle">ANIVERSARIANTES</p>'+select('birthdayMonth','Mês',Array.from({length:12},function(_,i){return option(i+1,api.monthBR('2026-'+String(i+1).padStart(2,'0')+'-01').split('/')[0]);}).join(''))+'<div id="birthdayList" class="grid"></div><p class="hint">Confira os contatos e selecione as pessoas antes de enviar parabéns. Nenhuma mensagem é enviada automaticamente.</p><button id="copyBirthdays" class="secondary">Copiar selecionados</button></div>');
      dates('cost');dates('management');el('birthdayMonth').value=Number(localDay().slice(5,7));
      el('costApply').onclick=guarded('expenseList',loadCosts);el('managementApply').onclick=guarded('managementMetrics',loadManagement);
      el('managementYear').onchange=guarded('managementMetrics',loadManagement);el('newExpense').onclick=function(){openExpense();};
      el('birthdayMonth').onchange=guarded('birthdayList',loadBirthdays);el('copyBirthdays').onclick=copyBirthdays;
      el('accountantReport').onclick=openReport;el('configureMail').onclick=configureMail;el('planProlabore').onclick=guarded('managementMetrics',planProlabore);
      var brand=document.querySelector('#app .top .brand');brand.setAttribute('role','button');brand.setAttribute('tabindex','0');brand.setAttribute('aria-label','Voltar para Home');brand.style.cursor='pointer';brand.onclick=function(){api.go('home');};brand.onkeydown=function(ev){if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();api.go('home');}};
      var style=document.createElement('style');style.textContent='.financeTable{width:100%;border-collapse:collapse;font-size:12px}.financeTable th,.financeTable td{padding:9px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}.financeTable small{display:block;color:var(--muted)}.rateRow{display:grid;grid-template-columns:minmax(0,1fr) 110px;gap:8px}.brand[role=button]:focus-visible{outline:2px solid var(--dark);border-radius:10px}.reportBody{white-space:pre-wrap;font-size:12px}';document.head.appendChild(style);
      document.addEventListener('click',function(ev){
        var expense=ev.target.closest('[data-edit-expense]');if(expense)openExpense(expenses.find(function(x){return x.id===expense.dataset.editExpense;}));
        var status=ev.target.closest('[data-expense-status]');if(status)expenseStatus(status.dataset.id,status.dataset.expenseStatus);
        var goal=ev.target.closest('[data-edit-goal]');if(goal)openGoal(goal.dataset.editGoal);
        var detail=ev.target.closest('[data-management-detail]');if(detail)managementDetail(detail.dataset.managementDetail);
        var evidence=ev.target.closest('[data-cash-detail]');if(evidence)cashEvidence(evidence.dataset.cashDetail);
        var voidButton=ev.target.closest('[data-void-payment]');if(voidButton)voidRecord(voidButton.dataset.voidPayment,voidButton.dataset.allocationId||null);
        var restore=ev.target.closest('[data-restore-void]');if(restore)restoreRecord(restore.dataset.restoreVoid);
        var receipt=ev.target.closest('[data-edit-receipt]');if(receipt)editReceipt(receipt.dataset.editReceipt);
      });
    }
    async function onPage(id) { if(id==='custos')await loadCosts();if(id==='faturamento')await loadManagement(); }
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
      var args=period('cost'),data=await rpc('v4_finance_management',args);expenses=data.expenses||[];
      var active=expenses.filter(function(x){return x.status!=='CANCELLED';}),paid=active.filter(function(x){return x.status==='PAID';}).reduce(function(n,x){return n+Number(x.amount_cents);},0);
      el('costMetrics').innerHTML=kpi('CUSTOS CADASTRADOS',active.reduce(function(n,x){return n+Number(x.amount_cents);},0),'Pela data da despesa','costs')+kpi('CADASTRADOS PAGOS',paid,'Neste filtro de despesas','costs')+kpi('A PAGAR',data.pendingCostsCents,'Não reduz o resultado até pagamento','costs');
      el('expenseList').innerHTML=expenses.map(function(x){var rate=(x.allocations||[]).map(function(a){var w=allWorks().find(function(w){return w.work_id===a.workId;});return (w?w.title:'Trabalho')+': '+money(a.amountCents);}).join(' · ');
        return row(x.description,x.amount_cents,api.dateBR(x.occurred_on)+' · '+x.category+' · '+({PAID:'Pago em '+api.dateBR(x.paid_on),PENDING:'A pagar',CANCELLED:'Excluído'}[x.status])+(rate?' · '+rate:''),button('Editar','data-edit-expense="'+x.id+'"')+button(x.status==='CANCELLED'?'Restaurar como pendente':'Excluir','data-expense-status="'+(x.status==='CANCELLED'?'PENDING':'CANCELLED')+'" data-id="'+x.id+'"'));
      }).join('')||api.empty('Nenhum custo cadastrado neste período.');
    }
    function openExpense(expense) {
      var x=expense||{},key=x.idempotency_key||'expense-'+crypto.randomUUID();
      api.openDrawer(x.id?'Editar custo':'Cadastrar custo','<form id="expenseForm">'+field('expenseDescription','Descrição','text',x.description,'required minlength="2"')+select('expenseCategory','Categoria',['MATERIAIS','CONTABILIDADE','PROLABORE','OPERACIONAL','ESTOQUE','OUTRO'].map(function(c){return option(c,c);}).join(''))+select('expenseScope','Destino',option('WORK','Um trabalho aberto')+option('SHARED','Dividido entre trabalhos')+option('FIXED','Operação / custo fixo')+option('STOCK','Estoque geral'))+field('expenseAmount','Valor total (R$)','text',decimal(x.amount_cents),'inputmode="decimal" required')+'<div id="expenseAllocations" class="summaryBox"></div><div class="grid2">'+field('expenseDate','Data da despesa','date',x.occurred_on||localDay(),'required')+select('expenseStatus','Situação',option('PENDING','A pagar')+option('PAID','Pago')+(x.status==='CANCELLED'?option('CANCELLED','Excluído'):''))+field('expensePaidOn','Data do pagamento','date',x.paid_on||'')+'</div>'+field('expenseReceipt','Comprovante (link HTTPS)','url',x.receipt_url)+field('expenseNotes','Observações','text',x.notes)+'<div id="expenseMsg"></div><button class="primary" type="submit">Salvar custo</button></form>');
      el('expenseCategory').value=x.category||'OUTRO';el('expenseScope').value=x.scope||'FIXED';el('expenseStatus').value=x.status||'PENDING';
      function allocationRows(values) {
        var scope=el('expenseScope').value,qty=scope==='WORK'?1:scope==='SHARED'?Math.max(2,(values||[]).length):0;
        el('expenseAllocations').classList.toggle('hidden',qty===0);
        el('expenseAllocations').innerHTML=Array.from({length:qty},function(_,i){var a=(values||[])[i]||{};return '<div class="rateRow" data-expense-rate>'+select('expenseWork'+i,'Trabalho',worksOptions(a.workId,true))+field('expenseRate'+i,'Valor (R$)','text',decimal(a.amountCents),'inputmode="decimal"')+'</div>';}).join('')+(scope==='SHARED'?button('+ Trabalho','id="addExpenseWork"'):'')+'<p class="hint">O rateio precisa somar exatamente o valor total.</p>';
        (values||[]).forEach(function(a,i){if(el('expenseWork'+i))el('expenseWork'+i).value=a.workId;});
        if(el('addExpenseWork'))el('addExpenseWork').onclick=function(){var current=readRates();current.push({});allocationRows(current);};
      }
      function readRates(){return Array.from(document.querySelectorAll('[data-expense-rate]')).map(function(_,i){return {workId:el('expenseWork'+i).value,amountCents:cents(el('expenseRate'+i).value)};});}
      el('expenseScope').onchange=function(){allocationRows([]);};allocationRows(x.allocations||[]);
      el('expenseForm').onsubmit=guarded('expenseMsg',async function(){
        var amount=cents(el('expenseAmount').value),rates=readRates();if(el('expenseScope').value==='WORK'&&rates.length)rates[0].amountCents=amount;
        await rpc('v4_api_save_expense',{p_id:x.id||null,p_data:{description:el('expenseDescription').value,category:el('expenseCategory').value,scope:el('expenseScope').value,amountCents:amount,allocations:rates,occurredOn:el('expenseDate').value,status:el('expenseStatus').value,paidOn:el('expensePaidOn').value||null,receiptUrl:el('expenseReceipt').value||null,notes:el('expenseNotes').value,idempotencyKey:key}});
        api.closeDrawer();api.toast('Custo salvo.');await loadCosts();
      });
    }
    async function expenseStatus(id,status) {var reason=prompt(status==='CANCELLED'?'Justificativa da exclusão do custo:':'Justificativa para restaurar o custo:');if(!reason)return;try{await rpc('v4_api_set_expense_status',{p_id:id,p_status:status,p_reason:reason});await loadCosts();api.toast('Custo atualizado.');}catch(e){api.toast(e.message);}}
    async function loadManagement() {
      management=await rpc('v4_finance_management',period('management'));
      var m=management;
      el('managementMetrics').innerHTML=kpi('VENDAS',m.salesCents,'Contratado pela data da venda','sales')+kpi('RECEITA BRUTA',m.revenueCents,'Recebimentos confirmados','revenue')+kpi('DESPESAS PAGAS',m.costsCents,'Custos, taxas e comissões pagas','costs')+kpi('RESULTADO',m.profitCents,'Receita menos despesas pagas','profit')+kpi('MARGEM',percent(m.marginBp),'Resultado / receita','profit',false)+kpi('RESERVA PARA CUSTOS',m.reserveCents,'Alocações pela regra desde 01/10/2026; não é despesa','reserve')+kpi('ASAAS A REPASSAR',m.cash.pendingTransferCents,'Valor líquido ainda indisponível','revenue')+kpi('PESSOAS / PARTICIPAÇÕES',m.profile.peopleCount+' / '+m.profile.participations,'Beneficiários distintos / serviços contratados','profile',false);
      var sum=function(key){return m.annual.reduce(function(n,r){return n+Number(r[key]||0);},0);},goal=function(key){return m.annual.reduce(function(n,r){return n+Number((r.goals||{})[key]||0);},0);};
      el('annualTotals').innerHTML=['revenue','costs','profit','sales'].map(function(k,i){return '<div class="moneyCard"><span>'+['RECEITA','CUSTOS','RESULTADO','VENDAS'][i]+' NO ANO</span><b>'+money(sum(k+'Cents'))+'</b><small>Meta anual: '+money(goal(k+'_cents'))+' (soma das metas mensais)</small></div>';}).join('');
      el('annualRows').innerHTML=m.annual.map(function(r){var g=r.goals||{};return '<tr><td>'+esc(api.monthBR(r.month))+'</td>'+['revenue','costs','profit','sales'].map(function(k){return '<td>'+money(r[k+'Cents'])+'<small>Meta '+(g[k+'_cents']==null?'não definida':money(g[k+'_cents']))+'</small></td>';}).join('')+'<td>'+percent(r.marginBp)+'<small>Meta '+(g.margin_bp==null?'não definida':percent(g.margin_bp))+'</small></td><td>'+button('Editar metas','data-edit-goal="'+r.month+'"')+'</td></tr>';}).join('');
      var p=m.profile;el('profileSummary').innerHTML='<div class="grid2">'+[['Idade',p.ageGroups,'age_group'],['Sexo informado',p.sexGroups,'sex'],['Tipo de participação',p.serviceGroups,'service_category']].map(function(group){return '<div class="summaryBox"><strong>'+group[0]+'</strong>'+group[1].map(function(v){return '<p>'+esc(api.categoryLabel(v[group[2]])||'Não informado')+': '+Number(v.total)+'</p>';}).join('')+'</div>';}).join('')+'</div>';
      el('participantRanking').innerHTML=p.topPeople.map(function(v){return '<div class="row"><strong>'+esc(v.full_name)+'</strong><p>'+Number(v.participations)+' participações · '+esc(v.categories)+'</p></div>';}).join('')||api.empty('Sem participações neste período.');
      el('financialVoids').innerHTML=m.voids.map(function(v){return '<div class="row"><strong>'+esc(v.reason)+'</strong><p>'+api.dateBR(v.createdAt)+'</p>'+button('Restaurar','data-restore-void="'+v.id+'"')+'</div>';}).join('')||api.empty('Nenhuma exclusão ativa.');
      var config=await rpc('v4_mail_configuration');el('mailState').textContent=config.configured?'Resend configurado: '+config.sender:'Envio direto ainda requer configuração do Resend. O rascunho para Gmail está disponível.';
      el('configureMail').classList.toggle('hidden',!api.has('integration.configure'));
    }
    function managementDetail(kind) {
      if(!management)return;
      if(kind==='costs'||kind==='profit')openEvidence('Despesas e resultado','<div class="summaryBox">Receita '+money(management.revenueCents)+' − despesas '+money(management.costsCents)+' = resultado '+money(management.profitCents)+'</div>'+management.costEvidence.map(function(x){return row(x.description,x.amount_cents,api.dateBR(x.paid_on)+' · '+x.category);}).join(''));
      if(kind==='revenue')openEvidence('Recebimentos do período',management.cash.evidence.map(function(x){return row(x.payer_name,x.gross_cents,api.dateBR(x.paid_on)+' · '+x.source+' · Líquido '+money(x.net_cents)+(x.availability==='PENDING_TRANSFER'?' · Aguardando repasse Asaas':''));}).join('')+'<p class="sectionTitle">RECEITA ASSOCIADA POR SERVIÇO</p>'+management.incomeCategories.map(function(x){return row(api.categoryLabel(x.category),x.amount_cents);}).join(''));
      if(kind==='sales')openEvidence('Vendas do período',(management.salesEvidence||[]).map(function(x){return row(x.name,x.amountCents,api.dateBR(x.date)+' · '+x.service);}).join(''));
      if(kind==='profile')el('profileSummary').scrollIntoView({behavior:'smooth'});
      if(kind==='reserve')openEvidence('Reserva para custos','<p class="note">'+money(management.reserveCents)+' reservado nas associações recebidas do período. Regra padrão: 30% do bruto para a Sunshine; os 70% restantes são divididos 70/15/15. Em R$ 100: R$ 30 de reserva, R$ 49 para responsável e R$ 10,50 para cada outra integrante. Divisões individuais substituem a regra apenas no lançamento escolhido. Despesas e pró-labore só reduzem o resultado quando pagos.</p>'+(management.reserveEvidence||[]).map(function(x){return row(x.payer,x.amountCents,api.dateBR(x.paidOn));}).join(''));
    }
    function openGoal(month) {
      var g=(management.annual.find(function(r){return r.month===month;})||{}).goals||{};
      api.openDrawer('Metas — '+api.monthBR(month),'<form id="goalForm">'+[['goalRevenue','Receita (R$)','revenue_cents'],['goalCosts','Custos máximos (R$)','costs_cents'],['goalProfit','Resultado (R$)','profit_cents'],['goalSales','Vendas (R$)','sales_cents'],['goalMargin','Margem (%)','margin_bp']].map(function(x){return field(x[0],x[1],'text',g[x[2]]==null?'':decimal(g[x[2]]),'inputmode="decimal"');}).join('')+'<p class="hint">Deixe em branco para remover uma meta. A meta anual soma as metas mensais em reais.</p><div id="goalMsg"></div><button class="primary" type="submit">Salvar metas</button></form>');
      el('goalForm').onsubmit=guarded('goalMsg',async function(){function value(id){return el(id).value.trim()===''?null:cents(el(id).value);}await rpc('v4_api_save_finance_goal',{p_month:month,p_data:{revenueCents:value('goalRevenue'),costsCents:value('goalCosts'),profitCents:value('goalProfit'),salesCents:value('goalSales'),marginBp:value('goalMargin')}});api.closeDrawer();await loadManagement();api.toast('Metas salvas.');});
    }
    async function planProlabore() {
      var month=el('managementStart').value.slice(0,7);if(month<'2026-10')throw new Error('A previsão de pró-labore começa em outubro/2026.');
      if(!confirm('Criar custos a pagar de R$ 1.620 para Yasmin e R$ 1.620 para Lourdes em '+month+'?'))return;
      for(var name of ['Yasmin','Lourdes'])await rpc('v4_api_save_expense',{p_id:null,p_data:{description:'Pró-labore '+name+' — '+month,category:'PROLABORE',scope:'FIXED',amountCents:162000,occurredOn:month+'-01',paidOn:null,status:'PENDING',allocations:[],idempotencyKey:'prolabore:'+month+':'+name}});
      await loadManagement();api.toast('Previsões criadas sem registrar pagamento.');
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
      api.openDrawer('Corrigir lançamento','<form id="financialItemForm"><p class="note">O comprovante é preservado. Alterações de divisão/responsável recalculam apenas comissões ainda não pagas, respeitando a data original da venda.</p>'+select('itemPerson','Beneficiário',api.personOptions(x.beneficiaryPersonId))+field('itemAmount','Valor total do serviço (R$)','text',decimal(x.totalCents),'inputmode="decimal" required')+select('itemWork','Trabalho associado',worksOptions(x.workId,false))+field('itemEvent','Evento / referência','text',x.eventName)+field('itemService','Nome do serviço','text',x.serviceName,'required')+select('itemCategory','Tipo',api.serviceCategoryOptions(x.serviceCategory))+select('itemResponsible','Responsável',api.teamOptions())+field('itemReference','Referência mensal','month',String(x.referenceMonth||'').slice(0,7))+field('itemQuestion','Pergunta objetiva','text',x.questionText)+'<label class="row paymentChoice"><input id="customCommission" type="checkbox"><span>Usar divisão individual neste lançamento</span></label><div id="commissionSplitFields" class="summaryBox hidden">'+field('splitCost','Reserva Sunshine (%)','text',decimal(x.commissionOverride?x.commissionOverride.costBp:3000),'inputmode="decimal"')+state.team.map(function(t){var share=x.commissionOverride&&(x.commissionOverride.shares||[]).find(function(s){return s.memberId===t.member_id;});return field('split'+t.member_id,t.full_name+' (%)','text',decimal(share?share.basisPoints:(t.member_id===x.responsibleMemberId?4900:1050)),'inputmode="decimal"');}).join('')+'<p class="hint">Percentuais sobre o valor bruto. A soma com a reserva precisa ser 100%. Desmarcar restaura a regra vigente na data da venda.</p></div>'+field('itemReason','Justificativa','text','','required minlength="3"')+'<div id="financialItemMsg"></div><button class="primary" type="submit">Salvar correção</button></form>');
      el('itemWork').value=x.workId||'';el('itemResponsible').value=x.responsibleMemberId||'';el('customCommission').checked=!!x.commissionOverride;el('commissionSplitFields').classList.toggle('hidden',!x.commissionOverride);el('customCommission').onchange=function(){el('commissionSplitFields').classList.toggle('hidden',!this.checked);};
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
    return {localDay:localDay,init:init,onPage:onPage,loadCash:loadCash,loadBirthdays:loadBirthdays,editItem:editItem,paymentActions:paymentActions,saveEntry:saveEntry,recoverEntry:recoverEntry,pendingAttempt:pendingAttempt};
  };
})();
