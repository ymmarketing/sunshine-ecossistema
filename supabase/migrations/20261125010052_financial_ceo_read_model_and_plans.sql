-- Read model only: no changes to receipts, allocations, commission rules or settlements.
-- Private planning values are supplied through authenticated APIs, never seeded in source.
create table sunshine_v4.financial_plans (
  year integer primary key check (year between 2000 and 2100),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings)='object'),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table sunshine_v4.financial_plans enable row level security;
revoke all on sunshine_v4.financial_plans from public,anon,authenticated;

create function public.v4_ceo_finance_source(p_year integer) returns jsonb
language plpgsql security definer set search_path='' set timezone='America/Sao_Paulo' as $$
declare v_start date;v_end date;v_income jsonb;v_costs jsonb;v_commissions jsonb;v_settlements jsonb;
begin
  perform private.sunshine_finance_guard('dashboard.read');
  perform sunshine_v4.v4_assert_permission('payment.read');
  perform sunshine_v4.v4_assert_permission('commission.read');
  if p_year is null or p_year not between 2000 and 2100 then raise exception 'Ano inválido.';end if;
  v_start:=make_date(p_year-1,1,1);v_end:=make_date(p_year+1,1,1);
  with receipts as materialized (
    select r.*,p.competence_date,p.retained_excess_cents
    from private.sunshine_receipts() r left join sunshine_v4.payments p on p.id=r.payment_id
    where r.paid_on>=v_start and r.paid_on<v_end
  ), allocations as materialized (
    select a.id,a.payment_id,a.amount_cents,i.id item_id,i.service_name,i.service_category,i.reference_month,
      i.responsible_member_id,t.full_name responsible_name,i.work_id,w.title work_title,
      coalesce(b.preferred_name,b.full_name) beneficiary_name
    from sunshine_v4.payment_allocations a join receipts r on r.payment_id=a.payment_id
    join sunshine_v4.obligations o on o.id=a.obligation_id
    join sunshine_v4.contract_items i on i.id=o.contract_item_id
    join sunshine_v4.contracts c on c.id=i.contract_id
    left join sunshine_v4.team_members t on t.id=i.responsible_member_id
    left join sunshine_v4.works w on w.id=i.work_id
    left join sunshine_v4.people b on b.id=i.beneficiary_person_id
    where coalesce(o.explicit_status,'')<>'CANCELLED' and coalesce(c.status,'')<>'CANCELLED'
  ), rows as (
    select a.id::text id,a.id allocation_id,a.item_id,r.payment_id,r.entry_id,r.paid_on as received_on,
      coalesce(a.reference_month,r.competence_date,r.paid_on) as competence_on,
      a.service_name,coalesce(a.service_category,'OUTRO') category,a.responsible_member_id,
      a.responsible_name,a.work_id,a.work_title,a.beneficiary_name,r.payer_name,a.amount_cents,
      r.availability,r.source,false as unassociated,false as retained
    from allocations a join receipts r on r.payment_id=a.payment_id
    union all
    select 'remainder:'||coalesce(r.payment_id,r.entry_id)::text,null,null,r.payment_id,r.entry_id,
      r.paid_on,coalesce(r.competence_date,r.paid_on),
      case when coalesce(r.retained_excess_cents,0)>0 then 'Excedente recebido' else 'Recebimento sem associação' end,
      case when coalesce(r.retained_excess_cents,0)>0 then 'EXCEDENTE' else 'NAO_ASSOCIADO' end,
      null,null,null,null,null,r.payer_name,
      r.gross_cents-coalesce((select sum(a.amount_cents) from allocations a where a.payment_id=r.payment_id),0),
      r.availability,r.source,true,coalesce(r.retained_excess_cents,0)>0
    from receipts r where r.gross_cents>coalesce((select sum(a.amount_cents) from allocations a where a.payment_id=r.payment_id),0)
  ) select coalesce(jsonb_agg(to_jsonb(x) order by received_on,id),'[]'::jsonb) into v_income from rows x;

  select coalesce(jsonb_agg(to_jsonb(x) order by occurred_on,id),'[]'::jsonb) into v_costs from (
    select c.*,e.scope,e.recurring_cost_id,e.competence_month,coalesce(e.allocations,'[]'::jsonb) allocations,
      w.work_id,w.contract_item_id,w.destination,rp.id as fee_payment_id
    from private.sunshine_contribution_costs() c
    left join sunshine_v4.expenses e on c.origin='EXPENSE' and c.id=e.id::text
    left join public.work_expenses w on c.origin='RECEIPT' and c.id='receipt:'||w.id::text
    left join sunshine_v4.payments rp on c.origin='ASAAS_FEE' and c.id='fee:'||rp.id::text
    where (c.occurred_on>=v_start and c.occurred_on<v_end+90)
       or (c.paid_on>=v_start and c.paid_on<v_end)
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by received_on,commission_id),'[]'::jsonb) into v_commissions from (
    select e.*,(p.paid_at at time zone 'America/Sao_Paulo')::date received_on,
      coalesce(i.reference_month,p.competence_date,(p.paid_at at time zone 'America/Sao_Paulo')::date) competence_on,
      a.payment_id,i.id item_id,i.service_category category,i.work_id,i.service_name,
      t.full_name responsible_name,coalesce(b.preferred_name,b.full_name) beneficiary_name
    from sunshine_v4.commission_effective_status e
    join sunshine_v4.payment_allocations a on a.id=e.allocation_id
    join sunshine_v4.payments p on p.id=a.payment_id
    join sunshine_v4.obligations o on o.id=a.obligation_id
    join sunshine_v4.contract_items i on i.id=o.contract_item_id
    join sunshine_v4.contracts c on c.id=i.contract_id
    left join sunshine_v4.team_members t on t.id=i.responsible_member_id
    left join sunshine_v4.people b on b.id=i.beneficiary_person_id
    where e.source_status in ('DUE','PAID','PARTIAL') and p.status='PAID'
      and coalesce(o.explicit_status,'')<>'CANCELLED' and coalesce(c.status,'')<>'CANCELLED'
      and exists(select 1 from private.sunshine_receipts() r where r.payment_id=p.id)
      and ((p.paid_at at time zone 'America/Sao_Paulo')::date between v_start and v_end-1
        or e.last_paid_on between v_start and v_end-1)
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by paid_on,id),'[]'::jsonb) into v_settlements from (
    select s.id,s.commission_id,s.commission_table,s.recipient_name,s.amount_cents,s.paid_on
    from sunshine_v4.commission_payment_entries s
    where s.paid_on>=v_start and s.paid_on<v_end
  ) x;

  return jsonb_build_object('asOf',current_date,'year',p_year,'income',v_income,'costs',v_costs,
    'commissions',v_commissions,'settlements',v_settlements,
    'goals',coalesce((select jsonb_agg(to_jsonb(g) order by g.month) from sunshine_v4.monthly_finance_goals g
      where g.month>=v_start and g.month<v_end),'[]'::jsonb),
    'plan',coalesce((select settings from sunshine_v4.financial_plans where year=p_year),'{}'::jsonb),
    'planUpdatedAt',(select updated_at from sunshine_v4.financial_plans where year=p_year),
    'firstCostDate',(select min(occurred_on) from private.sunshine_contribution_costs()),
    'source','ERP Sunshine · recebimentos, custos e comissões oficiais');
