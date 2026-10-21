const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
function boot(handler=async()=>null) {
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const dom=new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g,''),{url:'https://sunshine.ymnegocios.com.br/',runScripts:'outside-only'});
  const w=dom.window,calls=[];w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
  w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>{}},rpc:async(name,args)=>{calls.push({name,args});try{return {data:await handler(name,args),error:null}}catch(error){return {data:null,error}}}})};
  w.eval(fs.readFileSync(path.join(root,'assets/recurring-costs.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(root,'assets/finance-operations.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(root,'assets/payment-matching.js'),'utf8'));
  const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');
  w.eval(inline.replace('\ninit();','\nwindow.__testing={get operations(){return operations},state:state,openEntry:openEntry,entryCategoryCode:entryCategoryCode,loadPeople:loadPeople,loadPersonDetail:loadPersonDetail,renderPersonDetail:renderPersonDetail,openDebtRegularization:openDebtRegularization,loadFinance:loadFinance};init();'));
  return {w,dom,calls,api:w.__testing,close:()=>w.close()};
}
test('new modules mount, navigation and brand return to Home, sex is optional',()=>{
  const app=boot(),w=app.w;
  try {
    assert.equal(w.document.querySelector('#financeiro h1').textContent,'Receita');
    for(const id of ['custos','faturamento','cashSummary','birthdayList'])assert(w.document.getElementById(id),id);
    w.go('faturamento');assert(w.document.getElementById('faturamento').classList.contains('active'));
    w.document.querySelector('#app .brand').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    assert(w.document.getElementById('home').classList.contains('active'));
    w.document.getElementById('newPerson').click();assert.equal(w.document.getElementById('pSex').value,'NAO_INFORMADO');
  } finally {app.close();}
});
test('network uncertainty retries the identical payload and requires persisted registration',async()=>{
  let writes=0,proofReady=false;
  const app=boot(async(name)=>{
    if(name==='v4_api_register_manual_entry_operational'){if(++writes===1)throw new Error('Connection lost after commit');return {contractId:'contract-1'};}
    if(name==='v4_entry_receipt')return {items:[{beneficiaryPersonId:'person-1',amountCents:10000,allocatedCents:10000,workId:'work-1',registrationId:proofReady?'registration-1':null}]};
    return [];
  });
  try {
    const payload={idempotencyKey:'stable-key',items:[{beneficiaryPersonId:'person-1',amountCents:10000,allocateCents:10000,workId:'work-1'}]};
    await assert.rejects(app.api.operations.saveEntry(payload,null),/Connection lost/);
    assert(app.api.operations.pendingAttempt());
    await assert.rejects(app.api.operations.saveEntry({idempotencyKey:'wrong-new-key'},null),/vínculos ficou incompleta/);
    assert(app.api.operations.pendingAttempt());
    proofReady=true;app.api.state.me={name:'Teste',roles:[],permissions:[]};await app.api.operations.saveEntry(null,null);
    assert.equal(app.api.operations.pendingAttempt(),null);
    const entries=app.calls.filter(x=>x.name==='v4_api_register_manual_entry_operational');
    assert.equal(entries.length,3);assert(entries.every(x=>x.args.p_payload.idempotencyKey==='stable-key'));
    assert(entries.every(x=>JSON.stringify(x.args.p_payload)===JSON.stringify(payload)));
  } finally {app.close();}
});
test('definitive database validation allows correction instead of permanently blocking new entries',async()=>{
  const app=boot(async(name)=>{if(name.includes('register_manual'))throw Object.assign(new Error('Valor inválido'),{code:'P0001'});return [];});
  try {
    app.w.document.getElementById('drawerBody').innerHTML='<form id="entryForm"><input id="field" disabled data-frozen="false"></form>';
    await assert.rejects(app.api.operations.saveEntry({idempotencyKey:'reject-key',items:[]},null),/Valor inválido/);
    assert.equal(app.api.operations.pendingAttempt(),null);assert.equal(app.w.document.getElementById('field').disabled,false);
  } finally {app.close();}
});
test('cost rateio supports three works and sends integer cents',async()=>{
  const saved=[];const app=boot(async(name,args)=>{if(name==='v4_api_save_expense'){saved.push(args);return {id:'expense-1'};}if(name==='v4_finance_management')return {expenses:[],pendingCostsCents:0};if(name==='v4_cost_destinations')return [1,2,3].map(i=>({kind:'WORK',id:'work-'+i,label:'Trabalho '+i}));return [];});
  try {
    await app.w.document.getElementById('newExpense').onclick();
    const e=id=>app.w.document.getElementById(id);
    e('expenseScope').value='SHARED';e('expenseScope').dispatchEvent(new app.w.Event('change'));
    e('addExpenseWork').click();
    e('expenseDescription').value='Velas';e('expenseAmount').value='30,00';
    for(let i=0;i<3;i++){e('expenseWork'+i).value='WORK:work-'+(i+1);e('expenseRate'+i).value='10,00';}
    await e('expenseForm').onsubmit({preventDefault(){}});
    assert.equal(saved.length,1);assert.equal(saved[0].p_data.amountCents,3000);
    assert.equal(saved[0].p_data.allocations.length,3);assert(saved[0].p_data.allocations.every(x=>x.amountCents===1000));
  } finally {app.close();}
});
test('birthday list is user selected and performs no automatic messaging',async()=>{
  const app=boot(async(name)=>name==='v4_birthdays'?[{id:'birthday-person',name:'Teste <script>',phone:'',birthday:'2026-10-01',isToday:true}]:[]);
  try {
    await app.api.operations.loadBirthdays();
    const checkbox=app.w.document.querySelector('[data-birthday-id]');assert(checkbox);assert.equal(checkbox.checked,false);
    assert(app.w.document.getElementById('birthdayList').textContent.includes('Teste <script>'));assert.equal(app.w.document.getElementById('birthdayList').querySelector('script'),null);
    assert.deepEqual(app.calls.map(x=>x.name),['v4_birthdays']);
  } finally {app.close();}
});

