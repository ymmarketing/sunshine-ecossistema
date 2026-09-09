import assert from 'node:assert/strict'
import { createPool, ownerTransaction } from './db.js'
import { runMigrations } from './migrate.js'
import { seedDemo } from './seed.js'

const pool = createPool()
try {
  await runMigrations(pool)
  await ownerTransaction(pool, client => client.query(`truncate table
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
    sunshine_v4.people cascade`))
  const seeded = await seedDemo(pool, { businessData: true })
  const s = seeded.state
  assert.equal(s.people.length, 4)
  assert.equal(s.contracts.length, 4)
  assert.equal(s.items.length, 5)
  assert.equal(s.obligations.length, 5)
  assert.equal(s.payments.length, 4)
  assert.equal(s.allocations.length, 5)
  assert.equal(s.promises.length, 1)
  assert.equal(s.collectionTasks.length, 1)
  assert.equal(s.summary.openReceivablesCents, 33500)
  assert.equal(s.summary.unallocatedPaymentsCents, 1500)
  assert.equal(s.summary.pendingCollectionTasks, 1)
  assert.equal(s.summary.dueCommissionsCents, 3000)
  assert.equal(s.summary.inconsistentObligationsCents, 0)
  assert.equal(s.summary.inconsistentPaymentsCents, 0)
  console.log(JSON.stringify({
    ok: true,
    scenario: 'representative fictitious Sunshine dataset',
    counts: {
      people: s.people.length, contracts: s.contracts.length, items: s.items.length,
      obligations: s.obligations.length, payments: s.payments.length, allocations: s.allocations.length,
      promises: s.promises.length, collectionTasks: s.collectionTasks.length
    },
    reconciliation: s.summary
  }, null, 2))
} finally {
  await pool.end()
}
