-- Finance operations. Values are integer cents; no historical payouts are rewritten.
create table sunshine_v4.expenses (
  id uuid primary key default gen_random_uuid(), description text not null check(length(btrim(description))>1),
  category text not null, scope text not null check(scope in ('WORK','SHARED','FIXED','STOCK')),
  amount_cents bigint not null check(amount_cents>0), occurred_on date not null, paid_on date,
  status text not null check(status in ('PENDING','PAID','CANCELLED')), allocations jsonb not null default '[]',
  notes text, receipt_url text, idempotency_key text not null unique,
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index expenses_period_idx on sunshine_v4.expenses(occurred_on,status);
create table sunshine_v4.monthly_finance_goals (
  month date primary key check(month=date_trunc('month',month)::date),
  revenue_cents bigint check(revenue_cents>=0), costs_cents bigint check(costs_cents>=0),
  profit_cents bigint, margin_bp integer, sales_cents bigint check(sales_cents>=0),
  updated_by uuid not null, updated_at timestamptz not null default now()
);
create table sunshine_v4.financial_voids (
  id uuid primary key default gen_random_uuid(), payment_id uuid not null references sunshine_v4.payments(id),
  allocation_id uuid, reason text not null check(length(btrim(reason))>=3), snapshot jsonb not null,
  created_by uuid not null, created_at timestamptz not null default now(), restored_at timestamptz
);
create table sunshine_v4.accountant_reports (
  id uuid primary key default gen_random_uuid(), idempotency_key text not null unique,
  start_date date not null, end_date date not null, recipient text not null default 'bksm00@gmail.com',
  subject text not null, body text not null, documents_url text not null,
  status text not null default 'DRAFT' check(status in ('DRAFT','SENDING','SENT','ERROR')),
  provider_id text, error text, created_by uuid not null, created_at timestamptz not null default now()
);
create table private.sunshine_mail_settings (
  singleton boolean primary key default true check(singleton), sender text not null,
  secret_id uuid not null, updated_by uuid not null, updated_at timestamptz not null default now()
);
alter table sunshine_v4.contract_items add column commission_override jsonb;
alter table sunshine_v4.people add column sex text not null default 'NAO_INFORMADO'
  check(sex in ('FEMININO','MASCULINO','OUTRO','NAO_INFORMADO'));

alter table sunshine_v4.expenses enable row level security;
alter table sunshine_v4.monthly_finance_goals enable row level security;
alter table sunshine_v4.financial_voids enable row level security;
alter table sunshine_v4.accountant_reports enable row level security;
alter table private.sunshine_mail_settings enable row level security;
revoke all on sunshine_v4.expenses,sunshine_v4.monthly_finance_goals,sunshine_v4.financial_voids,
  sunshine_v4.accountant_reports,private.sunshine_mail_settings from public,anon,authenticated;

-- Private helpers are invoked only by guarded wrappers/triggers, never as an API.
create or replace function private.sunshine_finance_guard(p_permission text default 'dashboard.read')
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission(p_permission);
end $$;

-- Read-after-write receipt shared by retries and the UI. Includes persisted registrations.
create function private.sunshine_entry_receipt(p_contract uuid) returns jsonb
language sql stable security definer set search_path='' as $$
select jsonb_build_object('contractId',c.id,'items',coalesce((select jsonb_agg(jsonb_build_object(
  'itemId',i.id,'obligationId',o.id,'beneficiaryPersonId',i.beneficiary_person_id,'amountCents',i.amount_cents,
  'allocatedCents',coalesce((select sum(a.amount_cents) from sunshine_v4.payment_allocations a where a.obligation_id=o.id),0),
  'referenceMonth',i.reference_month,'workId',i.work_id,'registrationId',(select r.id from sunshine_v4.work_registrations r where r.contract_item_id=i.id limit 1)
) order by i.created_at,i.id) from sunshine_v4.contract_items i join sunshine_v4.obligations o on o.contract_item_id=i.id where i.contract_id=c.id),'[]'))
from sunshine_v4.contracts c where c.id=p_contract;
$$;
revoke all on function private.sunshine_entry_receipt(uuid) from public,anon,authenticated;
create function public.v4_entry_receipt(p_contract_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform private.sunshine_finance_guard('payment.read');
  return private.sunshine_entry_receipt(p_contract_id);
end $$;
revoke all on function private.sunshine_finance_guard(text) from public,anon,authenticated;

create function public.v4_api_save_expense(p_id uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_old jsonb; v_row sunshine_v4.expenses%rowtype;
  v_amount bigint:=(p_data->>'amountCents')::bigint; v_scope text:=p_data->>'scope';
  v_status text:=p_data->>'status'; v_alloc jsonb:=coalesce(p_data->'allocations','[]'); v_sum bigint;
begin
  perform private.sunshine_finance_guard('record.update');
  if v_amount is null or v_amount<=0 then raise exception 'Informe um custo maior que zero.'; end if;
  if jsonb_typeof(v_alloc)<>'array' then raise exception 'Rateio inválido.'; end if;
  if v_scope in ('WORK','SHARED') then
    select sum((x->>'amountCents')::bigint) into v_sum from jsonb_array_elements(v_alloc)x;
    if v_sum is distinct from v_amount or jsonb_array_length(v_alloc)=0
       or (v_scope='WORK' and jsonb_array_length(v_alloc)<>1)
       or (v_scope='SHARED' and jsonb_array_length(v_alloc)<2) then
      raise exception 'O rateio precisa somar exatamente o custo e respeitar a quantidade de trabalhos.';
    end if;
    if exists(select 1 from jsonb_array_elements(v_alloc)x where coalesce((x->>'amountCents')::bigint,0)<=0
       or not exists(select 1 from sunshine_v4.works w where w.id=(x->>'workId')::uuid and (w.status='OPEN' or (p_id is not null and exists(select 1 from sunshine_v4.expenses e,jsonb_array_elements(e.allocations)old where e.id=p_id and old->>'workId'=x->>'workId')))))
       or (select count(distinct x->>'workId') from jsonb_array_elements(v_alloc)x)<>jsonb_array_length(v_alloc) then
      raise exception 'Selecione trabalhos válidos, uma única vez, com valores positivos.';
    end if;
  elsif v_scope not in ('FIXED','STOCK') or jsonb_array_length(v_alloc)<>0 then
    raise exception 'Custo fixo/estoque não pode ter rateio por trabalho.';
  end if;
  if v_status='PAID' and nullif(p_data->>'paidOn','') is null then raise exception 'Informe quando o custo foi pago.'; end if;
  if nullif(p_data->>'receiptUrl','') is not null and p_data->>'receiptUrl' !~ '^https://' then
    raise exception 'Use um link HTTPS para o comprovante.';
  end if;
  if p_id is not null then
    select to_jsonb(e) into v_old from sunshine_v4.expenses e where id=p_id for update;
    if v_old is null then raise exception 'Custo não encontrado.'; end if;
    v_id:=p_id;
  else
    if nullif(p_data->>'idempotencyKey','') is null then raise exception 'Referência de gravação obrigatória.'; end if;
    perform pg_advisory_xact_lock(hashtextextended('expense:'||(p_data->>'idempotencyKey'),0));
    select id into v_id from sunshine_v4.expenses where idempotency_key=p_data->>'idempotencyKey';
    if v_id is not null then return jsonb_build_object('id',v_id,'idempotent',true); end if;
    v_id:=gen_random_uuid();
  end if;
  insert into sunshine_v4.expenses(id,description,category,scope,amount_cents,occurred_on,paid_on,status,
    allocations,notes,receipt_url,idempotency_key,created_by)
  values(v_id,btrim(p_data->>'description'),coalesce(nullif(p_data->>'category',''),'OUTRO'),v_scope,v_amount,
    (p_data->>'occurredOn')::date,case when v_status='PAID' then (p_data->>'paidOn')::date end,
    v_status,v_alloc,nullif(btrim(p_data->>'notes'),''),nullif(p_data->>'receiptUrl',''),
    coalesce(v_old->>'idempotency_key',p_data->>'idempotencyKey'),auth.uid())
  on conflict(id) do update set description=excluded.description,category=excluded.category,scope=excluded.scope,
    amount_cents=excluded.amount_cents,occurred_on=excluded.occurred_on,paid_on=excluded.paid_on,status=excluded.status,
    allocations=excluded.allocations,notes=excluded.notes,receipt_url=excluded.receipt_url,updated_at=now()
  returning * into v_row;
  perform sunshine_v4.v4_write_audit('EXPENSE_SAVED','expense',v_id,jsonb_build_object('before',v_old,'after',to_jsonb(v_row)));
  return to_jsonb(v_row);
end $$;

create function public.v4_api_set_expense_status(p_id uuid,p_status text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v_old jsonb;
begin
  perform private.sunshine_finance_guard('record.update');
  if p_status not in ('CANCELLED','PENDING') or length(btrim(coalesce(p_reason,'')))<3 then
    raise exception 'Informe a situação e uma justificativa.';
  end if;
  select to_jsonb(e) into v_old from sunshine_v4.expenses e where id=p_id for update;
  if v_old is null then raise exception 'Custo não encontrado.'; end if;
  update sunshine_v4.expenses set status=p_status,paid_on=null,updated_at=now() where id=p_id;
  perform sunshine_v4.v4_write_audit('EXPENSE_STATUS_CHANGED','expense',p_id,
    jsonb_build_object('before',v_old,'status',p_status,'reason',p_reason));
end $$;

create function public.v4_api_save_finance_goal(p_month date,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.sunshine_finance_guard('record.update');
  insert into sunshine_v4.monthly_finance_goals(month,revenue_cents,costs_cents,profit_cents,margin_bp,sales_cents,updated_by)
  values(date_trunc('month',p_month)::date,nullif(p_data->>'revenueCents','')::bigint,
    nullif(p_data->>'costsCents','')::bigint,nullif(p_data->>'profitCents','')::bigint,
    nullif(p_data->>'marginBp','')::integer,nullif(p_data->>'salesCents','')::bigint,auth.uid())
  on conflict(month) do update set revenue_cents=excluded.revenue_cents,costs_cents=excluded.costs_cents,
    profit_cents=excluded.profit_cents,margin_bp=excluded.margin_bp,sales_cents=excluded.sales_cents,
    updated_by=excluded.updated_by,updated_at=now();
  perform sunshine_v4.v4_write_audit('FINANCE_GOAL_SAVED','monthly_goal',null,jsonb_build_object('month',p_month,'goals',p_data));
end $$;

-- A confirmed Asaas charge is a receivable from the provider, not available cash.
create function private.sunshine_receipts()
returns table(payment_id uuid,entry_id uuid,payer_name text,gross_cents bigint,net_cents bigint,
  fees_cents bigint,paid_on date,source text,method text,availability text,credit_on date)
language sql stable security definer set search_path='' as $$
  select p.id,a.id,coalesce(pp.preferred_name,pp.full_name,p.payer_snapshot->>'name','Sem identificação'),
    p.amount_cents,coalesce(p.net_cents,p.amount_cents-p.fees_cents),p.fees_cents,
    (p.paid_at at time zone 'America/Sao_Paulo')::date,p.source,p.payment_method,
    case when p.source<>'ASAAS' then 'AVAILABLE'
      when coalesce(a.asaas_status,p.payer_snapshot->>'asaasStatus') in ('RECEIVED','RECEIVED_IN_CASH') then 'AVAILABLE'
      when coalesce(a.asaas_status,p.payer_snapshot->>'asaasStatus')='CONFIRMED' then 'PENDING_TRANSFER'
      else 'UNKNOWN' end,
    nullif(coalesce(a.payment_snapshot->>'creditDate',a.payment_snapshot->>'estimatedCreditDate'),'')::date
  from sunshine_v4.payments p left join sunshine_v4.people pp on pp.id=p.payer_person_id
  left join public.asaas_incoming_payments a on p.source='ASAAS' and a.asaas_payment_id=p.external_ref
  where upper(coalesce(p.status,'PAID'))='PAID'
    and (a.id is null or upper(coalesce(a.asaas_status,'')) not in ('REFUNDED','REFUND_IN_PROGRESS','CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE'))
    and not exists(select 1 from sunshine_v4.payment_queue_dismissals d where d.entity_kind='EXISTING' and d.entity_id=p.id)
  union all
  select null,a.id,coalesce(a.customer_name,'Sem identificação'),round(a.gross_amount*100)::bigint,
    round(coalesce(a.net_amount,a.gross_amount)*100)::bigint,
    greatest(round((a.gross_amount-coalesce(a.net_amount,a.gross_amount))*100)::bigint,0),
    (coalesce(a.payment_date,a.received_at) at time zone 'America/Sao_Paulo')::date,'ASAAS',a.billing_type,
    case when a.asaas_status in ('RECEIVED','RECEIVED_IN_CASH') then 'AVAILABLE' else 'PENDING_TRANSFER' end,
    nullif(coalesce(a.payment_snapshot->>'creditDate',a.payment_snapshot->>'estimatedCreditDate'),'')::date
  from public.asaas_incoming_payments a
  where a.classification_status='PENDING' and a.asaas_status in ('RECEIVED','RECEIVED_IN_CASH','CONFIRMED')
    and not exists(select 1 from sunshine_v4.payments p where p.source='ASAAS' and p.external_ref=a.asaas_payment_id)
    and not exists(select 1 from sunshine_v4.payment_queue_dismissals d where d.entity_kind='ASAAS' and d.entity_id=a.id);
$$;
revoke all on function private.sunshine_receipts() from public,anon,authenticated;

create function private.sunshine_paid_costs()
returns table(id text,description text,category text,amount_cents bigint,paid_on date,origin text)
language sql stable security definer set search_path='' as $$
  select e.id::text,e.description,e.category,e.amount_cents,e.paid_on,'EXPENSE'
    from sunshine_v4.expenses e where status='PAID'
  union all select 'fee:'||coalesce(r.payment_id,r.entry_id)::text,'Taxa Asaas — '||r.payer_name,
    'TAXA_ASAAS',r.fees_cents,r.paid_on,'ASAAS_FEE' from private.sunshine_receipts()r where r.fees_cents>0
  union all select 'commission:'||c.id::text,'Comissão — '||c.recipient_name,'COMISSAO',c.amount_cents,c.paid_on,'COMMISSION'
    from sunshine_v4.commission_payment_entries c
  union all select 'historical-commission:'||s.commission_id::text,'Comissão histórica — '||s.recipient_name,'COMISSAO',
    s.paid_cents-coalesce((select sum(e.amount_cents) from sunshine_v4.commission_payment_entries e where e.commission_id=s.commission_id and e.commission_table=s.commission_table),0),s.last_paid_on,'LEGACY_COMMISSION'
    from sunshine_v4.commission_effective_status s where s.last_paid_on is not null and s.paid_cents>coalesce((select sum(e.amount_cents) from sunshine_v4.commission_payment_entries e where e.commission_id=s.commission_id and e.commission_table=s.commission_table),0);
$$;
revoke all on function private.sunshine_paid_costs() from public,anon,authenticated;

create function public.v4_cash_availability(p_start date,p_end date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v jsonb;
begin
  perform private.sunshine_finance_guard('payment.read');
  if p_start is null or p_end is null or p_start>p_end then raise exception 'Período inválido.'; end if;
  select jsonb_build_object('grossCents',coalesce(sum(gross_cents),0),'netCents',coalesce(sum(net_cents),0),
    'availableCents',coalesce(sum(net_cents) filter(where availability='AVAILABLE'),0),
    'pendingTransferCents',coalesce(sum(net_cents) filter(where availability='PENDING_TRANSFER'),0),
    'unknownCents',coalesce(sum(net_cents) filter(where availability='UNKNOWN'),0),
    'evidence',coalesce(jsonb_agg(to_jsonb(r) order by paid_on desc),'[]')) into v
  from private.sunshine_receipts()r where paid_on between p_start and p_end;
  return v;
end $$;

create function public.v4_finance_management(p_start date,p_end date,p_year integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_revenue bigint;v_costs bigint;v_sales bigint;v_result jsonb;v_annual jsonb;v_profile jsonb;v_categories jsonb;
begin
  perform private.sunshine_finance_guard();
  if p_start is null or p_end is null or p_start>p_end or p_year not between 2000 and 2100 then raise exception 'Período inválido.'; end if;
  select coalesce(sum(gross_cents),0) into v_revenue from private.sunshine_receipts() where paid_on between p_start and p_end;
  select coalesce(sum(amount_cents),0) into v_costs from private.sunshine_paid_costs() where paid_on between p_start and p_end;
  select coalesce(sum(i.amount_cents),0) into v_sales from sunshine_v4.contract_items i
    join sunshine_v4.contracts c on c.id=i.contract_id
    join sunshine_v4.obligations o on o.contract_item_id=i.id
    where (coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo')::date between p_start and p_end
    and coalesce(c.status,'')<>'CANCELLED' and coalesce(o.explicit_status,'')<>'CANCELLED';
  with months as (select make_date(p_year,m,1) as month from generate_series(1,12)m),
    rev as(select date_trunc('month',paid_on)::date as month,sum(gross_cents)::bigint cents from private.sunshine_receipts() group by 1),
    cost as(select date_trunc('month',paid_on)::date as month,sum(amount_cents)::bigint cents from private.sunshine_paid_costs() group by 1),
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
    'cash',public.v4_cash_availability(p_start,p_end),'annual',v_annual,'profile',v_profile,'incomeCategories',v_categories,
    'costEvidence',coalesce((select jsonb_agg(to_jsonb(e) order by paid_on desc) from private.sunshine_paid_costs() e where paid_on between p_start and p_end),'[]'),
    'expenses',coalesce((select jsonb_agg(to_jsonb(e) order by occurred_on desc,created_at desc) from sunshine_v4.expenses e where occurred_on between p_start and p_end),'[]'),
    'pendingCostsCents',coalesce((select sum(amount_cents) from sunshine_v4.expenses where status='PENDING' and occurred_on between p_start and p_end),0),
    'reserveCents',coalesce((select sum(a.amount_cents-coalesce((select sum(ce.amount_cents) from sunshine_v4.commission_entries ce where ce.allocation_id=a.id and ce.status not in ('CANCELLED','REVERSED')),a.amount_cents)) from sunshine_v4.payment_allocations a join sunshine_v4.payments p on p.id=a.payment_id where p.status='PAID' and (p.paid_at at time zone 'America/Sao_Paulo')::date between p_start and p_end and private.sunshine_uses_october_rule(a.id)),0),
    'voids',coalesce((select jsonb_agg(jsonb_build_object('id',id,'paymentId',payment_id,'reason',reason,'createdAt',created_at))
      from sunshine_v4.financial_voids where restored_at is null),'[]'));
end $$;

create function public.v4_birthdays(p_reference date,p_month integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v jsonb;
begin
  perform private.sunshine_finance_guard('person.read');
  if p_month not between 1 and 12 then raise exception 'Mês inválido.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(p.preferred_name,p.full_name),'phone',p.phone,
    'birthDate',p.birth_date,'birthday',d.birthday,'age',extract(year from age(d.birthday,p.birth_date)),
    'isToday',extract(month from p.birth_date)=extract(month from p_reference) and extract(day from p.birth_date)=extract(day from p_reference))
    order by extract(day from p.birth_date),p.full_name),'[]') into v
  from sunshine_v4.people p cross join lateral (select (p.birth_date+make_interval(years=>extract(year from p_reference)::integer-extract(year from p.birth_date)::integer))::date birthday)d
  where p.birth_date is not null and extract(month from p.birth_date)=p_month and coalesce(p.status,'ACTIVE')<>'INACTIVE';
  return v;
end $$;


-- Correct transaction retries and preserve original dated commission rules.
CREATE OR REPLACE FUNCTION public.v4_api_associate_existing_payment(p_payment_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare
  v_actor uuid;
  v_key text;
  v_contract uuid;
  v_existing uuid;
  v_customer uuid;
  v_payment sunshine_v4.payments%rowtype;
  v_allocated bigint;
  v_available bigint;
  v_alloc_sum bigint:=0;
  v_total bigint:=0;
  v_item jsonb;
  v_idx integer:=0;
  v_item_id uuid;
  v_obligation_id uuid;
  v_beneficiary uuid;
  v_amount bigint;
  v_allocate bigint;
  v_work uuid;
  v_service uuid;
  v_responsible uuid;
  v_promised date;
  v_next_collection date;
  v_reference date;
  v_items_out jsonb:='[]'::jsonb;
begin
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('contract.create');
  perform sunshine_v4.v4_assert_permission('allocation.create');
  v_actor:=sunshine_v4.v4_current_user_id();
  v_key:=nullif(btrim(p_payload->>'idempotencyKey'),'');
  if v_key is null then raise exception 'idempotencyKey required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('associate-payment:'||p_payment_id::text||':'||v_key,0));

  select id into v_existing from sunshine_v4.contracts
  where idempotency_key='associate-payment:'||p_payment_id::text||':'||v_key;
  if v_existing is not null then
    return private.sunshine_entry_receipt(v_existing)||jsonb_build_object('idempotent',true,'paymentId',p_payment_id);
  end if;

  select * into v_payment from sunshine_v4.payments where id=p_payment_id for update;
  if v_payment.id is null then raise exception 'Pagamento não encontrado.'; end if;
  if v_payment.status<>'PAID' then raise exception 'Pagamento cancelado ou estornado não pode ser associado.'; end if;
  select coalesce(sum(amount_cents),0)::bigint into v_allocated
  from sunshine_v4.payment_allocations where payment_id=p_payment_id;
  v_available:=v_payment.amount_cents-v_allocated;
  if v_available<=0 then raise exception 'Este pagamento não possui valor disponível para associação.'; end if;


  if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items')=0 then
    raise exception 'Informe ao menos um item para associação.';
  end if;
  for v_item in select value from jsonb_array_elements(p_payload->'items') loop
    v_amount:=nullif(v_item->>'amountCents','')::bigint;
    v_allocate:=coalesce(nullif(v_item->>'allocateCents','')::bigint,0);
    if v_amount is null or v_amount<=0 then raise exception 'O valor do item deve ser maior que zero.'; end if;
    if v_allocate<0 or v_allocate>v_amount then raise exception 'Valor de associação inválido.'; end if;
    v_total:=v_total+v_amount;
    v_alloc_sum:=v_alloc_sum+v_allocate;
  end loop;
  if v_alloc_sum>v_available then raise exception 'A associação supera o valor disponível no pagamento.'; end if;

  v_customer:=nullif(p_payload->>'customerPersonId','')::uuid;
  if v_customer is null or not exists(select 1 from sunshine_v4.people where id=v_customer) then
    raise exception 'Selecione a pessoa vinculada ao lançamento.';
  end if;

  insert into sunshine_v4.contracts(
    customer_person_id,source,status,idempotency_key,created_at,legacy_imported,
    legacy_unresolved,sale_type,sales_channel,sold_at,legacy_status,notes
  ) values(
    v_customer,v_payment.source,'CONFIRMED','associate-payment:'||p_payment_id::text||':'||v_key,
    now(),false,false,'ASSOCIATION',null,coalesce(v_payment.paid_at,now()),'CONFIRMED',
    nullif(btrim(p_payload->>'notes'),'')
  ) returning id into v_contract;

  for v_item in select value from jsonb_array_elements(p_payload->'items') loop
    v_idx:=v_idx+1;
    v_beneficiary:=nullif(v_item->>'beneficiaryPersonId','')::uuid;
    if v_beneficiary is null or not exists(select 1 from sunshine_v4.people where id=v_beneficiary) then
      raise exception 'Selecione cada beneficiário.';
    end if;
    v_amount:=(v_item->>'amountCents')::bigint;
    v_allocate:=coalesce(nullif(v_item->>'allocateCents','')::bigint,0);
    v_work:=nullif(v_item->>'workId','')::uuid;
    v_service:=nullif(v_item->>'serviceId','')::uuid;
    v_responsible:=nullif(v_item->>'responsibleMemberId','')::uuid;
    v_reference:=case when nullif(v_item->>'referenceMonth','') is not null
      then date_trunc('month',(v_item->>'referenceMonth')::date)::date end;
    v_promised:=nullif(v_item->>'expectedPaymentDate','')::date;
    v_next_collection:=coalesce(nullif(v_item->>'nextCollectionDate','')::date,v_promised,nullif(v_item->>'dueDate','')::date);

    insert into sunshine_v4.contract_items(
      contract_id,beneficiary_person_id,service_code,service_name,amount_cents,
      legacy_imported,legacy_unresolved,service_id,work_id,responsible_member_id,
      service_category,reference_month
    ) values(
      v_contract,v_beneficiary,
      coalesce(nullif(btrim(v_item->>'serviceCode'),''),case when v_service is not null then 'SERVICE:'||v_service::text when v_work is not null then 'WORK:'||v_work::text else 'MANUAL' end),
      coalesce(nullif(btrim(v_item->>'serviceName'),''),(select name from sunshine_v4.services where id=v_service),(select title from sunshine_v4.works where id=v_work),'Lançamento'),
      v_amount,false,false,v_service,v_work,v_responsible,nullif(btrim(v_item->>'serviceCategory'),''),v_reference
    ) returning id into v_item_id;

    insert into sunshine_v4.obligations(
      contract_item_id,beneficiary_person_id,total_cents,due_date,
      expected_payment_date,next_collection_date,legacy_imported,legacy_unresolved
    ) values(
      v_item_id,v_beneficiary,v_amount,nullif(v_item->>'dueDate','')::date,
      v_promised,v_next_collection,false,false
    ) returning id into v_obligation_id;

    if v_work is not null then
      perform sunshine_v4.v4_assert_permission('work.registration.create');
      insert into sunshine_v4.work_registrations(
        work_id,beneficiary_person_id,contract_item_id,participant_name,
        participant_birth_date,rival_name,loved_person_name,participant_data,status,legacy_imported
      ) values(
        v_work,v_beneficiary,v_item_id,
        coalesce(nullif(btrim(v_item->>'participantName'),''),(select coalesce(preferred_name,full_name) from sunshine_v4.people where id=v_beneficiary)),
        nullif(v_item->>'participantBirthDate','')::date,nullif(btrim(v_item->>'rivalName'),''),
        nullif(btrim(v_item->>'lovedPersonName'),''),coalesce(v_item->'participantData','{}'::jsonb),'ACTIVE',false
      );
    end if;

    if v_allocate>0 then
      insert into sunshine_v4.payment_allocations(payment_id,obligation_id,amount_cents,idempotency_key,allocated_at,legacy_imported)
      values(p_payment_id,v_obligation_id,v_allocate,'associate-payment:'||p_payment_id::text||':'||v_key||':'||v_idx,now(),false);
      perform sunshine_v4.v4_write_audit('PAYMENT_ALLOCATED','allocation',
        (select id from sunshine_v4.payment_allocations where idempotency_key='associate-payment:'||p_payment_id::text||':'||v_key||':'||v_idx),
        jsonb_build_object('payment_id',p_payment_id,'obligation_id',v_obligation_id,'amount_cents',v_allocate));
    end if;

    if (v_amount-v_allocate)>0 and v_promised is not null then
      perform sunshine_v4.v4_assert_permission('promise.create');
      insert into sunshine_v4.payment_promises(obligation_id,promised_for,next_collection_date,note,created_by)
      values(v_obligation_id,v_promised,v_next_collection,nullif(btrim(v_item->>'promiseNote'),''),v_actor);
      if v_next_collection is not null then
        perform sunshine_v4.v4_assert_permission('collection.create');
        insert into sunshine_v4.collection_tasks(obligation_id,scheduled_for,status,note,created_by)
        values(v_obligation_id,v_next_collection,'SCHEDULED','Cobrança criada pela associação',v_actor);
      end if;
    end if;

    v_items_out:=v_items_out||jsonb_build_array(jsonb_build_object(
      'itemId',v_item_id,'obligationId',v_obligation_id,'beneficiaryPersonId',v_beneficiary,
      'amountCents',v_amount,'allocatedCents',v_allocate,'pendingCents',v_amount-v_allocate
    ));
  end loop;

  if (select count(distinct date_trunc('month',(x->>'referenceMonth')::date)::date)
      from jsonb_array_elements(p_payload->'items') x where nullif(x->>'referenceMonth','') is not null)=1
     and (select count(*) from jsonb_array_elements(p_payload->'items') x
          where upper(coalesce(x->>'serviceCategory',''))='MENSALIDADE')=jsonb_array_length(p_payload->'items') then
    update sunshine_v4.payments set competence_date=(
      select date_trunc('month',(x->>'referenceMonth')::date)::date
      from jsonb_array_elements(p_payload->'items') x where nullif(x->>'referenceMonth','') is not null limit 1
    ) where id=p_payment_id;
  end if;

  perform sunshine_v4.v4_write_audit('PAYMENT_ASSOCIATED','payment',p_payment_id,
    jsonb_build_object('contract_id',v_contract,'contract_total_cents',v_total,'allocated_cents',v_alloc_sum,'item_count',v_idx));
  return jsonb_build_object('idempotent',false,'contractId',v_contract,'paymentId',p_payment_id,
    'contractTotalCents',v_total,'allocatedCents',v_alloc_sum,'remainingCents',v_available-v_alloc_sum,'items',v_items_out);
end
$function$;



CREATE OR REPLACE FUNCTION sunshine_v4.v4_register_manual_entry(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'sunshine_v4', 'pg_temp'
AS $function$
declare
 v_actor uuid; v_key text; v_contract uuid; v_payment uuid; v_existing uuid;
 v_customer uuid; v_payer uuid; v_received bigint; v_alloc_sum bigint:=0; v_total bigint:=0;
 v_source text; v_payment_method text; v_paid_at timestamptz; v_payer_snapshot jsonb;
 v_item jsonb; v_idx integer:=0; v_item_id uuid; v_obligation_id uuid; v_beneficiary uuid;
 v_amount bigint; v_allocate bigint; v_work uuid; v_service uuid; v_responsible uuid; v_promised date; v_next_collection date;
 v_items_out jsonb:='[]'::jsonb;
begin
 perform v4_assert_permission('contract.create');
 v_actor:=v4_current_user_id();
 v_key:=nullif(btrim(p_payload->>'idempotencyKey'),'');
 if v_key is null then raise exception 'idempotencyKey required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('manual-entry:'||v_key,0));
 select id into v_existing from contracts where idempotency_key='manual-entry:'||v_key;
 if v_existing is not null then
   select p.id into v_payment from payments p where p.idempotency_key='manual-entry:'||v_key||':payment';
   return private.sunshine_entry_receipt(v_existing)||jsonb_build_object('idempotent',true,'paymentId',v_payment);
 end if;

 v_customer:=nullif(p_payload->>'customerPersonId','')::uuid;
 if v_customer is null or not exists(select 1 from people where id=v_customer) then raise exception 'valid customerPersonId required'; end if;
 v_payer:=nullif(p_payload->>'payerPersonId','')::uuid;
 if v_payer is not null and not exists(select 1 from people where id=v_payer) then raise exception 'payer person not found'; end if;
 v_received:=coalesce(nullif(p_payload->>'receivedCents','')::bigint,0);
 if v_received<0 then raise exception 'receivedCents cannot be negative'; end if;
 v_source:=coalesce(nullif(btrim(p_payload->>'source'),''),'MANUAL_V4');
 v_payment_method:=nullif(btrim(p_payload->>'paymentMethod'),'');
 v_paid_at:=coalesce(nullif(p_payload->>'paidAt','')::timestamptz,now());
 v_payer_snapshot:=coalesce(p_payload->'payerSnapshot','{}'::jsonb);
 if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items')=0 then raise exception 'items required'; end if;

 for v_item in select value from jsonb_array_elements(p_payload->'items') loop
   v_amount:=nullif(v_item->>'amountCents','')::bigint;
   v_allocate:=coalesce(nullif(v_item->>'allocateCents','')::bigint,0);
   if v_amount is null or v_amount<=0 then raise exception 'item amount must be positive'; end if;
   if v_allocate<0 or v_allocate>v_amount then raise exception 'invalid item allocation'; end if;
   v_total:=v_total+v_amount; v_alloc_sum:=v_alloc_sum+v_allocate;
 end loop;
 if v_alloc_sum>v_received then raise exception 'allocations exceed received amount'; end if;
 if v_received>0 then perform v4_assert_permission('payment.create'); perform v4_assert_permission('allocation.create'); end if;

 insert into contracts(customer_person_id,source,status,idempotency_key,created_at,legacy_imported,legacy_unresolved,sale_type,sales_channel,sold_at,legacy_status,notes)
 values(v_customer,v_source,'CONFIRMED','manual-entry:'||v_key,now(),false,false,coalesce(nullif(btrim(p_payload->>'saleType'),''),'MANUAL'),nullif(btrim(p_payload->>'salesChannel'),''),coalesce(nullif(p_payload->>'soldAt','')::timestamptz,v_paid_at),'CONFIRMED',nullif(btrim(p_payload->>'notes'),'')) returning id into v_contract;

 if v_received>0 then
   insert into payments(payer_person_id,payer_snapshot,source,external_ref,amount_cents,paid_at,idempotency_key,created_at,legacy_imported,legacy_client_id,payer_resolution_status,fees_cents,net_cents,retained_excess_cents,payment_method,notes,legacy_status,status)
   values(v_payer,v_payer_snapshot,v_source,nullif(btrim(p_payload->>'externalRef'),''),v_received,v_paid_at,'manual-entry:'||v_key||':payment',now(),false,null,'EXPLICIT',0,v_received,0,v_payment_method,nullif(btrim(p_payload->>'paymentNotes'),''),'PAID','PAID') returning id into v_payment;
   perform v4_write_audit('PAYMENT_CREATED','payment',v_payment,jsonb_build_object('payer_person_id',v_payer,'amount_cents',v_received,'source',v_source));
 end if;

 for v_item in select value from jsonb_array_elements(p_payload->'items') loop
   v_idx:=v_idx+1;
   v_beneficiary:=nullif(v_item->>'beneficiaryPersonId','')::uuid;
   if v_beneficiary is null or not exists(select 1 from people where id=v_beneficiary) then raise exception 'valid beneficiaryPersonId required'; end if;
   v_amount:=(v_item->>'amountCents')::bigint;
   v_allocate:=coalesce(nullif(v_item->>'allocateCents','')::bigint,0);
   v_work:=nullif(v_item->>'workId','')::uuid;
   v_service:=nullif(v_item->>'serviceId','')::uuid;
   v_responsible:=nullif(v_item->>'responsibleMemberId','')::uuid;
   if v_work is not null and not exists(select 1 from works where id=v_work) then raise exception 'work not found'; end if;
   if v_service is not null and not exists(select 1 from services where id=v_service) then raise exception 'service not found'; end if;

   insert into contract_items(contract_id,beneficiary_person_id,service_code,service_name,amount_cents,legacy_imported,legacy_unresolved,service_id,work_id,responsible_member_id,service_category)
   values(v_contract,v_beneficiary,coalesce(nullif(btrim(v_item->>'serviceCode'),''),case when v_service is not null then 'SERVICE:'||v_service::text when v_work is not null then 'WORK:'||v_work::text else 'MANUAL' end),coalesce(nullif(btrim(v_item->>'serviceName'),''),(select name from services where id=v_service),(select title from works where id=v_work),'Lançamento manual'),v_amount,false,false,v_service,v_work,v_responsible,nullif(btrim(v_item->>'serviceCategory'),'')) returning id into v_item_id;

   v_promised:=nullif(v_item->>'expectedPaymentDate','')::date;
   v_next_collection:=coalesce(nullif(v_item->>'nextCollectionDate','')::date,v_promised,nullif(v_item->>'dueDate','')::date);
   insert into obligations(contract_item_id,beneficiary_person_id,total_cents,due_date,expected_payment_date,next_collection_date,legacy_imported,legacy_unresolved)
   values(v_item_id,v_beneficiary,v_amount,nullif(v_item->>'dueDate','')::date,v_promised,v_next_collection,false,false) returning id into v_obligation_id;

   if v_work is not null then
     perform v4_assert_permission('work.registration.create');
     insert into work_registrations(work_id,beneficiary_person_id,contract_item_id,participant_name,participant_birth_date,rival_name,loved_person_name,participant_data,status,legacy_imported)
     values(v_work,v_beneficiary,v_item_id,coalesce(nullif(btrim(v_item->>'participantName'),''),(select coalesce(preferred_name,full_name) from people where id=v_beneficiary)),nullif(v_item->>'participantBirthDate','')::date,nullif(btrim(v_item->>'rivalName'),''),nullif(btrim(v_item->>'lovedPersonName'),''),coalesce(v_item->'participantData','{}'::jsonb),'ACTIVE',false);
   end if;

   if v_allocate>0 then
     insert into payment_allocations(payment_id,obligation_id,amount_cents,idempotency_key,allocated_at,legacy_imported)
     values(v_payment,v_obligation_id,v_allocate,'manual-entry:'||v_key||':allocation:'||v_idx,now(),false);
     perform v4_write_audit('PAYMENT_ALLOCATED','allocation',(select id from payment_allocations where idempotency_key='manual-entry:'||v_key||':allocation:'||v_idx),jsonb_build_object('payment_id',v_payment,'obligation_id',v_obligation_id,'amount_cents',v_allocate));
   end if;

   if (v_amount-v_allocate)>0 and v_promised is not null then
     perform v4_assert_permission('promise.create');
     insert into payment_promises(obligation_id,promised_for,next_collection_date,note,created_by)
     values(v_obligation_id,v_promised,v_next_collection,nullif(btrim(v_item->>'promiseNote'),''),v_actor);
     if v_next_collection is not null then
       perform v4_assert_permission('collection.create');
       insert into collection_tasks(obligation_id,scheduled_for,status,note,created_by)
       values(v_obligation_id,v_next_collection,'SCHEDULED','Cobrança criada pelo lançamento manual',v_actor);
     end if;
   end if;

   v_items_out:=v_items_out||jsonb_build_array(jsonb_build_object('itemId',v_item_id,'obligationId',v_obligation_id,'beneficiaryPersonId',v_beneficiary,'amountCents',v_amount,'allocatedCents',v_allocate,'pendingCents',v_amount-v_allocate));
 end loop;

 perform v4_write_audit('MANUAL_ENTRY_CREATED','contract',v_contract,jsonb_build_object('payment_id',v_payment,'contract_total_cents',v_total,'received_cents',v_received,'allocated_cents',v_alloc_sum,'item_count',v_idx));
 return jsonb_build_object('idempotent',false,'contractId',v_contract,'paymentId',v_payment,'contractTotalCents',v_total,'receivedCents',v_received,'allocatedCents',v_alloc_sum,'unallocatedCents',v_received-v_alloc_sum,'items',v_items_out);
end $function$;



CREATE OR REPLACE FUNCTION public.v4_api_associate_payment_group(p_payment_ids uuid[] DEFAULT '{}'::uuid[], p_asaas_entry_ids uuid[] DEFAULT '{}'::uuid[], p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare
  v_auth uuid;
  v_member uuid;
  v_key text;
  v_existing uuid;
  v_entry_id uuid;
  v_entry public.asaas_incoming_payments%rowtype;
  v_payment_id uuid;
  v_payer uuid;
  v_payment_ids uuid[] := '{}'::uuid[];
  v_first_payment uuid;
  v_payment uuid;
  v_available bigint;
  v_first_available bigint;
  v_requested bigint := 0;
  v_group_available bigint := 0;
  v_use bigint;
  v_remaining bigint;
  v_item jsonb;
  v_first_items jsonb := '[]'::jsonb;
  v_first_payload jsonb;
  v_result jsonb;
  v_result_item jsonb;
  v_obligation uuid;
  v_allocation uuid;
  v_idx integer := 0;
  v_alloc_idx integer := 0;
  v_reference date;
  v_promised date;
  v_next_collection date;
begin
  v_auth := public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('payment.create');
  perform sunshine_v4.v4_assert_permission('contract.create');
  perform sunshine_v4.v4_assert_permission('allocation.create');

  v_key := nullif(btrim(p_payload->>'idempotencyKey'),'');
  if v_key is null then raise exception 'idempotencyKey required'; end if;
  if coalesce(cardinality(p_payment_ids),0)+coalesce(cardinality(p_asaas_entry_ids),0)=0 then
    raise exception 'Selecione ao menos um pagamento.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('associate-payment-group:'||v_key,0));
  select id into v_existing from sunshine_v4.contracts where idempotency_key like 'associate-payment:%:group-'||v_key;
  if v_existing is not null then
    return private.sunshine_entry_receipt(v_existing)||jsonb_build_object('idempotent',true);
  end if;


  -- Import each selected Asaas receipt only once. Its original date, gross
  -- amount and external reference remain on the individual payment record.
  foreach v_entry_id in array coalesce(p_asaas_entry_ids,'{}'::uuid[])
  loop
    select * into v_entry
    from public.asaas_incoming_payments
    where id=v_entry_id
    for update;
    if v_entry.id is null then raise exception 'Recebimento do Asaas não encontrado.'; end if;

    select id into v_payment_id
    from sunshine_v4.payments
    where source='ASAAS' and external_ref=v_entry.asaas_payment_id
    limit 1;

    if v_payment_id is null then
      if v_entry.classification_status<>'PENDING' then
        raise exception 'Um dos recebimentos do Asaas já foi tratado.';
      end if;
      v_payer := nullif(p_payload->>'payerPersonId','')::uuid;
      if v_payer is null then
        select id into v_payer from sunshine_v4.people
        where legacy_v3_id=v_entry.matched_client_id limit 1;
      end if;
      if v_payer is null then raise exception 'Selecione quem realizou os pagamentos.'; end if;

      insert into sunshine_v4.payments(
        payer_person_id,payer_snapshot,source,external_ref,amount_cents,paid_at,idempotency_key,
        created_at,legacy_imported,payer_resolution_status,fees_cents,net_cents,retained_excess_cents,
        payment_method,notes,legacy_status,status
      ) values(
        v_payer,jsonb_build_object('name',v_entry.customer_name,'email',v_entry.customer_email,
          'phone',coalesce(v_entry.customer_mobile_phone,v_entry.customer_phone),'document',v_entry.customer_document,
          'asaasCustomerId',v_entry.asaas_customer_id),
        'ASAAS',v_entry.asaas_payment_id,round(coalesce(v_entry.gross_amount,0)*100)::bigint,
        coalesce(v_entry.payment_date,v_entry.received_at),'asaas-inbox:'||v_entry.asaas_payment_id,now(),false,
        case when v_entry.matched_client_id is null then 'EXPLICIT' else 'INFERRED_LEGACY_CLIENT' end,
        greatest(round((coalesce(v_entry.gross_amount,0)-coalesce(v_entry.net_amount,v_entry.gross_amount,0))*100),0)::bigint,
        round(coalesce(v_entry.net_amount,v_entry.gross_amount,0)*100)::bigint,0,v_entry.billing_type,
        'Recebido pelo webhook do Asaas','PAID','PAID'
      ) returning id into v_payment_id;

      perform sunshine_v4.v4_write_audit('PAYMENT_CREATED','payment',v_payment_id,
        jsonb_build_object('payer_person_id',v_payer,'amount_cents',round(coalesce(v_entry.gross_amount,0)*100)::bigint,
          'source','ASAAS','external_ref',v_entry.asaas_payment_id,'group_association',true));
    end if;
    if not (v_payment_id=any(v_payment_ids)) then v_payment_ids:=array_append(v_payment_ids,v_payment_id); end if;
  end loop;

  foreach v_payment_id in array coalesce(p_payment_ids,'{}'::uuid[])
  loop
    if not exists(select 1 from sunshine_v4.payments where id=v_payment_id) then
      raise exception 'Pagamento selecionado não encontrado.';
    end if;
    if not (v_payment_id=any(v_payment_ids)) then v_payment_ids:=array_append(v_payment_ids,v_payment_id); end if;
  end loop;

  if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items')=0 then
    raise exception 'Informe o serviço que os pagamentos cobrem.';
  end if;
  for v_item in select value from jsonb_array_elements(p_payload->'items')
  loop
    v_use:=coalesce(nullif(v_item->>'allocateCents','')::bigint,0);
    if v_use<0 or v_use>coalesce(nullif(v_item->>'amountCents','')::bigint,0) then
      raise exception 'Valor de associação inválido.';
    end if;
    v_requested:=v_requested+v_use;
  end loop;

  select array_agg(x order by x) into v_payment_ids from unnest(v_payment_ids)x;
  foreach v_payment in array v_payment_ids
  loop
    perform 1 from sunshine_v4.payments where id=v_payment and status='PAID' for update;
    if not found then raise exception 'Pagamento cancelado ou estornado não pode ser associado.'; end if;
    select p.amount_cents-coalesce((select sum(pa.amount_cents) from sunshine_v4.payment_allocations pa where pa.payment_id=p.id),0)::bigint
      into v_available from sunshine_v4.payments p where p.id=v_payment;
    if v_available>0 then
      v_group_available:=v_group_available+v_available;
      if v_first_payment is null then
        v_first_payment:=v_payment;
        v_first_available:=v_available;
      end if;
    end if;
  end loop;
  if v_first_payment is null then raise exception 'Os pagamentos selecionados não possuem saldo disponível.'; end if;
  if v_requested>v_group_available then raise exception 'A associação supera o total disponível nos pagamentos selecionados.'; end if;

  -- The existing association routine creates the one contract, items,
  -- obligations and work registrations. Only the first receipt is allocated
  -- there; the remaining receipts are allocated to those same obligations.
  v_remaining:=least(v_first_available,v_requested);
  for v_item in select value from jsonb_array_elements(p_payload->'items')
  loop
    v_use:=least(coalesce(nullif(v_item->>'allocateCents','')::bigint,0),v_remaining);
    v_remaining:=v_remaining-v_use;
    v_first_items:=v_first_items||jsonb_build_array(
      (v_item-'expectedPaymentDate'-'nextCollectionDate'-'promiseNote')||jsonb_build_object('allocateCents',v_use)
    );
  end loop;
  v_first_payload:=p_payload||jsonb_build_object('items',v_first_items,'idempotencyKey','group-'||v_key);
  v_result:=public.v4_api_associate_existing_payment(v_first_payment,v_first_payload);

  -- Continue each requested item across the remaining selected receipts.
  v_idx:=0;
  for v_item in select value from jsonb_array_elements(p_payload->'items')
  loop
    v_idx:=v_idx+1;
    v_result_item:=v_result->'items'->(v_idx-1);
    v_obligation:=(v_result_item->>'obligationId')::uuid;
    v_remaining:=coalesce(nullif(v_item->>'allocateCents','')::bigint,0)
      -coalesce(nullif(v_result_item->>'allocatedCents','')::bigint,0);

    foreach v_payment in array v_payment_ids
    loop
      exit when v_remaining<=0;
      if v_payment=v_first_payment then continue; end if;
      perform 1 from sunshine_v4.payments where id=v_payment and status='PAID' for update;
    if not found then raise exception 'Pagamento cancelado ou estornado não pode ser associado.'; end if;
      select p.amount_cents-coalesce((select sum(pa.amount_cents) from sunshine_v4.payment_allocations pa where pa.payment_id=p.id),0)::bigint
        into v_available from sunshine_v4.payments p where p.id=v_payment;
      v_use:=least(greatest(coalesce(v_available,0),0),v_remaining);
      if v_use>0 then
        v_alloc_idx:=v_alloc_idx+1;
        insert into sunshine_v4.payment_allocations(
          payment_id,obligation_id,amount_cents,idempotency_key,allocated_at,legacy_imported
        ) values(
          v_payment,v_obligation,v_use,
          'associate-payment-group:'||v_key||':'||v_idx||':'||v_alloc_idx,now(),false
        ) returning id into v_allocation;
        perform sunshine_v4.v4_write_audit('PAYMENT_ALLOCATED','allocation',v_allocation,
          jsonb_build_object('payment_id',v_payment,'obligation_id',v_obligation,'amount_cents',v_use,'group_association',true));
        v_remaining:=v_remaining-v_use;
      end if;
    end loop;

    if v_remaining>0 then raise exception 'Não foi possível distribuir todo o valor solicitado.'; end if;
    v_remaining:=coalesce(nullif(v_item->>'amountCents','')::bigint,0)
      -coalesce(nullif(v_item->>'allocateCents','')::bigint,0);
    v_promised:=nullif(v_item->>'expectedPaymentDate','')::date;
    v_next_collection:=coalesce(nullif(v_item->>'nextCollectionDate','')::date,v_promised,nullif(v_item->>'dueDate','')::date);
    if v_remaining>0 and v_promised is not null then
      perform sunshine_v4.v4_assert_permission('promise.create');
      insert into sunshine_v4.payment_promises(obligation_id,promised_for,next_collection_date,note,created_by)
      values(v_obligation,v_promised,v_next_collection,nullif(btrim(v_item->>'promiseNote'),''),sunshine_v4.v4_current_user_id());
      if v_next_collection is not null then
        perform sunshine_v4.v4_assert_permission('collection.create');
        insert into sunshine_v4.collection_tasks(obligation_id,scheduled_for,status,note,created_by)
        values(v_obligation,v_next_collection,'SCHEDULED','Cobrança criada pela associação agrupada',sunshine_v4.v4_current_user_id());
      end if;
    end if;
  end loop;

  if (select count(distinct date_trunc('month',(x->>'referenceMonth')::date)::date)
      from jsonb_array_elements(p_payload->'items') x where nullif(x->>'referenceMonth','') is not null)=1
     and (select count(*) from jsonb_array_elements(p_payload->'items') x
          where upper(coalesce(x->>'serviceCategory',''))='MENSALIDADE')=jsonb_array_length(p_payload->'items') then
    select date_trunc('month',(x->>'referenceMonth')::date)::date into v_reference
    from jsonb_array_elements(p_payload->'items') x where nullif(x->>'referenceMonth','') is not null limit 1;
    update sunshine_v4.payments set competence_date=v_reference where id=any(v_payment_ids);
  end if;

  select id into v_member from public.team_members where auth_user_id=v_auth and active limit 1;
  update public.asaas_incoming_payments
  set classification_status='RESOLVED',resolved_client_id=coalesce(resolved_client_id,matched_client_id),
      resolved_by=v_member,resolved_at=now()
  where id=any(coalesce(p_asaas_entry_ids,'{}'::uuid[]));

  perform sunshine_v4.v4_write_audit('PAYMENT_GROUP_ASSOCIATED','contract',(v_result->>'contractId')::uuid,
    jsonb_build_object('payment_ids',to_jsonb(v_payment_ids),'payment_count',cardinality(v_payment_ids),
      'available_cents',v_group_available,'allocated_cents',v_requested));
  return v_result||jsonb_build_object('paymentIds',to_jsonb(v_payment_ids),'paymentCount',cardinality(v_payment_ids),
    'selectedAvailableCents',v_group_available,'allocatedCents',v_requested);
end
$function$;



CREATE OR REPLACE FUNCTION public.v4_api_register_asaas_entry(p_entry_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare
  v_auth uuid;
  v_member uuid;
  v_entry public.asaas_incoming_payments%rowtype;
  v_payment uuid;
  v_payer uuid;
  v_payload jsonb;
  v_result jsonb;
begin
  v_auth:=public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('payment.create');
  perform sunshine_v4.v4_assert_permission('allocation.create');
  select * into v_entry from public.asaas_incoming_payments where id=p_entry_id for update;
  if v_entry.id is null then raise exception 'Recebimento do Asaas não encontrado.'; end if;

  select id into v_payment from sunshine_v4.payments where source='ASAAS' and external_ref=v_entry.asaas_payment_id;
  if v_entry.asaas_status not in ('RECEIVED','RECEIVED_IN_CASH','CONFIRMED') then
    raise exception 'Recebimento estornado ou não confirmado no Asaas.';
  end if;
  if v_payment is not null then
    v_result:=public.v4_api_associate_existing_payment(v_payment,p_payload||jsonb_build_object(
      'idempotencyKey','asaas-inbox-'||v_entry.asaas_payment_id));
    select id into v_member from public.team_members where auth_user_id=v_auth and active limit 1;
    update public.asaas_incoming_payments set classification_status='RESOLVED',resolved_by=v_member,resolved_at=now() where id=p_entry_id;
    return v_result||jsonb_build_object('asaasEntryId',p_entry_id,'paymentId',v_payment);
  end if;
  if v_entry.classification_status<>'PENDING' then raise exception 'Este recebimento do Asaas já foi tratado.'; end if;

  v_payer:=nullif(p_payload->>'payerPersonId','')::uuid;
  if v_payer is null then
    select id into v_payer from sunshine_v4.people where legacy_v3_id=v_entry.matched_client_id limit 1;
  end if;
  if v_payer is null then raise exception 'Selecione quem realizou o pagamento.'; end if;

  insert into sunshine_v4.payments(
    payer_person_id,payer_snapshot,source,external_ref,amount_cents,paid_at,idempotency_key,
    created_at,legacy_imported,payer_resolution_status,fees_cents,net_cents,retained_excess_cents,
    payment_method,notes,legacy_status,status
  ) values(
    v_payer,jsonb_build_object('name',v_entry.customer_name,'email',v_entry.customer_email,
      'phone',coalesce(v_entry.customer_mobile_phone,v_entry.customer_phone),'document',v_entry.customer_document,
      'asaasCustomerId',v_entry.asaas_customer_id),
    'ASAAS',v_entry.asaas_payment_id,round(coalesce(v_entry.gross_amount,0)*100)::bigint,
    coalesce(v_entry.payment_date,v_entry.received_at),'asaas-inbox:'||v_entry.asaas_payment_id,now(),false,
    case when v_entry.matched_client_id is null then 'EXPLICIT' else 'INFERRED_LEGACY_CLIENT' end,
    greatest(round((coalesce(v_entry.gross_amount,0)-coalesce(v_entry.net_amount,v_entry.gross_amount,0))*100),0)::bigint,
    round(coalesce(v_entry.net_amount,v_entry.gross_amount,0)*100)::bigint,0,v_entry.billing_type,
    'Recebido pelo webhook do Asaas','PAID','PAID'
  ) returning id into v_payment;

  perform sunshine_v4.v4_write_audit('PAYMENT_CREATED','payment',v_payment,
    jsonb_build_object('payer_person_id',v_payer,'amount_cents',round(coalesce(v_entry.gross_amount,0)*100)::bigint,'source','ASAAS','external_ref',v_entry.asaas_payment_id));

  v_payload:=p_payload||jsonb_build_object(
    'idempotencyKey','asaas-inbox-'||v_entry.asaas_payment_id,
    'customerPersonId',coalesce(nullif(p_payload->>'customerPersonId','')::uuid,v_payer),
    'payerPersonId',v_payer
  );
  v_result:=public.v4_api_associate_existing_payment(v_payment,v_payload);

  select id into v_member from public.team_members where auth_user_id=v_auth and active limit 1;
  update public.asaas_incoming_payments
  set classification_status='RESOLVED',resolved_client_id=coalesce(resolved_client_id,matched_client_id),
      resolved_by=v_member,resolved_at=now()
  where id=p_entry_id;
  return v_result||jsonb_build_object('asaasEntryId',p_entry_id,'paymentId',v_payment);
end
$function$;



CREATE OR REPLACE FUNCTION public.v4_payment_detail(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('payment.read');
  select jsonb_build_object(
    'payment',jsonb_build_object('paymentId',pay.id,'payerName',coalesce(pp.preferred_name,pp.full_name,pay.payer_snapshot->>'name','Pagador não identificado'),
      'status',pay.status,'payerPersonId',pay.payer_person_id,'amountCents',pay.amount_cents,'paidAt',pay.paid_at,'source',pay.source,'paymentMethod',pay.payment_method,'externalRef',pay.external_ref),
    'allocations',coalesce((select jsonb_agg(jsonb_build_object('allocationId',pa.id,'itemId',ci.id,'amountCents',pa.amount_cents,
      'totalCents',ci.amount_cents,'beneficiaryPersonId',ci.beneficiary_person_id,'workId',ci.work_id,'commissionOverride',ci.commission_override,'beneficiaryName',coalesce(bp.preferred_name,bp.full_name,'Pessoa não identificada'),'serviceName',ci.service_name,
      'eventName',ci.event_name,'workTitle',w.title,'serviceCategory',ci.service_category,'responsibleMemberId',ci.responsible_member_id,
      'responsibleName',tm.full_name,'referenceMonth',ci.reference_month,'questionText',ci.question_text) order by pa.allocated_at)
      from sunshine_v4.payment_allocations pa join sunshine_v4.obligations o on o.id=pa.obligation_id
      join sunshine_v4.contract_items ci on ci.id=o.contract_item_id left join sunshine_v4.people bp on bp.id=ci.beneficiary_person_id
      left join sunshine_v4.works w on w.id=ci.work_id left join sunshine_v4.team_members tm on tm.id=ci.responsible_member_id
      where pa.payment_id=pay.id),'[]'::jsonb))
  into v_result from sunshine_v4.payments pay left join sunshine_v4.people pp on pp.id=pay.payer_person_id where pay.id=p_payment_id;
  if v_result is null then raise exception 'Pagamento não encontrado.'; end if;
  return v_result;
end $function$;



CREATE OR REPLACE FUNCTION public.v4_api_save_person(p_person_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare v_id uuid; v_name text:=btrim(coalesce(p_data->>'fullName',''));
begin
  perform public.v4_bind_authenticated_user();
  if v_name='' then raise exception 'Informe o nome completo.'; end if;
  if p_person_id is null then
    perform sunshine_v4.v4_assert_permission('person.create');
    v_id:=sunshine_v4.v4_create_person(v_name,nullif(btrim(p_data->>'preferredName'),''),nullif(btrim(p_data->>'phone'),''),nullif(btrim(p_data->>'email'),''));
  else
    perform sunshine_v4.v4_assert_permission('record.update');
    v_id:=p_person_id;
    if not exists(select 1 from sunshine_v4.people where id=v_id) then raise exception 'Pessoa não encontrada.'; end if;
  end if;
  update sunshine_v4.people set full_name=v_name,preferred_name=nullif(btrim(p_data->>'preferredName'),''),
    birth_date=nullif(p_data->>'birthDate','')::date,phone=nullif(btrim(p_data->>'phone'),''),email=nullif(btrim(p_data->>'email'),''),
    document_number=nullif(btrim(p_data->>'documentNumber'),''),postal_code=nullif(btrim(p_data->>'postalCode'),''),
    address_line=nullif(btrim(p_data->>'addressLine'),''),address_number=nullif(btrim(p_data->>'addressNumber'),''),
    address_complement=nullif(btrim(p_data->>'addressComplement'),''),district=nullif(btrim(p_data->>'district'),''),
    city=nullif(btrim(p_data->>'city'),''),state=nullif(btrim(p_data->>'state'),''),country=coalesce(nullif(btrim(p_data->>'country'),''),'Brasil'),
    sex=coalesce(nullif(p_data->>'sex',''),sex),status=coalesce(nullif(upper(btrim(p_data->>'status')),''),'ACTIVE'),notes=nullif(btrim(p_data->>'notes'),'')
  where id=v_id;
  perform sunshine_v4.v4_write_audit(case when p_person_id is null then 'PERSON_CREATED' else 'PERSON_UPDATED' end,'person',v_id,
    jsonb_build_object('fields',p_data-'notes','notesChanged',p_data ? 'notes'));
  return v_id;
end $function$;



CREATE OR REPLACE FUNCTION public.v4_person_record(p_person_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('person.read');
  select jsonb_build_object('id',id,'fullName',full_name,'preferredName',preferred_name,'birthDate',birth_date,
    'sex',sex,'phone',phone,'email',email,'documentNumber',document_number,'postalCode',postal_code,'addressLine',address_line,
    'addressNumber',address_number,'addressComplement',address_complement,'district',district,'city',city,'state',state,
    'country',country,'status',status,'notes',notes,'sourceOrigin',source_origin,'asaasCustomerId',asaas_customer_id)
  into v_result from sunshine_v4.people where id=p_person_id;
  if v_result is null then raise exception 'Pessoa não encontrada.'; end if;
  return v_result;
end $function$;



CREATE OR REPLACE FUNCTION public.v4_finance_dashboard(p_start date, p_end date, p_basis text DEFAULT 'RECEIPT'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare v_basis text:=upper(coalesce(nullif(btrim(p_basis),''),'RECEIPT')); v_result jsonb;
begin
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('dashboard.read');
  if p_start is null or p_end is null or p_start>p_end then raise exception 'Informe um período válido.'; end if;
  if v_basis not in ('RECEIPT','SALE','COMPETENCE','DUE','SETTLEMENT') then raise exception 'Base de data financeira inválida: %',p_basis; end if;

  with obligation_base as (
    select o.id obligation_id,o.total_cents,
      coalesce(o.beneficiary_person_id,ci.beneficiary_person_id) beneficiary_person_id,
      coalesce(bp.preferred_name,bp.full_name,'Pessoa não identificada') beneficiary_name,
      ci.service_name,coalesce(ci.service_category,'OUTRO') service_category,
      coalesce(c.sold_at,c.created_at)::date sold_date,
      coalesce(ci.reference_month,max(pay.competence_date),coalesce(c.sold_at,c.created_at)::date) competence_date,
      coalesce(o.due_date,o.expected_payment_date,coalesce(c.sold_at,c.created_at)::date) due_date,
      coalesce(sum(pa.amount_cents),0)::bigint received_total_cents,max(pay.paid_at)::date last_receipt_date,
      case when coalesce(sum(pa.amount_cents),0)>=o.total_cents then max(pay.paid_at)::date end settlement_date
    from sunshine_v4.obligations o
    join sunshine_v4.contract_items ci on ci.id=o.contract_item_id
    join sunshine_v4.contracts c on c.id=ci.contract_id
    left join sunshine_v4.people bp on bp.id=coalesce(o.beneficiary_person_id,ci.beneficiary_person_id)
    left join sunshine_v4.payment_allocations pa on pa.obligation_id=o.id
    left join sunshine_v4.payments pay on pay.id=pa.payment_id
    where coalesce(o.explicit_status,'')<>'CANCELLED' and coalesce(c.status,'CONFIRMED')<>'CANCELLED'
    group by o.id,o.total_cents,o.beneficiary_person_id,ci.beneficiary_person_id,bp.preferred_name,bp.full_name,
      ci.service_name,ci.service_category,c.sold_at,c.created_at,ci.reference_month,o.due_date,o.expected_payment_date
  ), scoped_obligations as (
    select ob.*,case v_basis when 'SALE' then ob.sold_date when 'COMPETENCE' then ob.competence_date
      when 'DUE' then ob.due_date when 'SETTLEMENT' then ob.settlement_date else ob.last_receipt_date end event_date
    from obligation_base ob
    where (v_basis='RECEIPT' and exists(select 1 from sunshine_v4.payment_allocations spa
      join sunshine_v4.payments sp on sp.id=spa.payment_id where spa.obligation_id=ob.obligation_id
      and sp.paid_at::date between p_start and p_end))
      or (v_basis='SALE' and ob.sold_date between p_start and p_end)
      or (v_basis='COMPETENCE' and ob.competence_date between p_start and p_end)
      or (v_basis='DUE' and ob.due_date between p_start and p_end)
      or (v_basis='SETTLEMENT' and ob.settlement_date between p_start and p_end)
  ), sales_rows as (
    select pa.id evidence_id,pa.obligation_id,coalesce(bp.preferred_name,bp.full_name,'Pessoa não identificada') beneficiary_name,
      ci.service_name,coalesce(ci.service_category,'OUTRO') service_category,pa.amount_cents::bigint amount_cents,pay.paid_at::date event_date
    from sunshine_v4.payment_allocations pa
    join sunshine_v4.payments pay on pay.id=pa.payment_id
    join sunshine_v4.obligations o on o.id=pa.obligation_id
    join sunshine_v4.contract_items ci on ci.id=o.contract_item_id
    left join sunshine_v4.people bp on bp.id=coalesce(o.beneficiary_person_id,ci.beneficiary_person_id)
    where coalesce(o.explicit_status,'')<>'CANCELLED' and pay.status='PAID' and v_basis='RECEIPT' and pay.paid_at::date between p_start and p_end
    union all
    select so.obligation_id,so.obligation_id,so.beneficiary_name,so.service_name,so.service_category,
      so.total_cents,so.event_date from scoped_obligations so where v_basis<>'RECEIPT'
  ), payment_rows as (
    select p.id payment_id,coalesce(pp.preferred_name,pp.full_name,p.payer_snapshot->>'name','Pagador não identificado') payer_name,
      p.paid_at,p.source,p.payment_method,p.amount_cents::bigint amount_cents,
      greatest(coalesce(r.signed_unallocated_cents,0),0)::bigint unassociated_cents
    from sunshine_v4.payments p left join sunshine_v4.people pp on pp.id=p.payer_person_id
    left join sunshine_v4.payment_reconciliation r on r.payment_id=p.id
    where p.status='PAID' and v_basis='RECEIPT' and p.paid_at::date between p_start and p_end
    union all
    select p.id,coalesce(pp.preferred_name,pp.full_name,p.payer_snapshot->>'name','Pagador não identificado'),
      p.paid_at,p.source,p.payment_method,sum(pa.amount_cents)::bigint,0::bigint
    from scoped_obligations so join sunshine_v4.payment_allocations pa on pa.obligation_id=so.obligation_id
    join sunshine_v4.payments p on p.id=pa.payment_id left join sunshine_v4.people pp on pp.id=p.payer_person_id
    where p.status='PAID' and v_basis<>'RECEIPT'
    group by p.id,pp.preferred_name,pp.full_name,p.payer_snapshot,p.paid_at,p.source,p.payment_method
  ), commission_rows as (
    select lc.legacy_v3_id commission_id,coalesce(b.full_name,r.full_name,'Sem identificação') recipient_name,
      lc.amount_cents::bigint amount_cents,upper(coalesce(lc.status,'')) commission_status,pay.paid_at occurred_at,
      coalesce(pp.preferred_name,pp.full_name,pay.payer_snapshot->>'name','Pagador não identificado') payer_name,pa.obligation_id
    from sunshine_v4.legacy_commission_entries lc
    join sunshine_v4.payment_allocations pa on pa.id=lc.payment_allocation_id
    join sunshine_v4.payments pay on pay.id=pa.payment_id
    left join sunshine_v4.team_members b on b.id=lc.beneficiary_member_id
    left join sunshine_v4.team_members r on r.id=lc.responsible_member_id
    left join sunshine_v4.people pp on pp.id=pay.payer_person_id
    where pay.status='PAID' and upper(coalesce(lc.status,'')) not in ('CANCELLED','REVERSED')
      and ((v_basis='RECEIPT' and pay.paid_at::date between p_start and p_end)
        or (v_basis<>'RECEIPT' and exists(select 1 from scoped_obligations so where so.obligation_id=pa.obligation_id)))
    union all
    select ce.id,coalesce(b.full_name,r.full_name,nullif(ce.recipient_code,''),'Sem identificação'),
      ce.amount_cents::bigint,upper(coalesce(ce.status,'')),pay.paid_at,
      coalesce(pp.preferred_name,pp.full_name,pay.payer_snapshot->>'name','Pagador não identificado'),pa.obligation_id
    from sunshine_v4.commission_entries ce
    join sunshine_v4.payment_allocations pa on pa.id=ce.allocation_id
    join sunshine_v4.payments pay on pay.id=pa.payment_id
    left join sunshine_v4.team_members b on b.id=ce.beneficiary_member_id
    left join sunshine_v4.team_members r on r.id=ce.responsible_member_id
    left join sunshine_v4.people pp on pp.id=pay.payer_person_id
    where pay.status='PAID' and upper(coalesce(ce.status,'')) not in ('CANCELLED','REVERSED')
      and ((v_basis='RECEIPT' and pay.paid_at::date between p_start and p_end)
        or (v_basis<>'RECEIPT' and exists(select 1 from scoped_obligations so where so.obligation_id=pa.obligation_id)))
  ), category_totals as (
    select service_category,sum(amount_cents)::bigint total_cents from sales_rows group by service_category
  ), commission_totals as (
    select recipient_name,sum(amount_cents)::bigint total_cents from commission_rows group by recipient_name
  )
  select jsonb_build_object(
    'startDate',p_start,'endDate',p_end,'basis',v_basis,
    'salesCents',coalesce((select sum(amount_cents) from sales_rows),0),
    'receivedCents',coalesce((select sum(amount_cents) from payment_rows),0),
    'receivableCents',coalesce((select sum(greatest(total_cents-received_total_cents,0)) from scoped_obligations),0),
    'commissionTotalCents',coalesce((select sum(amount_cents) from commission_rows),0),
    'unassociatedCents',coalesce((select sum(unassociated_cents) from payment_rows),0),
    'commissionsByPerson',coalesce((select jsonb_object_agg(recipient_name,total_cents order by recipient_name) from commission_totals),'{}'::jsonb),
    'categories',coalesce((select jsonb_object_agg(service_category,total_cents order by service_category) from category_totals),'{}'::jsonb),
    'salesEvidence',coalesce((select jsonb_agg(jsonb_build_object('evidenceId',evidence_id,'obligationId',obligation_id,
      'personName',beneficiary_name,'serviceName',service_name,'category',service_category,'amountCents',amount_cents,
      'eventDate',event_date) order by event_date desc,beneficiary_name) from sales_rows),'[]'::jsonb),
    'paymentEvidence',coalesce((select jsonb_agg(jsonb_build_object('paymentId',payment_id,'payerName',payer_name,
      'paidAt',paid_at,'source',source,'paymentMethod',payment_method,'amountCents',amount_cents,
      'unassociatedCents',unassociated_cents) order by paid_at desc,payer_name) from payment_rows),'[]'::jsonb),
    'receivableEvidence',coalesce((select jsonb_agg(jsonb_build_object('obligationId',obligation_id,
      'personName',beneficiary_name,'serviceName',service_name,'totalCents',total_cents,
      'receivedCents',received_total_cents,'pendingCents',greatest(total_cents-received_total_cents,0),
      'dueDate',due_date) order by due_date nulls last,beneficiary_name)
      from scoped_obligations where total_cents>received_total_cents),'[]'::jsonb),
    'commissionEvidence',coalesce((select jsonb_agg(jsonb_build_object('commissionId',commission_id,
      'recipientName',recipient_name,'amountCents',amount_cents,'status',commission_status,
      'occurredAt',occurred_at,'payerName',payer_name) order by occurred_at desc nulls last,recipient_name)
      from commission_rows),'[]'::jsonb)
  ) into v_result;
  return v_result;
end
$function$;



CREATE OR REPLACE FUNCTION sunshine_v4.v4_rebuild_commissions_for_allocation_before_october(p_allocation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'sunshine_v4', 'pg_temp'
AS $function$
declare
 v_payment_status text; v_allocation_amount bigint; v_contract_id uuid; v_sale_source text;
 v_responsible uuid; v_sold_at date; v_category text; v_service_metadata jsonb; v_lourdes uuid;
begin
 select p.status,a.amount_cents,c.id,c.source,i.responsible_member_id,coalesce(c.sold_at,c.created_at)::date,i.service_category,coalesce(s.metadata,'{}'::jsonb)
 into v_payment_status,v_allocation_amount,v_contract_id,v_sale_source,v_responsible,v_sold_at,v_category,v_service_metadata
 from payment_allocations a
 join payments p on p.id=a.payment_id
 join obligations o on o.id=a.obligation_id
 join contract_items i on i.id=o.contract_item_id
 join contracts c on c.id=i.contract_id
 left join services s on s.id=i.service_id
 where a.id=p_allocation_id;
 if v_contract_id is null then return; end if;
 if v_sale_source='IMPORT' then return; end if;
 delete from commission_entries where allocation_id=p_allocation_id;
 if v_payment_status<>'PAID' or v_responsible is null then return; end if;
 if v_service_metadata->>'commission_mode'='LOURDES_100' then
   select id into v_lourdes from team_members where lower(full_name)='lourdes' and active=true limit 1;
   if v_lourdes is null then raise exception 'Lourdes não encontrada na equipe ativa'; end if;
   insert into commission_entries(allocation_id,commission_rule_id,recipient_code,base_cents,amount_cents,status,responsible_member_id,beneficiary_member_id,percentage,source,notes,calculation_source)
   values(p_allocation_id,null,v_lourdes::text,v_allocation_amount,v_allocation_amount,'DUE',v_responsible,v_lourdes,100.00,'AUTO','Regra especial: Primeira Mensalidade LU — 100% Lourdes.','RULE');
   return;
 end if;
 insert into commission_entries(allocation_id,commission_rule_id,recipient_code,base_cents,amount_cents,status,responsible_member_id,beneficiary_member_id,percentage,source,calculation_source)
 select p_allocation_id,null,r.beneficiary_member_id::text,v_allocation_amount,round((v_allocation_amount*r.percentage/100.0))::bigint,'DUE',v_responsible,r.beneficiary_member_id,r.percentage,'AUTO','RULE'
 from legacy_commission_rules r
 where r.responsible_member_id=v_responsible and r.active=true
   and r.valid_from<=coalesce(v_sold_at,current_date)
   and (r.valid_until is null or r.valid_until>=coalesce(v_sold_at,current_date))
   and (r.service_category is null or r.service_category=v_category);
end $function$;



CREATE OR REPLACE FUNCTION sunshine_v4.v4_generate_responsible_commissions_before_october(p_allocation_id uuid, p_status text DEFAULT 'DUE'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'sunshine_v4', 'pg_temp'
AS $function$
declare
  v_amount bigint;
  v_responsible uuid;
  v_payment_date timestamptz;
  v_rule_count integer;
  v_basis_sum integer;
begin
  select pa.amount_cents,ci.responsible_member_id,pay.paid_at
    into v_amount,v_responsible,v_payment_date
  from sunshine_v4.payment_allocations pa
  join sunshine_v4.obligations o on o.id=pa.obligation_id
  join sunshine_v4.contract_items ci on ci.id=o.contract_item_id
  join sunshine_v4.payments pay on pay.id=pa.payment_id
  where pa.id=p_allocation_id;

  if v_amount is null or v_responsible is null then return; end if;
  if exists(
    select 1 from sunshine_v4.legacy_commission_entries lc
    where lc.payment_allocation_id=p_allocation_id
      and upper(coalesce(lc.status,''))<>'CANCELLED'
  ) or exists(
    select 1 from sunshine_v4.commission_entries ce
    where ce.allocation_id=p_allocation_id
      and upper(coalesce(ce.status,''))<>'CANCELLED'
  ) then return; end if;

  select count(*),coalesce(sum(basis_points),0)
    into v_rule_count,v_basis_sum
  from sunshine_v4.responsible_distribution_rules
  where responsible_member_id=v_responsible and active;

  if v_rule_count<>3 or v_basis_sum<>10000 then
    raise exception 'Regra 80/10/10 incompleta para o responsável selecionado.';
  end if;

  insert into sunshine_v4.commission_entries(
    allocation_id,commission_rule_id,recipient_code,base_cents,amount_cents,
    status,responsible_member_id,beneficiary_member_id,percentage,source,
    notes,calculation_source,paid_at
  )
  with calculated as (
    select r.*,
      case when r.beneficiary_member_id=v_responsible then null
           else round(v_amount*r.basis_points/10000.0)::bigint end calculated_cents
    from sunshine_v4.responsible_distribution_rules r
    where r.responsible_member_id=v_responsible and r.active
  ), final_values as (
    select c.*,
      case when c.beneficiary_member_id=v_responsible
           then v_amount-coalesce(sum(c.calculated_cents) filter (
             where c.beneficiary_member_id<>v_responsible
           ) over (),0)
           else c.calculated_cents end amount_cents
    from calculated c
  )
  select p_allocation_id,null,f.beneficiary_member_id::text,v_amount,f.amount_cents,
    case when upper(coalesce(p_status,'DUE'))='PAID' then 'PAID' else 'DUE' end,
    v_responsible,f.beneficiary_member_id,f.basis_points/100.0,
    'AUTO_RESPONSIBLE','Distribuição automática 80/10/10 pelo responsável',
    'RESPONSIBLE_DISTRIBUTION',
    case when upper(coalesce(p_status,'DUE'))='PAID' then v_payment_date end
  from final_values f;
end
$function$;



CREATE OR REPLACE FUNCTION sunshine_v4.v4_recalculate_item_commissions_before_october(p_item_id uuid, p_responsible_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'sunshine_v4', 'public', 'pg_temp'
AS $function$
begin
  update sunshine_v4.legacy_commission_entries lc set responsible_member_id=p_responsible_id,
    percentage=case when lc.beneficiary_member_id=p_responsible_id then 80 else 10 end,
    amount_cents=case when lc.beneficiary_member_id=p_responsible_id then pa.amount_cents-2*round(pa.amount_cents*.10)::bigint else round(pa.amount_cents*.10)::bigint end
  from sunshine_v4.payment_allocations pa join sunshine_v4.obligations o on o.id=pa.obligation_id
  where lc.payment_allocation_id=pa.id and o.contract_item_id=p_item_id and upper(coalesce(lc.status,''))<>'CANCELLED';
  update sunshine_v4.commission_entries ce set responsible_member_id=p_responsible_id,
    percentage=case when ce.beneficiary_member_id=p_responsible_id then 80 else 10 end,
    amount_cents=case when ce.beneficiary_member_id=p_responsible_id then pa.amount_cents-2*round(pa.amount_cents*.10)::bigint else round(pa.amount_cents*.10)::bigint end
  from sunshine_v4.payment_allocations pa join sunshine_v4.obligations o on o.id=pa.obligation_id
  where ce.allocation_id=pa.id and o.contract_item_id=p_item_id and upper(coalesce(ce.status,''))<>'CANCELLED';
end $function$;



-- Source for the additive migration. Called only from guarded APIs and allocation triggers.
create function private.sunshine_uses_october_rule(p_allocation uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select i.commission_override is not null or
   (coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo')::date>=date '2026-10-01'
 from sunshine_v4.payment_allocations a join sunshine_v4.obligations o on o.id=a.obligation_id
 join sunshine_v4.contract_items i on i.id=o.contract_item_id join sunshine_v4.contracts c on c.id=i.contract_id where a.id=p_allocation;
$$;

create function private.sunshine_item_split(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_override jsonb;v_responsible uuid;v_shares jsonb;v_cost integer;v_sum integer;
begin
 select commission_override,responsible_member_id into v_override,v_responsible from sunshine_v4.contract_items where id=p_item;
 if v_override is null then
   select jsonb_agg(jsonb_build_object('memberId',t.id,'basisPoints',case when t.id=v_responsible then 4900 else 1050 end) order by t.id)
    into v_shares from sunshine_v4.team_members t where t.active and lower(t.full_name) in ('yasmin','lourdes','rosely','roseli');
   v_cost:=3000;
 else v_shares:=v_override->'shares';v_cost:=(v_override->>'costBp')::integer;
 end if;
 if jsonb_typeof(v_shares) is distinct from 'array' or jsonb_array_length(v_shares)<>3 or v_cost is null or v_cost not between 0 and 10000 then
   raise exception 'A divisão precisa informar a reserva e as três integrantes.';
 end if;
 select sum((x->>'basisPoints')::integer) into v_sum from jsonb_array_elements(v_shares)x;
 if v_sum+v_cost<>10000 or (select count(distinct x->>'memberId') from jsonb_array_elements(v_shares)x)<>3
    or not exists(select 1 from jsonb_array_elements(v_shares)x where (x->>'memberId')::uuid=v_responsible)
    or exists(select 1 from jsonb_array_elements(v_shares)x where coalesce((x->>'basisPoints')::integer,-1) not between 0 and 10000
       or not exists(select 1 from sunshine_v4.team_members t where t.id=(x->>'memberId')::uuid and t.active)) then
   raise exception 'A reserva e as comissões precisam somar 100%%, sem repetir integrantes.';
 end if;
 return jsonb_build_object('costBp',v_cost,'shares',v_shares);
end $$;

create function private.sunshine_build_october_commissions(p_allocation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_item uuid;v_amount bigint;v_responsible uuid;v_split jsonb;v_reserve bigint;v_rest bigint;v_share jsonb;v_cents bigint;v_status text;
begin
 select i.id,a.amount_cents,i.responsible_member_id,p.status into v_item,v_amount,v_responsible,v_status
 from sunshine_v4.payment_allocations a join sunshine_v4.obligations o on o.id=a.obligation_id
 join sunshine_v4.contract_items i on i.id=o.contract_item_id join sunshine_v4.payments p on p.id=a.payment_id where a.id=p_allocation;
 if v_item is null or v_status<>'PAID' then return; end if;
 if exists(select 1 from sunshine_v4.commission_effective_status where allocation_id=p_allocation and paid_cents>0) then
   raise exception 'Há comissão paga: regularize o pagamento de comissão antes de alterar a base financeira.';
 end if;
 if exists(select 1 from sunshine_v4.legacy_commission_entries where payment_allocation_id=p_allocation and status<>'CANCELLED') then
   raise exception 'Comissão histórica importada: preserve o histórico; corrija por um lançamento complementar.';
 end if;
 v_split:=private.sunshine_item_split(v_item);
 v_reserve:=round(v_amount*(v_split->>'costBp')::integer/10000.0)::bigint;
 v_rest:=v_amount-v_reserve;
 delete from sunshine_v4.commission_entries where allocation_id=p_allocation;
 for v_share in select value from jsonb_array_elements(v_split->'shares') where (value->>'memberId')::uuid<>v_responsible loop
   v_cents:=round(v_amount*(v_share->>'basisPoints')::integer/10000.0)::bigint;
   v_cents:=least(v_cents,v_rest);v_rest:=v_rest-v_cents;
   insert into sunshine_v4.commission_entries(allocation_id,recipient_code,base_cents,amount_cents,status,responsible_member_id,beneficiary_member_id,percentage,source,calculation_source,notes)
   values(p_allocation,v_share->>'memberId',v_amount-v_reserve,v_cents,'DUE',v_responsible,(v_share->>'memberId')::uuid,
     (v_share->>'basisPoints')::integer/100.0,'AUTO_RESPONSIBLE','OCTOBER_2026','Percentual sobre o bruto; reserva separada, sem gerar despesa paga.');
 end loop;
 insert into sunshine_v4.commission_entries(allocation_id,recipient_code,base_cents,amount_cents,status,responsible_member_id,beneficiary_member_id,percentage,source,calculation_source,notes)
 select p_allocation,v_responsible::text,v_amount-v_reserve,v_rest,'DUE',v_responsible,v_responsible,(x->>'basisPoints')::integer/100.0,
   'AUTO_RESPONSIBLE','OCTOBER_2026','Responsável recebe o resíduo dos centavos para fechar a divisão.' from jsonb_array_elements(v_split->'shares')x where (x->>'memberId')::uuid=v_responsible;
end $$;

create or replace function sunshine_v4.v4_rebuild_commissions_for_allocation(p_allocation_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from sunshine_v4.commission_effective_status where allocation_id=p_allocation_id and paid_cents>0) then
   raise exception 'Há comissão paga; a base financeira está protegida.';
 end if;
 if private.sunshine_uses_october_rule(p_allocation_id) then perform private.sunshine_build_october_commissions(p_allocation_id);
 else perform sunshine_v4.v4_rebuild_commissions_for_allocation_before_october(p_allocation_id);end if;
end $$;

create or replace function sunshine_v4.v4_generate_responsible_commissions(p_allocation_id uuid,p_status text default 'DUE') returns void
language plpgsql security definer set search_path='' as $$
begin
 if private.sunshine_uses_october_rule(p_allocation_id) then
   if not exists(select 1 from sunshine_v4.commission_entries where allocation_id=p_allocation_id and status<>'CANCELLED') then
     perform private.sunshine_build_october_commissions(p_allocation_id);end if;
 else perform sunshine_v4.v4_generate_responsible_commissions_before_october(p_allocation_id,p_status);end if;
end $$;

create or replace function sunshine_v4.v4_recalculate_item_commissions(p_item_id uuid,p_responsible_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_allocation uuid;
begin
 if exists(select 1 from sunshine_v4.commission_effective_status s join sunshine_v4.payment_allocations a on a.id=s.allocation_id
  join sunshine_v4.obligations o on o.id=a.obligation_id where o.contract_item_id=p_item_id and s.paid_cents>0) then
  raise exception 'Há comissão paga; a base financeira está protegida.';
 end if;
 for v_allocation in select a.id from sunshine_v4.payment_allocations a join sunshine_v4.obligations o on o.id=a.obligation_id where o.contract_item_id=p_item_id loop
  if private.sunshine_uses_october_rule(v_allocation) then perform private.sunshine_build_october_commissions(v_allocation);
  else perform sunshine_v4.v4_recalculate_item_commissions_before_october(p_item_id,p_responsible_id);exit;end if;
 end loop;
end $$;

create function public.v4_api_edit_financial_item(p_item_id uuid,p_data jsonb,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_old sunshine_v4.contract_items%rowtype;v_new sunshine_v4.contract_items%rowtype;v_obligation uuid;v_alloc bigint;v_financial boolean;
begin
 perform private.sunshine_finance_guard('record.update');
 if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Informe a justificativa da correção.';end if;
 select * into v_old from sunshine_v4.contract_items where id=p_item_id for update;
 if not found then raise exception 'Lançamento não encontrado.';end if;
 select id into v_obligation from sunshine_v4.obligations where contract_item_id=p_item_id for update;
 perform 1 from sunshine_v4.payments p where exists(select 1 from sunshine_v4.payment_allocations a where a.payment_id=p.id and a.obligation_id=v_obligation) order by p.id for update;
 select coalesce(sum(amount_cents),0) into v_alloc from sunshine_v4.payment_allocations where obligation_id=v_obligation;
 if (p_data->>'amountCents')::bigint<=0 or (p_data->>'amountCents')::bigint<v_alloc then raise exception 'O total não pode ser menor que o valor já associado.';end if;
 if not exists(select 1 from sunshine_v4.people where id=(p_data->>'beneficiaryPersonId')::uuid)
 or not exists(select 1 from sunshine_v4.team_members where id=(p_data->>'responsibleMemberId')::uuid and active) then raise exception 'Selecione beneficiário e responsável válidos.';end if;
 if nullif(p_data->>'workId','') is not null and not exists(select 1 from sunshine_v4.works where id=(p_data->>'workId')::uuid) then raise exception 'Trabalho não encontrado.';end if;
 v_financial:=v_old.responsible_member_id is distinct from (p_data->>'responsibleMemberId')::uuid
  or v_old.commission_override is distinct from nullif(p_data->'commissionOverride','null');
 update sunshine_v4.contract_items set beneficiary_person_id=(p_data->>'beneficiaryPersonId')::uuid,
  amount_cents=(p_data->>'amountCents')::bigint,work_id=nullif(p_data->>'workId','')::uuid,
  service_name=coalesce(nullif(btrim(p_data->>'serviceName'),''),service_name),event_name=nullif(btrim(p_data->>'eventName'),''),
  service_category=p_data->>'serviceCategory',responsible_member_id=(p_data->>'responsibleMemberId')::uuid,
  reference_month=nullif(p_data->>'referenceMonth','')::date,question_text=nullif(btrim(p_data->>'questionText'),''),
  commission_override=nullif(p_data->'commissionOverride','null') where id=p_item_id returning * into v_new;
 if v_new.commission_override is not null then perform private.sunshine_item_split(p_item_id);end if;
 update sunshine_v4.obligations set beneficiary_person_id=v_new.beneficiary_person_id,total_cents=v_new.amount_cents where id=v_obligation;
 if v_new.work_id is null then update sunshine_v4.work_registrations set status='CANCELLED',updated_at=now() where contract_item_id=p_item_id;
 elsif exists(select 1 from sunshine_v4.work_registrations where contract_item_id=p_item_id) then
  update sunshine_v4.work_registrations set work_id=v_new.work_id,beneficiary_person_id=v_new.beneficiary_person_id,
   participant_name=(select full_name from sunshine_v4.people where id=v_new.beneficiary_person_id),status='ACTIVE',updated_at=now() where contract_item_id=p_item_id;
 else
  perform sunshine_v4.v4_assert_permission('work.registration.create');
  insert into sunshine_v4.work_registrations(work_id,beneficiary_person_id,contract_item_id,participant_name,participant_birth_date,status)
   select v_new.work_id,v_new.beneficiary_person_id,p_item_id,full_name,birth_date,'ACTIVE' from sunshine_v4.people where id=v_new.beneficiary_person_id;
 end if;
 if v_financial then perform sunshine_v4.v4_recalculate_item_commissions(p_item_id,v_new.responsible_member_id);end if;
 perform sunshine_v4.v4_write_audit('FINANCIAL_ITEM_CORRECTED','contract_item',p_item_id,jsonb_build_object('before',to_jsonb(v_old),'after',to_jsonb(v_new),'reason',p_reason));
 return to_jsonb(v_new);
end $$;

-- Guard the older API as well, preserving compatibility with currently open tabs.
create or replace function public.v4_api_update_contract_item(p_item_id uuid,p_event_name text,p_service_name text,p_service_category text,p_responsible_member_id uuid,p_reference_month date default null,p_question_text text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v sunshine_v4.contract_items%rowtype;
begin
 perform private.sunshine_finance_guard('record.update');
 select * into v from sunshine_v4.contract_items where id=p_item_id;
 return public.v4_api_edit_financial_item(p_item_id,jsonb_build_object('beneficiaryPersonId',v.beneficiary_person_id,'amountCents',v.amount_cents,
  'workId',v.work_id,'commissionOverride',v.commission_override,'eventName',p_event_name,'serviceName',p_service_name,'serviceCategory',p_service_category,
  'responsibleMemberId',p_responsible_member_id,'referenceMonth',p_reference_month,'questionText',p_question_text),'Correção pelo editor de lançamento');
end $$;

create function public.v4_api_edit_receipt(p_payment_id uuid,p_data jsonb,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v sunshine_v4.payments%rowtype;v_total bigint;
begin
 perform private.sunshine_finance_guard('record.update');
 if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Informe uma justificativa.';end if;
 select * into v from sunshine_v4.payments where id=p_payment_id for update;
 if not found or v.status<>'PAID' then raise exception 'Pagamento ativo não encontrado.';end if;
 if v.source='ASAAS' then raise exception 'Valor e data do Asaas vêm do provedor; corrija apenas a associação.';end if;
 select coalesce(sum(amount_cents),0) into v_total from sunshine_v4.payment_allocations where payment_id=p_payment_id;
 if (p_data->>'amountCents')::bigint<=0 or (p_data->>'amountCents')::bigint<v_total then raise exception 'O valor recebido não pode ser menor que o já associado.';end if;
 update sunshine_v4.payments set amount_cents=(p_data->>'amountCents')::bigint,
  net_cents=(p_data->>'amountCents')::bigint-fees_cents,paid_at=(p_data->>'paidAt')::timestamptz,
  payment_method=p_data->>'paymentMethod',payer_person_id=(p_data->>'payerPersonId')::uuid,
  payer_snapshot=payer_snapshot||jsonb_build_object('name',(select full_name from sunshine_v4.people where id=(p_data->>'payerPersonId')::uuid)),
  notes=nullif(btrim(p_data->>'notes'),'') where id=p_payment_id;
 perform sunshine_v4.v4_write_audit('RECEIPT_CORRECTED','payment',p_payment_id,jsonb_build_object('before',to_jsonb(v),'fields',p_data,'reason',p_reason));
end $$;

create function public.v4_api_void_financial_record(p_payment_id uuid,p_allocation_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_payment sunshine_v4.payments%rowtype;v_ids uuid[];v_obligations uuid[];v_snapshot jsonb;v_id uuid;
begin
 perform private.sunshine_finance_guard('record.update');
 if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Informe uma justificativa para excluir.';end if;
 select * into v_payment from sunshine_v4.payments where id=p_payment_id for update;
 if not found or v_payment.status<>'PAID' then raise exception 'Pagamento ativo não encontrado.';end if;
 if p_allocation_id is null and v_payment.source='ASAAS' then raise exception 'O comprovante Asaas é preservado. Remova a associação ou regularize a fila de pendências.';end if;
 select array_agg(id),array_agg(distinct obligation_id) into v_ids,v_obligations from sunshine_v4.payment_allocations
 where payment_id=p_payment_id and (p_allocation_id is null or id=p_allocation_id);
 if p_allocation_id is not null and v_ids is null then raise exception 'Associação não encontrada.';end if;
 perform 1 from sunshine_v4.obligations where id=any(v_obligations) order by id for update;
 if exists(select 1 from sunshine_v4.commission_effective_status where allocation_id=any(v_ids) and paid_cents>0) then
  raise exception 'Há comissão paga: regularize-a antes de excluir a associação.';end if;
 select jsonb_build_object('payment',to_jsonb(v_payment),
  'allocations',coalesce((select jsonb_agg(to_jsonb(a)) from sunshine_v4.payment_allocations a where id=any(v_ids)),'[]'),
  'obligations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'status',o.explicit_status)) from sunshine_v4.obligations o where id=any(v_obligations)),'[]'),
  'registrations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'status',r.status)) from sunshine_v4.work_registrations r join sunshine_v4.obligations o on o.contract_item_id=r.contract_item_id where o.id=any(v_obligations)),'[]'),
  'commissions',coalesce((select jsonb_agg(to_jsonb(c)) from sunshine_v4.commission_entries c where allocation_id=any(v_ids)),'[]'),
  'legacyCommissions',coalesce((select jsonb_agg(to_jsonb(c)) from sunshine_v4.legacy_commission_entries c where payment_allocation_id=any(v_ids)),'[]')) into v_snapshot;
 insert into sunshine_v4.financial_voids(payment_id,allocation_id,reason,snapshot,created_by) values(p_payment_id,p_allocation_id,p_reason,v_snapshot,auth.uid()) returning id into v_id;
 delete from sunshine_v4.commission_entries where allocation_id=any(v_ids);
 delete from sunshine_v4.legacy_commission_entries where payment_allocation_id=any(v_ids);
 delete from sunshine_v4.payment_allocations where id=any(v_ids);
 update sunshine_v4.obligations o set explicit_status='CANCELLED' where id=any(v_obligations)
  and not exists(select 1 from sunshine_v4.payment_allocations a where a.obligation_id=o.id);
 update sunshine_v4.work_registrations r set status='CANCELLED',updated_at=now() where exists(
  select 1 from sunshine_v4.obligations o where o.contract_item_id=r.contract_item_id and o.id=any(v_obligations) and o.explicit_status='CANCELLED');
 if p_allocation_id is null then update sunshine_v4.payments set status='CANCELLED' where id=p_payment_id;end if;
 perform sunshine_v4.v4_write_audit('FINANCIAL_RECORD_VOIDED','payment',p_payment_id,jsonb_build_object('voidId',v_id,'allocationId',p_allocation_id,'reason',p_reason));
 return v_id;
end $$;

create function public.v4_api_restore_financial_record(p_void_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v sunshine_v4.financial_voids%rowtype;v_a jsonb;v_available bigint;v_required bigint;v_payment sunshine_v4.payments%rowtype;
begin
 perform private.sunshine_finance_guard('record.update');
 if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Informe uma justificativa para restaurar.';end if;
 select * into v from sunshine_v4.financial_voids where id=p_void_id for update;
 if not found or v.restored_at is not null then raise exception 'Exclusão ativa não encontrada.';end if;
 select * into v_payment from sunshine_v4.payments where id=v.payment_id for update;
 select v_payment.amount_cents-coalesce(sum(amount_cents),0) into v_available from sunshine_v4.payment_allocations where payment_id=v.payment_id;
 select coalesce(sum((x->>'amount_cents')::bigint),0) into v_required from jsonb_array_elements(v.snapshot->'allocations')x;
 if v_required>v_available then raise exception 'O saldo já foi reassociado. Remova a nova associação antes de restaurar.';end if;
 if v.allocation_id is null then update sunshine_v4.payments set status=v.snapshot->'payment'->>'status' where id=v.payment_id;end if;
 for v_a in select value from jsonb_array_elements(v.snapshot->'obligations') loop
  perform 1 from sunshine_v4.obligations where id=(v_a->>'id')::uuid for update;
  if (select coalesce(sum(amount_cents),0) from sunshine_v4.payment_allocations where obligation_id=(v_a->>'id')::uuid)
   + (select coalesce(sum((x->>'amount_cents')::bigint),0) from jsonb_array_elements(v.snapshot->'allocations')x where x->>'obligation_id'=v_a->>'id')
    > (select total_cents from sunshine_v4.obligations where id=(v_a->>'id')::uuid) then raise exception 'A restauração excede o valor do serviço.';end if;
  update sunshine_v4.obligations set explicit_status=v_a->>'status' where id=(v_a->>'id')::uuid;
 end loop;
 for v_a in select value from jsonb_array_elements(v.snapshot->'allocations') loop
  insert into sunshine_v4.payment_allocations select (jsonb_populate_record(null::sunshine_v4.payment_allocations,v_a)).*;
  delete from sunshine_v4.commission_entries where allocation_id=(v_a->>'id')::uuid;
 end loop;
 insert into sunshine_v4.commission_entries select * from jsonb_populate_recordset(null::sunshine_v4.commission_entries,v.snapshot->'commissions');
 insert into sunshine_v4.legacy_commission_entries select * from jsonb_populate_recordset(null::sunshine_v4.legacy_commission_entries,v.snapshot->'legacyCommissions');
 for v_a in select value from jsonb_array_elements(v.snapshot->'registrations') loop
  update sunshine_v4.work_registrations set status=v_a->>'status',updated_at=now() where id=(v_a->>'id')::uuid;
 end loop;
 update sunshine_v4.financial_voids set restored_at=now() where id=p_void_id;
 perform sunshine_v4.v4_write_audit('FINANCIAL_RECORD_RESTORED','payment',v.payment_id,jsonb_build_object('voidId',p_void_id,'reason',p_reason));
end $$;

create function public.v4_mail_configuration() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v jsonb;
begin
 perform private.sunshine_finance_guard('dashboard.read');
 select jsonb_build_object('configured',true,'sender',sender) into v from private.sunshine_mail_settings;
 return coalesce(v,jsonb_build_object('configured',false));
end $$;
create function public.v4_configure_accountant_mail(p_sender text,p_api_key text) returns void
language plpgsql security definer set search_path='' as $$
declare v_secret uuid;
begin
 perform private.sunshine_finance_guard('integration.configure');
 if p_sender !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_api_key !~ '^re_[A-Za-z0-9_-]{10,}$' then raise exception 'Informe remetente verificado no Resend e uma chave válida.';end if;
 select secret_id into v_secret from private.sunshine_mail_settings for update;
 if v_secret is null then v_secret:=vault.create_secret(p_api_key,'sunshine_accountant_resend','Envio de fechamento da Sunshine');
 else perform vault.update_secret(v_secret,p_api_key);end if;
 insert into private.sunshine_mail_settings(singleton,sender,secret_id,updated_by) values(true,p_sender,v_secret,auth.uid())
 on conflict(singleton) do update set sender=excluded.sender,secret_id=excluded.secret_id,updated_by=excluded.updated_by,updated_at=now();
 perform sunshine_v4.v4_write_audit('ACCOUNTANT_MAIL_CONFIGURED','integration',null,jsonb_build_object('sender',p_sender));
end $$;

create function public.v4_prepare_accountant_report(p_start date,p_end date,p_documents_url text,p_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_finance jsonb;v_id uuid;v_period text;v_body text;v_subject text;v_report sunshine_v4.accountant_reports%rowtype;
begin
 perform private.sunshine_finance_guard('record.update');
 if p_documents_url !~ '^https://drive\.google\.com/' then raise exception 'Informe o link HTTPS do Google Drive com as notas do período.';end if;
 if length(coalesce(p_key,''))<10 then raise exception 'Referência de envio inválida.';end if;
 perform pg_advisory_xact_lock(hashtextextended('accountant-report:'||p_key,0));
 select * into v_report from sunshine_v4.accountant_reports where idempotency_key=p_key;
 if found then
  if v_report.start_date<>p_start or v_report.end_date<>p_end or v_report.documents_url<>p_documents_url then raise exception 'Use uma nova referência para outro fechamento.';end if;
  return to_jsonb(v_report);end if;
 v_finance:=public.v4_finance_management(p_start,p_end,extract(year from p_end)::integer);
 v_period:=to_char(p_start,'MM/YYYY');
 if date_trunc('month',p_start)<>date_trunc('month',p_end) then v_period:=to_char(p_start,'DD/MM/YYYY')||' a '||to_char(p_end,'DD/MM/YYYY');end if;
 v_subject:='Fechamento Sunshine — '||v_period;
 v_body:='Boa tarde,'||E'\n\n'||'Segue fechamento do período '||v_period||E'\n'||to_char(p_start,'DD/MM/YYYY')||' a '||to_char(p_end,'DD/MM/YYYY')||E'\n\n'||
  'RENDIMENTOS: R$ '||replace(to_char((v_finance->>'revenueCents')::numeric/100,'FM999999999990.00'),'.',',')||E'\n'||
  'DESPESAS: R$ '||replace(to_char((v_finance->>'costsCents')::numeric/100,'FM999999999990.00'),'.',',')||E'\n'||
  'LUCRO: R$ '||replace(to_char((v_finance->>'profitCents')::numeric/100,'FM999999999990.00'),'.',',')||E'\n\n'||
  'Segue link do Google Drive com as notas fiscais do período: '||p_documents_url||E'\n\nAtenciosamente,\nYasmin Menezes\nSunshine Oráculos';
 insert into sunshine_v4.accountant_reports(idempotency_key,start_date,end_date,subject,body,documents_url,created_by)
 values(p_key,p_start,p_end,v_subject,v_body,p_documents_url,auth.uid()) returning * into v_report;
 perform sunshine_v4.v4_write_audit('ACCOUNTANT_REPORT_PREPARED','accountant_report',v_report.id,jsonb_build_object('period',v_period));
 return to_jsonb(v_report);
end $$;

-- Only the server can claim/send a draft and access the encrypted provider credential.
create function public.v4_claim_accountant_report(p_report_id uuid,p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v sunshine_v4.accountant_reports%rowtype;v_sender text;v_key text;
begin
 select * into v from sunshine_v4.accountant_reports where id=p_report_id for update;
 if not found or v.created_by<>p_user_id then raise exception 'Fechamento não encontrado para esta usuária.';end if;
 if v.status='SENT' then return jsonb_build_object('alreadySent',true,'providerId',v.provider_id);end if;
 if v.status='SENDING' then raise exception 'Este fechamento já está em envio. Confira o resultado antes de repetir.';end if;
 select s.sender,d.decrypted_secret into v_sender,v_key from private.sunshine_mail_settings s join vault.decrypted_secrets d on d.id=s.secret_id;
 if v_key is null then raise exception 'Configure o Resend em Faturamento ou utilize Abrir Gmail.';end if;
 update sunshine_v4.accountant_reports set status='SENDING',error=null where id=p_report_id;
 return jsonb_build_object('id',v.id,'from',v_sender,'to',v.recipient,'subject',v.subject,'text',v.body,'apiKey',v_key);
end $$;
create function public.v4_finish_accountant_report(p_report_id uuid,p_provider_id text,p_error text) returns void
language plpgsql security definer set search_path='' as $$
begin
 update sunshine_v4.accountant_reports set status=case when p_provider_id is not null then 'SENT' else 'ERROR' end,
  provider_id=p_provider_id,error=left(p_error,500) where id=p_report_id and status='SENDING';
end $$;

CREATE OR REPLACE FUNCTION public.v4_recent_payments(p_start date, p_end date, p_limit integer DEFAULT 50)
 RETURNS TABLE(payment_id uuid, payer_person_id uuid, payer_name text, amount_cents bigint, allocated_cents bigint, signed_unallocated_cents bigint, paid_at timestamp with time zone, source text, payment_method text, payer_resolution_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
begin
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('payment.read');
  return query
  select p.id,p.payer_person_id,coalesce(pp.preferred_name,pp.full_name,p.payer_snapshot->>'name','Pagador não identificado'),
    p.amount_cents,r.allocated_cents,r.signed_unallocated_cents,p.paid_at,p.source,p.payment_method,p.payer_resolution_status
  from sunshine_v4.payments p join sunshine_v4.payment_reconciliation r on r.payment_id=p.id
  left join sunshine_v4.people pp on pp.id=p.payer_person_id
  where p.status='PAID' and p.paid_at::date between p_start and p_end
    and not exists(select 1 from sunshine_v4.payment_queue_dismissals d where d.entity_kind='EXISTING' and d.entity_id=p.id)
  order by p.paid_at desc limit least(greatest(coalesce(p_limit,50),1),200);
end $function$;



insert into sunshine_v4.permissions(code) values('integration.configure') on conflict do nothing;
insert into sunshine_v4.role_permissions(role_code,permission_code) values('ADMIN','integration.configure') on conflict do nothing;
-- Private/internal functions have no callable client surface. Exposed wrappers use explicit permissions.
DO $acl$
declare f record;
begin
 for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and p.proname like 'sunshine_%')
  or (n.nspname='sunshine_v4' and p.proname like '%_before_october')
  or (n.nspname='public' and p.proname in ('v4_api_save_expense','v4_api_set_expense_status','v4_api_save_finance_goal','v4_cash_availability',
   'v4_finance_management','v4_birthdays','v4_entry_receipt','v4_api_edit_financial_item','v4_api_edit_receipt','v4_api_void_financial_record',
   'v4_api_restore_financial_record','v4_mail_configuration','v4_configure_accountant_mail','v4_prepare_accountant_report',
   'v4_claim_accountant_report','v4_finish_accountant_report')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.nspname='public' then
   if f.proname in ('v4_claim_accountant_report','v4_finish_accountant_report') then
    execute format('grant execute on function %s to service_role',f.signature);
   else execute format('grant execute on function %s to authenticated,service_role',f.signature);end if;
  end if;
 end loop;
end $acl$;
notify pgrst,'reload schema';