test('nonfixed costs require a destination and offer completed works, private person work and services',async()=>{
  const saved=[],destinations=[{kind:'WORK',id:'past-work',label:'Agrado coletivo · Concluído'}, {kind:'ITEM',id:'private-item',label:'Trabalho particular — Pessoa Exemplo · 30/09/2026'}, {kind:'SERVICE',id:'service-1',label:'Serviço — Agrado Coletivo'}];
  const app=boot(async(name,args)=>{if(name==='v4_cost_destinations')return destinations;if(name==='v4_api_save_expense'){saved.push(args.p_data);return {id:'expense-1'};}if(name==='v4_finance_management')return {expenses:[],pendingCostsCents:0};return [];});
  const e=id=>app.w.document.getElementById(id);
  try {
    await e('newExpense').onclick();
    assert.equal(e('expenseScope').value,'WORK');assert.equal(e('expenseScope').querySelector('[value="STOCK"]'),null);
    assert(e('expenseWork0').textContent.includes('Concluído'));assert(e('expenseWork0').textContent.includes('Pessoa Exemplo'));assert(e('expenseWork0').textContent.includes('Serviço — Agrado'));
    e('expenseDescription').value='Velas';e('expenseCategory').value='ESTOQUE';e('expenseAmount').value='10,00';
    await e('expenseForm').onsubmit({preventDefault(){}});
    assert.equal(saved.length,0);assert(e('expenseMsg').textContent.includes('Selecione o destino'));
    e('expenseSearch0').value='pessoa exemplo';e('expenseSearch0').dispatchEvent(new app.w.Event('input'));assert.equal(e('expenseWork0').options.length,2);
    e('expenseWork0').value='ITEM:private-item';
    await e('expenseForm').onsubmit({preventDefault(){}});
    assert.equal(saved[0].allocations[0].itemId,'private-item');assert.equal(saved[0].allocations[0].amountCents,1000);assert.equal(saved[0].category,'ESTOQUE');
    await e('newExpense').onclick();e('expenseScope').value='WORK';e('expenseScope').dispatchEvent(new app.w.Event('change'));e('expenseWork0').value='SERVICE:service-1';e('expenseAmount').value='5,00';
    await e('expenseForm').onsubmit({preventDefault(){}});assert.equal(saved[1].allocations[0].serviceId,'service-1');
    await e('newExpense').onclick();e('expenseScope').value='FIXED';e('expenseScope').dispatchEvent(new app.w.Event('change'));e('expenseAmount').value='10,00';
    await e('expenseForm').onsubmit({preventDefault(){}});assert.equal(saved[2].scope,'FIXED');assert.equal(saved[2].allocations.length,0);
  }finally{app.close();}
});
test('long lists and birthdays start collapsed; people search and debt filters remain above birthdays',async()=>{
  const app=boot(async()=>[]),w=app.w,e=id=>w.document.getElementById(id);
  try{
    for(const id of ['annualTable','paymentList','peopleList','workList','questionList','houseList','receivableList','collectionList','expenseList','participantRanking','financialVoids']){
      const box=e(id+'Disclosure');assert.equal(box.open,false,id);box.querySelector('summary').click();assert.equal(box.open,true,id);box.querySelector('summary').click();assert.equal(box.open,false,id);
    }
    assert.equal(e('birthdayDisclosure').open,false);
    assert(e('peopleQuery').compareDocumentPosition(e('birthdayDisclosure'))&w.Node.DOCUMENT_POSITION_FOLLOWING);
    assert(e('peopleBalanceFilter').compareDocumentPosition(e('birthdayDisclosure'))&w.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(e('peopleQuery').closest('details'),null);assert.equal(e('peopleBalanceFilter').closest('details'),null);
    assert.equal(e('peopleBalanceFilter').querySelector('[value="DEBT"]').textContent,'Com pagamento pendente');
    for(const query of ['Pessoa Exemplo','551199998888']){
      e('peopleQuery').value=query;e('peopleQuery').dispatchEvent(new w.Event('input',{bubbles:true}));
      await new Promise(r=>setTimeout(r,300));
      const call=app.calls.filter(x=>x.name==='v4_people_with_balances').at(-1);assert.equal(call.args.p_query,query);assert.equal(e('peopleListDisclosure').open,true);assert.equal(e('birthdayDisclosure').open,false);
    }
    e('peopleBalanceFilter').value='DEBT';e('peopleBalanceFilter').dispatchEvent(new w.Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,0));assert.equal(app.calls.filter(x=>x.name==='v4_people_with_balances').at(-1).args.p_balance_filter,'DEBT');
  }finally{app.close();}
});

