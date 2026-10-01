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
  w.eval(fs.readFileSync(path.join(root,'assets/finance-operations.js'),'utf8'));
  const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');
  w.eval(inline.replace('\ninit();','\nwindow.__testing={get operations(){return operations},state:state,openEntry:openEntry};init();'));
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
  const saved=[];const app=boot(async(name,args)=>{if(name==='v4_api_save_expense'){saved.push(args);return {id:'expense-1'};}if(name==='v4_finance_management')return {expenses:[],pendingCostsCents:0};return [];});
  try {
    app.api.state.allWorks=[1,2,3].map(i=>({work_id:'work-'+i,title:'Trabalho '+i,status:'OPEN'}));
    app.w.document.getElementById('newExpense').click();
    const e=id=>app.w.document.getElementById(id);
    e('expenseScope').value='SHARED';e('expenseScope').dispatchEvent(new app.w.Event('change'));
    e('addExpenseWork').click();
    e('expenseDescription').value='Velas';e('expenseAmount').value='30,00';
    for(let i=0;i<3;i++){e('expenseWork'+i).value='work-'+(i+1);e('expenseRate'+i).value='10,00';}
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
