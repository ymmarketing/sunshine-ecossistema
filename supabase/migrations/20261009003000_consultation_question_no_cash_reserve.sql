-- Approved by Yasmin on 2026-10-08 (America/Sao_Paulo): no reserve on
-- CONSULTA/PERGUNTA; commissions keep their percentages on the gross receipt.
insert into sunshine_v4.receipt_distribution_policies
 (valid_from,reserve_bp,commission_bp,responsible_bp,consultation_reserve_status,notes)
values (date '2026-10-08',3000,1050,4900,'EXEMPT',
 'Aprovado pela Yasmin: consultas e perguntas sem reserva de caixa desde 08/10/2026. Sobre o bruto: 10,5% para cada outra integrante e 79% responsável. Demais serviços: 30% caixa, 10,5% cada comissão e 49% responsável. Fixos preservados.')
on conflict(valid_from) do update set consultation_reserve_status=excluded.consultation_reserve_status,notes=excluded.notes;
update sunshine_v4.receipt_distribution_policies set consultation_reserve_status='EXEMPT',
 notes='Aprovado pela Yasmin: desde 01/11/2026, consultas e perguntas sem caixa, 15% para cada outra integrante e 70% responsável. Demais serviços: 30% caixa, 15% cada comissão e 40% responsável. Percentuais sobre o recebimento integral. Fixos preservados.'
where valid_from=date '2026-11-01';

create or replace function private.sunshine_item_split(p_item uuid,p_received_on date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 v_split jsonb;v_policy sunshine_v4.receipt_distribution_policies%rowtype;
 v_responsible uuid;v_category text;v_override jsonb;v_shares jsonb;v_cost integer;
begin
 v_split:=private.sunshine_item_split(p_item);
 select responsible_member_id,service_category,commission_override
 into v_responsible,v_category,v_override from sunshine_v4.contract_items where id=p_item;
 select * into v_policy from sunshine_v4.receipt_distribution_policies
 where valid_from<=p_received_on order by valid_from desc limit 1;
 if not found then return v_split;end if;
 if v_override is null then
  select jsonb_agg(jsonb_build_object('memberId',x->>'memberId','basisPoints',
    case when (x->>'memberId')::uuid=v_responsible then v_policy.responsible_bp else v_policy.commission_bp end))
  into v_shares from jsonb_array_elements(v_split->'shares')x;
  v_split:=jsonb_build_object('costBp',v_policy.reserve_bp,'shares',v_shares);
 end if;
 -- Keep every other recipient's gross percentage; release the reserve to the responsible.
 if v_policy.consultation_reserve_status='EXEMPT' and v_category in('CONSULTA','PERGUNTA') then
  v_cost:=(v_split->>'costBp')::integer;
  select jsonb_agg(jsonb_build_object('memberId',x->>'memberId','basisPoints',
   (x->>'basisPoints')::integer+case when (x->>'memberId')::uuid=v_responsible then v_cost else 0 end))
  into v_shares from jsonb_array_elements(v_split->'shares')x;
  v_split:=jsonb_build_object('costBp',0,'shares',v_shares);
 end if;
 return v_split||jsonb_build_object('validFrom',v_policy.valid_from);
end $$;
revoke all on function private.sunshine_item_split(uuid,date) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.v4_finance_dashboard_filtered(p_start date, p_end date, p_basis text DEFAULT 'RECEIPT'::text, p_responsible_member_id uuid DEFAULT NULL::uuid, p_service_category text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare v_result jsonb; v_payments jsonb; v_unassociated bigint; v_reserve bigint; v_reserve_evidence jsonb;
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
  return v_result || jsonb_build_object('paymentEvidence',v_payments,'unassociatedCents',v_unassociated,
    'reserveCents',v_reserve,'reserveEvidence',v_reserve_evidence);
end $function$
;


-- Rebuild only unpaid receipts under the newly approved effective dates.
-- Settlement protections in the builder remain in force; imported history is not rebuilt.
do $$
declare v_allocation uuid;
begin
 for v_allocation in
  select a.id from sunshine_v4.payment_allocations a
  join sunshine_v4.payments p on p.id=a.payment_id
  join sunshine_v4.obligations o on o.id=a.obligation_id
  join sunshine_v4.contract_items i on i.id=o.contract_item_id
  where p.status='PAID' and i.service_category in('CONSULTA','PERGUNTA')
   and (p.paid_at at time zone 'America/Sao_Paulo')::date>=date '2026-10-08'
   and private.sunshine_uses_october_rule(a.id)
   and not exists(select 1 from sunshine_v4.commission_effective_status e where e.allocation_id=a.id and e.paid_cents>0)
   and not exists(select 1 from sunshine_v4.legacy_commission_entries l where l.payment_allocation_id=a.id and l.status<>'CANCELLED')
 loop perform private.sunshine_build_october_commissions(v_allocation);end loop;
end $$;