test('person debts identify the work and date and keep regularization attached to the original obligation',async()=>{
  const person={id:'person-ux',fullName:'Pessoa Exemplo',phone:'551199998888',birthDate:'1990-01-01'},debt={obligationId:'obligation-ux',serviceName:'Agrado Coletivo 2026',serviceCategory:'AGRADO_COLETIVO',workTitle:'Sete Saias',workDate:'2026-09-10T15:00:00Z',totalCents:7000,receivedCents:0,pendingCents:7000,explicitStatus:'SETTLED'};
  const history=Array.from({length:30},(_,i)=>({event_type:i%2?'WORK':'PAYMENT',title:i%2?'Sete Saias':'Pagamento recebido',status:i%2?'DONE':'PAID',detail:i%2?'DONE':'PIX',occurred_at:i<15?'2026-09-10T12:00:00Z':'2026-08-10T12:00:00Z',amount_cents:7000}));
  const app=boot(async(name)=>{
    if(name==='v4_people_with_balances')return [{id:person.id,full_name:person.fullName,debt_cents:7000}];
    if(name==='v4_person_record')return person;
    if(name==='v4_person_detail')return {person,history,workCount:1};
    if(name==='v4_person_financial_position')return {creditCents:0,debtCents:7000,debtEvidence:[debt]};
    return [];
  });
  try{
    await app.api.loadPeople();const card=app.w.document.querySelector('.personCard');card.open=true;await app.api.loadPersonDetail(card);
    const pending=card.querySelector('.personDebtRow');assert.equal(pending.querySelector('strong').textContent,'Sete Saias');assert(pending.textContent.includes('10/09/2026'));assert(pending.textContent.includes('Agrado Coletivo 2026'));assert(pending.textContent.includes('Total contratado'));assert(pending.textContent.includes('Recebido associado'));assert(pending.querySelector('.personAlert').textContent.includes('Cadastro marcado como concluído'));
    assert.equal(card.querySelector('.personHistorySection').open,false);assert.equal(card.querySelector('.personProfileSection').open,false);assert(card.querySelector('.personBalance.personDebt'));
    card.querySelector('.personHistorySection summary').click();assert.equal(card.querySelector('.personHistorySection').open,true);assert.equal(card.querySelectorAll('.personHistoryRow').length,30);assert.equal(card.querySelectorAll('.historyMonth').length,2);assert(card.querySelector('.personHistory').textContent.includes('Trabalho concluído'));assert(card.querySelector('.personHistory').textContent.includes('Recebimento confirmado'));
    await app.api.openDebtRegularization(pending.querySelector('.regularizeDebt'));
    const form=app.w.document.getElementById('regularizationForm');assert.equal(form.dataset.obligationId,debt.obligationId);assert.equal(form.dataset.personId,person.id);assert(form.textContent.includes('Sete Saias'));assert(form.textContent.includes('10/09/2026'));assert(!app.calls.some(c=>c.name==='v4_api_regularize_obligation'));
  }finally{app.close();}
});
test('person detail marks unidentified work explicitly and safely renders history and cancelled receipts',()=>{
  const app=boot();
  try{
    const target=app.w.document.createElement('div');app.w.document.body.appendChild(target);
    app.api.renderPersonDetail(target,{person:{id:'person-2',fullName:'Outra pessoa'},financial:{creditCents:1200,debtCents:7000,creditEvidence:[{label:'Crédito recebido',amountCents:1200}],debtEvidence:[{obligationId:'debt-2',serviceName:'Agrado coletivo',serviceCategory:'AGRADO_COLETIVO',pendingCents:7000}]},history:[{event_type:'PAYMENT',title:'<script>alert(1)</script>',status:'CANCELLED',detail:'PIX',amount_cents:7000,occurred_at:'2026-09-01'}]});
    assert(target.querySelector('.personDebtRow .personAlert').textContent.includes('Trabalho específico não identificado'));assert.equal(target.querySelector('.regularizeDebt').dataset.serviceName,'Agrado coletivo');assert.equal(target.querySelectorAll('script').length,0);assert(target.textContent.includes('<script>alert(1)</script>'));assert(target.textContent.includes('Recebimento excluído'));assert(target.querySelector('.historyCancelled'));assert.equal(target.querySelector('.personCreditSection').open,false);assert.equal(target.querySelector('.personHistorySection').open,false);
  }finally{app.close();}
});

