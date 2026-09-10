-- V4: expose commission totals by recipient without recalculating historical entries.
create or replace function public.v4_finance_summary(p_start date, p_end date)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'sunshine_v4', 'auth', 'pg_temp'
as $function$
declare
  v_user uuid;
  v_result jsonb;
begin
  v_user := public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('dashboard.read');

  select jsonb_build_object(
    'startDate',p_start,
    'endDate',p_end,
    'receivedCents',(select coalesce(sum(amount_cents),0) from sunshine_v4.payments where paid_at::date between p_start and p_end),
    'allocatedCents',(select coalesce(sum(a.amount_cents),0) from sunshine_v4.payment_allocations a join sunshine_v4.payments p on p.id=a.payment_id where p.paid_at::date between p_start and p_end),
    'unallocatedCents',(select coalesce(sum(r.signed_unallocated_cents),0) from sunshine_v4.payment_reconciliation r join sunshine_v4.payments p on p.id=r.payment_id where p.paid_at::date between p_start and p_end),
    'salesCents',(select coalesce(sum(o.total_cents),0) from sunshine_v4.obligations o join sunshine_v4.contract_items i on i.id=o.contract_item_id join sunshine_v4.contracts c on c.id=i.contract_id where coalesce(c.sold_at,c.created_at)::date between p_start and p_end),
    'openReceivablesCents',(select coalesce(sum(signed_balance_cents),0) from sunshine_v4.receivables where signed_balance_cents>0),
    'dueLegacyCommissionsCents',(select coalesce(sum(amount_cents),0) from sunshine_v4.legacy_commission_entries where upper(coalesce(status,''))='DUE'),
    'paidLegacyCommissionsCents',(select coalesce(sum(amount_cents),0) from sunshine_v4.legacy_commission_entries where upper(coalesce(status,''))='PAID'),
    'dueCommissionsByPerson',coalesce((
      select jsonb_object_agg(recipient,total_cents order by recipient)
      from (
        select coalesce(b.full_name,r.full_name,'Sem identificação') recipient,
               sum(c.amount_cents)::bigint total_cents
        from sunshine_v4.legacy_commission_entries c
        left join sunshine_v4.team_members b on b.id=c.beneficiary_member_id
        left join sunshine_v4.team_members r on r.id=c.responsible_member_id
        where upper(coalesce(c.status,''))='DUE'
        group by coalesce(b.full_name,r.full_name,'Sem identificação')
      ) q
    ),'{}'::jsonb),
    'paidCommissionsByPerson',coalesce((
      select jsonb_object_agg(recipient,total_cents order by recipient)
      from (
        select coalesce(b.full_name,r.full_name,'Sem identificação') recipient,
               sum(c.amount_cents)::bigint total_cents
        from sunshine_v4.legacy_commission_entries c
        left join sunshine_v4.team_members b on b.id=c.beneficiary_member_id
        left join sunshine_v4.team_members r on r.id=c.responsible_member_id
        where upper(coalesce(c.status,''))='PAID'
        group by coalesce(b.full_name,r.full_name,'Sem identificação')
      ) q
    ),'{}'::jsonb),
    'categories',coalesce((
      select jsonb_object_agg(category,total_cents) from (
        select coalesce(i.service_category,'LEGACY') category,coalesce(sum(a.amount_cents),0)::bigint total_cents
        from sunshine_v4.payment_allocations a
        join sunshine_v4.payments p on p.id=a.payment_id
        join sunshine_v4.obligations o on o.id=a.obligation_id
        join sunshine_v4.contract_items i on i.id=o.contract_item_id
        where p.paid_at::date between p_start and p_end
        group by coalesce(i.service_category,'LEGACY')
      ) q
    ),'{}'::jsonb)
  ) into v_result;

  return v_result;
end
$function$;

revoke all on function public.v4_finance_summary(date,date) from public, anon;
grant execute on function public.v4_finance_summary(date,date) to authenticated, service_role;

create or replace function sunshine_v4.v4_create_work(
  p_title text,
  p_service_id uuid,
  p_work_type text,
  p_scheduled_at timestamptz,
  p_unit_price_cents bigint,
  p_responsible_member_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'sunshine_v4', 'pg_temp'
as $function$
declare
  v_id uuid := gen_random_uuid();
begin
  perform v4_assert_permission('work.create');
  if nullif(btrim(p_title),'') is null then
    raise exception 'Informe o nome do trabalho.';
  end if;
  if coalesce(p_unit_price_cents,0) < 0 then
    raise exception 'O valor do trabalho não pode ser negativo.';
  end if;

  insert into works(
    id,service_id,title,work_type,scheduled_at,unit_price_cents,
    responsible_member_id,status,notes,time_confirmed,legacy_imported
  )
  values(
    v_id,p_service_id,btrim(p_title),coalesce(nullif(btrim(p_work_type),''),'COLLECTIVE'),
    p_scheduled_at,coalesce(p_unit_price_cents,0),p_responsible_member_id,
    'OPEN',nullif(btrim(p_notes),''),p_scheduled_at is not null,false
  );

  perform v4_write_audit(
    'WORK_CREATED','work',v_id,
    jsonb_build_object('title',btrim(p_title),'scheduled_at',p_scheduled_at,'work_type',p_work_type)
  );
  return v_id;
end
$function$;

create or replace function public.v4_api_create_work(
  p_title text,
  p_service_id uuid,
  p_work_type text,
  p_scheduled_at timestamptz,
  p_unit_price_cents bigint,
  p_responsible_member_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'sunshine_v4', 'auth', 'pg_temp'
as $function$
begin
  perform public.v4_bind_authenticated_user();
  return sunshine_v4.v4_create_work(
    p_title,p_service_id,p_work_type,p_scheduled_at,p_unit_price_cents,
    p_responsible_member_id,p_notes
  );
end
$function$;

revoke all on function public.v4_api_create_work(text,uuid,text,timestamptz,bigint,uuid,text) from public, anon;
grant execute on function public.v4_api_create_work(text,uuid,text,timestamptz,bigint,uuid,text) to authenticated, service_role;
