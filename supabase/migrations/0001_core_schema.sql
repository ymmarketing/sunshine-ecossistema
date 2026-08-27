-- Ecossistema Sunshine Oráculos — Core Schema v0.2
-- Aplicar somente no projeto Supabase exclusivo da Sunshine.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  email text unique,
  role text not null check (role in ('ADMIN','EDITOR','VIEWER')),
  is_practitioner boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  birth_date date,
  odu text,
  notes text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','BLOCKED')),
  source text not null default 'MANUAL' check (source in ('MANUAL','IMPORT','WHATSAPP','ASAAS','OTHER')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.team_members(id) on delete set null,
  updated_by uuid references public.team_members(id) on delete set null
);
create index if not exists idx_clients_phone on public.clients(phone);
create index if not exists idx_clients_name_search on public.clients using gin (to_tsvector('simple', coalesce(full_name,'')));

create table if not exists public.client_aliases (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  alias text not null,
  source text not null default 'IMPORT',
  created_at timestamptz not null default now(),
  unique (client_id, alias)
);
create index if not exists idx_client_aliases_alias on public.client_aliases(lower(alias));

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('CONSULTA','PERGUNTA','MENSALIDADE','TRABALHO_COLETIVO','TRABALHO_COLETIVO_PREMIUM','TRABALHO_PARTICULAR','OUTRO')),
  default_price numeric(12,2),
  financial_type text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services(id) on delete set null,
  title text not null,
  entity_detail text,
  work_type text not null check (work_type in ('COLETIVO','COLETIVO_PREMIUM','PARTICULAR')),
  scheduled_at timestamptz,
  sales_open_at timestamptz,
  sales_close_at timestamptz,
  unit_price numeric(12,2),
  responsible_member_id uuid references public.team_members(id) on delete set null,
  status text not null default 'PLANNED' check (status in ('PLANNED','OPEN','CLOSED','DONE','CANCELLED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_works_scheduled_at on public.works(scheduled_at);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  service_id uuid references public.services(id) on delete set null,
  work_id uuid references public.works(id) on delete set null,
  responsible_member_id uuid references public.team_members(id) on delete set null,
  event_type text not null check (event_type in ('CONSULTA','PERGUNTA','TRABALHO','RETORNO','OUTRO')),
  consultation_method text check (consultation_method is null or consultation_method in ('BARALHO','BUZIOS','PERGUNTA_OBJETIVA','OUTRO')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','DONE','CANCELLED','RESCHEDULED','NO_SHOW')),
  guidance_summary text,
  follow_up text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_appointments_client on public.appointments(client_id);
create index if not exists idx_appointments_starts on public.appointments(starts_at);

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  work_id uuid references public.works(id) on delete cascade,
  required boolean not null default true,
  due_at timestamptz,
  status text not null default 'PENDING' check (status in ('PENDING','DONE','CANCELLED')),
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_id is not null or appointment_id is not null or work_id is not null)
);

create table if not exists public.work_registrations (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  client_id uuid references public.clients(id) on delete restrict,
  participant_name text,
  participant_birth_date date,
  responsible_member_id uuid references public.team_members(id) on delete set null,
  rival_name text,
  loved_person_name text,
  participant_data jsonb not null default '{}'::jsonb,
  status text not null default 'REGISTERED' check (status in ('REGISTERED','CONFIRMED','DONE','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_id is not null or participant_name is not null)
);
create index if not exists idx_work_registrations_work on public.work_registrations(work_id);
create index if not exists idx_work_registrations_client on public.work_registrations(client_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete restrict,
  service_id uuid references public.services(id) on delete set null,
  work_id uuid references public.works(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  registration_id uuid references public.work_registrations(id) on delete set null,
  responsible_member_id uuid references public.team_members(id) on delete set null,
  source text not null default 'MANUAL' check (source in ('MANUAL','ASAAS','IMPORT')),
  external_ref text,
  status text not null default 'PENDING' check (status in ('PENDING','PAID','OVERDUE','REFUNDED','CANCELLED')),
  gross_amount numeric(12,2) not null check (gross_amount >= 0),
  fees_amount numeric(12,2) not null default 0 check (fees_amount >= 0),
  net_amount numeric(12,2) generated always as (gross_amount - fees_amount) stored,
  payment_method text,
  paid_at timestamptz,
  competence_date date,
  legacy_month text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_payments_external_ref on public.payments(source, external_ref) where external_ref is not null;
create index if not exists idx_payments_paid_at on public.payments(paid_at);
create index if not exists idx_payments_client on public.payments(client_id);
create index if not exists idx_payments_service on public.payments(service_id);

create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  responsible_member_id uuid not null references public.team_members(id) on delete cascade,
  beneficiary_member_id uuid not null references public.team_members(id) on delete cascade,
  percentage numeric(5,2) not null check (percentage >= 0 and percentage <= 100),
  applies_to_category text,
  active boolean not null default true,
  valid_from date not null default current_date,
  valid_until date,
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from),
  unique(responsible_member_id, beneficiary_member_id, applies_to_category, valid_from)
);

create table if not exists public.commission_entries (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  responsible_member_id uuid not null references public.team_members(id) on delete restrict,
  beneficiary_member_id uuid not null references public.team_members(id) on delete restrict,
  percentage numeric(5,2) not null,
  amount numeric(12,2) not null,
  rule_id uuid references public.commission_rules(id) on delete set null,
  status text not null default 'DUE' check (status in ('DUE','PAID','CANCELLED')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique(payment_id, beneficiary_member_id)
);

create table if not exists public.house_members (
  id uuid primary key default gen_random_uuid(),
  client_id uuid unique references public.clients(id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  joined_at date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.house_member_payments (
  id uuid primary key default gen_random_uuid(),
  house_member_id uuid not null references public.house_members(id) on delete restrict,
  payment_id uuid unique references public.payments(id) on delete set null,
  amount numeric(12,2) not null,
  competence_date date not null,
  paid_at timestamptz,
  status text not null default 'PENDING' check (status in ('PENDING','PAID','CANCELLED')),
  external_ref text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.cost_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  purchase_quantity numeric(12,3),
  purchase_unit text,
  purchase_cost numeric(12,2),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_cost_items (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services(id) on delete cascade,
  work_template_name text,
  cost_item_id uuid not null references public.cost_items(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity >= 0),
  calculated_cost numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (service_id is not null or work_template_name is not null)
);

create table if not exists public.work_expenses (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  cost_item_id uuid references public.cost_items(id) on delete set null,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  expense_date date,
  source text not null default 'MANUAL' check (source in ('MANUAL','IMPORT')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  work_id uuid references public.works(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  name text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'PLANNED' check (status in ('PLANNED','ACTIVE','DONE','CANCELLED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.performance_data_sources (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  name text not null,
  external_project_id text,
  status text not null default 'PENDING',
  config jsonb not null default '{}'::jsonb,
  credentials_secret_ref text,
  last_synced_at timestamptz,
  next_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.performance_kpis (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null,
  unit text not null,
  direction text not null default 'HIGHER_BETTER',
  source_id uuid references public.performance_data_sources(id) on delete set null,
  external_metric_key text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.performance_measurements (
  id uuid primary key default gen_random_uuid(),
  kpi_id uuid not null references public.performance_kpis(id) on delete cascade,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  work_id uuid references public.works(id) on delete set null,
  period_start date not null,
  period_end date not null,
  value numeric not null,
  source_type text not null default 'REPORTEI',
  external_record_key text,
  dimensions jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(kpi_id, period_start, period_end, external_record_key)
);

create table if not exists public.performance_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.performance_data_sources(id) on delete cascade,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_read integer not null default 0,
  records_written integer not null default 0,
  error_summary text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_hash text,
  source_period text,
  status text not null default 'STAGED' check (status in ('STAGED','PROCESSING','RECONCILED','FAILED','CANCELLED')),
  row_count integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  reconciled_at timestamptz
);

create table if not exists public.import_rows (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  source_sheet text not null,
  source_row integer not null,
  raw_data jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING','IMPORTED','SKIPPED','ERROR')),
  target_entity text,
  target_id uuid,
  error_message text,
  created_at timestamptz not null default now(),
  unique(batch_id, source_sheet, source_row)
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array[
    'team_members','clients','services','works','appointments','follow_ups',
    'work_registrations','payments','house_members','cost_items','service_cost_items',
    'marketing_campaigns','performance_data_sources','performance_kpis'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'trg_' || t || '_updated_at', t);
  end loop;
end $$;

create or replace function public.current_team_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.id from public.team_members tm
  where tm.auth_user_id = auth.uid() and tm.active = true
  limit 1;
$$;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select tm.role from public.team_members tm
  where tm.auth_user_id = auth.uid() and tm.active = true
  limit 1;
$$;

revoke all on function public.current_team_member_id() from public;
revoke all on function public.current_role() from public;
grant execute on function public.current_team_member_id() to authenticated;
grant execute on function public.current_role() to authenticated;

alter table public.team_members enable row level security;
alter table public.clients enable row level security;
alter table public.client_aliases enable row level security;
alter table public.services enable row level security;
alter table public.works enable row level security;
alter table public.appointments enable row level security;
alter table public.follow_ups enable row level security;
alter table public.work_registrations enable row level security;
alter table public.payments enable row level security;
alter table public.commission_rules enable row level security;
alter table public.commission_entries enable row level security;
alter table public.house_members enable row level security;
alter table public.house_member_payments enable row level security;
alter table public.cost_items enable row level security;
alter table public.service_cost_items enable row level security;
alter table public.work_expenses enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.performance_data_sources enable row level security;
alter table public.performance_kpis enable row level security;
alter table public.performance_measurements enable row level security;
alter table public.performance_sync_runs enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.audit_log enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'clients','client_aliases','services','works','appointments','follow_ups','work_registrations',
    'payments','commission_rules','commission_entries','house_members','house_member_payments',
    'cost_items','service_cost_items','work_expenses','marketing_campaigns',
    'performance_data_sources','performance_kpis','performance_measurements','performance_sync_runs'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.current_role() in (''ADMIN'',''EDITOR'',''VIEWER''))', 'sel_' || t, t);
    execute format('create policy %I on public.%I for all to authenticated using (public.current_role() in (''ADMIN'',''EDITOR'')) with check (public.current_role() in (''ADMIN'',''EDITOR''))', 'write_' || t, t);
  end loop;
end $$;

create policy sel_team_members on public.team_members for select to authenticated using (public.current_role() in ('ADMIN','EDITOR','VIEWER'));
create policy admin_team_members on public.team_members for all to authenticated using (public.current_role() = 'ADMIN') with check (public.current_role() = 'ADMIN');
create policy admin_import_batches on public.import_batches for all to authenticated using (public.current_role() = 'ADMIN') with check (public.current_role() = 'ADMIN');
create policy admin_import_rows on public.import_rows for all to authenticated using (public.current_role() = 'ADMIN') with check (public.current_role() = 'ADMIN');
create policy admin_audit_log on public.audit_log for select to authenticated using (public.current_role() = 'ADMIN');

-- Seed dos membros, regras 80/10/10 e Reportei entra em migração posterior,
-- após criação dos usuários e obtenção dos IDs reais.
