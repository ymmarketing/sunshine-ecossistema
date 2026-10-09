CREATE OR REPLACE FUNCTION public.v4_finance_dashboard_filtered(p_start date, p_end date, p_basis text DEFAULT 'RECEIPT'::text, p_responsible_member_id uuid DEFAULT NULL::uuid, p_service_category text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare v_result jsonb; v_payments jsonb; v_unassociated bigint; v_reserve bigint; v_reserve_evidence jsonb; v_sales jsonb;
begin
  v_result:=public.v4_finance_dashboard_filtered_before_queue_dismissals(p_start,p_end,p_basis,p_responsible_member_id,p_service_category);
  select coalesce(jsonb_agg(case when d.entity_id is not null then e.value || jsonb_build_object('unassociatedCents',0) else e.value end
      order by e.ordinality),'[]'::jsonb),
    coalesce(sum(case when d.entity_id is null then (e.value->>'unassociatedCents')::bigint else 0 end),0)
  into v_payments,v_unassociated
  from jsonb_array_elements(coalesce(v_result->'paymentEvidence','[]'::jsonb)) with ordinality e(value,ordinality)
  left join sunshine_v4.payment_queue_dismissals d on d.entity_kind='EXISTING' and d.entity_id=(e.value->>'paymentId')::uuid;
  -- Reuse the filtered sales evidence to keep period, responsible and category in sync.
  with rows as (
    select a.id,a.amount_cents base_cents,p.paid_at,i.service_name,
      coalesce(bp.preferred_name,bp.full_name,p.payer_snapshot->>'name','Pessoa não identificada') person_name,
      (private.sunshine_item_split(i.id,(p.paid_at at time zone 'America/Sao_Paulo')::date)->>'costBp')::integer cost_bp
    from sunshine_v4.payment_allocations a
    join sunshine_v4.payments p on p.id=a.payment_id
    join sunshine_v4.obligations o on o.id=a.obligation_id
    join sunshine_v4.contract_items i on i.id=o.contract_item_id
    left join sunshine_v4.people bp on bp.id=coalesce(o.beneficiary_person_id,i.beneficiary_person_id)
    where p.status='PAID' and private.sunshine_uses_october_rule(a.id)
      and exists(select 1 from jsonb_array_elements(coalesce(v_result->'salesEvidence','[]'::jsonb)) e
        where case when upper(coalesce(p_basis,'RECEIPT'))='RECEIPT'
          then (e->>'evidenceId')::uuid=a.id else (e->>'obligationId')::uuid=o.id end)
  ), amounts as (select *,round(base_cents*cost_bp/10000.0)::bigint reserve_cents from rows)
  select coalesce(sum(reserve_cents),0),coalesce(jsonb_agg(jsonb_build_object(
    'allocationId',id,'personName',person_name,'serviceName',service_name,'paidAt',paid_at,
    'baseCents',base_cents,'costBp',cost_bp,'amountCents',reserve_cents
  ) order by paid_at desc,id),'[]'::jsonb) into v_reserve,v_reserve_evidence from amounts;
  -- Keep the filtered evidence and cents; add only the identifying detail for each service.
  select coalesce(jsonb_agg(e.value || jsonb_build_object(
    'eventName',nullif(btrim(i.event_name),''),
    'workTitle',w.title,
    'responsibleName',t.full_name,
    'referenceMonth',i.reference_month,
    'questionText',nullif(btrim(i.question_text),'')
  ) order by e.ordinality),'[]'::jsonb) into v_sales
  from jsonb_array_elements(coalesce(v_result->'salesEvidence','[]'::jsonb)) with ordinality e(value,ordinality)
  left join sunshine_v4.obligations o on o.id=(e.value->>'obligationId')::uuid
  left join sunshine_v4.contract_items i on i.id=o.contract_item_id
  left join sunshine_v4.works w on w.id=i.work_id
  left join sunshine_v4.team_members t on t.id=i.responsible_member_id;
  return v_result || jsonb_build_object('salesEvidence',v_sales,'paymentEvidence',v_payments,'unassociatedCents',v_unassociated,
    'reserveCents',v_reserve,'reserveEvidence',v_reserve_evidence);
end $function$
;

