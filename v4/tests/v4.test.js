import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MemoryStore, SunshineV4Service } from '../src/core.js'

const admin={id:'admin',role:'ADMIN'}
const finance={id:'finance',role:'FINANCE'}
const operator={id:'operator',role:'OPERATOR'}
const fixedNow=()=>new Date('2026-09-09T12:00:00.000Z')
function setup(){const store=new MemoryStore();return{store,service:new SunshineV4Service(store,{now:fixedNow})}}
function makePeople(service){return{maria:service.createPerson(admin,{fullName:'Maria Demo'}),jakeline:service.createPerson(admin,{fullName:'Jakeline Demo'})}}
function makeContract(service,customerId,beneficiaryId,amountCents=7000,serviceCode='AGRADO',dueDate=null){return service.createContract(admin,{customerPersonId:customerId,items:[{beneficiaryPersonId:beneficiaryId,serviceCode,serviceName:'Serviço Demo',amountCents,dueDate}]})}

test('isolamento: core/migration não referenciam produção ou secrets',async()=>{
  const root=join(dirname(fileURLToPath(import.meta.url)),'..')
  const content=(await Promise.all(['src/core.js','src/server.js','public/index.html','migrations/001_v4_foundation.sql'].map(f=>readFile(join(root,f),'utf8')))).join('\n')
  assert.equal(content.includes('dhpsvwkytcqasmtaeayv'),false)
  assert.equal(content.includes('sunshine.ymnegocios.com.br'),false)
  assert.equal(/ASAAS_API_KEY|SUPABASE_SERVICE_ROLE_KEY|service_role/.test(content),false)
})

test('pagador pode ser diferente do beneficiário',()=>{
  const {service}=setup();const{maria,jakeline}=makePeople(service)
  const c=makeContract(service,jakeline.id,jakeline.id)
  const p=service.createPayment(finance,{payerPersonId:maria.id,amountCents:7000,externalRef:'P1'})
  service.allocatePayment(finance,{paymentId:p.id,obligationId:c.entries[0].obligation.id,amountCents:7000})
  const s=service.snapshot(admin)
  assert.equal(s.payments[0].payerPersonId,maria.id)
  assert.equal(s.obligations[0].beneficiaryPersonId,jakeline.id)
  assert.equal(s.obligations[0].liquidationStatus,'PAID')
})

test('um pagamento quita duas obrigações',()=>{
  const {service}=setup();const{maria,jakeline}=makePeople(service)
  const c=service.createContract(admin,{customerPersonId:maria.id,items:[
    {beneficiaryPersonId:maria.id,serviceCode:'AGRADO',serviceName:'Agrado Demo',amountCents:7000},
    {beneficiaryPersonId:jakeline.id,serviceCode:'AGRADO',serviceName:'Agrado Demo',amountCents:7000}
  ]})
  const p=service.createPayment(finance,{payerPersonId:maria.id,amountCents:14000,externalRef:'P2'})
  service.allocatePayment(finance,{paymentId:p.id,obligationId:c.entries[0].obligation.id,amountCents:7000})
  service.allocatePayment(finance,{paymentId:p.id,obligationId:c.entries[1].obligation.id,amountCents:7000})
  const s=service.snapshot(admin)
  assert.equal(s.payments[0].availableCents,0)
  assert.deepEqual(s.obligations.map(o=>o.liquidationStatus),['PAID','PAID'])
})

test('dois pagamentos completam uma obrigação',()=>{
  const {service}=setup();const{maria}=makePeople(service);const c=makeContract(service,maria.id,maria.id)
  const p1=service.createPayment(finance,{payerPersonId:maria.id,amountCents:3500,externalRef:'P3A'})
  const p2=service.createPayment(finance,{payerPersonId:maria.id,amountCents:3500,externalRef:'P3B'})
  service.allocatePayment(finance,{paymentId:p1.id,obligationId:c.entries[0].obligation.id,amountCents:3500})
  assert.equal(service.snapshot(admin).obligations[0].liquidationStatus,'PARTIAL')
  service.allocatePayment(finance,{paymentId:p2.id,obligationId:c.entries[0].obligation.id,amountCents:3500})
  assert.equal(service.snapshot(admin).obligations[0].liquidationStatus,'PAID')
})

test('excesso fica não alocado e não muda valor contratado',()=>{
  const {service}=setup();const{maria}=makePeople(service);const c=makeContract(service,maria.id,maria.id,3500)
  const p=service.createPayment(finance,{payerPersonId:maria.id,amountCents:5000,externalRef:'P4'})
  service.allocatePayment(finance,{paymentId:p.id,obligationId:c.entries[0].obligation.id,amountCents:3500})
  const s=service.snapshot(admin)
  assert.equal(s.obligations[0].totalCents,3500)
  assert.equal(s.payments[0].availableCents,1500)
})

test('não permite sobrealocação do pagamento',()=>{
  const {service}=setup();const{maria,jakeline}=makePeople(service)
  const c=service.createContract(admin,{customerPersonId:maria.id,items:[
    {beneficiaryPersonId:maria.id,serviceCode:'A',serviceName:'A',amountCents:7000},
    {beneficiaryPersonId:jakeline.id,serviceCode:'B',serviceName:'B',amountCents:5000}
  ]})
  const p=service.createPayment(finance,{payerPersonId:maria.id,amountCents:10000,externalRef:'P5'})
  service.allocatePayment(finance,{paymentId:p.id,obligationId:c.entries[0].obligation.id,amountCents:7000})
  assert.throws(()=>service.allocatePayment(finance,{paymentId:p.id,obligationId:c.entries[1].obligation.id,amountCents:4000}),/saldo disponível/)
})

