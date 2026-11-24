-- Prospective collective pilot. No historical payment, commission or payout is recalculated.
create table sunshine_v4.collective_distribution_policy (
 code text primary key,
 valid_from timestamptz not null default clock_timestamp(),
 house_bp integer not null default 2000 check(house_bp=2000),
 operating_bp integer not null default 2000 check(operating_bp=2000),
 responsible_bp integer not null default 3000 check(responsible_bp=3000),
 other_bp integer not null default 1500 check(other_bp=1500),
 check(house_bp+operating_bp+responsible_bp+2*other_bp=10000)
);
alter table sunshine_v4.collective_distribution_policy enable row level security;
revoke all on sunshine_v4.collective_distribution_policy from public,anon,authenticated;
insert into sunshine_v4.collective_distribution_policy(code) values('COLLECTIVE_PILOT_20261124');

create function private.sunshine_allocation_split(p_allocation uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_item sunshine_v4.contract_items%rowtype;v_payment sunshine_v4.payments%rowtype;
 v_policy sunshine_v4.collective_distribution_policy%rowtype;v_shares jsonb;
begin
 select i.* into strict v_item from sunshine_v4.payment_allocations a
 join sunshine_v4.obligations o on o.id=a.obligation_id
 join sunshine_v4.contract_items i on i.id=o.contract_item_id where a.id=p_allocation;
 select p.* into strict v_payment from sunshine_v4.payment_allocations a
 join sunshine_v4.payments p on p.id=a.payment_id where a.id=p_allocation;
 select * into strict v_policy from sunshine_v4.collective_distribution_policy where code='COLLECTIVE_PILOT_20261124';
 if v_payment.paid_at<v_policy.valid_from or v_payment.created_at<v_policy.valid_from
 or coalesce(v_item.service_category,'') not in ('AGRADO_COLETIVO','TRABALHO_COLETIVO','TRABALHO_COLETIVO_PREMIUM') then
  return private.sunshine_item_split(v_item.id,(v_payment.paid_at at time zone 'America/Sao_Paulo')::date);
 end if;
 select jsonb_agg(jsonb_build_object('memberId',t.id,'basisPoints',
  case when t.id=v_item.responsible_member_id then v_policy.responsible_bp else v_policy.other_bp end) order by t.id)
 into v_shares from sunshine_v4.team_members t
 where t.active and lower(t.full_name) in ('yasmin','lourdes','rosely','roseli');
 if jsonb_array_length(v_shares) is distinct from 3
 or not exists(select 1 from jsonb_array_elements(v_shares)x where (x->>'memberId')::uuid=v_item.responsible_member_id) then
  raise exception 'Informe a responsável e confira as três integrantes ativas para a divisão do coletivo.';
 end if;
 return jsonb_build_object('costBp',v_policy.house_bp,'houseBp',v_policy.house_bp,
 'operatingCostBp',v_policy.operating_bp,'shares',v_shares,'policyCode',v_policy.code,'validFrom',v_policy.valid_from);
end $$;
revoke all on function private.sunshine_allocation_split(uuid) from public,anon,authenticated;

alter function private.sunshine_build_october_commissions(uuid) rename to sunshine_build_commissions_before_collective_20261124;
revoke all on function private.sunshine_build_commissions_before_collective_20261124(uuid) from public,anon,authenticated;
create function private.sunshine_build_october_commissions(p_allocation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_split jsonb;v_amount bigint;v_responsible uuid;v_status text;
 v_house bigint;v_operating bigint;v_remaining bigint;v_cents bigint;v_share jsonb;
begin
 v_split:=private.sunshine_allocation_split(p_allocation);
 if v_split->>'policyCode' is distinct from 'COLLECTIVE_PILOT_20261124' then
  perform private.sunshine_build_commissions_before_collective_20261124(p_allocation);return;
 end if;
 select a.amount_cents,i.responsible_member_id,p.status into v_amount,v_responsible,v_status
 from sunshine_v4.payment_allocations a join sunshine_v4.obligations o on o.id=a.obligation_id
 join sunshine_v4.contract_items i on i.id=o.contract_item_id
 join sunshine_v4.payments p on p.id=a.payment_id where a.id=p_allocation;
 if v_status<>'PAID' then return;end if;
 if exists(select 1 from sunshine_v4.commission_effective_status where allocation_id=p_allocation and paid_cents>0) then
  raise exception 'Há comissão paga: regularize o pagamento de comissão antes de alterar a base financeira.';
 end if;
 if exists(select 1 from sunshine_v4.legacy_commission_entries where payment_allocation_id=p_allocation and status<>'CANCELLED') then
  raise exception 'Comissão histórica importada: preserve o histórico; corrija por um lançamento complementar.';
 end if;
 v_house:=round(v_amount*(v_split->>'houseBp')::integer/10000.0)::bigint;
 v_operating:=round(v_amount*(v_split->>'operatingCostBp')::integer/10000.0)::bigint;
 v_remaining:=v_amount-v_house-v_operating;
 delete from sunshine_v4.commission_entries where allocation_id=p_allocation;
 for v_share in select value from jsonb_array_elements(v_split->'shares') where (value->>'memberId')::uuid<>v_responsible loop
  v_cents:=least(v_remaining,round(v_amount*(v_share->>'basisPoints')::integer/10000.0)::bigint);
  insert into sunshine_v4.commission_entries(allocation_id,recipient_code,base_cents,amount_cents,status,responsible_member_id,beneficiary_member_id,percentage,source,calculation_source,notes)
  values(p_allocation,v_share->>'memberId',v_amount,v_cents,'DUE',v_responsible,(v_share->>'memberId')::uuid,15,'AUTO_RESPONSIBLE','COLLECTIVE_PILOT_20261124','15% do recebido; casa e operação separadas.');
  v_remaining:=v_remaining-v_cents;
 end loop;
 insert into sunshine_v4.commission_entries(allocation_id,recipient_code,base_cents,amount_cents,status,responsible_member_id,beneficiary_member_id,percentage,source,calculation_source,notes)
 values(p_allocation,v_responsible::text,v_amount,v_remaining,'DUE',v_responsible,v_responsible,30,'AUTO_RESPONSIBLE','COLLECTIVE_PILOT_20261124','30% do recebido; ajuste de centavos no responsável. Casa 20%; operação 20%.');
end $$;
revoke all on function private.sunshine_build_october_commissions(uuid) from public,anon,authenticated;

create function public.v4_open_work_finance() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform private.sunshine_finance_guard();
 with open_works as (
  select w.* from sunshine_v4.works w
  where upper(w.status) not in ('DONE','COMPLETED','CANCELLED','CANCELED','CONCLUIDO','CONCLUÍDO')
 ), allocations as (
  select a.id,a.amount_cents,i.work_id,p.paid_at,
  case when a.id=(select a0.id from sunshine_v4.payment_allocations a0 where a0.payment_id=p.id order by a0.allocated_at,a0.id limit 1)
  then greatest(coalesce(p.retained_excess_cents,0),0) else 0 end excess_cents
  from sunshine_v4.payment_allocations a join sunshine_v4.payments p on p.id=a.payment_id
  join sunshine_v4.obligations o on o.id=a.obligation_id join sunshine_v4.contract_items i on i.id=o.contract_item_id
  join sunshine_v4.contracts c on c.id=i.contract_id join open_works w on w.id=i.work_id
  where p.status='PAID' and c.status<>'CANCELLED' and coalesce(o.explicit_status,'')<>'CANCELLED'
 ), receipts as (
  select work_id,sum(amount_cents+excess_cents)::bigint cents from allocations group by work_id
 ), commission_rows as (
  select a.work_id,coalesce(m.full_name,s.recipient_name,'Sem identificação') person,sum(s.amount_cents)::bigint cents
  from allocations a join sunshine_v4.commission_effective_status s on s.allocation_id=a.id
  left join sunshine_v4.team_members m on m.id=s.beneficiary_member_id
  where coalesce(s.source_status,'') not in ('CANCELLED','REVERSED') group by 1,2
 ), commissions as (
  select work_id,sum(cents)::bigint cents,jsonb_object_agg(person,cents) people from commission_rows group by work_id
 ), cost_rows as (
  select e.work_id,round(e.amount*100)::bigint cents
  from public.work_expenses e left join public.expense_receipts r on r.id=e.receipt_id
  join open_works w on w.id=e.work_id where e.receipt_id is null or r.status='CONFIRMED'
  union all
  select (x->>'workId')::uuid,(x->>'amountCents')::bigint
  from sunshine_v4.expenses e cross join lateral jsonb_array_elements(coalesce(e.allocations,'[]'))x
  join open_works w on w.id=nullif(x->>'workId','')::uuid
  where e.status in ('PENDING','PAID') and e.cost_kind='OPERATING' and e.category<>'COMISSAO'
 ), costs as(select work_id,sum(cents)::bigint cents from cost_rows group by work_id)
 select coalesce(jsonb_agg(jsonb_build_object(
  'workId',w.id,'title',w.title,'receivedCents',coalesce(r.cents,0),
  'costTargetCents',round(coalesce(r.cents,0)*.20)::bigint,
  'costsCents',coalesce(k.cents,0),'commissionCents',coalesce(c.cents,0),
  'commissionsByPerson',coalesce(c.people,'{}'::jsonb),
  'houseTargetCents',round(coalesce(r.cents,0)*.20)::bigint,
  'balanceCents',coalesce(r.cents,0)-coalesce(c.cents,0)-coalesce(k.cents,0),
  'houseGapCents',coalesce(r.cents,0)-coalesce(c.cents,0)-coalesce(k.cents,0)-round(coalesce(r.cents,0)*.20)::bigint
 ) order by w.scheduled_at nulls last,w.title),'[]'::jsonb) into v_result
 from open_works w left join receipts r on r.work_id=w.id
 left join commissions c on c.work_id=w.id left join costs k on k.work_id=w.id;
 return v_result;
end $$;
revoke all on function public.v4_open_work_finance() from public,anon;
grant execute on function public.v4_open_work_finance() to authenticated;

CREATE OR REPLACE FUNCTION private.agent_reserve(p_sales jsonb, p_basis text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_reserve bigint;v_reserve_evidence jsonb;
begin
 with rows as (
   select a.id,a.amount_cents base_cents,p.paid_at,i.service_name,
     coalesce(bp.preferred_name,bp.full_name,p.payer_snapshot->>'name','Pessoa não identificada') person_name,
     (private.sunshine_allocation_split(a.id)->>'costBp')::integer cost_bp,
     case when a.id=(
       select a_first.id from sunshine_v4.payment_allocations a_first
       where a_first.payment_id=p.id order by a_first.allocated_at,a_first.id limit 1
     ) then greatest(coalesce(p.retained_excess_cents,0),0) else 0 end excess_cents
   from sunshine_v4.payment_allocations a
   join sunshine_v4.payments p on p.id=a.payment_id
   join sunshine_v4.obligations o on o.id=a.obligation_id
   join sunshine_v4.contract_items i on i.id=o.contract_item_id
   left join sunshine_v4.people bp on bp.id=coalesce(o.beneficiary_person_id,i.beneficiary_person_id)
   where p.status='PAID'
     and (private.sunshine_uses_october_rule(a.id) or coalesce(p.retained_excess_cents,0)>0)
     and exists(select 1 from jsonb_array_elements(coalesce(p_sales,'[]'::jsonb)) e
       where case when upper(coalesce(p_basis,'RECEIPT'))='RECEIPT'
         then (e->>'evidenceId')::uuid=a.id else (e->>'obligationId')::uuid=o.id end)
 ),
 amounts as (
   select *, (round(base_cents*cost_bp/10000.0)::bigint + excess_cents)::bigint reserve_cents
   from rows
 )
 select coalesce(sum(reserve_cents),0),
   coalesce(jsonb_agg(jsonb_build_object(
    'allocationId',id,'personName',person_name,'serviceName',service_name,'paidAt',paid_at,
    'baseCents',base_cents,'costBp',cost_bp,'excessCents',excess_cents,'amountCents',reserve_cents
   ) order by paid_at desc,id),'[]'::jsonb)
 into v_reserve,v_reserve_evidence from amounts;
 return jsonb_build_object('reserveCents',v_reserve,'reserveEvidence',v_reserve_evidence);
end $function$;

CREATE OR REPLACE FUNCTION private.sunshine_cost_reserve_rows()
 RETURNS TABLE(allocation_id uuid, payment_id uuid, paid_on date, responsible_name text, person_name text, service_name text, event_name text, base_cents bigint, cost_bp integer, reserve_cents bigint, transferred_cents bigint, pending_cents bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 with source as (
   select a.id allocation_id,p.id payment_id,
     (p.paid_at at time zone 'America/Sao_Paulo')::date paid_on,
     coalesce(t.full_name,'Sem responsável') responsible_name,
     coalesce(bp.preferred_name,bp.full_name,p.payer_snapshot->>'name','Pessoa não identificada') person_name,
     i.service_name,coalesce(nullif(btrim(i.event_name),''),w.title,i.service_name) event_name,
     a.amount_cents base_cents,
     case when (lower(btrim(coalesce(t.full_name,''))) in ('yasmin','lourdes') or private.sunshine_allocation_split(a.id)->>'policyCode'='COLLECTIVE_PILOT_20261124')
       then (private.sunshine_allocation_split(a.id)->>'costBp')::integer
       else 0 end cost_bp,
     case when a.id=(
       select a_first.id from sunshine_v4.payment_allocations a_first
       where a_first.payment_id=p.id order by a_first.allocated_at,a_first.id limit 1
     ) then greatest(coalesce(p.retained_excess_cents,0),0) else 0 end excess_cents,
     (lower(btrim(coalesce(t.full_name,''))) in ('yasmin','lourdes') or private.sunshine_allocation_split(a.id)->>'policyCode'='COLLECTIVE_PILOT_20261124') eligible_regular_reserve
   from sunshine_v4.payment_allocations a
   join sunshine_v4.payments p on p.id=a.payment_id
   join sunshine_v4.obligations o on o.id=a.obligation_id
   join sunshine_v4.contract_items i on i.id=o.contract_item_id
   left join sunshine_v4.team_members t on t.id=i.responsible_member_id
   left join sunshine_v4.people bp on bp.id=coalesce(o.beneficiary_person_id,i.beneficiary_person_id)
   left join sunshine_v4.works w on w.id=i.work_id
   where p.status='PAID'
     and (p.paid_at at time zone 'America/Sao_Paulo')::date>=date '2026-10-27'
     and (p.paid_at at time zone 'America/Sao_Paulo')::date<=(now() at time zone 'America/Sao_Paulo')::date
 ),
 generated as (
   select *,
      (case when eligible_regular_reserve then round(base_cents*cost_bp/10000.0)::bigint else 0 end
       + excess_cents)::bigint reserve_value
   from source
 ),
 transferred as (
   select e.allocation_id,sum(e.amount_cents)::bigint amount_cents
   from sunshine_v4.cost_reserve_transfer_entries e
   join sunshine_v4.cost_reserve_transfers t on t.id=e.transfer_id
   where t.reversed_at is null group by e.allocation_id
 )
 select g.allocation_id,g.payment_id,g.paid_on,g.responsible_name,g.person_name,
   g.service_name,g.event_name,g.base_cents,g.cost_bp,g.reserve_value,
   coalesce(t.amount_cents,0)::bigint,
   greatest(g.reserve_value-coalesce(t.amount_cents,0),0)::bigint
 from generated g left join transferred t using(allocation_id)
 where g.reserve_value>0;
$function$;

CREATE OR REPLACE FUNCTION public.v4_finance_management(p_start date, p_end date, p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_revenue bigint;v_costs bigint;v_sales bigint;v_result jsonb;v_annual jsonb;v_profile jsonb;v_categories jsonb;v_team jsonb;v_team_cents bigint;
begin
  perform private.sunshine_finance_guard();
  if p_start is null or p_end is null or p_start>p_end or p_year not between 2000 and 2100 then raise exception 'Período inválido.'; end if;
  perform public.v4_ensure_monthly_costs(date '2026-10-01',p_end);
  select coalesce(sum(gross_cents),0) into v_revenue from private.sunshine_receipts() where paid_on between p_start and p_end;
  select coalesce(sum(amount_cents),0) into v_costs from private.sunshine_contribution_costs() where occurred_on between p_start and p_end;
  select coalesce(sum(i.amount_cents),0) into v_sales from sunshine_v4.contract_items i
    join sunshine_v4.contracts c on c.id=i.contract_id
    join sunshine_v4.obligations o on o.contract_item_id=i.id
    where (coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo')::date between p_start and p_end
    and coalesce(c.status,'')<>'CANCELLED' and coalesce(o.explicit_status,'')<>'CANCELLED';
  with months as (select make_date(p_year,m,1) as month from generate_series(1,12)m),
    rev as(select date_trunc('month',paid_on)::date as month,sum(gross_cents)::bigint cents from private.sunshine_receipts() group by 1),
    cost as(select date_trunc('month',occurred_on)::date as month,sum(amount_cents)::bigint cents from private.sunshine_contribution_costs() group by 1),
    sales as(select date_trunc('month',coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo')::date as month,sum(i.amount_cents)::bigint cents
      from sunshine_v4.contract_items i join sunshine_v4.contracts c on c.id=i.contract_id join sunshine_v4.obligations o on o.contract_item_id=i.id
      where coalesce(c.status,'')<>'CANCELLED' and coalesce(o.explicit_status,'')<>'CANCELLED' group by 1)
  select jsonb_agg(jsonb_build_object('month',m.month,'revenueCents',coalesce(r.cents,0),'costsCents',coalesce(c.cents,0),
    'profitCents',coalesce(r.cents,0)-coalesce(c.cents,0),'salesCents',coalesce(s.cents,0),
    'marginBp',case when r.cents>0 then round((r.cents-coalesce(c.cents,0))*10000.0/r.cents) end,'goals',to_jsonb(g)) order by m.month)
    into v_annual from months m left join rev r using(month) left join cost c using(month)
    left join sales s using(month) left join sunshine_v4.monthly_finance_goals g using(month);
  with entries as (
    select p.id,p.full_name,p.birth_date,p.sex,i.service_category
    from sunshine_v4.contract_items i join sunshine_v4.contracts c on c.id=i.contract_id
    join sunshine_v4.obligations o on o.contract_item_id=i.id join sunshine_v4.people p on p.id=i.beneficiary_person_id
    where (coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo')::date between p_start and p_end
      and coalesce(c.status,'')<>'CANCELLED' and coalesce(o.explicit_status,'')<>'CANCELLED'
  ), ranked as (select id,full_name,birth_date,sex,count(*) participations,
      string_agg(distinct service_category,', ') categories from entries group by 1,2,3,4),
    ages as (select case when birth_date is null then 'Não informado'
       when extract(year from age(p_end,birth_date))<18 then 'Até 17'
       when extract(year from age(p_end,birth_date))<30 then '18 a 29'
       when extract(year from age(p_end,birth_date))<45 then '30 a 44'
       when extract(year from age(p_end,birth_date))<60 then '45 a 59' else '60+' end age_group,count(*) total from ranked group by 1),
    sexes as(select sex,count(*) total from ranked group by 1), cats as(select service_category,count(*) total from entries group by 1)
  select jsonb_build_object('peopleCount',(select count(*) from ranked),'participations',(select count(*) from entries),
    'topPeople',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from ranked order by participations desc,full_name limit 50)x),'[]'),
    'ageGroups',coalesce((select jsonb_agg(to_jsonb(x)) from ages x),'[]'),
    'sexGroups',coalesce((select jsonb_agg(to_jsonb(x)) from sexes x),'[]'),
    'serviceGroups',coalesce((select jsonb_agg(to_jsonb(x)) from cats x),'[]')) into v_profile;
  v_categories:=private.agent_income_categories(p_start,p_end);
  v_team:=private.sunshine_team_commissions(p_start,p_end);v_team_cents:=coalesce((v_team->>'totalCents')::bigint,0);
return jsonb_build_object('startDate',p_start,'endDate',p_end,'revenueCents',v_revenue,'costsCents',v_costs,'salesCents',v_sales,
    'profitCents',v_revenue-v_costs,'marginBp',case when v_revenue>0 then round((v_revenue-v_costs)*10000.0/v_revenue) end,
    'salesEvidence',coalesce((select jsonb_agg(jsonb_build_object('itemId',i.id,'name',p.full_name,'service',i.service_name,'amountCents',i.amount_cents,'date',(coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo')::date)) from sunshine_v4.contract_items i join sunshine_v4.contracts c on c.id=i.contract_id join sunshine_v4.obligations o on o.contract_item_id=i.id left join sunshine_v4.people p on p.id=i.beneficiary_person_id where (coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo')::date between p_start and p_end and c.status<>'CANCELLED' and coalesce(o.explicit_status,'')<>'CANCELLED'),'[]'),
    'reserveEvidence',coalesce((select jsonb_agg(jsonb_build_object('paymentId',p.id,'payer',coalesce(pp.full_name,p.payer_snapshot->>'name'),'amountCents',a.amount_cents-coalesce((select sum(ce.amount_cents) from sunshine_v4.commission_entries ce where ce.allocation_id=a.id and ce.status not in ('CANCELLED','REVERSED')),a.amount_cents)-round(a.amount_cents*coalesce((private.sunshine_allocation_split(a.id)->>'operatingCostBp')::integer,0)/10000.0)::bigint,'paidOn',(p.paid_at at time zone 'America/Sao_Paulo')::date)) from sunshine_v4.payment_allocations a join sunshine_v4.payments p on p.id=a.payment_id left join sunshine_v4.people pp on pp.id=p.payer_person_id where p.status='PAID' and (p.paid_at at time zone 'America/Sao_Paulo')::date between p_start and p_end and private.sunshine_uses_october_rule(a.id)),'[]'),
    'cash',public.v4_cash_availability(p_start,p_end),'annual',v_annual,'profile',v_profile,'incomeCategories',v_categories,
    'costEvidence',coalesce((select jsonb_agg(to_jsonb(e) order by occurred_on desc) from private.sunshine_contribution_costs() e where occurred_on between p_start and p_end),'[]'),
    'expenses',coalesce((select jsonb_agg(to_jsonb(e) order by occurred_on desc,created_at desc) from sunshine_v4.expenses e where occurred_on between p_start and p_end),'[]'),
    'pendingCostsCents',coalesce((select sum(amount_cents) from private.sunshine_contribution_costs() where status='PENDING' and occurred_on between p_start and p_end),0),
    'paidCostsCents',coalesce((select sum(amount_cents) from private.sunshine_contribution_costs() where status='PAID' and occurred_on between p_start and p_end),0),
    'liabilitiesCents',coalesce((select sum(amount_cents) from sunshine_v4.expenses where cost_kind='LIABILITY' and status<>'CANCELLED' and occurred_on between p_start and p_end),0),
    'marginDefinition','REVENUE_MINUS_COSTS_EXCLUDING_COMMISSIONS',
    'teamCommissions',v_team,'teamCommissionsCents',v_team_cents,'profitAfterTeamCents',v_revenue-v_costs-v_team_cents,
    'marginAfterTeamBp',case when v_revenue>0 then round((v_revenue-v_costs-v_team_cents)*10000.0/v_revenue) end,
    'reserveCents',coalesce((select sum(a.amount_cents-coalesce((select sum(ce.amount_cents) from sunshine_v4.commission_entries ce where ce.allocation_id=a.id and ce.status not in ('CANCELLED','REVERSED')),a.amount_cents)-round(a.amount_cents*coalesce((private.sunshine_allocation_split(a.id)->>'operatingCostBp')::integer,0)/10000.0)::bigint) from sunshine_v4.payment_allocations a join sunshine_v4.payments p on p.id=a.payment_id where p.status='PAID' and (p.paid_at at time zone 'America/Sao_Paulo')::date between p_start and p_end and private.sunshine_uses_october_rule(a.id)),0),
    'voids',coalesce((select jsonb_agg(jsonb_build_object('id',id,'paymentId',payment_id,'reason',reason,'createdAt',created_at))
      from sunshine_v4.financial_voids where restored_at is null),'[]'));
end $function$;

notify pgrst, 'reload schema';
