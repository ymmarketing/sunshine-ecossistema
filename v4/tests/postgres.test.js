import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Pool } = pg
const databaseUrl = process.env.TEST_DATABASE_URL
const pgtest = databaseUrl ? test : test.skip
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 12 }) : null

const ADMIN='00000000-0000-4000-8000-000000000001'
const FINANCE='00000000-0000-4000-8000-000000000002'
const OPERATOR='00000000-0000-4000-8000-000000000003'
const VIEWER='00000000-0000-4000-8000-000000000004'
const NOBODY='00000000-0000-4000-8000-000000000005'

async function appClient(userId){
  const c=await pool.connect()
  await c.query('set role v4_app')
  await c.query("select set_config('app.user_id',$1,false)",[userId])
  return c
}

async function asApp(userId,fn){
  const c=await appClient(userId)
  try{return await fn(c)}finally{c.release()}
}

async function createPerson(userId=ADMIN,name='Pessoa Demo'){
  return asApp(userId,async c=>(await c.query('select sunshine_v4.v4_create_person($1,$2,$3,$4) id',[name,null,null,null])).rows[0].id)
}

async function createContract(customerId,items,key='contract-demo'){
  return asApp(ADMIN,async c=>(await c.query('select sunshine_v4.v4_create_contract($1,$2,$3::jsonb,$4) id',[customerId,'MANUAL_DEMO',JSON.stringify(items),key])).rows[0].id)
}

async function obligationIds(contractId){
  const {rows}=await pool.query(`select o.id from sunshine_v4.obligations o join sunshine_v4.contract_items i on i.id=o.contract_item_id where i.contract_id=$1 order by i.created_at,i.id`,[contractId])
  return rows.map(r=>r.id)
}

async function createPayment(payerId,amount=7000,key='pay-demo'){
  return asApp(FINANCE,async c=>(await c.query(`select sunshine_v4.v4_create_payment($1,$2::jsonb,$3,$4,$5,$6,$7) id`,[payerId,JSON.stringify({name:'Pagador Demo'}),'MANUAL_DEMO',key,amount,'2026-09-09T12:00:00Z',key])).rows[0].id)
}

async function allocate(paymentId,obligationId,amount,key){
  return asApp(FINANCE,async c=>(await c.query('select sunshine_v4.v4_allocate_payment($1,$2,$3,$4) id',[paymentId,obligationId,amount,key])).rows[0].id)
}

before(async()=>{
  if(!databaseUrl)return
  await pool.query('drop schema if exists sunshine_v4 cascade')
  await pool.query(`do $$ begin if exists(select 1 from pg_roles where rolname='v4_app') then drop role v4_app; end if; end $$;`)
  const files=(await readdir(join(root,'migrations'))).filter(f=>f.endsWith('.sql')).sort()
  assert.deepEqual(files,['001_domain_schema.sql','002_security_rls_audit.sql','003_transactional_functions_views.sql'])
  for(const file of files){await pool.query(await readFile(join(root,'migrations',file),'utf8'))}
  await pool.query(`insert into sunshine_v4.user_roles(user_id,role_code) values ($1,'ADMIN'),($2,'FINANCE'),($3,'OPERATOR'),($4,'VIEWER')`,[ADMIN,FINANCE,OPERATOR,VIEWER])
})

after(async()=>{if(pool)await pool.end()})

beforeEach(async()=>{
  if(!databaseUrl)return
  await pool.query(`truncate table
    sunshine_v4.commission_entries,
    sunshine_v4.collection_tasks,
    sunshine_v4.payment_promises,
    sunshine_v4.payment_allocations,
    sunshine_v4.payments,
    sunshine_v4.obligations,
    sunshine_v4.contract_items,
    sunshine_v4.contracts,
    sunshine_v4.commission_rules,
    sunshine_v4.audit_events,
    sunshine_v4.people
    cascade`)
})

