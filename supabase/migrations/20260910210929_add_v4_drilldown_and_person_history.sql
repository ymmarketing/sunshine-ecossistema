-- V4: add read-only operational drill-downs for people and commissions.

create or replace function public.v4_person_detail(p_person_id uuid)
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
  perform sunshine_v4.v4_assert_permission('person.read');

  if not exists(select 1 from sunshine_v4.people where id=p_person_id) then
    raise exception 'Pessoa não encontrada.';
  end if;

  select jsonb_build_object(
    'person',jsonb_build_object(
      'id',p.id,'fullName',p.full_name,'preferredName',p.preferred_name,
      'phone',p.phone,'email',p.email,'birthDate',p.birth_date,
      'city',p.city,'state',p.state,'status',p.status,'sourceOrigin',p.source_origin,
      'createdAt',p.created_at
    ),
    'workCount',(select count(distinct wr.work_id) from sunshine_v4.work_registrations wr where wr.beneficiary_person_id=p.id),
    'appointmentCount',(select count(*) from sunshine_v4.appointments a where a.person_id=p.id),
    'paymentCount',(select count(*) from sunshine_v4.payments pay where pay.payer_person_id=p.id),
    'house',coalesce((
      select jsonb_build_object(
        'isHouseMember',true,'status',hm.status,'joinedAt',hm.joined_at,
        'leftAt',hm.left_at,'monthlyFeeCents',hm.monthly_fee_cents,
        'billingExempt',hm.billing_exempt,'billingDueDay',hm.billing_due_day
      )
      from sunshine_v4.house_members hm
      where hm.person_id=p.id
      order by case when upper(coalesce(hm.status,'')) in ('ACTIVE','ATIVO') and hm.left_at is null then 0 else 1 end,
               coalesce(hm.updated_at,hm.created_at) desc
      limit 1
    ),jsonb_build_object('isHouseMember',false)),
    'history',coalesce((
      select jsonb_agg(to_jsonb(h) order by h.occurred_at desc)
      from (
        select * from (
          select 'WORK'::text event_type,coalesce(w.scheduled_at,wr.created_at) occurred_at,
                 w.title title,coalesce(w.status,wr.status,'') detail,
                 coalesce(ci.amount_cents,0)::bigint amount_cents
          from sunshine_v4.work_registrations wr
          join sunshine_v4.works w on w.id=wr.work_id
          left join sunshine_v4.contract_items ci on ci.id=wr.contract_item_id
          where wr.beneficiary_person_id=p.id
          union all
          select 'SERVICE'::text,coalesce(c.sold_at,c.created_at),ci.service_name,
                 coalesce(c.status,''),ci.amount_cents
          from sunshine_v4.contract_items ci
          join sunshine_v4.contracts c on c.id=ci.contract_id
          where ci.beneficiary_person_id=p.id
          union all
          select 'PAYMENT'::text,pay.paid_at,'Pagamento recebido',
                 coalesce(pay.payment_method,pay.source,''),pay.amount_cents
          from sunshine_v4.payments pay
          where pay.payer_person_id=p.id
          union all
          select 'APPOINTMENT'::text,coalesce(a.starts_at,a.created_at),
                 coalesce(a.consultation_method,a.event_type,'Agendamento'),
                 coalesce(a.status,''),0::bigint
          from sunshine_v4.appointments a
          where a.person_id=p.id
        ) all_history
        order by occurred_at desc nulls last
        limit 100
      ) h
    ),'[]'::jsonb)
  )
  into v_result
  from sunshine_v4.people p
  where p.id=p_person_id;

  return v_result;
end
$function$;

revoke all on function public.v4_person_detail(uuid) from public, anon;
grant execute on function public.v4_person_detail(uuid) to authenticated, service_role;

