-- Sunshine V4 — migration 001
-- CANONICAL / ISOLATED ONLY. Never apply to V3 production.
-- Monetary values are integer cents.

create extension if not exists pgcrypto;
create schema if not exists sunshine_v4;
set search_path = sunshine_v4, public;

create table people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) > 0),
  preferred_name text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table contracts (
  id uuid primary key default gen_random_uuid(),
  customer_person_id uuid not null references people(id),
  source text not null default 'MANUAL_DEMO',
  status text not null default 'CONFIRMED' check (status in ('DRAFT','CONFIRMED','CANCELLED')),
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create table contract_items (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete restrict,
  beneficiary_person_id uuid not null references people(id),
  service_code text not null check (length(trim(service_code)) > 0),
  service_name text not null check (length(trim(service_name)) > 0),
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now()
);

create table obligations (
  id uuid primary key default gen_random_uuid(),
  contract_item_id uuid not null unique references contract_items(id) on delete restrict,
  beneficiary_person_id uuid not null references people(id),
  total_cents bigint not null check (total_cents > 0),
  due_date date,
  expected_payment_date date,
  next_collection_date date,
  explicit_status text check (explicit_status is null or explicit_status in ('EXEMPT','CANCELLED')),
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  payer_person_id uuid references people(id),
  payer_snapshot jsonb,
  source text not null check (length(trim(source)) > 0),
  external_ref text,
  amount_cents bigint not null check (amount_cents > 0),
  paid_at timestamptz not null,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  unique(source, external_ref)
);

create table payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete restrict,
  obligation_id uuid not null references obligations(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  idempotency_key text unique,
  allocated_at timestamptz not null default now()
);

create index payment_allocations_payment_idx on payment_allocations(payment_id);
create index payment_allocations_obligation_idx on payment_allocations(obligation_id);
create index obligations_beneficiary_idx on obligations(beneficiary_person_id);
create index contract_items_contract_idx on contract_items(contract_id);

create table payment_promises (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references obligations(id) on delete restrict,
  promised_for date not null,
  next_collection_date date,
  note text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index payment_promises_obligation_idx on payment_promises(obligation_id, created_at);

create table collection_tasks (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references obligations(id) on delete restrict,
  scheduled_for date not null,
  status text not null default 'SCHEDULED' check(status in ('SCHEDULED','CONTACTED','CANCELLED','DONE')),
  note text,
  result text,
  contacted_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index collection_tasks_due_idx on collection_tasks(status, scheduled_for);

create table commission_rules (
  id uuid primary key default gen_random_uuid(),
  service_code text not null,
  recipient_code text not null,
  basis_points integer not null check(basis_points between 0 and 10000),
  version integer not null check(version > 0),
  valid_from timestamptz not null,
  valid_to timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique(service_code, recipient_code, version),
  check(valid_to is null or valid_to > valid_from)
);

create table commission_entries (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references payment_allocations(id) on delete restrict,
  commission_rule_id uuid not null references commission_rules(id) on delete restrict,
  recipient_code text not null,
  base_cents bigint not null check(base_cents >= 0),
  amount_cents bigint not null check(amount_cents >= 0),
  status text not null default 'DUE' check(status in ('DUE','PAID','REVERSED','CANCELLED')),
  created_at timestamptz not null default now(),
  unique(allocation_id, commission_rule_id)
);

create table roles (
  code text primary key
);

create table permissions (
  code text primary key
);

create table role_permissions (
  role_code text not null references roles(code) on delete cascade,
  permission_code text not null references permissions(code) on delete cascade,
  primary key(role_code, permission_code)
);

create table user_roles (
  user_id uuid not null,
  role_code text not null references roles(code) on delete cascade,
  primary key(user_id, role_code)
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_events_entity_idx on audit_events(entity_type, entity_id, occurred_at);
create index audit_events_actor_idx on audit_events(actor_id, occurred_at);
