import { randomUUID } from 'node:crypto'

export function assertCents(value, field = 'valor') {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} deve ser inteiro em centavos e >= 0`)
  }
  return value
}

export function assertPositiveCents(value, field = 'valor') {
  assertCents(value, field)
  if (value === 0) throw new Error(`${field} deve ser maior que zero`)
  return value
}

export function brl(cents) {
  assertCents(cents)
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(cents / 100)
}

export const ACTIONS = Object.freeze({
  PERSON_CREATE: 'person.create',
  PERSON_READ: 'person.read',
  CONTRACT_CREATE: 'contract.create',
  CONTRACT_READ: 'contract.read',
  PAYMENT_CREATE: 'payment.create',
  PAYMENT_READ: 'payment.read',
  ALLOCATION_CREATE: 'allocation.create',
  ALLOCATION_READ: 'allocation.read',
  RECEIVABLE_READ: 'receivable.read',
  PROMISE_CREATE: 'promise.create',
  COLLECTION_CREATE: 'collection.create',
  COLLECTION_UPDATE: 'collection.update',
  COMMISSION_RULE_CREATE: 'commission.rule.create',
  COMMISSION_READ: 'commission.read',
  DASHBOARD_READ: 'dashboard.read',
  AUDIT_READ: 'audit.read'
})

const all = Object.values(ACTIONS)

export const ROLE_PERMISSIONS = Object.freeze({
  ADMIN: new Set(all),
  FINANCE: new Set([
    ACTIONS.PERSON_CREATE, ACTIONS.PERSON_READ,
    ACTIONS.CONTRACT_CREATE, ACTIONS.CONTRACT_READ,
    ACTIONS.PAYMENT_CREATE, ACTIONS.PAYMENT_READ,
    ACTIONS.ALLOCATION_CREATE, ACTIONS.ALLOCATION_READ,
    ACTIONS.RECEIVABLE_READ, ACTIONS.PROMISE_CREATE,
    ACTIONS.COLLECTION_CREATE, ACTIONS.COLLECTION_UPDATE,
    ACTIONS.COMMISSION_READ, ACTIONS.DASHBOARD_READ,
    ACTIONS.AUDIT_READ
  ]),
  OPERATOR: new Set([
    ACTIONS.PERSON_CREATE, ACTIONS.PERSON_READ,
    ACTIONS.CONTRACT_CREATE, ACTIONS.CONTRACT_READ,
    ACTIONS.PAYMENT_READ, ACTIONS.ALLOCATION_READ,
    ACTIONS.RECEIVABLE_READ, ACTIONS.PROMISE_CREATE,
    ACTIONS.COLLECTION_CREATE, ACTIONS.COLLECTION_UPDATE,
    ACTIONS.DASHBOARD_READ
  ]),
  VIEWER: new Set([
    ACTIONS.PERSON_READ, ACTIONS.CONTRACT_READ,
    ACTIONS.PAYMENT_READ, ACTIONS.ALLOCATION_READ,
    ACTIONS.RECEIVABLE_READ, ACTIONS.COMMISSION_READ,
    ACTIONS.DASHBOARD_READ
  ])
})

export function assertAllowed(role, action) {
  const permissions = ROLE_PERMISSIONS[role]
  if (!permissions || !permissions.has(action)) {
    const err = new Error(`papel ${role ?? 'desconhecido'} não pode executar ${action}`)
    err.code = 'FORBIDDEN'
    throw err
  }
}

function dayKey(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) throw new Error('data inválida')
  return d.toISOString().slice(0, 10)
}

export function liquidationStatus(totalCents, receivedCents, explicitStatus = null) {
  if (explicitStatus === 'EXEMPT') return 'EXEMPT'
  if (explicitStatus === 'CANCELLED') return 'CANCELLED'
  if (receivedCents <= 0) return 'OPEN'
  if (receivedCents < totalCents) return 'PARTIAL'
  return 'PAID'
}

export function dueStatus({ dueDate, balanceCents, now = new Date(), explicitStatus = null }) {
  if (explicitStatus === 'EXEMPT' || explicitStatus === 'CANCELLED' || balanceCents <= 0) return 'NONE'
  if (!dueDate) return 'NO_DUE_DATE'
  const today = dayKey(now)
  const due = dayKey(dueDate)
  if (due > today) return 'FUTURE'
  if (due === today) return 'DUE_TODAY'
  return 'OVERDUE'
}

export function collectionStatus(obligation) {
  if (obligation.explicitStatus === 'EXEMPT' || obligation.explicitStatus === 'CANCELLED') return 'NONE'
  if (obligation.collectionStage) return obligation.collectionStage
  if (obligation.nextCollectionDate) return 'SCHEDULED'
  return 'NONE'
}

export class MemoryStore {
  constructor() { this.reset() }

  reset() {
    this.people = new Map()
    this.contracts = new Map()
    this.items = new Map()
    this.obligations = new Map()
    this.payments = new Map()
    this.allocations = new Map()
    this.promises = []
    this.collectionTasks = new Map()
    this.commissionRules = []
    this.commissionEntries = new Map()
    this.auditEvents = []
    this.idempotency = new Map()
  }
}

function clone(value) {
  return structuredClone(value)
}

function dateOrNull(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) throw new Error(`data inválida: ${value}`)
  return d.toISOString()
}

function requireRecord(map, id, label) {
  const value = map.get(id)
  if (!value) {
    const err = new Error(`${label} não encontrado`)
    err.code = 'NOT_FOUND'
    throw err
  }
  return value
}

export class SunshineV4Service {
  constructor(store, { now = () => new Date() } = {}) {
    this.store = store
    this.now = now
  }

  _audit(actor, action, entityType, entityId, payload = {}) {
    const event = Object.freeze({
      id: randomUUID(),
      actorId: actor.id,
      actorRole: actor.role,
      action,
      entityType,
      entityId,
      payload: clone(payload),
      occurredAt: this.now().toISOString()
    })
    this.store.auditEvents.push(event)
    return event
  }

  _withIdempotency(scope, key, producer) {
    if (!key) return producer()
    const composite = `${scope}:${key}`
    if (this.store.idempotency.has(composite)) {
      return clone(this.store.idempotency.get(composite))
    }
    const value = producer()
    this.store.idempotency.set(composite, clone(value))
    return value
  }

  createPerson(actor, input) {
    assertAllowed(actor.role, ACTIONS.PERSON_CREATE)
    const name = String(input.fullName ?? '').trim()
    if (!name) throw new Error('nome obrigatório')
    const person = {
      id: randomUUID(),
      fullName: name,
      preferredName: String(input.preferredName ?? '').trim() || null,
      phone: String(input.phone ?? '').trim() || null,
      email: String(input.email ?? '').trim().toLowerCase() || null,
      createdAt: this.now().toISOString()
    }
    this.store.people.set(person.id, person)
    this._audit(actor, 'PERSON_CREATED', 'person', person.id, { fullName: person.fullName })
    return clone(person)
  }

  listPeople(actor) {
    assertAllowed(actor.role, ACTIONS.PERSON_READ)
    return [...this.store.people.values()].map(clone)
  }

  createContract(actor, input) {
    assertAllowed(actor.role, ACTIONS.CONTRACT_CREATE)
    const customer = requireRecord(this.store.people, input.customerPersonId, 'cliente/contratante')
    if (!Array.isArray(input.items) || input.items.length === 0) throw new Error('contratação precisa de pelo menos um item')

    return this._withIdempotency('contract', input.idempotencyKey, () => {
      const contract = {
        id: randomUUID(),
        customerPersonId: customer.id,
        source: input.source ?? 'MANUAL_DEMO',
        status: 'CONFIRMED',
        createdAt: this.now().toISOString()
      }
      this.store.contracts.set(contract.id, contract)

      const createdItems = input.items.map((raw, index) => {
        const beneficiary = requireRecord(this.store.people, raw.beneficiaryPersonId, `beneficiário do item ${index + 1}`)
        const amountCents = assertPositiveCents(raw.amountCents, `valor do item ${index + 1}`)
        const item = {
          id: randomUUID(),
          contractId: contract.id,
          beneficiaryPersonId: beneficiary.id,
          serviceCode: String(raw.serviceCode ?? 'CUSTOM').trim() || 'CUSTOM',
          serviceName: String(raw.serviceName ?? 'Serviço').trim() || 'Serviço',
          amountCents,
          createdAt: this.now().toISOString()
        }
        this.store.items.set(item.id, item)

        const obligation = {
          id: randomUUID(),
          contractItemId: item.id,
          beneficiaryPersonId: beneficiary.id,
          totalCents: amountCents,
          dueDate: dateOrNull(raw.dueDate),
          expectedPaymentDate: dateOrNull(raw.expectedPaymentDate),
          nextCollectionDate: dateOrNull(raw.nextCollectionDate ?? raw.expectedPaymentDate ?? raw.dueDate),
          collectionStage: raw.expectedPaymentDate || raw.nextCollectionDate ? 'SCHEDULED' : null,
          explicitStatus: null,
          createdAt: this.now().toISOString()
        }
        this.store.obligations.set(obligation.id, obligation)
        return { item, obligation }
      })

      this._audit(actor, 'CONTRACT_CREATED', 'contract', contract.id, {
        customerPersonId: customer.id,
        itemCount: createdItems.length,
        totalCents: createdItems.reduce((sum, x) => sum + x.item.amountCents, 0)
      })
      return clone({ contract, entries: createdItems })
    })
  }

  createPayment(actor, input) {
    assertAllowed(actor.role, ACTIONS.PAYMENT_CREATE)
    const amountCents = assertPositiveCents(input.amountCents, 'valor do pagamento')
    if (input.payerPersonId) requireRecord(this.store.people, input.payerPersonId, 'pagador')

    return this._withIdempotency('payment', input.idempotencyKey ?? input.externalRef, () => {
      if (input.externalRef) {
        const duplicate = [...this.store.payments.values()].find(p => p.externalRef === input.externalRef)
        if (duplicate) return clone(duplicate)
      }
      const payment = {
        id: randomUUID(),
        source: input.source ?? 'MANUAL_DEMO',
        externalRef: input.externalRef ?? null,
        payerPersonId: input.payerPersonId ?? null,
        payerSnapshot: clone(input.payerSnapshot ?? null),
        amountCents,
        paidAt: dateOrNull(input.paidAt) ?? this.now().toISOString(),
        createdAt: this.now().toISOString()
      }
      this.store.payments.set(payment.id, payment)
      this._audit(actor, 'PAYMENT_CREATED', 'payment', payment.id, {
        payerPersonId: payment.payerPersonId,
        amountCents: payment.amountCents,
        source: payment.source
      })
      return clone(payment)
    })
  }

  paymentAllocatedCents(paymentId) {
    return [...this.store.allocations.values()]
      .filter(a => a.paymentId === paymentId)
      .reduce((sum, a) => sum + a.amountCents, 0)
  }

  obligationReceivedCents(obligationId) {
    return [...this.store.allocations.values()]
      .filter(a => a.obligationId === obligationId)
      .reduce((sum, a) => sum + a.amountCents, 0)
  }

  _commissionRuleFor(item, at) {
    const time = new Date(at).getTime()
    return this.store.commissionRules
      .filter(r => r.serviceCode === item.serviceCode)
      .filter(r => new Date(r.validFrom).getTime() <= time)
      .filter(r => !r.validTo || new Date(r.validTo).getTime() > time)
      .sort((a, b) => new Date(b.validFrom) - new Date(a.validFrom))[0] ?? null
  }

  allocatePayment(actor, input) {
    assertAllowed(actor.role, ACTIONS.ALLOCATION_CREATE)
    const amountCents = assertPositiveCents(input.amountCents, 'valor da alocação')

    return this._withIdempotency('allocation', input.idempotencyKey, () => {
      const payment = requireRecord(this.store.payments, input.paymentId, 'pagamento')
      const obligation = requireRecord(this.store.obligations, input.obligationId, 'obrigação')
      const paymentAvailable = payment.amountCents - this.paymentAllocatedCents(payment.id)
      const obligationBalance = obligation.totalCents - this.obligationReceivedCents(obligation.id)

      if (amountCents > paymentAvailable) {
        const err = new Error(`alocação excede saldo disponível do pagamento (${paymentAvailable} centavos)`)
        err.code = 'PAYMENT_OVERALLOCATION'
        throw err
      }
      if (amountCents > obligationBalance) {
        const err = new Error(`alocação excede saldo da obrigação (${obligationBalance} centavos)`)
        err.code = 'OBLIGATION_OVERALLOCATION'
        throw err
      }

      const allocation = {
        id: randomUUID(),
        paymentId: payment.id,
        obligationId: obligation.id,
        amountCents,
        allocatedAt: this.now().toISOString()
      }
      this.store.allocations.set(allocation.id, allocation)
      this._audit(actor, 'PAYMENT_ALLOCATED', 'allocation', allocation.id, clone(allocation))

      const item = requireRecord(this.store.items, obligation.contractItemId, 'item')
      const rule = this._commissionRuleFor(item, allocation.allocatedAt)
      if (rule) {
        const commissionCents = Math.floor((amountCents * rule.basisPoints) / 10000)
        const commission = {
          id: randomUUID(),
          allocationId: allocation.id,
          ruleId: rule.id,
          recipientCode: rule.recipientCode,
          baseCents: amountCents,
          amountCents: commissionCents,
          status: 'DUE',
          createdAt: this.now().toISOString()
        }
        this.store.commissionEntries.set(commission.id, commission)
        this._audit(actor, 'COMMISSION_CREATED', 'commission', commission.id, {
          allocationId: allocation.id,
          ruleVersion: rule.version,
          amountCents: commissionCents
        })
      }

      return clone(allocation)
    })
  }

  createPaymentPromise(actor, input) {
    assertAllowed(actor.role, ACTIONS.PROMISE_CREATE)
    const obligation = requireRecord(this.store.obligations, input.obligationId, 'obrigação')
    const promisedFor = dateOrNull(input.promisedFor)
    if (!promisedFor) throw new Error('data prometida obrigatória')
    const promise = Object.freeze({
      id: randomUUID(),
      obligationId: obligation.id,
      promisedFor,
      note: String(input.note ?? '').trim() || null,
      createdAt: this.now().toISOString(),
      createdBy: actor.id
    })
    this.store.promises.push(promise)
    obligation.expectedPaymentDate = promisedFor
    obligation.nextCollectionDate = dateOrNull(input.nextCollectionDate) ?? promisedFor
    obligation.collectionStage = 'PROMISE'
    this._audit(actor, 'PAYMENT_PROMISE_CREATED', 'obligation', obligation.id, {
      promiseId: promise.id,
      promisedFor,
      nextCollectionDate: obligation.nextCollectionDate
    })
    return clone(promise)
  }

  createCollectionTask(actor, input) {
    assertAllowed(actor.role, ACTIONS.COLLECTION_CREATE)
    const obligation = requireRecord(this.store.obligations, input.obligationId, 'obrigação')
    const task = {
      id: randomUUID(),
      obligationId: obligation.id,
      scheduledFor: dateOrNull(input.scheduledFor) ?? obligation.nextCollectionDate ?? this.now().toISOString(),
      status: 'SCHEDULED',
      note: String(input.note ?? '').trim() || null,
      createdAt: this.now().toISOString()
    }
    this.store.collectionTasks.set(task.id, task)
    obligation.collectionStage = 'SCHEDULED'
    obligation.nextCollectionDate = task.scheduledFor
    this._audit(actor, 'COLLECTION_TASK_CREATED', 'collection_task', task.id, clone(task))
    return clone(task)
  }

  markCollectionContacted(actor, input) {
    assertAllowed(actor.role, ACTIONS.COLLECTION_UPDATE)
    const task = requireRecord(this.store.collectionTasks, input.taskId, 'tarefa de cobrança')
    task.status = 'CONTACTED'
    task.contactedAt = this.now().toISOString()
    task.result = String(input.result ?? '').trim() || null
    const obligation = requireRecord(this.store.obligations, task.obligationId, 'obrigação')
    obligation.collectionStage = 'CONTACTED'
    this._audit(actor, 'COLLECTION_CONTACTED', 'collection_task', task.id, {
      result: task.result
    })
    return clone(task)
  }

  createCommissionRule(actor, input) {
    assertAllowed(actor.role, ACTIONS.COMMISSION_RULE_CREATE)
    if (!Number.isSafeInteger(input.basisPoints) || input.basisPoints < 0 || input.basisPoints > 10000) {
      throw new Error('basisPoints deve estar entre 0 e 10000')
    }
    const sameService = this.store.commissionRules.filter(r => r.serviceCode === input.serviceCode)
    const version = sameService.length + 1
    const rule = Object.freeze({
      id: randomUUID(),
      serviceCode: String(input.serviceCode),
      recipientCode: String(input.recipientCode),
      basisPoints: input.basisPoints,
      version,
      validFrom: dateOrNull(input.validFrom) ?? this.now().toISOString(),
      validTo: dateOrNull(input.validTo),
      createdAt: this.now().toISOString()
    })
    this.store.commissionRules.push(rule)
    this._audit(actor, 'COMMISSION_RULE_CREATED', 'commission_rule', rule.id, {
      serviceCode: rule.serviceCode,
      version,
      basisPoints: rule.basisPoints
    })
    return clone(rule)
  }

  obligationView(obligation, now = this.now()) {
    const receivedCents = this.obligationReceivedCents(obligation.id)
    const balanceCents = Math.max(0, obligation.totalCents - receivedCents)
    return {
      ...clone(obligation),
      receivedCents,
      balanceCents,
      liquidationStatus: liquidationStatus(obligation.totalCents, receivedCents, obligation.explicitStatus),
      dueStatus: dueStatus({ dueDate: obligation.dueDate, balanceCents, now, explicitStatus: obligation.explicitStatus }),
      collectionStatus: collectionStatus(obligation)
    }
  }

  snapshot(actor) {
    assertAllowed(actor.role, ACTIONS.DASHBOARD_READ)
    const obligations = [...this.store.obligations.values()].map(o => this.obligationView(o))
    const payments = [...this.store.payments.values()].map(p => ({
      ...clone(p),
      allocatedCents: this.paymentAllocatedCents(p.id),
      availableCents: p.amountCents - this.paymentAllocatedCents(p.id)
    }))
    const commissions = [...this.store.commissionEntries.values()].map(clone)
    const dueCommissionsCents = commissions.filter(c => c.status === 'DUE').reduce((s, c) => s + c.amountCents, 0)
    const open = obligations.filter(o => ['OPEN', 'PARTIAL'].includes(o.liquidationStatus))
    const openReceivablesCents = open.reduce((s, o) => s + o.balanceCents, 0)
    return {
      people: [...this.store.people.values()].map(clone),
      contracts: [...this.store.contracts.values()].map(clone),
      items: [...this.store.items.values()].map(clone),
      obligations,
      payments,
      allocations: [...this.store.allocations.values()].map(clone),
      promises: this.store.promises.map(clone),
      collectionTasks: [...this.store.collectionTasks.values()].map(clone),
      commissionRules: this.store.commissionRules.map(clone),
      commissionEntries: commissions,
      summary: {
        openReceivablesCents,
        dueTodayCount: open.filter(o => o.dueStatus === 'DUE_TODAY').length,
        overdueCount: open.filter(o => o.dueStatus === 'OVERDUE').length,
        unallocatedPaymentsCents: payments.reduce((s, p) => s + p.availableCents, 0),
        pendingCollectionTasks: [...this.store.collectionTasks.values()].filter(t => t.status === 'SCHEDULED').length,
        dueCommissionsCents
      }
    }
  }

  audit(actor) {
    assertAllowed(actor.role, ACTIONS.AUDIT_READ)
    return this.store.auditEvents.map(clone)
  }
}
