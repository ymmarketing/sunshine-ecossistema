import { withActor, ownerTransaction } from './db.js'

function camelKey(key) { return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) }
function numericField(key) { return /(?:_cents|_count|basis_points|version|execution_ms)$/.test(key) }
function mapRow(row) {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => {
    const value = numericField(k) && v != null ? Number(v) : v
    return [camelKey(k), value]
  }))
}
function mapRows(rows) { return rows.map(mapRow) }

export class PostgresRepository {
  constructor(pool) { this.pool = pool }

  async health() {
    const db = await this.pool.query("select current_database() database, current_setting('server_version') server_version")
    const ledger = await this.pool.query("select migration_name,checksum_sha256,applied_at,execution_ms,git_sha from sunshine_v4._migration_ledger order by migration_name")
    return { database: db.rows[0].database, serverVersion: db.rows[0].server_version, migrations: mapRows(ledger.rows) }
  }

  async identity(userId) {
    const result = await this.pool.query(`select ur.role_code, array_agg(rp.permission_code order by rp.permission_code) permissions
      from sunshine_v4.user_roles ur
      join sunshine_v4.role_permissions rp on rp.role_code=ur.role_code
      where ur.user_id=$1
      group by ur.role_code
      order by case ur.role_code when 'ADMIN' then 1 when 'FINANCE' then 2 when 'OPERATOR' then 3 else 4 end`, [userId])
    if (!result.rowCount) return null
    const roles = result.rows.map(r => r.role_code)
    const permissions = [...new Set(result.rows.flatMap(r => r.permissions || []))].sort()
    return { userId, roles, role: roles[0], permissions }
  }

  async assertPermission(userId, permission) {
    return withActor(this.pool, userId, async client => {
      const result = await client.query('select sunshine_v4.v4_has_permission($1) allowed', [permission])
      if (!result.rows[0]?.allowed) throw Object.assign(new Error(`forbidden: ${permission}`), { code: 'FORBIDDEN' })
      return true
    })
  }

  async state(userId) {
    return withActor(this.pool, userId, async client => {
      const people = await client.query('select id,full_name,preferred_name,phone,email,created_at from sunshine_v4.people order by created_at,id')
      const contracts = await client.query(`select c.*, coalesce(x.item_count,0)::int item_count, coalesce(x.total_cents,0)::bigint total_cents
        from sunshine_v4.contracts c left join lateral (
          select count(*) item_count, sum(amount_cents) total_cents from sunshine_v4.contract_items i where i.contract_id=c.id
        ) x on true order by c.created_at,c.id`)
      const items = await client.query('select * from sunshine_v4.contract_items order by created_at,id')
      const obligations = await client.query(`select o.id,o.contract_item_id,o.beneficiary_person_id,o.total_cents,o.due_date,o.expected_payment_date,o.next_collection_date,o.explicit_status,o.created_at,
        r.received_cents,r.signed_balance_cents,r.is_overallocated,r.overallocated_cents,r.liquidation_status,r.due_status,
        i.service_code,i.service_name
        from sunshine_v4.obligations o
        join sunshine_v4.receivables r on r.obligation_id=o.id
        join sunshine_v4.contract_items i on i.id=o.contract_item_id
        order by o.created_at,o.id`)
      const payments = await client.query(`select p.*, r.allocated_cents,r.signed_unallocated_cents,r.is_overallocated,r.overallocated_cents
        from sunshine_v4.payments p join sunshine_v4.payment_reconciliation r on r.payment_id=p.id
        order by p.paid_at desc,p.id`)
      const allocations = await client.query('select * from sunshine_v4.payment_allocations order by allocated_at,id')
      const promises = await client.query('select * from sunshine_v4.payment_promises order by created_at,id')
      const collections = await client.query('select * from sunshine_v4.collection_tasks order by scheduled_for,created_at,id')
      const commissions = await client.query('select * from sunshine_v4.commission_entries order by created_at,id')

      const obligationRows = mapRows(obligations.rows)
      const paymentRows = mapRows(payments.rows)
      const collectionRows = mapRows(collections.rows)
      const commissionRows = mapRows(commissions.rows)
      const openReceivablesCents = obligationRows.reduce((s, r) => s + Math.max(r.signedBalanceCents, 0), 0)
      const unallocatedPaymentsCents = paymentRows.reduce((s, r) => s + Math.max(r.signedUnallocatedCents, 0), 0)
      const inconsistentObligationsCents = obligationRows.reduce((s, r) => s + (r.isOverallocated ? r.overallocatedCents : 0), 0)
      const inconsistentPaymentsCents = paymentRows.reduce((s, r) => s + (r.isOverallocated ? r.overallocatedCents : 0), 0)
      const overdueCount = obligationRows.filter(r => r.dueStatus === 'OVERDUE').length
      const pendingCollectionTasks = collectionRows.filter(r => r.status === 'SCHEDULED').length
      const dueCommissionsCents = commissionRows.filter(r => r.status === 'DUE').reduce((s, r) => s + r.amountCents, 0)

      return {
        people: mapRows(people.rows), contracts: mapRows(contracts.rows), items: mapRows(items.rows), obligations: obligationRows,
        payments: paymentRows, allocations: mapRows(allocations.rows), promises: mapRows(promises.rows), collectionTasks: collectionRows,
        commissionEntries: commissionRows,
        summary: { openReceivablesCents, unallocatedPaymentsCents, overdueCount, pendingCollectionTasks, dueCommissionsCents, inconsistentObligationsCents, inconsistentPaymentsCents }
      }
    })
  }

