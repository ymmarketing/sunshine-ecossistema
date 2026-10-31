-- Administrative recognition of confirmed historical standing; never creates a receipt or commission.
alter table sunshine_v4.house_members add column regularized_through date,
 add column regularization_note text,add column regularized_at timestamptz;
CREATE OR REPLACE FUNCTION private.agent_core_v4_house_monthly_status(p_reference_month date DEFAULT CURRENT_DATE)
 RETURNS TABLE(house_member_id uuid, person_id uuid, person_name text, reference_month date, house_status text, monthly_fee_cents bigint, billing_exempt boolean, billing_exemption_reason text, billing_due_label text, billing_due_date date, paid_cents bigint, pending_cents bigint, payment_status text, payment_evidence jsonb, payment_history jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET "TimeZone" TO 'America/Sao_Paulo'
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare
  v_month date := date_trunc('month',coalesce(p_reference_month,current_date)::timestamp)::date;
  v_next_month date := (date_trunc('month',coalesce(p_reference_month,current_date)::timestamp) + interval '1 month')::date;
begin
  
  

  return query
  with monthly_paid as (
    select ci.beneficiary_person_id,
           coalesce(sum(pa.amount_cents) filter (where upper(coalesce(pay.status,'PAID'))='PAID'),0)::bigint paid_cents,
           coalesce(jsonb_agg(
             jsonb_build_object(
               'paymentId',pay.id,
               'allocationId',pa.id,
               'paidAt',pay.paid_at,
               'referenceMonth',ci.reference_month,
               'amountCents',pa.amount_cents,
               'payerName',coalesce(pp.preferred_name,pp.full_name,pay.payer_snapshot->>'name','Pagador não identificado'),
               'source',pay.source,
               'method',pay.payment_method,
               'externalRef',pay.external_ref
             ) order by pay.paid_at desc, pa.allocated_at desc
           ) filter (where pa.id is not null and upper(coalesce(pay.status,'PAID'))='PAID'),'[]'::jsonb) evidence
    from sunshine_v4.contract_items ci
    left join sunshine_v4.obligations o on o.contract_item_id=ci.id
    left join sunshine_v4.payment_allocations pa on pa.obligation_id=o.id
    left join sunshine_v4.payments pay on pay.id=pa.payment_id
    left join sunshine_v4.people pp on pp.id=pay.payer_person_id
    where ci.reference_month=v_month
      and upper(coalesce(ci.service_category,''))='MENSALIDADE'
    group by ci.beneficiary_person_id
  )
  select hm.id,
         hm.person_id,
         coalesce(p.preferred_name,p.full_name,'Pessoa não identificada'),
         v_month,
         hm.status,
         coalesce(hm.monthly_fee_cents,0)::bigint,
         coalesce(hm.billing_exempt,false),
         hm.billing_exemption_reason,
         case
           when coalesce(hm.billing_exempt,false) then 'Isento'
           when coalesce(hm.billing_due_rule,'FIXED_DAY')='LAST_DAY_MONTH' then 'Último dia do mês'
           else 'Dia '||coalesce(hm.billing_due_day,10)::text
         end,
         case
           when coalesce(hm.billing_exempt,false) then null
           when coalesce(hm.billing_due_rule,'FIXED_DAY')='LAST_DAY_MONTH' then v_next_month-1
           else make_date(extract(year from v_month)::int,extract(month from v_month)::int,
                  least(coalesce(hm.billing_due_day,10)::int,extract(day from (v_next_month-1))::int))
         end,
         case when coalesce(hm.billing_exempt,false) then 0 else coalesce(mp.paid_cents,0) end,
         case when coalesce(hm.billing_exempt,false) or hm.regularized_through>=v_next_month-1 then 0 else greatest(coalesce(hm.monthly_fee_cents,0)-coalesce(mp.paid_cents,0),0)::bigint end,
         case
           when coalesce(hm.billing_exempt,false) then 'ISENTO'
           when coalesce(mp.paid_cents,0)>=coalesce(hm.monthly_fee_cents,0) then 'PAGO'
           when hm.regularized_through>=v_next_month-1 then 'REGULARIZADO'
           when coalesce(mp.paid_cents,0)>0 then 'PARCIAL'
           else 'PENDENTE'
         end,
         coalesce(mp.evidence,'[]'::jsonb)||case when hm.regularized_through>=v_next_month-1 and coalesce(mp.paid_cents,0)<coalesce(hm.monthly_fee_cents,0) then jsonb_build_array(jsonb_build_object('kind','HISTORICAL_CLEARANCE','recordedAt',hm.regularized_at,'referenceMonth',v_month,'notes',hm.regularization_note)) else '[]'::jsonb end,
         coalesce(hist.history,'[]'::jsonb)
  from sunshine_v4.house_members hm
  left join sunshine_v4.people p on p.id=hm.person_id
  left join monthly_paid mp on mp.beneficiary_person_id=hm.person_id
  left join lateral (
    select jsonb_agg(to_jsonb(h) order by h.reference_month desc) history
    from (
      select ci.reference_month,
             coalesce(sum(pa.amount_cents) filter (where upper(coalesce(pay.status,'PAID'))='PAID'),0)::bigint paid_cents,
             max(pay.paid_at) filter (where upper(coalesce(pay.status,'PAID'))='PAID') last_paid_at
      from sunshine_v4.contract_items ci
      left join sunshine_v4.obligations o on o.contract_item_id=ci.id
      left join sunshine_v4.payment_allocations pa on pa.obligation_id=o.id
      left join sunshine_v4.payments pay on pay.id=pa.payment_id
      where ci.beneficiary_person_id=hm.person_id
        and ci.reference_month is not null
        and upper(coalesce(ci.service_category,''))='MENSALIDADE'
      group by ci.reference_month
      order by ci.reference_month desc
      limit 24
    ) h
  ) hist on true
  where upper(coalesce(hm.status,'')) in ('ACTIVE','ATIVO')
    and (hm.joined_at is null or hm.joined_at<v_next_month)
    and (hm.left_at is null or hm.left_at>=v_month)
  order by case
             when coalesce(hm.billing_exempt,false) then 3
             when hm.regularized_through>=v_next_month-1 then 2
             when coalesce(mp.paid_cents,0)=0 then 0
             when coalesce(mp.paid_cents,0)<coalesce(hm.monthly_fee_cents,0) then 1
             else 2
           end,
           p.full_name;
end
$function$
;
create or replace function public.v4_api_inactivate_house_member(p_house_member_id uuid,p_left_at date default current_date,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare h sunshine_v4.house_members%rowtype;v_day date:=coalesce(p_left_at,(now() at time zone 'America/Sao_Paulo')::date);
begin
 perform public.v4_bind_authenticated_user();
 perform sunshine_v4.v4_assert_permission('house.update');
 if v_day>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'A saída não pode estar no futuro.';end if;
 select * into h from sunshine_v4.house_members where id=p_house_member_id for update;
 if not found then raise exception 'Filho da Casa não encontrado.';end if;
 if h.status='INACTIVE' then return jsonb_build_object('houseMemberId',h.id,'status',h.status,'leftAt',h.left_at,'alreadyInactive',true);end if;
 if h.joined_at is not null and v_day<h.joined_at then raise exception 'A saída não pode ser anterior à entrada.';end if;
 update sunshine_v4.house_members set status='INACTIVE',left_at=v_day,updated_at=now(),
 notes=concat_ws(E'\n',nullif(notes,''),'Filho inativo em '||to_char(v_day,'DD/MM/YYYY')||case when nullif(btrim(p_note),'') is not null then ': '||btrim(p_note) else '.' end)
 where id=h.id;
 perform sunshine_v4.v4_write_audit('HOUSE_MEMBER_INACTIVATED','house_member',h.id,
  jsonb_build_object('personId',h.person_id,'before',to_jsonb(h),'status','INACTIVE','leftAt',v_day,'note',p_note));
 return jsonb_build_object('houseMemberId',h.id,'status','INACTIVE','leftAt',v_day);
end $function$;
revoke all on function public.v4_api_inactivate_house_member(uuid,date,text) from public,anon;
grant execute on function public.v4_api_inactivate_house_member(uuid,date,text) to authenticated;
notify pgrst,'reload schema';