pgtest('migrations canônicas aplicam em PostgreSQL 17 isolado',async()=>{
  const v=await pool.query('show server_version')
  assert.match(v.rows[0].server_version,/^17\./)
  const tables=await pool.query("select count(*)::int n from information_schema.tables where table_schema='sunshine_v4' and table_type='BASE TABLE'")
  assert.equal(tables.rows[0].n,15)
  const rls=await pool.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='sunshine_v4' and c.relkind='r' and c.relrowsecurity")
  assert.equal(rls.rows[0].n,11)
})

pgtest('RLS filtra leitura e permissão impede escrita financeira de operador',async()=>{
  const person=await createPerson(ADMIN,'RLS Demo')
  await asApp(NOBODY,async c=>{const r=await c.query('select * from sunshine_v4.people');assert.equal(r.rowCount,0)})
  await asApp(VIEWER,async c=>{const r=await c.query('select id from sunshine_v4.people');assert.deepEqual(r.rows.map(x=>x.id),[person])})
  await assert.rejects(asApp(OPERATOR,c=>c.query(`select sunshine_v4.v4_create_payment($1,null,$2,$3,$4,now(),$5)`,[person,'MANUAL_DEMO','DENIED',3000,'DENIED'])),/forbidden: payment.create/)
  await assert.rejects(asApp(FINANCE,c=>c.query(`insert into sunshine_v4.payments(source,amount_cents,paid_at) values('X',100,now())`)),/permission denied/)
})

pgtest('contratação é transacional: falha no segundo item faz rollback total',async()=>{
  const person=await createPerson()
  const items=[
    {beneficiaryPersonId:person,serviceCode:'A',serviceName:'A',amountCents:7000},
    {beneficiaryPersonId:person,serviceCode:'B',serviceName:'B',amountCents:0}
  ]
  await assert.rejects(createContract(person,items,'rollback-contract'),/item amount must be positive/)
  for(const table of ['contracts','contract_items','obligations']){
    const r=await pool.query(`select count(*)::int n from sunshine_v4.${table}`)
    assert.equal(r.rows[0].n,0)
  }
  const audit=await pool.query("select count(*)::int n from sunshine_v4.audit_events where action='CONTRACT_CREATED'")
  assert.equal(audit.rows[0].n,0)
})

pgtest('saldo persistente e excesso legítimo ficam explícitos',async()=>{
  const person=await createPerson()
  const contract=await createContract(person,[{beneficiaryPersonId:person,serviceCode:'AGRADO',serviceName:'Agrado',amountCents:3500}])
  const [obligation]=await obligationIds(contract)
  const payment=await createPayment(person,5000,'EXCESS-1')
  await allocate(payment,obligation,3500,'ALLOC-EXCESS')
  const o=await pool.query('select * from sunshine_v4.obligation_reconciliation where obligation_id=$1',[obligation])
  assert.equal(Number(o.rows[0].signed_balance_cents),0)
  assert.equal(o.rows[0].is_overallocated,false)
  const p=await pool.query('select * from sunshine_v4.payment_reconciliation where payment_id=$1',[payment])
  assert.equal(Number(p.rows[0].signed_unallocated_cents),1500)
  assert.equal(p.rows[0].is_overallocated,false)
})

pgtest('concorrência real: duas transações não consomem o mesmo saldo',async()=>{
  const person=await createPerson()
  const contract=await createContract(person,[
    {beneficiaryPersonId:person,serviceCode:'A',serviceName:'A',amountCents:10000},
    {beneficiaryPersonId:person,serviceCode:'B',serviceName:'B',amountCents:10000}
  ],'conc-contract')
  const [o1,o2]=await obligationIds(contract)
  const payment=await createPayment(person,10000,'CONC-PAY')
  const c1=await appClient(FINANCE), c2=await appClient(FINANCE)
  try{
    const settled=await Promise.allSettled([
      c1.query('select sunshine_v4.v4_allocate_payment($1,$2,$3,$4) id',[payment,o1,10000,'CONC-A']),
      c2.query('select sunshine_v4.v4_allocate_payment($1,$2,$3,$4) id',[payment,o2,10000,'CONC-B'])
    ])
    assert.equal(settled.filter(x=>x.status==='fulfilled').length,1)
    assert.equal(settled.filter(x=>x.status==='rejected').length,1)
    assert.match(settled.find(x=>x.status==='rejected').reason.message,/payment overallocation/)
  }finally{c1.release();c2.release()}
  const count=await pool.query('select count(*)::int n,sum(amount_cents)::bigint total from sunshine_v4.payment_allocations where payment_id=$1',[payment])
  assert.equal(count.rows[0].n,1);assert.equal(Number(count.rows[0].total),10000)
})