  async audit(userId) {
    return withActor(this.pool, userId, async client => mapRows((await client.query('select * from sunshine_v4.audit_events order by occurred_at desc,id desc limit 500')).rows))
  }

  async createPerson(userId, input) {
    return withActor(this.pool, userId, async client => {
      const id = (await client.query('select sunshine_v4.v4_create_person($1,$2,$3,$4) id', [input.fullName, input.preferredName ?? null, input.phone ?? null, input.email ?? null])).rows[0].id
      return mapRow((await client.query('select * from sunshine_v4.people where id=$1', [id])).rows[0])
    })
  }

  async createContract(userId, input) {
    return withActor(this.pool, userId, async client => {
      const id = (await client.query('select sunshine_v4.v4_create_contract($1,$2,$3::jsonb,$4) id', [input.customerPersonId, input.source ?? 'MANUAL_DEMO', JSON.stringify(input.items || []), input.idempotencyKey ?? null])).rows[0].id
      const contract = mapRow((await client.query('select * from sunshine_v4.contracts where id=$1', [id])).rows[0])
      const entries = mapRows((await client.query(`select i.*,o.id obligation_id,o.total_cents obligation_total_cents,o.due_date,o.expected_payment_date,o.next_collection_date
        from sunshine_v4.contract_items i join sunshine_v4.obligations o on o.contract_item_id=i.id where i.contract_id=$1 order by i.created_at,i.id`, [id])).rows)
      return { contract, entries }
    })
  }

  async createPayment(userId, input) {
    return withActor(this.pool, userId, async client => {
      const id = (await client.query('select sunshine_v4.v4_create_payment($1,$2::jsonb,$3,$4,$5,$6,$7) id', [input.payerPersonId ?? null, JSON.stringify(input.payerSnapshot ?? null), input.source ?? 'MANUAL_DEMO', input.externalRef ?? null, input.amountCents, input.paidAt ?? null, input.idempotencyKey ?? input.externalRef ?? null])).rows[0].id
      return mapRow((await client.query(`select p.*,r.allocated_cents,r.signed_unallocated_cents,r.is_overallocated,r.overallocated_cents
        from sunshine_v4.payments p join sunshine_v4.payment_reconciliation r on r.payment_id=p.id where p.id=$1`, [id])).rows[0])
    })
  }

  async allocatePayment(userId, input) {
    return withActor(this.pool, userId, async client => {
      const id = (await client.query('select sunshine_v4.v4_allocate_payment($1,$2,$3,$4) id', [input.paymentId, input.obligationId, input.amountCents, input.idempotencyKey])).rows[0].id
      return mapRow((await client.query('select * from sunshine_v4.payment_allocations where id=$1', [id])).rows[0])
    })
  }

  async createPromise(userId, input) {
    return withActor(this.pool, userId, async client => {
      const id = (await client.query('select sunshine_v4.v4_create_payment_promise($1,$2,$3,$4) id', [input.obligationId, input.promisedFor, input.nextCollectionDate ?? null, input.note ?? null])).rows[0].id
      return mapRow((await client.query('select * from sunshine_v4.payment_promises where id=$1', [id])).rows[0])
    })
  }

  async createCollectionTask(userId, input) {
    return withActor(this.pool, userId, async client => {
      const id = (await client.query('select sunshine_v4.v4_create_collection_task($1,$2,$3) id', [input.obligationId, input.scheduledFor, input.note ?? null])).rows[0].id
      return mapRow((await client.query('select * from sunshine_v4.collection_tasks where id=$1', [id])).rows[0])
    })
  }

  async createCommissionRule(userId, input) {
    return withActor(this.pool, userId, async client => {
      const existing = await client.query('select coalesce(max(version),0)::int max_version from sunshine_v4.commission_rules where service_code=$1 and recipient_code=$2', [input.serviceCode, input.recipientCode])
      const version = input.version ?? existing.rows[0].max_version + 1
      const id = (await client.query('select sunshine_v4.v4_create_commission_rule($1,$2,$3,$4,$5,$6) id', [input.serviceCode, input.recipientCode, input.basisPoints, version, input.validFrom ?? new Date().toISOString(), input.validTo ?? null])).rows[0].id
      return mapRow((await client.query('select * from sunshine_v4.commission_rules where id=$1', [id])).rows[0])
    })
  }

  async seedRoles(users) {
    return ownerTransaction(this.pool, async client => {
      for (const user of users) await client.query('insert into sunshine_v4.user_roles(user_id,role_code) values($1,$2) on conflict(user_id,role_code) do nothing', [user.id, user.role])
    })
  }
}
