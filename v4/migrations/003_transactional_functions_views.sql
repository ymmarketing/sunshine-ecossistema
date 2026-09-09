-- Sunshine V4 — migration 003
-- CANONICAL / ISOLATED ONLY.

set search_path = sunshine_v4, public;

create or replace function v4_create_person(
  p_full_name text,
  p_preferred_name text default null,
  p_phone text default null,
  p_email text default null
) returns uuid
language plpgsql
security definer
set search_path = sunshine_v4, pg_temp
as $$
declare v_id uuid;
begin
  perform v4_assert_permission('person.create');
  if nullif(trim(p_full_name),'') is null then raise exception 'name required'; end if;
  insert into people(full_name,preferred_name,phone,email)
  values(trim(p_full_name),nullif(trim(p_preferred_name),''),nullif(trim(p_phone),''),nullif(lower(trim(p_email)),''))
  returning id into v_id;
  perform v4_write_audit('PERSON_CREATED','person',v_id,jsonb_build_object('full_name',trim(p_full_name)));
  return v_id;
end $$;

create or replace function v4_create_contract(
  p_customer_person_id uuid,
  p_source text,
  p_items jsonb,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path = sunshine_v4, pg_temp
as $$
declare
  v_contract uuid;
  v_item jsonb;
  v_item_id uuid;
  v_obligation_id uuid;
  v_beneficiary uuid;
  v_amount bigint;
  v_service_code text;
  v_service_name text;
  v_key text := nullif(trim(p_idempotency_key),'');
begin
  perform v4_assert_permission('contract.create');
  if not exists(select 1 from people where id=p_customer_person_id) then raise exception 'customer not found'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'at least one item required';
  end if;

  if v_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('contract:'||v_key,0));
    select id into v_contract from contracts where idempotency_key=v_key;
    if v_contract is not null then return v_contract; end if;
  end if;

  insert into contracts(customer_person_id,source,idempotency_key)
  values(p_customer_person_id,coalesce(nullif(trim(p_source),''),'MANUAL_DEMO'),v_key)
  returning id into v_contract;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_beneficiary := (v_item->>'beneficiaryPersonId')::uuid;
    v_amount := (v_item->>'amountCents')::bigint;
    v_service_code := nullif(trim(v_item->>'serviceCode'),'');
    v_service_name := nullif(trim(v_item->>'serviceName'),'');
    if not exists(select 1 from people where id=v_beneficiary) then raise exception 'beneficiary not found'; end if;
    if v_amount is null or v_amount <= 0 then raise exception 'item amount must be positive'; end if;
    if v_service_code is null or v_service_name is null then raise exception 'service code/name required'; end if;

    insert into contract_items(contract_id,beneficiary_person_id,service_code,service_name,amount_cents)
    values(v_contract,v_beneficiary,v_service_code,v_service_name,v_amount)
    returning id into v_item_id;

    insert into obligations(contract_item_id,beneficiary_person_id,total_cents,due_date,expected_payment_date,next_collection_date)
    values(
      v_item_id,
      v_beneficiary,
      v_amount,
      nullif(v_item->>'dueDate','')::date,
      nullif(v_item->>'expectedPaymentDate','')::date,
      coalesce(nullif(v_item->>'nextCollectionDate','')::date,nullif(v_item->>'expectedPaymentDate','')::date,nullif(v_item->>'dueDate','')::date)
    ) returning id into v_obligation_id;
  end loop;

  perform v4_write_audit('CONTRACT_CREATED','contract',v_contract,jsonb_build_object('customer_person_id',p_customer_person_id,'item_count',jsonb_array_length(p_items)));
  return v_contract;
end $$;

create or replace function v4_create_payment(
  p_payer_person_id uuid,
  p_payer_snapshot jsonb,
  p_source text,
  p_external_ref text,
  p_amount_cents bigint,
  p_paid_at timestamptz,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path = sunshine_v4, pg_temp
as $$
declare
  v_id uuid;
  v_key text;
  v_existing payments%rowtype;
begin
  perform v4_assert_permission('payment.create');
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'payment amount must be positive'; end if;
  if nullif(trim(p_source),'') is null then raise exception 'payment source required'; end if;
  if p_payer_person_id is not null and not exists(select 1 from people where id=p_payer_person_id) then raise exception 'payer not found'; end if;

  v_key := coalesce(nullif(trim(p_idempotency_key),''), case when nullif(trim(p_external_ref),'') is not null then 'external:'||trim(p_source)||':'||trim(p_external_ref) end);
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('payment:'||v_key,0));
    select * into v_existing from payments where idempotency_key=v_key;
    if found then
      if v_existing.amount_cents is distinct from p_amount_cents
         or v_existing.source is distinct from trim(p_source)
         or v_existing.payer_person_id is distinct from p_payer_person_id then
        raise exception using errcode='23505', message='idempotency conflict: payment payload differs';
      end if;
      return v_existing.id;
    end if;
  end if;

  insert into payments(payer_person_id,payer_snapshot,source,external_ref,amount_cents,paid_at,idempotency_key)
  values(p_payer_person_id,p_payer_snapshot,trim(p_source),nullif(trim(p_external_ref),''),p_amount_cents,coalesce(p_paid_at,now()),v_key)
  returning id into v_id;
  perform v4_write_audit('PAYMENT_CREATED','payment',v_id,jsonb_build_object('payer_person_id',p_payer_person_id,'amount_cents',p_amount_cents,'source',trim(p_source)));
  return v_id;