test('idempotência de pagamento evita duplicidade',()=>{
  const {service}=setup();const{maria}=makePeople(service)
  const a=service.createPayment(finance,{payerPersonId:maria.id,amountCents:3000,externalRef:'IDEM-1'})
  const b=service.createPayment(finance,{payerPersonId:maria.id,amountCents:3000,externalRef:'IDEM-1'})
  assert.equal(a.id,b.id);assert.equal(service.snapshot(admin).payments.length,1)
})

test('operador não pode registrar pagamento',()=>{
  const {service}=setup();const{maria}=makePeople(service)
  assert.throws(()=>service.createPayment(operator,{payerPersonId:maria.id,amountCents:3000}),/não pode executar payment.create/)
})

test('valor monetário rejeita string/ID',()=>{
  const {service}=setup();const{maria}=makePeople(service)
  assert.throws(()=>service.createPayment(finance,{payerPersonId:maria.id,amountCents:'3000'}),/inteiro em centavos/)
})

test('parcial + promessa mantém vencimento original e histórico',()=>{
  const {service}=setup();const{maria}=makePeople(service);const c=makeContract(service,maria.id,maria.id,60000,'PARTICULAR','2026-09-08')
  const obligation=c.entries[0].obligation
  const p=service.createPayment(finance,{payerPersonId:maria.id,amountCents:30000,externalRef:'PARTIAL-1'})
  service.allocatePayment(finance,{paymentId:p.id,obligationId:obligation.id,amountCents:30000})
  service.createPaymentPromise(finance,{obligationId:obligation.id,promisedFor:'2026-09-20'})
  const o=service.snapshot(admin).obligations[0]
  assert.equal(o.liquidationStatus,'PARTIAL');assert.equal(o.dueStatus,'OVERDUE');assert.equal(o.collectionStatus,'PROMISE');assert.equal(o.balanceCents,30000)
})

test('tarefa de cobrança é separada da obrigação',()=>{
  const {service}=setup();const{maria}=makePeople(service);const c=makeContract(service,maria.id,maria.id,60000,'PARTICULAR','2026-09-08')
  service.createCollectionTask(finance,{obligationId:c.entries[0].obligation.id,scheduledFor:'2026-09-10'})
  const s=service.snapshot(admin);assert.equal(s.collectionTasks.length,1);assert.equal(s.summary.pendingCollectionTasks,1)
})

test('comissão versionada nasce proporcional à alocação',()=>{
  const {service}=setup();const{maria}=makePeople(service);const c=makeContract(service,maria.id,maria.id,60000,'PARTICULAR')
  service.createCommissionRule(admin,{serviceCode:'PARTICULAR',recipientCode:'DEMO',basisPoints:1000,validFrom:'2026-09-01'})
  const p=service.createPayment(finance,{payerPersonId:maria.id,amountCents:30000,externalRef:'COM-1'})
  service.allocatePayment(finance,{paymentId:p.id,obligationId:c.entries[0].obligation.id,amountCents:30000})
  const s=service.snapshot(admin);assert.equal(s.commissionEntries[0].baseCents,30000);assert.equal(s.commissionEntries[0].amountCents,3000)
})

test('nova versão de regra não altera comissão histórica',()=>{
  const {service}=setup();const{maria}=makePeople(service);const c=makeContract(service,maria.id,maria.id,60000,'PARTICULAR')
  service.createCommissionRule(admin,{serviceCode:'PARTICULAR',recipientCode:'DEMO',basisPoints:1000,validFrom:'2026-09-01',validTo:'2026-09-10'})
  const p=service.createPayment(finance,{payerPersonId:maria.id,amountCents:30000,externalRef:'COM-HIST'})
  service.allocatePayment(finance,{paymentId:p.id,obligationId:c.entries[0].obligation.id,amountCents:30000})
  const before=service.snapshot(admin).commissionEntries[0].amountCents
  service.createCommissionRule(admin,{serviceCode:'PARTICULAR',recipientCode:'DEMO',basisPoints:2000,validFrom:'2026-09-10'})
  const after=service.snapshot(admin).commissionEntries[0].amountCents
  assert.equal(before,3000);assert.equal(after,3000)
})

test('auditoria registra mutações críticas',()=>{
  const {service}=setup();const{maria}=makePeople(service);const c=makeContract(service,maria.id,maria.id,60000,'PARTICULAR')
  const p=service.createPayment(finance,{payerPersonId:maria.id,amountCents:10000,externalRef:'AUD-1'})
  service.allocatePayment(finance,{paymentId:p.id,obligationId:c.entries[0].obligation.id,amountCents:10000})
  service.createPaymentPromise(finance,{obligationId:c.entries[0].obligation.id,promisedFor:'2026-09-15'})
  const actions=service.audit(admin).map(e=>e.action)
  assert.ok(actions.includes('PAYMENT_CREATED'));assert.ok(actions.includes('PAYMENT_ALLOCATED'));assert.ok(actions.includes('PAYMENT_PROMISE_CREATED'))
})