test('regularization requires a responsible and sends it with the original obligation in all payment modes',async()=>{
  const team=['Yasmin','Lourdes','Rosely'].map((full_name,i)=>({member_id:'member-'+i,full_name}));
  for(const mode of ['MANUAL','EXISTING','ASAAS']){
    const writes=[];const app=boot(async(name,args)=>{
      if(name==='v4_team_members')return team;
      if(mode==='EXISTING'&&name==='v4_unassociated_receipts')return {payments:[{payment_id:'received-1',payer_person_id:'person-1',signed_unallocated_cents:22000}]};
      if(mode==='ASAAS'&&name==='v4_unassociated_receipts')return {asaas:[{entry_id:'asaas-1',matched_person_id:'person-1',amount_cents:22000}]};
      if(name==='v4_api_regularize_obligation'){writes.push(args);throw new Error('stop before refresh');}
      return [];
    });
    try{
      const button=app.w.document.createElement('button');Object.assign(button.dataset,{obligationId:'debt-1',personId:'person-1',pendingCents:'22000',serviceName:'Limpeza coletiva'});
      await app.api.openDebtRegularization(button);
      const e=id=>app.w.document.getElementById(id),form=e('regularizationForm');
      assert.deepEqual([...e('regResponsible').options].slice(1).map(x=>x.textContent),['Yasmin','Lourdes','Rosely']);assert(e('regResponsible').required);
      await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(writes.length,0);assert(e('regularizationMsg').textContent.includes('Selecione o responsável'));
      e('regResponsible').value='member-2';await form.onsubmit({preventDefault(){},currentTarget:form});
      assert.equal(writes.length,1);assert.equal(writes[0].p_obligation_id,'debt-1');assert.equal(writes[0].p_payload.responsibleMemberId,'member-2');assert.equal(writes[0].p_payload.mode,mode);
      button.dataset.responsibleId='member-1';await app.api.openDebtRegularization(button);assert.equal(e('regResponsible').value,'member-1');
    }finally{app.close();}
  }
});

test('receipt reserve card uses backend amount and opens per-entry evidence',async()=>{
  const app=boot(async(name)=>name==='v4_finance_dashboard_filtered'?{salesCents:526500,reserveCents:157950,commissionTotalCents:368550,reserveEvidence:[{personName:'Pessoa <script>',serviceName:'Limpeza',paidAt:'2026-10-03T12:00:00Z',costBp:3000,baseCents:22000,amountCents:6600}]}:[]);
  try{
    await app.api.loadFinance();const card=app.w.document.querySelector('[data-finance-detail="reserve"]');assert(card);assert(card.textContent.includes('RESERVA PARA CUSTOS'));assert.match(card.textContent,/1\.579,50/);
    card.click();const list=app.w.document.getElementById('financeEvidenceList');assert(list.textContent.includes('Limpeza'));assert(list.textContent.includes('30%'));assert.match(list.textContent,/66,00/);assert.equal(list.querySelector('script'),null);
  }finally{app.close();}
});


