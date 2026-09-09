import { fileURLToPath } from 'node:url'
import { createPool } from './db.js'
import { runMigrations } from './migrate.js'
import { PostgresRepository } from './repository.js'
import { DEMO_USERS } from './auth.js'

const ADMIN = DEMO_USERS.find(x => x.role === 'ADMIN').id
const FINANCE = DEMO_USERS.find(x => x.role === 'FINANCE').id

async function ensurePerson(repo, pool, name) {
  const found = await pool.query('select id from sunshine_v4.people where full_name=$1 order by created_at limit 1', [name])
  if (found.rowCount) return found.rows[0].id
  return (await repo.createPerson(ADMIN, { fullName: name })).id
}

async function ensurePromise(repo, pool, obligationId, promisedFor, nextCollectionDate, note) {
  const found = await pool.query('select id from sunshine_v4.payment_promises where obligation_id=$1 and promised_for=$2', [obligationId, promisedFor])
  if (found.rowCount) return found.rows[0].id
  return (await repo.createPromise(FINANCE, { obligationId, promisedFor, nextCollectionDate, note })).id
}

async function ensureCollection(repo, pool, obligationId, scheduledFor, note) {
  const found = await pool.query("select id from sunshine_v4.collection_tasks where obligation_id=$1 and scheduled_for=$2 and status='SCHEDULED'", [obligationId, scheduledFor])
  if (found.rowCount) return found.rows[0].id
  return (await repo.createCollectionTask(FINANCE, { obligationId, scheduledFor, note })).id
}

async function ensureDemoCommissionRule(repo, pool) {
  const found = await pool.query("select id from sunshine_v4.commission_rules where service_code='PARTICULAR_DEMO' and recipient_code='DEMO' order by version desc limit 1")
  if (found.rowCount) return found.rows[0].id
  return (await repo.createCommissionRule(ADMIN, {
    serviceCode: 'PARTICULAR_DEMO', recipientCode: 'DEMO', basisPoints: 1000, version: 1,
    validFrom: '2026-01-01T00:00:00.000Z'
  })).id
}

export async function seedDemo(pool, { businessData = true } = {}) {
  const repo = new PostgresRepository(pool)
  await repo.seedRoles(DEMO_USERS)
  if (!businessData) return { users: DEMO_USERS.map(({ password, ...u }) => u) }

  await ensureDemoCommissionRule(repo, pool)

  const maria = await ensurePerson(repo, pool, 'Maria Demo')
  const jakeline = await ensurePerson(repo, pool, 'Jakeline Demo')
  const fatima = await ensurePerson(repo, pool, 'Fátima Demo')
  const luiz = await ensurePerson(repo, pool, 'Luiz Demo')

  const agrado = await repo.createContract(ADMIN, {
    customerPersonId: maria,
    source: 'MANUAL_DEMO',
    idempotencyKey: 'seed-contract-agrado-duplo',
    items: [
      { beneficiaryPersonId: maria, serviceCode: 'AGRADO_DEMO', serviceName: 'Agrado coletivo DEMO', amountCents: 7000 },
      { beneficiaryPersonId: jakeline, serviceCode: 'AGRADO_DEMO', serviceName: 'Agrado coletivo DEMO', amountCents: 7000 }
    ]
  })
  const payAgrado = await repo.createPayment(FINANCE, { payerPersonId: maria, payerSnapshot: { name: 'Maria Demo' }, source: 'MANUAL_DEMO', externalRef: 'SEED-AGRADO-140', amountCents: 14000, paidAt: '2026-09-09T12:00:00Z', idempotencyKey: 'seed-pay-agrado-140' })
  await repo.allocatePayment(FINANCE, { paymentId: payAgrado.id, obligationId: agrado.entries[0].obligationId, amountCents: 7000, idempotencyKey: 'seed-alloc-agrado-maria' })
  await repo.allocatePayment(FINANCE, { paymentId: payAgrado.id, obligationId: agrado.entries[1].obligationId, amountCents: 7000, idempotencyKey: 'seed-alloc-agrado-jakeline' })

  const parcial = await repo.createContract(ADMIN, {
    customerPersonId: fatima, source: 'MANUAL_DEMO', idempotencyKey: 'seed-contract-parcial',
    items: [{ beneficiaryPersonId: fatima, serviceCode: 'AGRADO_DEMO', serviceName: 'Agrado coletivo DEMO', amountCents: 7000, dueDate: '2026-09-09' }]
  })
  const payParcial = await repo.createPayment(FINANCE, { payerPersonId: fatima, payerSnapshot: { name: 'Fátima Demo' }, source: 'MANUAL_DEMO', externalRef: 'SEED-PARCIAL-35', amountCents: 3500, paidAt: '2026-09-09T12:10:00Z', idempotencyKey: 'seed-pay-parcial' })
  await repo.allocatePayment(FINANCE, { paymentId: payParcial.id, obligationId: parcial.entries[0].obligationId, amountCents: 3500, idempotencyKey: 'seed-alloc-parcial' })
  await ensurePromise(repo, pool, parcial.entries[0].obligationId, '2026-09-20', '2026-09-19', 'Restante combinado — cenário fictício')

  const particular = await repo.createContract(ADMIN, {
    customerPersonId: luiz, source: 'MANUAL_DEMO', idempotencyKey: 'seed-contract-particular',
    items: [{ beneficiaryPersonId: luiz, serviceCode: 'PARTICULAR_DEMO', serviceName: 'Trabalho particular DEMO', amountCents: 60000, dueDate: '2026-09-20' }]
  })
  const payParticular = await repo.createPayment(FINANCE, { payerPersonId: maria, payerSnapshot: { name: 'Maria Demo — terceiro pagador fictício' }, source: 'MANUAL_DEMO', externalRef: 'SEED-PARTICULAR-300', amountCents: 30000, paidAt: '2026-09-09T12:20:00Z', idempotencyKey: 'seed-pay-particular' })
  await repo.allocatePayment(FINANCE, { paymentId: payParticular.id, obligationId: particular.entries[0].obligationId, amountCents: 30000, idempotencyKey: 'seed-alloc-particular' })
  await ensureCollection(repo, pool, particular.entries[0].obligationId, '2026-09-20', 'Cobrar saldo fictício de R$ 300')

  const excess = await repo.createContract(ADMIN, {
    customerPersonId: maria, source: 'MANUAL_DEMO', idempotencyKey: 'seed-contract-excess',
    items: [{ beneficiaryPersonId: maria, serviceCode: 'PERGUNTA_DEMO', serviceName: 'Pergunta objetiva DEMO', amountCents: 3500 }]
  })
  const payExcess = await repo.createPayment(FINANCE, { payerPersonId: maria, payerSnapshot: { name: 'Maria Demo' }, source: 'MANUAL_DEMO', externalRef: 'SEED-EXCESS-50', amountCents: 5000, paidAt: '2026-09-09T12:30:00Z', idempotencyKey: 'seed-pay-excess' })
  await repo.allocatePayment(FINANCE, { paymentId: payExcess.id, obligationId: excess.entries[0].obligationId, amountCents: 3500, idempotencyKey: 'seed-alloc-excess' })

  return { users: DEMO_USERS.map(({ password, ...u }) => u), people: { maria, jakeline, fatima, luiz }, state: await repo.state(ADMIN) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool()
  try {
    await runMigrations(pool)
    const result = await seedDemo(pool, { businessData: process.env.SEED_BUSINESS_DEMO !== '0' })
    console.log(JSON.stringify({ ok: true, summary: result.state?.summary ?? null, users: result.users }, null, 2))
  } finally {
    await pool.end()
  }
}