end $$;

create or replace function v4_allocate_payment(
  p_payment_id uuid,
  p_obligation_id uuid,
  p_amount_cents bigint,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path = sunshine_v4, pg_temp
as $$
declare
  v_payment_amount bigint;
  v_obligation_amount bigint;
  v_payment_allocated bigint;
  v_obligation_received bigint;
  v_id uuid;
  v_key text := nullif(trim(p_idempotency_key),'');
  v_rule record;
begin
  perform v4_assert_permission('allocation.create');
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'allocation amount must be positive'; end if;
  if v_key is null then raise exception 'allocation idempotency key required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('allocation:'||v_key,0));
  select id into v_id from payment_allocations where idempotency_key=v_key;
  if v_id is not null then return v_id; end if;

  select amount_cents into v_payment_amount from payments where id=p_payment_id for update;
  if v_payment_amount is null then raise exception 'payment not found'; end if;
  select total_cents into v_obligation_amount from obligations where id=p_obligation_id for update;
  if v_obligation_amount is null then raise exception 'obligation not found'; end if;

  -- Re-check after row locks so concurrent idempotent callers see committed work.
  select id into v_id from payment_allocations where idempotency_key=v_key;
  if v_id is not null then return v_id; end if;

  select coalesce(sum(amount_cents),0)::bigint into v_payment_allocated from payment_allocations where payment_id=p_payment_id;
  select coalesce(sum(amount_cents),0)::bigint into v_obligation_received from payment_allocations where obligation_id=p_obligation_id;

  if p_amount_cents > v_payment_amount - v_payment_allocated then
    raise exception using errcode='23514', message='payment overallocation';
  end if;
  if p_amount_cents > v_obligation_amount - v_obligation_received then
    raise exception using errcode='23514', message='obligation overallocation';
  end if;

  insert into payment_allocations(payment_id,obligation_id,amount_cents,idempotency_key)
  values(p_payment_id,p_obligation_id,p_amount_cents,v_key)
  returning id into v_id;

  for v_rule in
    select r.* from commission_rules r
    join obligations o on o.id=p_obligation_id
    join contract_items i on i.id=o.contract_item_id
    where r.service_code=i.service_code
      and r.valid_from <= now()
      and (r.valid_to is null or r.valid_to > now())
  loop
    insert into commission_entries(allocation_id,commission_rule_id,recipient_code,base_cents,amount_cents)
    values(v_id,v_rule.id,v_rule.recipient_code,p_amount_cents,(p_amount_cents*v_rule.basis_points)/10000)
    on conflict(allocation_id,commission_rule_id) do nothing;
  end loop;

  perform v4_write_audit('PAYMENT_ALLOCATED','allocation',v_id,jsonb_build_object('payment_id',p_payment_id,'obligation_id',p_obligation_id,'amount_cents',p_amount_cents));
  return v_id;
end $$;

create or replace function v4_create_payment_promise(
  p_obligation_id uuid,
  p_promised_for date,
  p_next_collection_date date default null,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = sunshine_v4, pg_temp
as $$
declare v_id uuid; v_actor uuid;
begin
  perform v4_assert_permission('promise.create');
  if not exists(select 1 from obligations where id=p_obligation_id) then raise exception 'obligation not found'; end if;
  if p_promised_for is null then raise exception 'promised date required'; end if;
  v_actor := v4_current_user_id();
  insert into payment_promises(obligation_id,promised_for,next_collection_date,note,created_by)
  values(p_obligation_id,p_promised_for,coalesce(p_next_collection_date,p_promised_for),nullif(trim(p_note),''),v_actor)
  returning id into v_id;
  update obligations set expected_payment_date=p_promised_for,next_collection_date=coalesce(p_next_collection_date,p_promised_for) where id=p_obligation_id;
  perform v4_write_audit('PAYMENT_PROMISE_CREATED','obligation',p_obligation_id,jsonb_build_object('promise_id',v_id,'promised_for',p_promised_for));
  return v_id;
end $$;

create or replace function v4_create_collection_task(
  p_obligation_id uuid,
  p_scheduled_for date,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = sunshine_v4, pg_temp
as $$
declare v_id uuid; v_actor uuid;
begin
  perform v4_assert_permission('collection.create');
  if not exists(select 1 from obligations where id=p_obligation_id) then raise exception 'obligation not found'; end if;
  if p_scheduled_for is null then raise exception 'scheduled date required'; end if;
  v_actor := v4_current_user_id();
  insert into collection_tasks(obligation_id,scheduled_for,note,created_by)
  values(p_obligation_id,p_scheduled_for,nullif(trim(p_note),''),v_actor)
  returning id into v_id;
  perform v4_write_audit('COLLECTION_TASK_CREATED','collection_task',v_id,jsonb_build_object('obligation_id',p_obligation_id,'scheduled_for',p_scheduled_for));
  return v_id;
end $$;

create or replace function v4_create_commission_rule(
  p_service_code text,
  p_recipient_code text,
  p_basis_points integer,
  p_version integer,
  p_valid_from timestamptz,
  p_valid_to timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = sunshine_v4, pg_temp
as $$
declare v_id uuid; v_actor uuid;
begin
  perform v4_assert_permission('commission.rule.create');
  v_actor := v4_current_user_id();
  insert into commission_rules(service_code,recipient_code,basis_points,version,valid_from,valid_to,created_by)
  values(trim(p_service_code),trim(p_recipient_code),p_basis_points,p_version,p_valid_from,p_valid_to,v_actor)
  returning id into v_id;
  perform v4_write_audit('COMMISSION_RULE_CREATED','commission_rule',v_id,jsonb_build_object('service_code',trim(p_service_code),'version',p_version));
  return v_id;
end $$;

-- Signed reconciliation: inconsistencies are surfaced, never clamped with greatest(...,0).
create or replace view obligation_reconciliation
with (security_invoker=true) as
select
  o.id as obligation_id,
  o.contract_item_id,
  o.beneficiary_person_id,
  o.total_cents,
  coalesce(sum(a.amount_cents),0)::bigint as received_cents,
  (o.total_cents - coalesce(sum(a.amount_cents),0))::bigint as signed_balance_cents,
  (coalesce(sum(a.amount_cents),0) > o.total_cents) as is_overallocated,
  case when coalesce(sum(a.amount_cents),0) > o.total_cents then (coalesce(sum(a.amount_cents),0)-o.total_cents)::bigint else 0::bigint end as overallocated_cents
from obligations o
left join payment_allocations a on a.obligation_id=o.id
group by o.id;

create or replace view payment_reconciliation
with (security_invoker=true) as
select
  p.id as payment_id,
  p.payer_person_id,
  p.amount_cents,
  coalesce(sum(a.amount_cents),0)::bigint as allocated_cents,
  (p.amount_cents - coalesce(sum(a.amount_cents),0))::bigint as signed_unallocated_cents,
  (coalesce(sum(a.amount_cents),0) > p.amount_cents) as is_overallocated,
  case when coalesce(sum(a.amount_cents),0) > p.amount_cents then (coalesce(sum(a.amount_cents),0)-p.amount_cents)::bigint else 0::bigint end as overallocated_cents
from payments p
left join payment_allocations a on a.payment_id=p.id
group by p.id;

create or replace view receivables
with (security_invoker=true) as
select
  o.id as obligation_id,
  o.beneficiary_person_id,
  i.service_code,
  i.service_name,
  r.total_cents,
  r.received_cents,
  r.signed_balance_cents,
  r.is_overallocated,
  r.overallocated_cents,
  o.due_date,
  o.expected_payment_date,
  o.next_collection_date,
  case
    when o.explicit_status='EXEMPT' then 'EXEMPT'
    when o.explicit_status='CANCELLED' then 'CANCELLED'
    when r.signed_balance_cents < 0 then 'INCONSISTENT_OVERALLOCATED'
    when r.received_cents=0 then 'OPEN'
    when r.signed_balance_cents>0 then 'PARTIAL'
    else 'PAID'
  end as liquidation_status,
  case
    when r.signed_balance_cents <= 0 or o.explicit_status is not null then 'NONE'
    when o.due_date is null then 'NO_DUE_DATE'
    when o.due_date > current_date then 'FUTURE'
    when o.due_date = current_date then 'DUE_TODAY'
    else 'OVERDUE'
  end as due_status
from obligations o
join contract_items i on i.id=o.contract_item_id
join obligation_reconciliation r on r.obligation_id=o.id;

grant select on obligation_reconciliation, payment_reconciliation, receivables to v4_app;

-- Permission-checking transactional API only.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='sunshine_v4' and p.proname in (
    'v4_create_person','v4_create_contract','v4_create_payment','v4_allocate_payment','v4_create_payment_promise','v4_create_collection_task','v4_create_commission_rule'
  ) loop
    execute 'revoke all on function '||f.sig||' from public';
    execute 'grant execute on function '||f.sig||' to v4_app';
  end loop;
end $$;
