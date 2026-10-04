-- Receipt preparation only: no WhatsApp, AI or Drive integration.
insert into sunshine_v4.roles(code) values ('EDITOR') on conflict do nothing;
insert into sunshine_v4.role_permissions(role_code,permission_code)
select 'EDITOR',code from sunshine_v4.permissions
where code in ('dashboard.read','record.update') on conflict do nothing;

create function private.expense_member_can_write(p_member uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from sunshine_v4.team_members t where t.id=p_member and t.active
   and (exists(select 1 from sunshine_v4.user_roles u where u.user_id=t.auth_user_id and u.role_code in ('ADMIN','EDITOR'))
     or (not exists(select 1 from sunshine_v4.user_roles u where u.user_id=t.auth_user_id)
       and t.legacy_role in ('ADMIN','EDITOR'))));
$$;
create function private.expense_can_read() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from sunshine_v4.team_members t where t.auth_user_id=auth.uid() and t.active
   and (exists(select 1 from sunshine_v4.user_roles u where u.user_id=t.auth_user_id and u.role_code in ('ADMIN','EDITOR','VIEWER','FINANCE','OPERATOR'))
     or t.legacy_role in ('ADMIN','EDITOR','VIEWER')));
$$;
create function private.expense_can_write() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select private.expense_member_can_write(t.id) from sunshine_v4.team_members t
 where t.auth_user_id=auth.uid() and t.active),false);
$$;

