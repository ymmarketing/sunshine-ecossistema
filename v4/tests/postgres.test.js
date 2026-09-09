import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { chromium } from 'playwright'
import { runMigrations } from '../src/migrate.js'
import { PostgresRepository } from '../src/repository.js'
import { createHttpServer } from '../src/app.js'
import { seedDemo } from '../src/seed.js'
import { DEMO_USERS } from '../src/auth.js'

const { Pool } = pg
const databaseUrl = process.env.TEST_DATABASE_URL
const pgtest = databaseUrl ? test : test.skip
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 16 }) : null
const ADMIN = DEMO_USERS.find(x=>x.role==='ADMIN').id
const FINANCE = DEMO_USERS.find(x=>x.role==='FINANCE').id
const OPERATOR = DEMO_USERS.find(x=>x.role==='OPERATOR').id
const VIEWER = DEMO_USERS.find(x=>x.role==='VIEWER').id
const NOBODY = '00000000-0000-4000-8000-000000000099'
let repo, server, baseUrl, browser

function dateKey(v){return v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10)}
async function appClient(userId){const c=await pool.connect();await c.query('set role v4_app');await c.query("select set_config('app.user_id',$1,false)",[userId]);return c}
async function releaseApp(c){try{try{await c.query('reset role')}catch{};try{await c.query("select set_config('app.user_id','',false)")}catch{}}finally{c.release()}}
async function asApp(userId,fn){const c=await appClient(userId);try{return await fn(c)}finally{await releaseApp(c)}}
async function createPerson(userId=ADMIN,name='Pessoa Demo'){return asApp(userId,async c=>(await c.query('select sunshine_v4.v4_create_person($1,$2,$3,$4) id',[name,null,null,null])).rows[0].id)}
async function createContract(customerId,items,key='contract-demo'){return asApp(ADMIN,async c=>(await c.query('select sunshine_v4.v4_create_contract($1,$2,$3::jsonb,$4) id',[customerId,'MANUAL_DEMO',JSON.stringify(items),key])).rows[0].id)}
async function obligationIds(contractId){return (await pool.query('select o.id from sunshine_v4.obligations o join sunshine_v4.contract_items i on i.id=o.contract_item_id where i.contract_id=$1 order by i.created_at,i.id',[contractId])).rows.map(r=>r.id)}
async function createPayment(payerId,amount=7000,key='pay-demo'){return asApp(FINANCE,async c=>(await c.query('select sunshine_v4.v4_create_payment($1,$2::jsonb,$3,$4,$5,$6,$7) id',[payerId,JSON.stringify({name:'Pagador Demo'}),'MANUAL_DEMO',key,amount,'2026-09-09T12:00:00Z',key])).rows[0].id)}
async function allocate(paymentId,obligationId,amount,key){return asApp(FINANCE,async c=>(await c.query('select sunshine_v4.v4_allocate_payment($1,$2,$3,$4) id',[paymentId,obligationId,amount,key])).rows[0].id)}
async function http(path,{method='GET',token,body}={}){const r=await fetch(baseUrl+path,{method,headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();return {status:r.status,data}}
async function login(username,password){const r=await http('/api/auth/login',{method:'POST',body:{username,password}});assert.equal(r.status,200);return r.data.token}

before(async()=>{
  if(!databaseUrl)return
  process.env.V4_ENVIRONMENT='ci';process.env.V4_ISOLATED_DEMO='1';process.env.V4_DEMO_AUTH_SECRET=process.env.V4_DEMO_AUTH_SECRET||'ci-only-secret-123456789'
  await pool.query('drop schema if exists sunshine_v4 cascade')
  const first=await runMigrations(pool,{gitSha:'test-first'});assert.equal(first.length,3);assert.ok(first.every(x=>x.status==='applied'))
  const second=await runMigrations(pool,{gitSha:'test-second'});assert.ok(second.every(x=>x.status==='already_applied'))
  await seedDemo(pool,{businessData:false})
  repo=new PostgresRepository(pool);server=createHttpServer(repo);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));baseUrl=`http://127.0.0.1:${server.address().port}`
  browser=await chromium.launch({headless:true})
})
after(async()=>{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));if(pool)await pool.end()})
beforeEach(async()=>{if(!databaseUrl)return;await pool.query(`truncate table sunshine_v4.commission_entries,sunshine_v4.collection_tasks,sunshine_v4.payment_promises,sunshine_v4.payment_allocations,sunshine_v4.payments,sunshine_v4.obligations,sunshine_v4.contract_items,sunshine_v4.contracts,sunshine_v4.commission_rules,sunshine_v4.audit_events,sunshine_v4.people cascade`)})