test('consultation exemption is shown as complete gross distributions',async()=>{
  const policies=[{valid_from:'2026-10-08',reserve_bp:3000,commission_bp:1050,responsible_bp:4900,consultation_reserve_status:'EXEMPT'},{valid_from:'2026-11-01',reserve_bp:3000,commission_bp:1500,responsible_bp:4000,consultation_reserve_status:'EXEMPT'}];
  const app=boot(async(name)=>name==='v4_receipt_distribution_policies'?policies:name==='v4_finance_management'?{cash:{pendingTransferCents:0},annual:[],profile:{peopleCount:0,participations:0,ageGroups:[],sexGroups:[],serviceGroups:[],topPeople:[]},categoryBreakdown:[],voids:[]}:[]);
  try{
    app.api.state.me={permissions:['dashboard.read','record.update']};
    await app.api.operations.onPage('faturamento');
    const rows=[...app.w.document.querySelectorAll('#distributionPolicies tbody tr')];assert.equal(rows.length,4);
    const cells=rows.map(r=>[...r.querySelectorAll('td')].map(c=>c.childNodes[0].textContent));
    assert.deepEqual(cells[1].slice(1),['0%','10,5%','10,5%','79%','100%']);
    assert.deepEqual(cells[3].slice(1),['0%','15%','15%','70%','100%']);
    assert.deepEqual(cells[0].slice(1),['30%','10,5%','10,5%','49%','100%']);
  }finally{app.close();}
});

test('editing a consultation uses the receipt date and the integral commission base',()=>{
  for(const [paidAt,expectedOwner,expectedOther]of [['2026-10-08T03:00:00Z','79,00','10,50'],['2026-11-01T03:00:00Z','70,00','15,00']]){
    const app=boot();
    try{
      app.api.state.team=[{member_id:'y',full_name:'Yasmin'},{member_id:'l',full_name:'Lourdes'},{member_id:'r',full_name:'Rosely'}];
      app.api.state.paymentDetails={p:{payment:{paidAt},allocations:[{itemId:'i',serviceCategory:'CONSULTA',responsibleMemberId:'y',totalCents:100000}]}};
      app.api.operations.editItem('p','i');
      assert.equal(app.w.document.getElementById('splitCost').value,'0,00');
      assert.equal(app.w.document.getElementById('splitCost').readOnly,true);
      assert.equal(app.w.document.getElementById('splity').value,expectedOwner);
      assert.equal(app.w.document.getElementById('splitl').value,expectedOther);
      assert.equal(app.w.document.getElementById('splitr').value,expectedOther);
    }finally{app.close();}
  }
});
test('receipt categories open a simple list that closes the category total',async()=>{
  const app=boot(async(name)=>name==='v4_finance_dashboard_filtered'?{
    salesCents:1022500,categories:{TRABALHO_PARTICULAR:962500,CONSULTA:60000},
    salesEvidence:[
      {category:'TRABALHO_PARTICULAR',personName:'Cliente A',serviceName:'Trabalho particular',eventName:'Limpeza e blindagem',responsibleName:'Rosely',eventDate:'2026-10-07',amountCents:900000},
      {category:'TRABALHO_PARTICULAR',personName:'Cliente <script>',serviceName:'Trabalho particular',workTitle:'Proteção',responsibleName:'Lourdes',eventDate:'2026-10-06',amountCents:62500},
      {category:'CONSULTA',personName:'Cliente da consulta',serviceName:'Consulta',responsibleName:'Yasmin',eventDate:'2026-10-05',amountCents:60000}
    ]
  }:[]);
  try{
    await app.api.loadFinance();
    const d=app.w.document;d.querySelector('[data-finance-category="TRABALHO_PARTICULAR"]').click();
    const list=d.getElementById('financeEvidenceList');
    assert.match(d.getElementById('financeEvidenceTitle').textContent,/Trabalho particular.*recebimentos/);
    assert.match(list.textContent,/9\.625,00/);assert.match(list.textContent,/Cliente A/);assert.match(list.textContent,/Limpeza e blindagem/);assert.match(list.textContent,/Responsável: Rosely/);assert.match(list.textContent,/Responsável: Lourdes/);
    assert(!list.textContent.includes('Cliente da consulta'));assert.equal(list.querySelector('script'),null);assert.equal(list.querySelectorAll('.row').length,2);
    list.querySelector('[data-finance-detail="categories"]').click();
    d.querySelector('#financeEvidenceList [data-finance-category="CONSULTA"]').click();
    assert.match(d.getElementById('financeEvidenceList').textContent,/Cliente da consulta/);
    assert(!d.getElementById('financeEvidenceList').textContent.includes('Cliente A'));
  }finally{app.close();}
});