pgtest('rollback real desfaz alocação e auditoria após falha intermediária',async()=>{
  const person=await createPerson()
  const contract=await createContract(person,[{beneficiaryPersonId:person,serviceCode:'A',serviceName:'A',amountCents:7000}],'tx-contract')
  const [obligation]=await obligationIds(contract)
  const payment=await createPayment(person,7000,'TX-PAY')
  const c=await appClient(FINANCE)
  try{
    await c.query('begin')
    await c.query('select sunshine_v4.v4_allocate_payment($1,$2,$3,$4)',[payment,obligation,7000,'TX-ALLOC'])
    await assert.rejects(c.query('select 1/0'),/division by zero/)
    await c.query('rollback')
  }finally{c.release()}
  const allocation=await pool.query("select count(*)::int n from sunshine_v4.payment_allocations where idempotency_key='TX-ALLOC'")
  const audit=await pool.query("select count(*)::int n from sunshine_v4.audit_events where action='PAYMENT_ALLOCATED'")
  assert.equal(allocation.rows[0].n,0);assert.equal(audit.rows[0].n,0)
})

pgtest('idempotência SQL de pagamento funciona sob concorrência',async()=>{
  const person=await createPerson()
  const c1=await appClient(FINANCE), c2=await appClient(FINANCE)
  try{
    const args=[person,null,'MANUAL_DEMO','IDEM-CONCURRENT',3000,'2026-09-09T12:00:00Z','IDEM-CONCURRENT']
    const [a,b]=await Promise.all([
      c1.query('select sunshine_v4.v4_create_payment($1,$2,$3,$4,$5,$6,$7) id',args),
      c2.query('select sunshine_v4.v4_create_payment($1,$2,$3,$4,$5,$6,$7) id',args)
    ])
    assert.equal(a.rows[0].id,b.rows[0].id)
  }finally{c1.release();c2.release()}
  const r=await pool.query("select count(*)::int n from sunshine_v4.payments where idempotency_key='IDEM-CONCURRENT'")
  assert.equal(r.rows[0].n,1)
})

pgtest('idempotência SQL de alocação funciona sob repetição concorrente',async()=>{
  const person=await createPerson()
  const contract=await createContract(person,[{beneficiaryPersonId:person,serviceCode:'A',serviceName:'A',amountCents:7000}],'idem-alloc-contract')
  const [obligation]=await obligationIds(contract)
  const payment=await createPayment(person,7000,'IDEM-ALLOC-PAY')
  const c1=await appClient(FINANCE), c2=await appClient(FINANCE)
  try{
    const args=[payment,obligation,7000,'IDEM-ALLOC']
    const [a,b]=await Promise.all([
      c1.query('select sunshine_v4.v4_allocate_payment($1,$2,$3,$4) id',args),
      c2.query('select sunshine_v4.v4_allocate_payment($1,$2,$3,$4) id',args)
    ])
    assert.equal(a.rows[0].id,b.rows[0].id)
  }finally{c1.release();c2.release()}
  const r=await pool.query("select count(*)::int n,sum(amount_cents)::bigint total from sunshine_v4.payment_allocations where idempotency_key='IDEM-ALLOC'")
  assert.equal(r.rows[0].n,1);assert.equal(Number(r.rows[0].total),7000)
})

pgtest('auditoria é append-only em nível de banco',async()=>{
  await createPerson(ADMIN,'Audit Demo')
  const row=await pool.query('select id from sunshine_v4.audit_events limit 1')
  assert.equal(row.rowCount,1)
  await assert.rejects(pool.query("update sunshine_v4.audit_events set action='TAMPERED' where id=$1",[row.rows[0].id]),/append-only/)
  await assert.rejects(pool.query('delete from sunshine_v4.audit_events where id=$1',[row.rows[0].id]),/append-only/)
})