pgtest('ledger de migrations é canônico, idempotente e PostgreSQL 17',async()=>{
  assert.match((await pool.query('show server_version')).rows[0].server_version,/^17\./)
  const ledger=await pool.query('select migration_name,checksum_sha256 from sunshine_v4._migration_ledger order by migration_name')
  assert.deepEqual(ledger.rows.map(r=>r.migration_name),['001_domain_schema.sql','002_security_rls_audit.sql','003_transactional_functions_views.sql'])
  assert.ok(ledger.rows.every(r=>/^[a-f0-9]{64}$/.test(r.checksum_sha256)))
  assert.equal((await pool.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='sunshine_v4' and c.relkind='r' and c.relrowsecurity")).rows[0].n,11)
})

pgtest('RLS filtra leitura e permissões impedem escrita financeira indevida',async()=>{
  const person=await createPerson(ADMIN,'RLS Demo')
  await asApp(NOBODY,async c=>assert.equal((await c.query('select * from sunshine_v4.people')).rowCount,0))
  await asApp(VIEWER,async c=>assert.deepEqual((await c.query('select id from sunshine_v4.people')).rows.map(x=>x.id),[person]))
  await assert.rejects(asApp(OPERATOR,c=>c.query('select sunshine_v4.v4_create_payment($1,null,$2,$3,$4,now(),$5)',[person,'MANUAL_DEMO','DENIED',3000,'DENIED'])),/forbidden: payment.create/)
  await assert.rejects(asApp(FINANCE,c=>c.query("insert into sunshine_v4.payments(source,amount_cents,paid_at) values('X',100,now())")),/permission denied/)
})

pgtest('falha intermediária na contratação faz rollback total',async()=>{
  const person=await createPerson();await assert.rejects(createContract(person,[{beneficiaryPersonId:person,serviceCode:'A',serviceName:'A',amountCents:7000},{beneficiaryPersonId:person,serviceCode:'B',serviceName:'B',amountCents:0}],'rollback-contract'),/item amount must be positive/)
  for(const table of ['contracts','contract_items','obligations'])assert.equal((await pool.query(`select count(*)::int n from sunshine_v4.${table}`)).rows[0].n,0)
  assert.equal((await pool.query("select count(*)::int n from sunshine_v4.audit_events where action='CONTRACT_CREATED'")).rows[0].n,0)
})

pgtest('saldo persistente e excesso legítimo ficam explícitos',async()=>{
  const person=await createPerson();const contract=await createContract(person,[{beneficiaryPersonId:person,serviceCode:'AGRADO',serviceName:'Agrado',amountCents:3500}]);const [obligation]=await obligationIds(contract);const payment=await createPayment(person,5000,'EXCESS-1');await allocate(payment,obligation,3500,'ALLOC-EXCESS')
  const o=(await pool.query('select * from sunshine_v4.obligation_reconciliation where obligation_id=$1',[obligation])).rows[0];const p=(await pool.query('select * from sunshine_v4.payment_reconciliation where payment_id=$1',[payment])).rows[0]
  assert.equal(Number(o.signed_balance_cents),0);assert.equal(Number(p.signed_unallocated_cents),1500);assert.equal(o.is_overallocated,false);assert.equal(p.is_overallocated,false)
})

pgtest('concorrência real impede duas transações de consumir o mesmo saldo',async()=>{
  const person=await createPerson();const contract=await createContract(person,[{beneficiaryPersonId:person,serviceCode:'A',serviceName:'A',amountCents:10000},{beneficiaryPersonId:person,serviceCode:'B',serviceName:'B',amountCents:10000}],'conc-contract');const [o1,o2]=await obligationIds(contract);const payment=await createPayment(person,10000,'CONC-PAY');const c1=await appClient(FINANCE),c2=await appClient(FINANCE)
  try{const settled=await Promise.allSettled([c1.query('select sunshine_v4.v4_allocate_payment($1,$2,$3,$4) id',[payment,o1,10000,'CONC-A']),c2.query('select sunshine_v4.v4_allocate_payment($1,$2,$3,$4) id',[payment,o2,10000,'CONC-B'])]);assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);assert.equal(settled.filter(x=>x.status==='rejected').length,1);assert.match(settled.find(x=>x.status==='rejected').reason.message,/payment overallocation/)}finally{await releaseApp(c1);await releaseApp(c2)}
  const r=(await pool.query('select count(*)::int n,coalesce(sum(amount_cents),0)::bigint total from sunshine_v4.payment_allocations where payment_id=$1',[payment])).rows[0];assert.equal(r.n,1);assert.equal(Number(r.total),10000)
})

pgtest('rollback real desfaz alocação e auditoria após falha posterior',async()=>{
  const person=await createPerson();const contract=await createContract(person,[{beneficiaryPersonId:person,serviceCode:'A',serviceName:'A',amountCents:7000}],'tx-contract');const [obligation]=await obligationIds(contract);const payment=await createPayment(person,7000,'TX-PAY');const c=await appClient(FINANCE)
  try{await c.query('begin');await c.query('select sunshine_v4.v4_allocate_payment($1,$2,$3,$4)',[payment,obligation,7000,'TX-ALLOC']);await assert.rejects(c.query('select 1/0'),/division by zero/);await c.query('rollback')}finally{await releaseApp(c)}
  assert.equal((await pool.query("select count(*)::int n from sunshine_v4.payment_allocations where idempotency_key='TX-ALLOC'")).rows[0].n,0);assert.equal((await pool.query("select count(*)::int n from sunshine_v4.audit_events where action='PAYMENT_ALLOCATED'")).rows[0].n,0)
})

pgtest('idempotência SQL de pagamento funciona sob repetição concorrente',async()=>{
  const person=await createPerson();const c1=await appClient(FINANCE),c2=await appClient(FINANCE)
  try{const args=[person,null,'MANUAL_DEMO','IDEM-CONCURRENT',3000,'2026-09-09T12:00:00Z','IDEM-CONCURRENT'];const [a,b]=await Promise.all([c1.query('select sunshine_v4.v4_create_payment($1,$2,$3,$4,$5,$6,$7) id',args),c2.query('select sunshine_v4.v4_create_payment($1,$2,$3,$4,$5,$6,$7) id',args)]);assert.equal(a.rows[0].id,b.rows[0].id)}finally{await releaseApp(c1);await releaseApp(c2)}
  assert.equal((await pool.query("select count(*)::int n from sunshine_v4.payments where idempotency_key='IDEM-CONCURRENT'")).rows[0].n,1)
})

pgtest('idempotência SQL de alocação funciona sob repetição concorrente',async()=>{
  const person=await createPerson();const contract=await createContract(person,[{beneficiaryPersonId:person,serviceCode:'A',serviceName:'A',amountCents:7000}],'idem-alloc-contract');const [obligation]=await obligationIds(contract);const payment=await createPayment(person,7000,'IDEM-ALLOC-PAY');const c1=await appClient(FINANCE),c2=await appClient(FINANCE)
  try{const args=[payment,obligation,7000,'IDEM-ALLOC'];const [a,b]=await Promise.all([c1.query('select sunshine_v4.v4_allocate_payment($1,$2,$3,$4) id',args),c2.query('select sunshine_v4.v4_allocate_payment($1,$2,$3,$4) id',args)]);assert.equal(a.rows[0].id,b.rows[0].id)}finally{await releaseApp(c1);await releaseApp(c2)}
  const r=(await pool.query("select count(*)::int n,coalesce(sum(amount_cents),0)::bigint total from sunshine_v4.payment_allocations where idempotency_key='IDEM-ALLOC'")).rows[0];assert.equal(r.n,1);assert.equal(Number(r.total),7000)
})

pgtest('auditoria é append-only em nível de banco',async()=>{await createPerson(ADMIN,'Audit Demo');const row=(await pool.query('select id from sunshine_v4.audit_events limit 1')).rows[0];await assert.rejects(pool.query("update sunshine_v4.audit_events set action='TAMPERED' where id=$1",[row.id]),/append-only/);await assert.rejects(pool.query('delete from sunshine_v4.audit_events where id=$1',[row.id]),/append-only/)})

pgtest('promessas preservam histórico e vencimento original',async()=>{
  const person=await createPerson();const contract=await createContract(person,[{beneficiaryPersonId:person,serviceCode:'PARTICULAR',serviceName:'Particular',amountCents:60000,dueDate:'2026-09-08'}],'promise-contract');const [obligation]=await obligationIds(contract);await asApp(FINANCE,c=>c.query('select sunshine_v4.v4_create_payment_promise($1,$2,$3,$4)',[obligation,'2026-09-15',null,'primeira']));await asApp(FINANCE,c=>c.query('select sunshine_v4.v4_create_payment_promise($1,$2,$3,$4)',[obligation,'2026-09-20','2026-09-19','segunda']));const o=(await pool.query('select due_date,expected_payment_date,next_collection_date from sunshine_v4.obligations where id=$1',[obligation])).rows[0];assert.equal(dateKey(o.due_date),'2026-09-08');assert.equal(dateKey(o.expected_payment_date),'2026-09-20');assert.equal(dateKey(o.next_collection_date),'2026-09-19');assert.equal((await pool.query('select count(*)::int n from sunshine_v4.payment_promises where obligation_id=$1',[obligation])).rows[0].n,2)
})

pgtest('comissão persistente nasce da alocação e regra histórica não é recalculada',async()=>{
  const person=await createPerson();const contract=await createContract(person,[{beneficiaryPersonId:person,serviceCode:'PARTICULAR',serviceName:'Particular',amountCents:60000}],'commission-contract');const [obligation]=await obligationIds(contract);await asApp(ADMIN,c=>c.query('select sunshine_v4.v4_create_commission_rule($1,$2,$3,$4,$5,$6)',['PARTICULAR','DEMO',1000,1,'2026-01-01T00:00:00Z',null]));const payment=await createPayment(person,30000,'COM-PAY');await allocate(payment,obligation,30000,'COM-ALLOC');const before=(await pool.query('select base_cents,amount_cents from sunshine_v4.commission_entries')).rows[0];assert.equal(Number(before.base_cents),30000);assert.equal(Number(before.amount_cents),3000);await asApp(ADMIN,c=>c.query('select sunshine_v4.v4_create_commission_rule($1,$2,$3,$4,$5,$6)',['PARTICULAR','DEMO',2000,2,'2026-10-01T00:00:00Z',null]));const after=await pool.query('select amount_cents from sunshine_v4.commission_entries');assert.equal(after.rowCount,1);assert.equal(Number(after.rows[0].amount_cents),3000)
})

pgtest('reconciliação expõe inconsistência sem greatest(...,0)',async()=>{
  const person=await createPerson();const contract=await createContract(person,[{beneficiaryPersonId:person,serviceCode:'A',serviceName:'A',amountCents:3500}],'corrupt-contract');const [obligation]=await obligationIds(contract);const payment=await createPayment(person,5000,'CORRUPT-PAY');await pool.query("insert into sunshine_v4.payment_allocations(payment_id,obligation_id,amount_cents,idempotency_key) values($1,$2,6000,'FORCED-INCONSISTENCY')",[payment,obligation]);const o=(await pool.query('select signed_balance_cents,is_overallocated,overallocated_cents from sunshine_v4.obligation_reconciliation where obligation_id=$1',[obligation])).rows[0];const p=(await pool.query('select signed_unallocated_cents,is_overallocated,overallocated_cents from sunshine_v4.payment_reconciliation where payment_id=$1',[payment])).rows[0];assert.equal(Number(o.signed_balance_cents),-2500);assert.equal(o.is_overallocated,true);assert.equal(Number(p.signed_unallocated_cents),-1000);assert.equal(p.is_overallocated,true)
})

pgtest('API exige autenticação e aplica autorização por ação',async()=>{
  assert.equal((await http('/api/state')).status,401)
  const operator=await login('operacao-demo','sunshine-v4-operacao');const person=(await http('/api/people',{method:'POST',token:operator,body:{fullName:'Operador Demo'}}));assert.equal(person.status,201);const denied=await http('/api/payments',{method:'POST',token:operator,body:{payerPersonId:person.data.id,source:'MANUAL_DEMO',externalRef:'NO',amountCents:1000}});assert.equal(denied.status,403);assert.match(denied.data.error,/payment.create/)
})

pgtest('API persistente executa terceiro pagador e múltiplos beneficiários',async()=>{
  const admin=await login('admin-demo','sunshine-v4-admin');const maria=(await http('/api/people',{method:'POST',token:admin,body:{fullName:'Maria API'}})).data;const jakeline=(await http('/api/people',{method:'POST',token:admin,body:{fullName:'Jakeline API'}})).data;const contract=(await http('/api/contracts',{method:'POST',token:admin,body:{customerPersonId:maria.id,idempotencyKey:'api-contract',items:[{beneficiaryPersonId:maria.id,serviceCode:'AGRADO',serviceName:'Agrado API',amountCents:7000},{beneficiaryPersonId:jakeline.id,serviceCode:'AGRADO',serviceName:'Agrado API',amountCents:7000}]}})).data;const payment=(await http('/api/payments',{method:'POST',token:admin,body:{payerPersonId:maria.id,payerSnapshot:{name:'Maria API'},source:'MANUAL_DEMO',externalRef:'API-PAY-140',idempotencyKey:'API-PAY-140',amountCents:14000}})).data;for(const [i,e] of contract.entries.entries()){const a=await http('/api/allocations',{method:'POST',token:admin,body:{paymentId:payment.id,obligationId:e.obligationId,amountCents:7000,idempotencyKey:`api-alloc-${i}`}});assert.equal(a.status,201)}const s=(await http('/api/state',{token:admin})).data;assert.equal(s.summary.openReceivablesCents,0);assert.equal(s.summary.unallocatedPaymentsCents,0);assert.equal(s.allocations.length,2);assert.equal(s.obligations.find(o=>o.beneficiaryPersonId===jakeline.id).receivedCents,7000)
})

pgtest('API persistente mantém parcial, promessa, cobrança e Home reconciliados',async()=>{
  const finance=await login('finance-demo','sunshine-v4-finance');const p=(await http('/api/people',{method:'POST',token:finance,body:{fullName:'Fátima API'}})).data;const c=(await http('/api/contracts',{method:'POST',token:finance,body:{customerPersonId:p.id,idempotencyKey:'partial-api',items:[{beneficiaryPersonId:p.id,serviceCode:'AGRADO',serviceName:'Agrado parcial',amountCents:7000,dueDate:'2026-09-09'}]}})).data;const pay=(await http('/api/payments',{method:'POST',token:finance,body:{payerPersonId:p.id,source:'MANUAL_DEMO',externalRef:'PART-35',idempotencyKey:'PART-35',amountCents:3500}})).data;await http('/api/allocations',{method:'POST',token:finance,body:{paymentId:pay.id,obligationId:c.entries[0].obligationId,amountCents:3500,idempotencyKey:'PART-ALLOC'}});assert.equal((await http('/api/promises',{method:'POST',token:finance,body:{obligationId:c.entries[0].obligationId,promisedFor:'2026-09-20',nextCollectionDate:'2026-09-19'}})).status,201);assert.equal((await http('/api/collection-tasks',{method:'POST',token:finance,body:{obligationId:c.entries[0].obligationId,scheduledFor:'2026-09-19'}})).status,201);const s=(await http('/api/state',{token:finance})).data;assert.equal(s.summary.openReceivablesCents,3500);assert.equal(s.summary.pendingCollectionTasks,1);assert.equal(s.obligations[0].liquidationStatus,'PARTIAL');assert.equal(dateKey(s.obligations[0].expectedPaymentDate),'2026-09-20')
})

pgtest('interface mobile executa fluxo persistente pessoa → parcial → Home',async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(baseUrl);await page.selectOption('#loginUser','admin-demo');await page.fill('#loginPassword','sunshine-v4-admin');await page.click('#loginForm button');await page.waitForSelector('#appView:not(.hidden)');await page.click('.tab[data-tab="flow"]');await page.fill('#personForm input[name="fullName"]','Pessoa Mobile');await page.click('#personForm button');await page.waitForTimeout(80);await page.selectOption('#contractForm select[name="customerPersonId"]',{label:'Pessoa Mobile'});await page.selectOption('#contractForm select[name="beneficiaryPersonId"]',{label:'Pessoa Mobile'});await page.fill('#contractForm input[name="amount"]','70');await page.click('#contractForm button');await page.waitForTimeout(80);await page.selectOption('#paymentForm select[name="payerPersonId"]',{label:'Pessoa Mobile'});await page.fill('#paymentForm input[name="amount"]','35');await page.fill('#paymentForm input[name="externalRef"]','MOBILE-35');await page.click('#paymentForm button');await page.waitForTimeout(80);await page.fill('#allocationForm input[name="amount"]','35');await page.click('#allocationForm button');await page.waitForTimeout(100);await page.click('.tab[data-tab="home"]');await assert.doesNotReject(page.waitForFunction(()=>document.body.innerText.includes('R$ 35,00')||document.body.innerText.includes('R$ 35,00')));await page.click('.tab[data-tab="receivables"]');await assert.doesNotReject(page.waitForFunction(()=>document.body.innerText.includes('PARTIAL')));await page.close()
})