test('manual entry offers Premium and selecting its service selects the right category',()=>{
  const app=boot();
  try{
    app.api.state.services=[{service_id:'premium',name:'Trabalho Coletivo Premium',category:'TRABALHO_COLETIVO_PREMIUM',default_price_cents:30000},{service_id:'private',name:'Trabalho Particular',category:'TRABALHO_PARTICULAR'}];
    app.api.openEntry();const d=app.w.document,category=d.getElementById('entryCategory');
    assert([...category.options].some(x=>x.value==='Trabalho coletivo premium'));
    category.value='Trabalho particular';d.getElementById('entryService').value='premium';
    d.getElementById('entryService').dispatchEvent(new app.w.Event('change',{bubbles:true}));
    assert.equal(category.value,'Trabalho coletivo premium');
    assert.equal(app.api.entryCategoryCode(),'TRABALHO_COLETIVO_PREMIUM');
  }finally{app.close();}
});

test('private work descriptions stay with each person and reach the saved service name',async()=>{
  const app=boot(async(name,args)=>name==='v4_api_resolve_person'?args.p_person_id:[]),w=app.w,d=w.document;
  try{
    app.api.state.services=[{service_id:'private',name:'Trabalho Particular',category:'TRABALHO_PARTICULAR'}];
    app.api.openEntry();
    d.getElementById('entryService').value='private';
    d.getElementById('entryService').dispatchEvent(new w.Event('change',{bubbles:true}));
    assert.equal(app.api.entryCategoryCode(),'TRABALHO_PARTICULAR');
    let description=d.querySelector('.partPrivateWork');
    assert(description.required);assert(!description.closest('.privateOnly').classList.contains('hidden'));
    description.value='Limpeza espiritual';
    d.getElementById('qty').value='2';d.getElementById('qty').dispatchEvent(new w.Event('change',{bubbles:true}));
    assert.equal(d.querySelectorAll('.partPrivateWork')[0].value,'Limpeza espiritual');
    assert.equal(d.querySelectorAll('.partPrivateWork')[1].value,'');
    const nodes=[...d.querySelectorAll('.participant')];
    nodes.forEach((n,i)=>{n.querySelector('.personIdInput').value='person-'+i;n.querySelector('.personNameInput').value='Pessoa '+i;n.querySelector('.partBirth').value='1990-01-01';n.querySelector('.partAmount').value='1200,00';});
    const responsible=d.getElementById('entryResponsible');responsible.insertAdjacentHTML('beforeend','<option value="member">Responsável</option>');responsible.value='member';
    let saved;app.api.operations.saveEntry=async p=>{saved=p;};
    await d.getElementById('entryForm').onsubmit({preventDefault(){}});
    assert.equal(saved,undefined);assert.match(d.getElementById('entryMsg').textContent,/cada pessoa/);
    d.querySelectorAll('.partPrivateWork')[1].value='Proteção <especial>';
    await d.getElementById('entryForm').onsubmit({preventDefault(){}});
    assert(saved,d.getElementById('entryMsg').textContent);assert.equal(saved.items[0].serviceName,'Limpeza espiritual');assert.equal(saved.items[1].serviceName,'Proteção <especial>');
    assert(saved.items.every(x=>x.serviceCategory==='TRABALHO_PARTICULAR'&&x.serviceId==='private'));
  }finally{app.close();}
});

