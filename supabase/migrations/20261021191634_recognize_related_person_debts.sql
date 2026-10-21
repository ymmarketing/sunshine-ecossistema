CREATE OR REPLACE FUNCTION public.v4_payment_debt_candidates()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb;
begin
 perform public.v4_bind_authenticated_user();
 perform sunshine_v4.v4_assert_permission('receivable.read');
 select coalesce(jsonb_agg(to_jsonb(x) order by x."personName",x."soldAt"),'[]') into v from (
  select o.id "obligationId",o.beneficiary_person_id "personId",c.customer_person_id "customerPersonId",
   coalesce(p.preferred_name,p.full_name,'Pessoa não identificada') "personName",
   i.service_name "serviceName",coalesce(w.title,i.event_name,i.service_name) "eventName",
   coalesce(w.scheduled_at,c.sold_at,c.created_at) "soldAt",i.reference_month "referenceMonth",
   (select coalesce(jsonb_agg(other.id order by other.id),'[]') from sunshine_v4.people other
    where other.id=p.id or (p.birth_date is not null and p.birth_date=other.birth_date
    and length(regexp_replace(coalesce(p.phone,''),'[^0-9]','','g'))>=10
    and regexp_replace(p.phone,'[^0-9]','','g')=regexp_replace(other.phone,'[^0-9]','','g'))) "identityPersonIds",
   i.responsible_member_id "responsibleMemberId",o.total_cents "totalCents",
   o.total_cents-coalesce(a.received,0) "pendingCents"
  from sunshine_v4.obligations o
  join sunshine_v4.contract_items i on i.id=o.contract_item_id
  join sunshine_v4.contracts c on c.id=i.contract_id
  left join sunshine_v4.people p on p.id=o.beneficiary_person_id
  left join sunshine_v4.works w on w.id=i.work_id
  left join lateral (select sum(amount_cents) received from sunshine_v4.payment_allocations where obligation_id=o.id)a on true
  where coalesce(o.explicit_status,'')<>'CANCELLED' and c.status<>'CANCELLED'
   and o.total_cents>coalesce(a.received,0)
 )x;
 return v;
end $function$
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
                 w.title title,case when wr.status='CANCELLED' then 'CANCELLED' else coalesce(w.status,wr.status,'') end detail,
                 coalesce(ci.amount_cents,0)::bigint amount_cents,w.title work_title,null::text event_name,case when wr.status='CANCELLED' then 'CANCELLED' else w.status end status
          from sunshine_v4.work_registrations wr
          join sunshine_v4.works w on w.id=wr.work_id
          left join sunshine_v4.contract_items ci on ci.id=wr.contract_item_id
          where wr.beneficiary_person_id=p.id
          union all
          select 'SERVICE'::text,coalesce(c.sold_at,c.created_at),ci.service_name,
                 case when exists(select 1 from sunshine_v4.obligations status_o where status_o.contract_item_id=ci.id and status_o.explicit_status='CANCELLED') then 'CANCELLED' else coalesce(c.status,'') end,ci.amount_cents,w.title,ci.event_name,case when exists(select 1 from sunshine_v4.obligations status_o where status_o.contract_item_id=ci.id and status_o.explicit_status='CANCELLED') then 'CANCELLED' else c.status end
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