pgtest('promessas preservam histórico e não alteram vencimento original',async()=>{
  const person=await createPerson()
  const contract=await createContract(person,[{beneficiaryPersonId:person,serviceCode:'PARTICULAR',serviceName:'Particular',amountCents:60000,dueDate:'2026-09-08'}],'promise-contract')
  const [obligation]=await obligationIds(contract)
  await asApp(FINANCE,c=>c.query('select sunshine_v4.v4_create_payment_promise($1,$2,$3,$4)',[obligation,'2026-09-15',null,'primeira']))
  await asApp(FINANCE,c=>c.query('select sunshine_v4.v4_create_payment_promise($1,$2,$3,$4)',[obligation,'2026-09-20','2026-09-19','segunda']))
  const o=await pool.query('select due_date,expected_payment_date,next_collection_date from sunshine_v4.obligations where id=$1',[obligation])
  assert.equal(String(o.rows[0].due_date).slice(0,10),'Mon Sep 08')
  assert.equal(String(o.rows[0].expected_payment_date).slice(0,10),'Sun Sep 20')
  const h=await pool.query('select promised_for from sunshine_v4.payment_promises where obligation_id=$1 order by created_at,id',[obligation])
  assert.equal(h.rowCount,2)
})

pgtest('comissão persistente nasce da alocação e regra fica versionada',async()=>{
  const person=await createPerson()
  const contract=await createContract(person,[{beneficiaryPersonId:person,serviceCode:'PARTICULAR',serviceName:'Particular',amountCents:60000}],'commission-contract')
  const [obligation]=await obligationIds(contract)
  await asApp(ADMIN,c=>c.query('select sunshine_v4.v4_create_commission_rule($1,$2,$3,$4,$5,$6)',['PARTICULAR','DEMO',1000,1,'2026-01-01T00:00:00Z',null]))
  const payment=await createPayment(person,30000,'COM-PAY')
  await allocate(payment,obligation,30000,'COM-ALLOC')
  const before=await pool.query('select base_cents,amount_cents from sunshine_v4.commission_entries')
  assert.equal(Number(before.rows[0].base_cents),30000);assert.equal(Number(before.rows[0].amount_cents),3000)
  await asApp(ADMIN,c=>c.query('select sunshine_v4.v4_create_commission_rule($1,$2,$3,$4,$5,$6)',['PARTICULAR','DEMO',2000,2,'2026-10-01T00:00:00Z',null]))
  const after=await pool.query('select amount_cents from sunshine_v4.commission_entries')
  assert.equal(after.rowCount,1);assert.equal(Number(after.rows[0].amount_cents),3000)
})

pgtest('reconciliação expõe inconsistência negativa sem mascarar com greatest',async()=>{
  const person=await createPerson()
  const contract=await createContract(person,[{beneficiaryPersonId:person,serviceCode:'A',serviceName:'A',amountCents:3500}],'corrupt-contract')
  const [obligation]=await obligationIds(contract)
  const payment=await createPayment(person,5000,'CORRUPT-PAY')
  -- Simula corrupção/legado somente como superuser do banco isolado; a API canônica impediria isso.
  await pool.query(`insert into sunshine_v4.payment_allocations(payment_id,obligation_id,amount_cents,idempotency_key) values($1,$2,6000,'FORCED-INCONSISTENCY')`,[payment,obligation])
  const o=await pool.query('select signed_balance_cents,is_overallocated,overallocated_cents from sunshine_v4.obligation_reconciliation where obligation_id=$1',[obligation])
  const p=await pool.query('select signed_unallocated_cents,is_overallocated,overallocated_cents from sunshine_v4.payment_reconciliation where payment_id=$1',[payment])
  assert.equal(Number(o.rows[0].signed_balance_cents),-2500);assert.equal(o.rows[0].is_overallocated,true);assert.equal(Number(o.rows[0].overallocated_cents),2500)
  assert.equal(Number(p.rows[0].signed_unallocated_cents),-1000);assert.equal(p.rows[0].is_overallocated,true);assert.equal(Number(p.rows[0].overallocated_cents),1000)
})
