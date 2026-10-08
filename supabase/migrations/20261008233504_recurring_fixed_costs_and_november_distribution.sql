-- Approved by Yasmin on 08/10/2026. No payment or historical commission is rewritten.
create table sunshine_v4.recurring_fixed_costs (
 id uuid primary key default gen_random_uuid(), code text not null unique,
 description text not null check(length(btrim(description))>1), category text not null,
 amount_cents bigint not null check(amount_cents>0), annual_amount_cents bigint check(annual_amount_cents>0),
 start_month date not null check(start_month=date_trunc('month',start_month)::date),
 end_month date check(end_month=date_trunc('month',end_month)::date), active boolean not null default true,
 key_format text not null unique check(position('{month}' in key_format)>0), notes text,
 created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table sunshine_v4.recurring_fixed_costs enable row level security;
revoke all on sunshine_v4.recurring_fixed_costs from public,anon,authenticated;
create unique index recurring_fixed_costs_active_name_idx on sunshine_v4.recurring_fixed_costs(lower(description)) where active;
alter table sunshine_v4.expenses add column recurring_cost_id uuid references sunshine_v4.recurring_fixed_costs(id);
alter table sunshine_v4.expenses add column competence_month date;
alter table sunshine_v4.expenses add column cost_kind text not null default 'OPERATING' check(cost_kind in ('OPERATING','LIABILITY'));
alter table sunshine_v4.expenses add constraint expense_competence_month_first_day check(competence_month is null or competence_month=date_trunc('month',competence_month)::date);
create unique index expenses_recurring_month_idx on sunshine_v4.expenses(recurring_cost_id,competence_month) where recurring_cost_id is not null;
-- Bank balances are liabilities, not monthly operating expenses or repayment agreements.
update sunshine_v4.expenses set cost_kind='LIABILITY' where idempotency_key like 'debt:%';

create table sunshine_v4.receipt_distribution_policies (
 valid_from date primary key, reserve_bp integer not null, commission_bp integer not null,
 responsible_bp integer not null, consultation_reserve_status text not null default 'UNDER_REVIEW', notes text not null,
 check(reserve_bp>=0 and commission_bp>=0 and responsible_bp>=0 and reserve_bp+2*commission_bp+responsible_bp=10000)
);
alter table sunshine_v4.receipt_distribution_policies enable row level security;
revoke all on sunshine_v4.receipt_distribution_policies from public,anon,authenticated;
insert into sunshine_v4.receipt_distribution_policies(valid_from,reserve_bp,commission_bp,responsible_bp,notes) values
 ('2026-10-01',3000,1050,4900,'Regra atual mantida. Consulta e pergunta: reserva ainda em avaliação. Quadro completo sempre sobre o recebimento total, em reais e percentuais, somando 100%.'),
 ('2026-11-01',3000,1500,4000,'Aprovado pela Yasmin: 30% caixa, 15% para cada uma das duas comissões e 40% responsável, sobre o bruto. Vigência por recebimento em America/Sao_Paulo. Consulta/pergunta mantêm reserva vigente até nova decisão. Fixos de Yasmin e Lourdes preservados.');

insert into sunshine_v4.recurring_fixed_costs(code,description,category,amount_cents,annual_amount_cents,start_month,end_month,key_format,notes,created_by)
select v.code,v.description,coalesce(e.category,'OPERACIONAL'),v.amount_cents,v.annual_amount_cents,
 date '2026-10-01',v.end_month,v.key_format,
 concat_ws(' ',e.notes,'Recorrência automática autorizada em 08/10/2026. Lançamento mensal pendente; baixa somente após pagamento informado.'),
 coalesce(e.created_by,(select auth_user_id from sunshine_v4.team_members where active and lower(full_name)='yasmin' limit 1))
from (values
 ('imposto','Imposto',150000::bigint,null::bigint,null::date,'fixed:{month}:imposto'),
 ('contador','Contador',35000,null,null,'fixed:{month}:contador'),
 ('yasmin','Pró-labore Yasmin',162000,null,null,'prolabore:{month}:Yasmin'),
 ('lourdes','Pró-labore Lourdes',162000,null,null,'prolabore:{month}:Lourdes'),
 ('pronampe','Pronampe - parcela mensal',133333,null,date '2029-03-01','fixed:{month}:pronampe'),
 ('certificado','Certificado digital - provisão anual',1667,20000,null,'fixed:{month}:certificado-provisao'),
 ('instagram','Instagram',5900,null,null,'fixed:{month}:instagram'),
 ('manychat','ManyChat',14990,null,null,'fixed:{month}:manychat'),
 ('telefone','Telefone',4000,null,null,'fixed:{month}:telefone'),
 ('aluguel','Aluguel Sunshine',198000,null,null,'fixed:{month}:aluguel')
) v(code,description,amount_cents,annual_amount_cents,end_month,key_format)
left join sunshine_v4.expenses e on e.idempotency_key=replace(v.key_format,'{month}','2026-10');

create function private.sunshine_generate_recurring_costs(p_start date,p_end date) returns integer
language plpgsql security definer set search_path='' as $$
declare v_count integer;v_attached integer;v_previous_actor text;v_actor uuid;
begin
 if p_start is null or p_end is null or p_start>p_end then return 0;end if;
 if p_end>p_start+interval '100 years' then raise exception 'Intervalo de recorrência inválido.';end if;
 perform pg_advisory_xact_lock(hashtextextended('sunshine-recurring-costs',0));
 insert into sunshine_v4.expenses(description,category,scope,amount_cents,occurred_on,status,allocations,
   notes,idempotency_key,created_by,recurring_cost_id,competence_month)
 select r.description||' - '||to_char(m.month,'MM/YYYY'),r.category,'FIXED',
   case when r.annual_amount_cents is not null and extract(month from m.month)=12
     then r.annual_amount_cents-11*r.amount_cents else r.amount_cents end,
   m.month,'PENDING','[]'::jsonb,r.notes,replace(r.key_format,'{month}',to_char(m.month,'YYYY-MM')),r.created_by,r.id,m.month
 from sunshine_v4.recurring_fixed_costs r
 cross join lateral (select d::date as month from generate_series(date_trunc('month',p_start),date_trunc('month',p_end),interval '1 month') d) m
 where r.active and m.month>=r.start_month and (r.end_month is null or m.month<=r.end_month)
 on conflict(idempotency_key) do nothing;
 get diagnostics v_count=row_count;
 -- Adopt existing October rows, including paid/cancelled rows, without changing amounts or settlements.
 update sunshine_v4.expenses e set recurring_cost_id=r.id,competence_month=date_trunc('month',e.occurred_on)::date
 from sunshine_v4.recurring_fixed_costs r
 where e.recurring_cost_id is null and e.idempotency_key=replace(r.key_format,'{month}',to_char(e.occurred_on,'YYYY-MM'))
   and e.occurred_on between date_trunc('month',p_start)::date and (date_trunc('month',p_end)+interval '1 month'-interval '1 day')::date;
 get diagnostics v_attached=row_count;
 if v_count>0 or v_attached>0 then
  v_previous_actor:=current_setting('app.user_id',true);
  if nullif(v_previous_actor,'') is null then
   select created_by into v_actor from sunshine_v4.recurring_fixed_costs order by created_at,id limit 1;
   perform set_config('app.user_id',v_actor::text,true);
  end if;
  perform sunshine_v4.v4_write_audit('RECURRING_COSTS_GENERATED','recurring_fixed_cost',null,
   jsonb_build_object('start',p_start,'end',p_end,'created',v_count,'adopted',v_attached,'automatic',auth.uid() is null));
  if nullif(v_previous_actor,'') is null then perform set_config('app.user_id',coalesce(v_previous_actor,''),true);end if;
 end if;
 return v_count;
end $$;
revoke all on function private.sunshine_generate_recurring_costs(date,date) from public,anon,authenticated;

create function public.v4_ensure_monthly_costs(p_start date,p_end date) returns integer
language plpgsql security definer set search_path='' as $$
begin
 perform private.sunshine_finance_guard('dashboard.read');
 if p_start is null or p_end is null or p_start>p_end then raise exception 'Período inválido.';end if;
 return private.sunshine_generate_recurring_costs(greatest(date '2026-10-01',date_trunc('month',p_start)::date),
  least(date_trunc('month',p_end)::date,date_trunc('month',now() at time zone 'America/Sao_Paulo')::date));
end $$;

create function public.v4_recurring_costs() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform private.sunshine_finance_guard('dashboard.read');
 return coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('running',r.active and
  (r.end_month is null or r.end_month>=date_trunc('month',now() at time zone 'America/Sao_Paulo')::date)) order by r.description)
 from sunshine_v4.recurring_fixed_costs r),'[]'::jsonb);