alter table sunshine_v4.team_members add column whatsapp_phone text unique
 check (whatsapp_phone is null or whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$');

create table public.general_cost_categories (
 id uuid primary key default gen_random_uuid(), name text not null unique check (length(btrim(name))>0),
 kind text not null check(kind in ('CUSTO_FIXO','RATEIO_GERAL')), description text,
 active boolean not null default true, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index general_cost_categories_normalized_name on public.general_cost_categories(lower(btrim(name)));
create table public.expense_receipts (
 id uuid primary key default gen_random_uuid(), total_amount numeric(14,2) not null check(total_amount>0),
 expense_date date not null, competence_month date not null check(extract(day from competence_month)=1),
 supplier_name text, payment_method text, drive_file_id text, drive_url text,
 sent_by_member_id uuid not null references sunshine_v4.team_members(id) on delete restrict,
 source text not null default 'MANUAL' check(source in ('MANUAL','WHATSAPP')),
 whatsapp_message_id text unique check(whatsapp_message_id is null or length(btrim(whatsapp_message_id))>0),
 raw_text text, ai_extraction jsonb not null default '{}'::jsonb,
 status text not null default 'PENDING_CONFIRMATION' check(status in ('PENDING_CONFIRMATION','CONFIRMED','CANCELLED')),
 confirmed_at timestamptz, confirmed_by uuid references sunshine_v4.team_members(id) on delete restrict,
 notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 -- Manual retries have the same atomic duplicate protection as WhatsApp retries.
 idempotency_key text unique,
 check(source<>'WHATSAPP' or whatsapp_message_id is not null),
 check(status<>'CONFIRMED' or (confirmed_at is not null and confirmed_by is not null))
);
create index expense_receipts_month_status_idx on public.expense_receipts(competence_month,status);
create index expense_receipts_sender_idx on public.expense_receipts(sent_by_member_id);
create index expense_receipts_confirmer_idx on public.expense_receipts(confirmed_by);

alter table public.work_expenses add column receipt_id uuid references public.expense_receipts(id) on delete restrict;
alter table public.work_expenses add column destination text not null default 'TRABALHO';
alter table public.work_expenses add column general_category_id uuid references public.general_cost_categories(id) on delete restrict;
alter table public.work_expenses alter column work_id drop not null;
alter table public.work_expenses drop constraint work_expenses_source_check;
alter table public.work_expenses add constraint work_expenses_source_check check(source in ('MANUAL','IMPORT','WHATSAPP'));
-- Every old work ID is present in V4. Stop if that ever ceases to be true.
do $$ begin
 if exists(select 1 from public.work_expenses e where e.work_id is not null
   and not exists(select 1 from sunshine_v4.works w where w.id=e.work_id)) then
   raise exception 'Migração interrompida: existe custo antigo sem trabalho correspondente na V4.';
 end if;
end $$;
alter table public.work_expenses drop constraint work_expenses_work_id_fkey;
alter table public.work_expenses add constraint work_expenses_work_id_fkey
 foreign key(work_id) references sunshine_v4.works(id) on delete restrict;
alter table public.work_expenses add constraint work_expenses_destination_check check (
 (destination='TRABALHO' and work_id is not null and general_category_id is null
   and (cost_item_id is not null or receipt_id is null))
 or (destination in ('CUSTO_FIXO','RATEIO_GERAL') and work_id is null and cost_item_id is null and general_category_id is not null)
);
create index work_expenses_receipt_idx on public.work_expenses(receipt_id);
create index work_expenses_general_category_idx on public.work_expenses(general_category_id);
create index work_expenses_work_idx on public.work_expenses(work_id);
create index work_expenses_cost_item_idx on public.work_expenses(cost_item_id);

create table public.whatsapp_inbound_messages (
 id uuid primary key default gen_random_uuid(), whatsapp_message_id text not null unique,
 from_phone text not null check(from_phone ~ '^\+[1-9][0-9]{7,14}$'), message_type text not null,
 payload jsonb not null default '{}', received_at timestamptz not null default now(),
 process_status text not null default 'RECEIVED' check(process_status in ('RECEIVED','PROCESSED','REJECTED','ERROR')),
 error_message text, receipt_id uuid references public.expense_receipts(id) on delete restrict
);
create index whatsapp_inbound_receipt_idx on public.whatsapp_inbound_messages(receipt_id);

alter table public.general_cost_categories enable row level security;
alter table public.expense_receipts enable row level security;
alter table public.whatsapp_inbound_messages enable row level security;
create policy expense_categories_read on public.general_cost_categories for select to authenticated using(private.expense_can_read());
create policy expense_categories_insert on public.general_cost_categories for insert to authenticated with check(private.expense_can_write());
create policy expense_categories_update on public.general_cost_categories for update to authenticated using(private.expense_can_write()) with check(private.expense_can_write());
create policy expense_receipts_read on public.expense_receipts for select to authenticated using(private.expense_can_read());
create policy expense_inbound_read on public.whatsapp_inbound_messages for select to authenticated using(private.expense_can_read());
-- Receipt writes are atomic via authenticated ERP wrappers, never raw client table writes.
revoke all on public.general_cost_categories,public.expense_receipts,public.whatsapp_inbound_messages from anon,authenticated;
grant select,insert,update on public.general_cost_categories to authenticated;
grant select on public.expense_receipts,public.whatsapp_inbound_messages to authenticated;
grant all on public.general_cost_categories,public.expense_receipts,public.whatsapp_inbound_messages to service_role;
-- Existing legacy standalone costs remain writable, but VIEWER may never write these costs.
drop policy work_expenses_insert_internal on public.work_expenses;
drop policy work_expenses_update_internal on public.work_expenses;
drop policy work_expenses_delete_admin on public.work_expenses;
drop policy work_expenses_select_internal on public.work_expenses;
create policy work_expenses_read on public.work_expenses for select to authenticated using(private.expense_can_read());
create policy work_expenses_insert on public.work_expenses for insert to authenticated with check(private.expense_can_write() and receipt_id is null);
create policy work_expenses_update on public.work_expenses for update to authenticated using(private.expense_can_write() and receipt_id is null) with check(private.expense_can_write() and receipt_id is null);
create policy work_expenses_delete on public.work_expenses for delete to authenticated using(private.expense_can_write() and receipt_id is null);

create function private.expense_timestamp() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at:=now(); return new; end $$;
create trigger expense_categories_timestamp before update on public.general_cost_categories for each row execute function private.expense_timestamp();
create trigger expense_receipts_timestamp before update on public.expense_receipts for each row execute function private.expense_timestamp();

-- A historical category may be renamed or deactivated; its kind cannot be changed after use.
create function private.expense_category_kind_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.kind<>old.kind and exists(select 1 from public.work_expenses e where e.general_category_id=old.id) then
  raise exception using message='Esta categoria já foi utilizada. Crie outra categoria para mudar o tipo.', detail='CATEGORIA_EM_USO';
 end if;
 new.name:=btrim(new.name); return new;
end $$;
create trigger expense_category_kind_guard before update on public.general_cost_categories for each row execute function private.expense_category_kind_guard();

revoke all on function private.expense_member_can_write(uuid),private.expense_can_read(),private.expense_can_write(),private.expense_timestamp(),private.expense_category_kind_guard() from public,anon,authenticated;
grant execute on function private.expense_can_read(),private.expense_can_write() to authenticated;