test('payment matching ranks existing debts and permits partial/third-party association without a new sale',async()=>{
 const debts=[{obligationId:'other',personId:'third-party',personName:'Outra pessoa',eventName:'Outro trabalho',pendingCents:20000}, {obligationId:'mine',personId:'person-1',personName:'Cliente',eventName:'Sete Saias',pendingCents:7000,responsibleMemberId:'r',soldAt:'2026-09-10'}];
 const writes=[];const app=boot(async(name,args)=>{if(name==='v4_payment_debt_candidates')return debts;if(name==='v4_api_match_payments_to_debt'){writes.push(args.p_payload);throw Object.assign(new Error('teste'),{code:'P0001'});}return [];});
 try{
  app.api.state.team=[{member_id:'r',full_name:'Rosely'}];app.api.openEntry({kind:'EXISTING',paymentId:'pix-1',payerPersonId:'person-1',amountCents:5000});
  await new Promise(r=>setTimeout(r,0));const e=id=>app.w.document.getElementById(id),form=e('entryForm');
  assert.equal(e('associationDestination').value,'DEBT');assert.equal(e('debtChoice').value,'');assert.equal(e('newServiceFields').disabled,true);assert.equal(e('debtChoice').options[1].value,'mine');
  e('debtChoice').value='mine';e('debtChoice').dispatchEvent(new app.w.Event('change'));assert.equal(e('debtAmount').value,'50,00');assert(e('debtPreview').textContent.includes('20,00'));
  await form.onsubmit({preventDefault(){}});assert.equal(writes[0].obligationId,'mine');assert.equal(writes[0].amountCents,5000);assert.equal(writes[0].payments[0].id,'pix-1');
  e('debtChoice').value='other';e('debtChoice').dispatchEvent(new app.w.Event('change'));e('debtResponsible').value='r';await form.onsubmit({preventDefault(){}});assert.equal(writes[1].obligationId,'other');
  e('associationDestination').value='NEW';e('associationDestination').dispatchEvent(new app.w.Event('change'));assert.equal(e('newServiceFields').disabled,false);assert.equal(e('existingDebtFields').disabled,true);
  assert(!app.calls.some(c=>c.name.includes('register_manual')||c.name.includes('associate_existing_payment_operational')));
 }finally{app.close();}
});
test('uncertain debt association survives reopening and retries its exact committed request',async()=>{
 const requests=[];const app=boot(async(name,args)=>{if(name==='v4_payment_debt_candidates')return [{obligationId:'debt',personId:'person',personName:'Cliente',eventName:'Limpeza',pendingCents:10000,responsibleMemberId:'r'}];if(name==='v4_api_match_payments_to_debt'){requests.push(args.p_payload);throw new Error('Connection lost');}return [];});
 try{
  app.api.state.team=[{member_id:'r',full_name:'Rosely'}];app.api.openEntry({kind:'ASAAS',entryId:'asaas',amountCents:10000});await new Promise(r=>setTimeout(r,0));
  let e=id=>app.w.document.getElementById(id);e('debtChoice').value='debt';e('debtChoice').dispatchEvent(new app.w.Event('change'));await e('entryForm').onsubmit({preventDefault(){}});
  assert(app.w.sessionStorage.getItem('sunshine.debtMatch.v1'));assert(e('associationDestination').disabled);
  app.api.openEntry({kind:'EXISTING',paymentId:'different',amountCents:20000});await new Promise(r=>setTimeout(r,0));await e('entryForm').onsubmit({preventDefault(){}});
  assert.equal(requests.length,2);assert.equal(JSON.stringify(requests[0]),JSON.stringify(requests[1]));
 }finally{app.close();}
});

test('new service warns about a debt under a verified related person record',async()=>{
 const app=boot(async name=>name==='v4_payment_debt_candidates'?[{obligationId:'original-debt',personId:'canonical-person',identityPersonIds:['canonical-person','other-record'],personName:'Cliente',eventName:'Trabalho original',pendingCents:20000,responsibleMemberId:'r'}]:[]);
 try{
  app.api.state.team=[{member_id:'r',full_name:'Rosely'}];app.w.confirm=()=>false;
  app.api.openEntry({kind:'EXISTING',paymentId:'receipt',payerPersonId:'other-record',amountCents:20000});await new Promise(r=>setTimeout(r,0));
  const e=id=>app.w.document.getElementById(id);assert(e('debtChoice').options[1].textContent.includes('Desta pessoa'));
  e('associationDestination').value='NEW';e('associationDestination').dispatchEvent(new app.w.Event('change'));
  await e('entryForm').onsubmit({preventDefault(){}});assert.equal(e('associationDestination').value,'DEBT');
  assert(!app.calls.some(c=>c.name.includes('associate_existing_payment_operational')));
 }finally{app.close();}
});
