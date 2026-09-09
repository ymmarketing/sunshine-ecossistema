-- Sunshine V4 / P0-A
-- ISOLATED ONLY. Do not apply to V3 production.
-- Monetary values are integer cents to prevent float/ID confusion.

create extension if not exists pgcrypto;

create table if not exists v4_people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) > 0),
  preferred_name text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists v4_contracts (
  id uuid primary key default gen_random_uuid(),
  customer_person_id uuid not null references v4_people(id),
  source text not null default 'MANUAL',
  status text not null default 'CONFIRMED' check (status in ('DRAFT','CONFIRMED','CANCELLED')),
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create table if not exists v4_contract_items (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references v4_contracts(id),
  beneficiary_person_id uuid not null references v4_people(id),
  service_code text not null,
  service_name text not null,
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now()
);

create table if not exists v4_obligations (
  id uuid primary key default gen_random_uuid(),
  contract_item_id uuid not null unique references v4_contract_items(id),
  beneficiary_person_id uuid not null references v4_people(id),
  total_cents bigint not null check (total_cents > 0),
  due_date date,
  expected_payment_date date,
  next_collection_date date,
  explicit_status text check (explicit_status is null or explicit_status in ('EXEMPT','CANCELLED')),
  created_at timestamptz not null default now()
);

create table if not exists v4_payments (
  id uuid primary key default gen_random_uuid(),
  payer_person_id uuid references v4_people(id),
  payer_snapshot jsonb,
  source text not null,
  external_ref text,
  amount_cents bigint not null check (amount_cents > 0),
  paid_at timestamptz not null,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  unique(source, external_ref)
);

create table if not exists v4_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references v4_payments(id),
  obligation_id uuid not null references v4_obligations(id),
  amount_cents bigint not null check (amount_cents > 0),
  idempotency_key text unique,
  allocated_at timestamptz not null default now()
);

create index if not exists v4_allocations_payment_idx on v4_payment_allocations(payment_id);
create index if not exists v4_allocations_obligation_idx on v4_payment_allocations(obligation_id);
create index if not exists v4_obligations_beneficiary_idx on v4_obligations(beneficiary_person_id);

create or replace view v4_obligation_balances as
select
  o.id as obligation_id,
  o.contract_item_id,
  o.beneficiary_person_id,
  o.total_cents,
  coalesce(sum(a.amount_cents),0)::bigint as received_cents,
  greatest(o.total_cents - coalesce(sum(a.amount_cents),0),0)::bigint as balance_cents
from v4_obligations o
left join v4_payment_allocations a on a.obligation_id=o.id
group by o.id;

create or replace function v4_allocate_payment(
  p_payment_id uuid,
  p_obligation_id uuid,
  p_amount_cents bigint,
  p_idempotency_key text default null
) returns uuid
language plpgsql
as $$
declare
  v_payment_amount bigint;
  v_obligation_amount bigint;
  v_payment_allocated bigint;
  v_obligation_received bigint;
  v_id uuid;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'allocation amount must be positive';
  end if;

  if p_idempotency_key is not null then
    select id into v_id from v4_payment_allocations where idempotency_key=p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;

  select amount_cents into v_payment_amount from v4_payments where id=p_payment_id for update;
  if v_payment_amount is null then raise exception 'payment not found'; end if;

  select total_cents into v_obligation_amount from v4_obligations where id=p_obligation_id for update;
  if v_obligation_amount is null then raise exception 'obligation not found'; end if;

  select coalesce(sum(amount_cents),0) into v_payment_allocated from v4_payment_allocations where payment_id=p_payment_id;
  select coalesce(sum(amount_cents),0) into v_obligation_received from v4_payment_allocations where obligation_id=p_obligation_id;

  if p_amount_cents > v_payment_amount - v_payment_allocated then
    raise exception 'payment overallocation';
  end if;
  if p_amount_cents > v_obligation_amount - v_obligation_received then
    raise exception 'obligation overallocation';
  end if;

  insert into v4_payment_allocations(payment_id,obligation_id,amount_cents,idempotency_key)
  values(p_payment_id,p_obligation_id,p_amount_cents,p_idempotency_key)
  returning id into v_id;
  return v_id;
end $$;

-- Sunshine V4 / P0-B
-- ISOLATED ONLY. No integration/webhook/secrets.

create table if not exists v4_payment_promises (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references v4_obligations(id),
  promised_for date not null,
  next_collection_date date,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists v4_payment_promises_obligation_idx on v4_payment_promises(obligation_id, created_at);

create table if not exists v4_collection_tasks (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references v4_obligations(id),
  scheduled_for date not null,
  status text not null default 'SCHEDULED' check(status in ('SCHEDULED','CONTACTED','CANCELLED','DONE')),
  note text,
  result text,
  contacted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists v4_commission_rules (
  id uuid primary key default gen_random_uuid(),
  service_code text not null,
  recipient_code text not null,
  basis_points integer not null check(basis_points between 0 and 10000),
  version integer not null check(version > 0),
  valid_from timestamptz not null,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  unique(service_code, recipient_code, version),
  check(valid_to is null or valid_to > valid_from)
);

create table if not exists v4_commission_entries (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references v4_payment_allocations(id),
  commission_rule_id uuid not null references v4_commission_rules(id),
  recipient_code text not null,
  base_cents bigint not null check(base_cents >= 0),
  amount_cents bigint not null check(amount_cents >= 0),
  status text not null default 'DUE' check(status in ('DUE','PAID','REVERSED','CANCELLED')),
  created_at timestamptz not null default now(),
  unique(allocation_id, commission_rule_id)
);

create or replace view v4_receivables as
select
  o.id as obligation_id,
  o.beneficiary_person_id,
  i.service_code,
  i.service_name,
  o.total_cents,
  b.received_cents,
  b.balance_cents,
  o.due_date,
  o.expected_payment_date,
  o.next_collection_date,
  case
    when o.explicit_status='EXEMPT' then 'EXEMPT'
    when o.explicit_status='CANCELLED' then 'CANCELLED'
    when b.received_cents=0 then 'OPEN'
    when b.balance_cents>0 then 'PARTIAL'
    else 'PAID'
  end as liquidation_status,
  case
    when b.balance_cents=0 or o.explicit_status is not null then 'NONE'
    when o.due_date is null then 'NO_DUE_DATE'
    when o.due_date > current_date then 'FUTURE'
    when o.due_date = current_date then 'DUE_TODAY'
    else 'OVERDUE'
  end as due_status
from v4_obligations o
join v4_contract_items i on i.id=o.contract_item_id
join v4_obligation_balances b on b.obligation_id=o.id;

-- Sunshine V4 / foundation: audit + granular permission model.
-- ISOLATED ONLY.

create table if not exists v4_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

-- Append-only intent: application role receives SELECT/INSERT only.
-- No UPDATE/DELETE policy should be granted to ordinary app actors.

create table if not exists v4_roles (
  code text primary key
);
create table if not exists v4_permissions (
  code text primary key
);
create table if not exists v4_role_permissions (
  role_code text not null references v4_roles(code),
  permission_code text not null references v4_permissions(code),
  primary key(role_code,permission_code)
);
create table if not exists v4_user_roles (
  user_id uuid not null,
  role_code text not null references v4_roles(code),
  primary key(user_id,role_code)
);
