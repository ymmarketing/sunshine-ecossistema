-- Add identifying context only; debt calculations and stored records are preserved.
CREATE OR REPLACE FUNCTION public.v4_person_financial_position(p_person_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('person.read');
  if not exists(select 1 from sunshine_v4.people where id=p_person_id) then
    raise exception 'Pessoa não encontrada.';
  end if;
  with credit_rows as (
    select e.*,
      case when e.amount_cents>0 then 'Crédito recebido' else 'Crédito utilizado' end label
    from sunshine_v4.person_credit_entries e where e.person_id=p_person_id
  ), debt_rows as (
    select o.id obligation_id,ci.service_name,o.total_cents,
      ci.id item_id,ci.service_category,ci.event_name,coalesce(ci.work_id,w.id) work_id,w.title work_title,
      w.scheduled_at work_date,ci.reference_month,coalesce(c.sold_at,c.created_at) sold_at,o.explicit_status,
      coalesce(sum(pa.amount_cents),0)::bigint received_cents,
      greatest(o.total_cents-coalesce(sum(pa.amount_cents),0),0)::bigint pending_cents,
      coalesce(o.next_collection_date,o.expected_payment_date,o.due_date) due_date
    from sunshine_v4.obligations o
    join sunshine_v4.contract_items ci on ci.id=o.contract_item_id
    join sunshine_v4.contracts c on c.id=ci.contract_id
    left join lateral (
      select count(distinct wr.work_id) work_count,(array_agg(distinct wr.work_id))[1] work_id
      from sunshine_v4.work_registrations wr where wr.contract_item_id=ci.id
    ) linked on ci.work_id is null
    left join sunshine_v4.works w on w.id=coalesce(ci.work_id,case when linked.work_count=1 then linked.work_id end)
    left join sunshine_v4.payment_allocations pa on pa.obligation_id=o.id
    where coalesce(o.beneficiary_person_id,ci.beneficiary_person_id)=p_person_id
      and coalesce(o.explicit_status,'')<>'CANCELLED'
      and coalesce(c.status,'CONFIRMED')<>'CANCELLED'
    group by o.id,ci.id,c.id,w.id
    having o.total_cents>coalesce(sum(pa.amount_cents),0)
  )
  select jsonb_build_object(
    'creditCents',coalesce((select sum(amount_cents) from credit_rows),0),
    'debtCents',coalesce((select sum(pending_cents) from debt_rows),0),
    'creditEvidence',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'paymentId',payment_id,'amountCents',amount_cents,'entryType',entry_type,
      'label',label,'notes',notes,'createdAt',created_at
    ) order by created_at desc) from credit_rows),'[]'::jsonb),
    'debtEvidence',coalesce((select jsonb_agg(jsonb_build_object(
      'obligationId',obligation_id,'serviceName',service_name,'totalCents',total_cents,
      'receivedCents',received_cents,'pendingCents',pending_cents,'dueDate',due_date,
      'itemId',item_id,'serviceCategory',service_category,'eventName',event_name,'workId',work_id,
      'workTitle',work_title,'workDate',work_date,'referenceMonth',reference_month,'soldAt',sold_at,'explicitStatus',explicit_status
    ) order by due_date nulls last,service_name) from debt_rows),'[]'::jsonb)
  ) into v_result;
  return v_result;
end
$function$

;
CREATE OR REPLACE FUNCTION public.v4_person_detail(p_person_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                 coalesce(ci.amount_cents,0)::bigint amount_cents,w.title work_title,null::text event_name,w.status status
          from sunshine_v4.work_registrations wr
          join sunshine_v4.works w on w.id=wr.work_id
          left join sunshine_v4.contract_items ci on ci.id=wr.contract_item_id
          where wr.beneficiary_person_id=p.id
          union all
          select 'SERVICE'::text,coalesce(c.sold_at,c.created_at),ci.service_name,
                 coalesce(c.status,''),ci.amount_cents,w.title,ci.event_name,c.status
          from sunshine_v4.contract_items ci
          join sunshine_v4.contracts c on c.id=ci.contract_id
          left join sunshine_v4.works w on w.id=ci.work_id
          where ci.beneficiary_person_id=p.id
          union all
          select 'PAYMENT'::text,pay.paid_at,'Pagamento recebido',
                 coalesce(pay.payment_method,pay.source,''),pay.amount_cents,null::text,null::text,pay.status
          from sunshine_v4.payments pay
          where pay.payer_person_id=p.id
          union all
          select 'APPOINTMENT'::text,coalesce(a.starts_at,a.created_at),
                 coalesce(a.consultation_method,a.event_type,'Agendamento'),
                 coalesce(a.status,''),0::bigint,null::text,null::text,a.status
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
$function$

;

revoke all on function public.v4_person_financial_position(uuid),public.v4_person_detail(uuid) from public,anon;
grant execute on function public.v4_person_financial_position(uuid),public.v4_person_detail(uuid) to authenticated,service_role;
