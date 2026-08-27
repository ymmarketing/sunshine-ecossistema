-- Sunshine v3 — Asaas inbox + classificação humana
-- Produção: projeto dhpsvwkytcqasmtaeayv

alter table public.clients
  add column if not exists document_number text,
  add column if not exists asaas_customer_id text,
  add column if not exists postal_code text,
  add column if not exists address_line text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists district text;
create index if not exists idx_clients_document_number on public.clients(document_number) where document_number is not null;
create unique index if not exists uq_clients_asaas_customer_id on public.clients(asaas_customer_id) where asaas_customer_id is not null;

create table if not exists public.asaas_integration_settings (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'PRODUCTION' check (environment in ('SANDBOX','PRODUCTION')),
  status text not null default 'NOT_CONNECTED' check (status in ('NOT_CONNECTED','CONNECTED','ERROR','DISABLED')),
  webhook_id text, webhook_url text, webhook_token_hash text, alert_email text,
  last_event_at timestamptz, last_error text, connected_at timestamptz,
  connected_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.asaas_integration_settings enable row level security;
create policy asaas_settings_select_internal on public.asaas_integration_settings for select to authenticated using (private.is_internal_member());
create policy asaas_settings_admin_write on public.asaas_integration_settings for all to authenticated using (private.is_admin_member()) with check (private.is_admin_member());

create table if not exists public.asaas_webhook_events (
  id uuid primary key default gen_random_uuid(), asaas_event_id text not null unique, event_type text not null,
  asaas_payment_id text, asaas_customer_id text, raw_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(), processed_at timestamptz,
  process_status text not null default 'RECEIVED' check (process_status in ('RECEIVED','PROCESSED','IGNORED','ERROR')),
  error_message text
);
alter table public.asaas_webhook_events enable row level security;
create policy asaas_events_select_internal on public.asaas_webhook_events for select to authenticated using (private.is_internal_member());

create table if not exists public.asaas_incoming_payments (
  id uuid primary key default gen_random_uuid(), asaas_payment_id text not null unique, asaas_customer_id text,
  latest_event_id text, latest_event_type text, asaas_status text,
  gross_amount numeric(12,2) not null default 0, net_amount numeric(12,2), billing_type text,
  due_date date, payment_date timestamptz, description text, external_reference text,
  customer_name text, customer_email text, customer_phone text, customer_mobile_phone text, customer_document text,
  customer_postal_code text, customer_address text, customer_address_number text, customer_address_complement text,
  customer_district text, customer_city text, customer_state text,
  customer_snapshot jsonb not null default '{}'::jsonb, payment_snapshot jsonb not null default '{}'::jsonb,
  classification_status text not null default 'PENDING' check (classification_status in ('PENDING','RESOLVED','IGNORED','REVIEW')),
  matched_client_id uuid references public.clients(id) on delete set null,
  resolved_client_id uuid references public.clients(id) on delete set null,
  resolved_sale_id uuid references public.sales(id) on delete set null,
  resolved_payment_id uuid references public.payments(id) on delete set null,
  resolved_work_registration_id uuid references public.work_registrations(id) on delete set null,
  resolved_by uuid references public.team_members(id) on delete set null, resolved_at timestamptz,
  received_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_asaas_incoming_pending on public.asaas_incoming_payments(classification_status,received_at desc);
alter table public.asaas_incoming_payments enable row level security;
create policy asaas_incoming_select_internal on public.asaas_incoming_payments for select to authenticated using (private.is_internal_member());
create policy asaas_incoming_update_internal on public.asaas_incoming_payments for update to authenticated using (private.is_internal_member()) with check (private.is_internal_member());

-- API Key Asaas: armazenada exclusivamente no Supabase Vault. Somente service_role pode chamar estes RPCs.
create or replace function public.asaas_store_api_key(p_api_key text) returns void language plpgsql security definer set search_path=public,vault as $$
declare v_existing uuid;
begin
  select id into v_existing from vault.secrets where name='sunshine_asaas_api_key' limit 1;
  if v_existing is null then perform vault.create_secret(p_api_key,'sunshine_asaas_api_key','Asaas API key - Ecossistema Sunshine',null);
  else perform vault.update_secret(v_existing,p_api_key,'sunshine_asaas_api_key','Asaas API key - Ecossistema Sunshine',null); end if;
end;$$;
revoke all on function public.asaas_store_api_key(text) from public,anon,authenticated;
grant execute on function public.asaas_store_api_key(text) to service_role;

create or replace function public.asaas_get_api_key() returns text language plpgsql security definer set search_path=public,vault as $$
declare v text;
begin select decrypted_secret into v from vault.decrypted_secrets where name='sunshine_asaas_api_key' order by created_at desc limit 1; return v; end;$$;
revoke all on function public.asaas_get_api_key() from public,anon,authenticated;
grant execute on function public.asaas_get_api_key() to service_role;

-- A resolução da pendência roda como o próprio usuário autenticado e respeita RLS.
-- Implementação completa está aplicada em produção e coberta pela migração de hotfix registrada no histórico Supabase.