pgtest('interface respeita permissões de OPERATOR e VIEWER',async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(baseUrl);await page.selectOption('#loginUser','operacao-demo');await page.fill('#loginPassword','sunshine-v4-operacao');await page.click('#loginForm button');await page.waitForSelector('#appView:not(.hidden)');await page.click('.tab[data-tab="flow"]');assert.equal(await page.locator('.action[data-permission="payment.create"]').evaluate(el=>el.classList.contains('locked')),true);assert.equal(await page.locator('.action[data-permission="person.create"] button').isDisabled(),false);await page.click('#logoutBtn');await page.selectOption('#loginUser','viewer-demo');await page.fill('#loginPassword','sunshine-v4-viewer');await page.click('#loginForm button');await page.waitForSelector('#appView:not(.hidden)');await page.click('.tab[data-tab="flow"]');assert.equal(await page.locator('.action[data-permission="person.create"] button').isDisabled(),true);assert.equal(await page.locator('.tab[data-tab="audit"]').evaluate(el=>el.classList.contains('hidden')),true);await page.close()
})

pgtest('health reporta banco persistente isolado e migrations',async()=>{const h=await http('/api/health');assert.equal(h.status,200);assert.equal(h.data.isolated,true);assert.equal(h.data.environment,'ci');assert.equal(h.data.migrations.length,3)})
