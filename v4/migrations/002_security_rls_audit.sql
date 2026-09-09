-- Sunshine V4 — migration 002
-- CANONICAL / ISOLATED ONLY.

set search_path = sunshine_v4, public;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'v4_app') then
    create role v4_app nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end $$;

grant usage on schema sunshine_v4 to v4_app;

insert into roles(code) values ('ADMIN'),('FINANCE'),('OPERATOR'),('VIEWER')
on conflict do nothing;

insert into permissions(code) values
 ('person.read'),('person.create'),
 ('contract.read'),('contract.create'),
 ('payment.read'),('payment.create'),
 ('allocation.read'),('allocation.create'),
 ('receivable.read'),
 ('promise.read'),('promise.create'),
 ('collection.read'),('collection.create'),('collection.update'),
 ('commission.read'),('commission.rule.create'),
 ('dashboard.read'),('audit.read')
on conflict do nothing;

insert into role_permissions(role_code, permission_code)
select 'ADMIN', code from permissions
on conflict do nothing;

insert into role_permissions(role_code, permission_code) values
 ('FINANCE','person.read'),('FINANCE','person.create'),
 ('FINANCE','contract.read'),('FINANCE','contract.create'),
 ('FINANCE','payment.read'),('FINANCE','payment.create'),
 ('FINANCE','allocation.read'),('FINANCE','allocation.create'),
 ('FINANCE','receivable.read'),('FINANCE','promise.read'),('FINANCE','promise.create'),
 ('FINANCE','collection.read'),('FINANCE','collection.create'),('FINANCE','collection.update'),
 ('FINANCE','commission.read'),('FINANCE','dashboard.read'),('FINANCE','audit.read'),
 ('OPERATOR','person.read'),('OPERATOR','person.create'),
 ('OPERATOR','contract.read'),('OPERATOR','contract.create'),
 ('OPERATOR','payment.read'),('OPERATOR','allocation.read'),
 ('OPERATOR','receivable.read'),('OPERATOR','promise.read'),('OPERATOR','promise.create'),
 ('OPERATOR','collection.read'),('OPERATOR','collection.create'),('OPERATOR','collection.update'),
 ('OPERATOR','dashboard.read'),
 ('VIEWER','person.read'),('VIEWER','contract.read'),('VIEWER','payment.read'),
 ('VIEWER','allocation.read'),('VIEWER','receivable.read'),('VIEWER','promise.read'),
 ('VIEWER','collection.read'),('VIEWER','commission.read'),('VIEWER','dashboard.read')
on conflict do nothing;

create or replace function v4_current_user_id()
returns uuid
language plpgsql
stable
set search_path = sunshine_v4, pg_temp
as $$
declare v text;
begin
  v := nullif(current_setting('app.user_id', true), '');
  if v is null then return null; end if;
  return v::uuid;
exception when invalid_text_representation then
  return null;
end $$;

create or replace function v4_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = sunshine_v4, pg_temp
as $$
  select exists (
    select 1
      from user_roles ur
      join role_permissions rp on rp.role_code = ur.role_code
     where ur.user_id = v4_current_user_id()
       and rp.permission_code = p_permission
  );
$$;

create or replace function v4_assert_permission(p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = sunshine_v4, pg_temp
as $$
begin
  if not v4_has_permission(p_permission) then
    raise exception using errcode='42501', message='forbidden: ' || p_permission;
  end if;
end $$;

create or replace function v4_actor_role()
returns text
language sql
stable
security definer
set search_path = sunshine_v4, pg_temp
as $$
  select ur.role_code
    from user_roles ur
   where ur.user_id = v4_current_user_id()
   order by case ur.role_code when 'ADMIN' then 1 when 'FINANCE' then 2 when 'OPERATOR' then 3 else 4 end
   limit 1;
$$;

revoke all on function v4_has_permission(text) from public;
revoke all on function v4_assert_permission(text) from public;
revoke all on function v4_actor_role() from public;
grant execute on function v4_has_permission(text), v4_assert_permission(text), v4_actor_role() to v4_app;

create or replace function v4_prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = sunshine_v4, pg_temp
as $$
begin
  raise exception using errcode='55000', message='audit_events is append-only';
end $$;

create trigger audit_events_immutable
before update or delete on audit_events
for each row execute function v4_prevent_audit_mutation();

create or replace function v4_write_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = sunshine_v4, pg_temp
as $$
declare v_id uuid; v_actor uuid;
begin
  v_actor := v4_current_user_id();
  if v_actor is null then
    raise exception using errcode='42501', message='missing app.user_id';
  end if;
  insert into audit_events(actor_id, actor_role, action, entity_type, entity_id, payload)
  values(v_actor, v4_actor_role(), p_action, p_entity_type, p_entity_id, coalesce(p_payload,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function v4_write_audit(text,text,uuid,jsonb) from public;
grant execute on function v4_write_audit(text,text,uuid,jsonb) to v4_app;

alter table people enable row level security;
alter table contracts enable row level security;
alter table contract_items enable row level security;
alter table obligations enable row level security;
alter table payments enable row level security;
alter table payment_allocations enable row level security;
alter table payment_promises enable row level security;
alter table collection_tasks enable row level security;
alter table commission_rules enable row level security;
alter table commission_entries enable row level security;
alter table audit_events enable row level security;

create policy people_read on people for select to v4_app using (v4_has_permission('person.read'));
create policy contracts_read on contracts for select to v4_app using (v4_has_permission('contract.read'));
create policy contract_items_read on contract_items for select to v4_app using (v4_has_permission('contract.read'));
create policy obligations_read on obligations for select to v4_app using (v4_has_permission('receivable.read'));
create policy payments_read on payments for select to v4_app using (v4_has_permission('payment.read'));
create policy allocations_read on payment_allocations for select to v4_app using (v4_has_permission('allocation.read'));
create policy promises_read on payment_promises for select to v4_app using (v4_has_permission('promise.read'));
create policy collections_read on collection_tasks for select to v4_app using (v4_has_permission('collection.read'));
create policy commission_rules_read on commission_rules for select to v4_app using (v4_has_permission('commission.read'));
create policy commission_entries_read on commission_entries for select to v4_app using (v4_has_permission('commission.read'));
create policy audit_read on audit_events for select to v4_app using (v4_has_permission('audit.read'));

grant select on people, contracts, contract_items, obligations, payments, payment_allocations,
  payment_promises, collection_tasks, commission_rules, commission_entries, audit_events to v4_app;

revoke insert, update, delete on people, contracts, contract_items, obligations, payments,
  payment_allocations, payment_promises, collection_tasks, commission_rules, commission_entries, audit_events from v4_app;