create or replace function public.v4_commission_details(
  p_status text default null,
  p_limit integer default 300
)
returns table(
  commission_id uuid,
  recipient_name text,
  commission_status text,
  amount_cents bigint,
  occurred_at timestamptz,
  source text,
  payer_name text,
  payment_amount_cents bigint,
  allocated_amount_cents bigint
)
language plpgsql
security definer
set search_path to 'public', 'sunshine_v4', 'auth', 'pg_temp'
as $function$
begin
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('commission.read');

  return query
  select q.commission_id,q.recipient_name,q.commission_status,q.amount_cents,
         q.occurred_at,q.source,q.payer_name,q.payment_amount_cents,q.allocated_amount_cents
  from (
    select c.legacy_v3_id commission_id,
           coalesce(b.full_name,r.full_name,'Sem identificação') recipient_name,
           upper(coalesce(c.status,'')) commission_status,
           c.amount_cents,
           coalesce(c.paid_at,c.created_at) occurred_at,
           coalesce(c.source,c.calculation_source,'LEGADO') source,
           coalesce(pp.preferred_name,pp.full_name,pay.payer_snapshot->>'name','Pagador não identificado') payer_name,
           coalesce(pay.amount_cents,0)::bigint payment_amount_cents,
           coalesce(pa.amount_cents,0)::bigint allocated_amount_cents
    from sunshine_v4.legacy_commission_entries c
    left join sunshine_v4.team_members b on b.id=c.beneficiary_member_id
    left join sunshine_v4.team_members r on r.id=c.responsible_member_id
    left join sunshine_v4.payment_allocations pa on pa.id=c.payment_allocation_id
    left join sunshine_v4.payments pay on pay.id=pa.payment_id
    left join sunshine_v4.people pp on pp.id=pay.payer_person_id
    union all
    select c.id,coalesce(b.full_name,r.full_name,nullif(c.recipient_code,''),'Sem identificação'),
           upper(coalesce(c.status,'')),c.amount_cents,coalesce(c.paid_at,c.created_at),
           coalesce(c.source,c.calculation_source,'V4'),
           coalesce(pp.preferred_name,pp.full_name,pay.payer_snapshot->>'name','Pagador não identificado'),
           coalesce(pay.amount_cents,0)::bigint,coalesce(pa.amount_cents,0)::bigint
    from sunshine_v4.commission_entries c
    left join sunshine_v4.team_members b on b.id=c.beneficiary_member_id
    left join sunshine_v4.team_members r on r.id=c.responsible_member_id
    left join sunshine_v4.payment_allocations pa on pa.id=c.allocation_id
    left join sunshine_v4.payments pay on pay.id=pa.payment_id
    left join sunshine_v4.people pp on pp.id=pay.payer_person_id
  ) q
  where p_status is null or q.commission_status=upper(p_status)
  order by q.occurred_at desc nulls last
  limit least(greatest(coalesce(p_limit,300),1),500);
end
$function$;

revoke all on function public.v4_commission_details(text,integer) from public, anon;
grant execute on function public.v4_commission_details(text,integer) to authenticated, service_role;

create or replace function public.v4_work_detail(p_work_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'sunshine_v4', 'auth', 'pg_temp'
as $function$
declare
  v_result jsonb;
begin
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('work.read');

  select jsonb_build_object(
    'work',jsonb_build_object(
      'id',w.id,'title',w.title,'status',w.status,'workType',w.work_type,
      'scheduledAt',w.scheduled_at,'unitPriceCents',w.unit_price_cents
    ),
    'participants',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'registrationId',wr.id,
          'personId',wr.beneficiary_person_id,
          'personName',coalesce(p.preferred_name,p.full_name,wr.participant_name,'Pessoa não identificada'),
          'registeredAt',wr.created_at,
          'registrationStatus',wr.status,
          'amountCents',coalesce(ci.amount_cents,0),
          'paidCents',coalesce(fin.paid_cents,0),
          'pendingCents',greatest(coalesce(ci.amount_cents,0)-coalesce(fin.paid_cents,0),0)
        )
        order by wr.created_at desc
      )
      from sunshine_v4.work_registrations wr
      left join sunshine_v4.people p on p.id=wr.beneficiary_person_id
      left join sunshine_v4.contract_items ci on ci.id=wr.contract_item_id
      left join lateral (
        select coalesce(sum(pa.amount_cents),0)::bigint paid_cents
        from sunshine_v4.obligations o
        left join sunshine_v4.payment_allocations pa on pa.obligation_id=o.id
        where o.contract_item_id=wr.contract_item_id
      ) fin on true
      where wr.work_id=w.id
    ),'[]'::jsonb)
  )
  into v_result
  from sunshine_v4.works w
  where w.id=p_work_id;

  if v_result is null then
    raise exception 'Trabalho não encontrado.';
  end if;
  return v_result;
end
$function$;

revoke all on function public.v4_work_detail(uuid) from public, anon;
grant execute on function public.v4_work_detail(uuid) to authenticated, service_role;