end $$;
revoke all on function public.v4_ceo_finance_source(integer) from public,anon;
grant execute on function public.v4_ceo_finance_source(integer) to authenticated,service_role;

create function public.v4_api_save_financial_plan(p_year integer,p_settings jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare k text;v jsonb;member_key text;
begin
  perform private.sunshine_finance_guard('commission.rule.create');
  if p_year is null or p_year not between 2000 and 2100 or jsonb_typeof(p_settings) is distinct from 'object'
    then raise exception 'Planejamento inválido.';end if;
  if exists(select 1 from jsonb_object_keys(p_settings) x where x not in
    ('floorBp','growthBp','reserveBp','materialsBp','marginBp','bonusBp','payrollCents','fixedCents','estimateIncomplete'))
    then raise exception 'Parâmetro de planejamento desconhecido.';end if;
  foreach k in array array['floorBp','reserveBp','materialsBp','marginBp','bonusBp'] loop
    v:=p_settings->k;
    if v is not null and v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or (v#>>'{}') !~ '^[0-9]+$' or (v#>>'{}')::numeric>10000)
      then raise exception 'Percentual inválido: %',k;end if;
  end loop;
  v:=p_settings->'growthBp';if v is not null and (jsonb_typeof(v)<>'number' or (v#>>'{}') !~ '^-?[0-9]+$' or (v#>>'{}')::numeric not between -9000 and 100000)
    then raise exception 'Variação de receita inválida.';end if;
  v:=p_settings->'fixedCents';if v is not null and v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or (v#>>'{}') !~ '^[0-9]+$' or (v#>>'{}')::numeric>100000000000)
    then raise exception 'Custos fixos inválidos.';end if;
  if p_settings ? 'payrollCents' then
    if jsonb_typeof(p_settings->'payrollCents')<>'object' then raise exception 'Pró-labores inválidos.';end if;
    for member_key,v in select key,value from jsonb_each(p_settings->'payrollCents') loop
      if not exists(select 1 from sunshine_v4.team_members t where t.id::text=member_key and t.active)
        or jsonb_typeof(v)<>'number' or (v#>>'{}') !~ '^[0-9]+$' or (v#>>'{}')::numeric>100000000000
        then raise exception 'Pró-labore inválido.';end if;
    end loop;
  end if;
  if p_settings ? 'estimateIncomplete' and jsonb_typeof(p_settings->'estimateIncomplete')<>'boolean'
    then raise exception 'Estimativa inválida.';end if;
  insert into sunshine_v4.financial_plans(year,settings,updated_by) values(p_year,p_settings,auth.uid())
    on conflict(year) do update set settings=excluded.settings,updated_by=excluded.updated_by,updated_at=now();
  return jsonb_build_object('year',p_year,'settings',p_settings,'simulationOnly',true);
end $$;
revoke all on function public.v4_api_save_financial_plan(integer,jsonb) from public,anon;
grant execute on function public.v4_api_save_financial_plan(integer,jsonb) to authenticated,service_role;
comment on table sunshine_v4.financial_plans is 'Cenários gerenciais. Não altera regras de comissão nem cria pagamentos ou despesas.';