end $$;

create function public.v4_api_save_recurring_cost(p_id uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_old jsonb;v_row sunshine_v4.recurring_fixed_costs%rowtype;v_code text;
 v_amount bigint:=(p_data->>'amountCents')::bigint;v_annual bigint:=nullif(p_data->>'annualAmountCents','')::bigint;
 v_start date:=date_trunc('month',(p_data->>'startMonth')::date)::date;
 v_end date:=date_trunc('month',nullif(p_data->>'endMonth','')::date)::date;
begin
 perform private.sunshine_finance_guard('record.update');
 if v_amount is null or v_amount<=0 or v_start is null or length(btrim(coalesce(p_data->>'description','')))<2 then raise exception 'Informe descrição, valor positivo e mês inicial.';end if;
 if v_end is not null and v_end<v_start then raise exception 'O mês final não pode anteceder o inicial.';end if;
 if v_annual is not null and v_annual-11*v_amount<=0 then raise exception 'A provisão anual precisa permitir o ajuste positivo de dezembro.';end if;
 if p_id is not null then
  select to_jsonb(r) into v_old from sunshine_v4.recurring_fixed_costs r where id=p_id for update;
  if v_old is null then raise exception 'Custo recorrente não encontrado.';end if;
  v_id:=p_id;v_code:=v_old->>'code';
 else
  v_code:=nullif(p_data->>'code','');
  if v_code is null then raise exception 'Referência de gravação obrigatória.';end if;
  perform pg_advisory_xact_lock(hashtextextended('recurring:'||v_code,0));
  select * into v_row from sunshine_v4.recurring_fixed_costs where code=v_code;
  if found then return to_jsonb(v_row)||jsonb_build_object('replayed',true);end if;
  v_id:=gen_random_uuid();
 end if;
 insert into sunshine_v4.recurring_fixed_costs(id,code,description,category,amount_cents,annual_amount_cents,start_month,end_month,active,key_format,notes,created_by)
 values(v_id,v_code,btrim(p_data->>'description'),coalesce(nullif(p_data->>'category',''),'OPERACIONAL'),v_amount,v_annual,
  v_start,v_end,true,coalesce(v_old->>'key_format','recurring:{month}:'||v_code),nullif(btrim(p_data->>'notes'),''),coalesce((v_old->>'created_by')::uuid,auth.uid()))
 on conflict(id) do update set description=excluded.description,category=excluded.category,amount_cents=excluded.amount_cents,
  annual_amount_cents=excluded.annual_amount_cents,start_month=excluded.start_month,end_month=excluded.end_month,active=true,notes=excluded.notes,updated_at=now()
 returning * into v_row;
 perform private.sunshine_generate_recurring_costs(greatest(v_start,date '2026-10-01'),date_trunc('month',now() at time zone 'America/Sao_Paulo')::date);
 perform sunshine_v4.v4_write_audit('RECURRING_COST_SAVED','recurring_fixed_cost',v_id,jsonb_build_object('before',v_old,'after',to_jsonb(v_row)));
 return to_jsonb(v_row);
end $$;

create function public.v4_api_stop_recurring_cost(p_id uuid,p_stop_month date,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v_old jsonb;v_month date:=date_trunc('month',p_stop_month)::date;v_count integer;
begin
 perform private.sunshine_finance_guard('record.update');
 if v_month is null or v_month<date_trunc('month',now() at time zone 'America/Sao_Paulo')::date or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Informe o mês atual ou futuro e uma justificativa.';end if;
 perform pg_advisory_xact_lock(hashtextextended('sunshine-recurring-costs',0));
 select to_jsonb(r) into v_old from sunshine_v4.recurring_fixed_costs r where id=p_id for update;
 if v_old is null then raise exception 'Custo recorrente não encontrado.';end if;
 update sunshine_v4.recurring_fixed_costs set end_month=(v_month-interval '1 month')::date,updated_at=now() where id=p_id;
 update sunshine_v4.expenses set status='CANCELLED',updated_at=now() where recurring_cost_id=p_id and competence_month>=v_month and status='PENDING';
 get diagnostics v_count=row_count;
 perform sunshine_v4.v4_write_audit('RECURRING_COST_STOPPED','recurring_fixed_cost',p_id,jsonb_build_object('before',v_old,'stopMonth',v_month,'cancelledPending',v_count,'reason',p_reason));
end $$;

create function public.v4_api_pay_expense(p_id uuid,p_paid_on date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_old jsonb;v_row sunshine_v4.expenses%rowtype;
begin
 perform private.sunshine_finance_guard('record.update');
 if p_paid_on is null or p_paid_on>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe a data real do pagamento, sem data futura.';end if;
 select to_jsonb(e) into v_old from sunshine_v4.expenses e where id=p_id for update;
 if v_old is null or v_old->>'status'='CANCELLED' then raise exception 'Custo não encontrado ou excluído.';end if;
 if v_old->>'cost_kind'='LIABILITY' then raise exception 'Saldo bancário não é parcela confirmada. Registre o acordo ou pagamento após a negociação.';end if;
 update sunshine_v4.expenses set status='PAID',paid_on=p_paid_on,updated_at=now() where id=p_id returning * into v_row;
 perform sunshine_v4.v4_write_audit('EXPENSE_PAID','expense',p_id,jsonb_build_object('before',v_old,'paidOn',p_paid_on));
 return to_jsonb(v_row);
end $$;

create function public.v4_receipt_distribution_policies() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform private.sunshine_finance_guard('dashboard.read');
 return (select jsonb_agg(to_jsonb(p) order by valid_from) from sunshine_v4.receipt_distribution_policies p);
end $$;

create function private.sunshine_contribution_costs()
returns table(id text,description text,category text,amount_cents bigint,occurred_on date,paid_on date,status text,origin text)
language sql stable security definer set search_path='' as $$
 select e.id::text,e.description,e.category,e.amount_cents,e.occurred_on,e.paid_on,e.status,'EXPENSE'
 from sunshine_v4.expenses e where e.status in ('PENDING','PAID') and e.cost_kind='OPERATING' and e.category<>'COMISSAO'
 union all select 'fee:'||coalesce(r.payment_id,r.entry_id)::text,'Taxa Asaas - '||r.payer_name,'TAXA_ASAAS',r.fees_cents,r.paid_on,r.paid_on,'PAID','ASAAS_FEE'
 from private.sunshine_receipts() r where r.fees_cents>0
 union all select 'receipt:'||e.id::text,e.description,coalesce(g.name,i.name,'MATERIAIS'),round(e.amount*100)::bigint,
 e.expense_date,e.expense_date,'PAID','RECEIPT'
 from public.work_expenses e left join public.expense_receipts r on r.id=e.receipt_id
 left join public.general_cost_categories g on g.id=e.general_category_id left join public.cost_items i on i.id=e.cost_item_id
 where e.receipt_id is null or r.status='CONFIRMED';
$$;
revoke all on function private.sunshine_contribution_costs() from public,anon,authenticated;

-- Every exposed RPC is guarded; no new table is exposed to anonymous/authenticated direct access.
revoke all on function public.v4_ensure_monthly_costs(date,date),public.v4_recurring_costs(),
 public.v4_api_save_recurring_cost(uuid,jsonb),public.v4_api_stop_recurring_cost(uuid,date,text),
 public.v4_api_pay_expense(uuid,date),public.v4_receipt_distribution_policies() from public,anon;
grant execute on function public.v4_ensure_monthly_costs(date,date),public.v4_recurring_costs(),
 public.v4_api_save_recurring_cost(uuid,jsonb),public.v4_api_stop_recurring_cost(uuid,date,text),
 public.v4_api_pay_expense(uuid,date),public.v4_receipt_distribution_policies() to authenticated;

select private.sunshine_generate_recurring_costs(date '2026-10-01',date_trunc('month',now() at time zone 'America/Sao_Paulo')::date);
create extension if not exists pg_cron with schema pg_catalog;
-- 03:00 UTC = midnight in Sao Paulo. Daily retries also recover an interrupted month opening.
select cron.schedule('sunshine-monthly-fixed-costs','0 3 * * *',
 $$select private.sunshine_generate_recurring_costs(date '2026-10-01',date_trunc('month',now() at time zone 'America/Sao_Paulo')::date);$$);
create function private.sunshine_item_split(p_item uuid,p_received_on date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_split jsonb;v_policy sunshine_v4.receipt_distribution_policies%rowtype;v_responsible uuid;v_shares jsonb;
begin
 v_split:=private.sunshine_item_split(p_item);
 if exists(select 1 from sunshine_v4.contract_items where id=p_item and commission_override is not null) then return v_split;end if;
 select * into v_policy from sunshine_v4.receipt_distribution_policies where valid_from<=p_received_on order by valid_from desc limit 1;
 if not found then return v_split;end if;
 select responsible_member_id into v_responsible from sunshine_v4.contract_items where id=p_item;
 select jsonb_agg(jsonb_build_object('memberId',x->>'memberId','basisPoints',
   case when (x->>'memberId')::uuid=v_responsible then v_policy.responsible_bp else v_policy.commission_bp end))
 into v_shares from jsonb_array_elements(v_split->'shares') x;
 return jsonb_build_object('costBp',v_policy.reserve_bp,'shares',v_shares,'validFrom',v_policy.valid_from);
end $$;
revoke all on function private.sunshine_item_split(uuid,date) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.sunshine_build_october_commissions(p_allocation uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_item uuid;v_amount bigint;v_responsible uuid;v_split jsonb;v_reserve bigint;v_rest bigint;v_share jsonb;v_cents bigint;v_status text;v_received_on date;
begin
 select i.id,a.amount_cents,i.responsible_member_id,p.status,(p.paid_at at time zone 'America/Sao_Paulo')::date into v_item,v_amount,v_responsible,v_status,v_received_on
 from sunshine_v4.payment_allocations a join sunshine_v4.obligations o on o.id=a.obligation_id
 join sunshine_v4.contract_items i on i.id=o.contract_item_id join sunshine_v4.payments p on p.id=a.payment_id where a.id=p_allocation;
 if v_item is null or v_status<>'PAID' then return; end if;
 if exists(select 1 from sunshine_v4.commission_effective_status where allocation_id=p_allocation and paid_cents>0) then
   raise exception 'Há comissão paga: regularize o pagamento de comissão antes de alterar a base financeira.';
 end if;
 if exists(select 1 from sunshine_v4.legacy_commission_entries where payment_allocation_id=p_allocation and status<>'CANCELLED') then
   raise exception 'Comissão histórica importada: preserve o histórico; corrija por um lançamento complementar.';
 end if;
 v_split:=private.sunshine_item_split(v_item,v_received_on);
 v_reserve:=round(v_amount*(v_split->>'costBp')::integer/10000.0)::bigint;
 v_rest:=v_amount-v_reserve;
 delete from sunshine_v4.commission_entries where allocation_id=p_allocation;
 for v_share in select value from jsonb_array_elements(v_split->'shares') where (value->>'memberId')::uuid<>v_responsible loop
   v_cents:=round(v_amount*(v_share->>'basisPoints')::integer/10000.0)::bigint;
   v_cents:=least(v_cents,v_rest);v_rest:=v_rest-v_cents;
   insert into sunshine_v4.commission_entries(allocation_id,recipient_code,base_cents,amount_cents,status,responsible_member_id,beneficiary_member_id,percentage,source,calculation_source,notes)
   values(p_allocation,v_share->>'memberId',v_amount-v_reserve,v_cents,'DUE',v_responsible,(v_share->>'memberId')::uuid,
     (v_share->>'basisPoints')::integer/100.0,'AUTO_RESPONSIBLE',case when v_received_on>=date '2026-11-01' then 'NOVEMBER_2026' else 'OCTOBER_2026' end,'Percentual sobre o bruto; reserva separada, sem gerar despesa paga.');
 end loop;
 insert into sunshine_v4.commission_entries(allocation_id,recipient_code,base_cents,amount_cents,status,responsible_member_id,beneficiary_member_id,percentage,source,calculation_source,notes)
 select p_allocation,v_responsible::text,v_amount-v_reserve,v_rest,'DUE',v_responsible,v_responsible,(x->>'basisPoints')::integer/100.0,
   'AUTO_RESPONSIBLE',case when v_received_on>=date '2026-11-01' then 'NOVEMBER_2026' else 'OCTOBER_2026' end,'Responsável recebe o resíduo dos centavos para fechar a divisão.' from jsonb_array_elements(v_split->'shares')x where (x->>'memberId')::uuid=v_responsible;
end $function$;

CREATE OR REPLACE FUNCTION public.v4_finance_management(p_start date, p_end date, p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_revenue bigint;v_costs bigint;v_sales bigint;v_result jsonb;v_annual jsonb;v_profile jsonb;v_categories jsonb;
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
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_categories from (
    select coalesce(i.service_category,'OUTRO') category,sum(a.amount_cents)::bigint amount_cents
    from sunshine_v4.payment_allocations a join sunshine_v4.obligations o on o.id=a.obligation_id
    join sunshine_v4.contract_items i on i.id=o.contract_item_id join sunshine_v4.payments p on p.id=a.payment_id
    where (p.paid_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
      and p.status='PAID' and coalesce(o.explicit_status,'')<>'CANCELLED' group by 1 order by 2 desc)x;
  return jsonb_build_object('startDate',p_start,'endDate',p_end,'revenueCents',v_revenue,'costsCents',v_costs,'salesCents',v_sales,
    'profitCents',v_revenue-v_costs,'marginBp',case when v_revenue>0 then round((v_revenue-v_costs)*10000.0/v_revenue) end,
    'salesEvidence',coalesce((select jsonb_agg(jsonb_build_object('itemId',i.id,'name',p.full_name,'service',i.service_name,'amountCents',i.amount_cents,'date',(coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo')::date)) from sunshine_v4.contract_items i join sunshine_v4.contracts c on c.id=i.contract_id join sunshine_v4.obligations o on o.contract_item_id=i.id left join sunshine_v4.people p on p.id=i.beneficiary_person_id where (coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo')::date between p_start and p_end and c.status<>'CANCELLED' and coalesce(o.explicit_status,'')<>'CANCELLED'),'[]'),
    'reserveEvidence',coalesce((select jsonb_agg(jsonb_build_object('paymentId',p.id,'payer',coalesce(pp.full_name,p.payer_snapshot->>'name'),'amountCents',a.amount_cents-coalesce((select sum(ce.amount_cents) from sunshine_v4.commission_entries ce where ce.allocation_id=a.id and ce.status not in ('CANCELLED','REVERSED')),a.amount_cents),'paidOn',(p.paid_at at time zone 'America/Sao_Paulo')::date)) from sunshine_v4.payment_allocations a join sunshine_v4.payments p on p.id=a.payment_id left join sunshine_v4.people pp on pp.id=p.payer_person_id where p.status='PAID' and (p.paid_at at time zone 'America/Sao_Paulo')::date between p_start and p_end and private.sunshine_uses_october_rule(a.id)),'[]'),
    'cash',public.v4_cash_availability(p_start,p_end),'annual',v_annual,'profile',v_profile,'incomeCategories',v_categories,
    'costEvidence',coalesce((select jsonb_agg(to_jsonb(e) order by occurred_on desc) from private.sunshine_contribution_costs() e where occurred_on between p_start and p_end),'[]'),
    'expenses',coalesce((select jsonb_agg(to_jsonb(e) order by occurred_on desc,created_at desc) from sunshine_v4.expenses e where occurred_on between p_start and p_end),'[]'),
    'pendingCostsCents',coalesce((select sum(amount_cents) from private.sunshine_contribution_costs() where status='PENDING' and occurred_on between p_start and p_end),0),
    'paidCostsCents',coalesce((select sum(amount_cents) from private.sunshine_contribution_costs() where status='PAID' and occurred_on between p_start and p_end),0),
    'liabilitiesCents',coalesce((select sum(amount_cents) from sunshine_v4.expenses where cost_kind='LIABILITY' and status<>'CANCELLED' and occurred_on between p_start and p_end),0),
    'marginDefinition','REVENUE_MINUS_COSTS_EXCLUDING_COMMISSIONS',
    'reserveCents',coalesce((select sum(a.amount_cents-coalesce((select sum(ce.amount_cents) from sunshine_v4.commission_entries ce where ce.allocation_id=a.id and ce.status not in ('CANCELLED','REVERSED')),a.amount_cents)) from sunshine_v4.payment_allocations a join sunshine_v4.payments p on p.id=a.payment_id where p.status='PAID' and (p.paid_at at time zone 'America/Sao_Paulo')::date between p_start and p_end and private.sunshine_uses_october_rule(a.id)),0),
    'voids',coalesce((select jsonb_agg(jsonb_build_object('id',id,'paymentId',payment_id,'reason',reason,'createdAt',created_at))
      from sunshine_v4.financial_voids where restored_at is null),'[]'));
end $function$;

