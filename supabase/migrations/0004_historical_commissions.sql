-- Sunshine 2026 legacy commission protection
-- Historical rows imported from LANÇAMENTO DIÁRIO must preserve spreadsheet values exactly.
-- Current commission rules apply only to new operational entries created in the application.

alter table public.commission_entries
  add column if not exists calculation_source text not null default 'RULE';

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid='public.commission_entries'::regclass
      and conname='commission_entries_status_check'
  ) then
    alter table public.commission_entries drop constraint commission_entries_status_check;
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid='public.commission_entries'::regclass
      and conname='commission_entries_calculation_source_check'
  ) then
    alter table public.commission_entries drop constraint commission_entries_calculation_source_check;
  end if;
end $$;

alter table public.commission_entries
  add constraint commission_entries_status_check
  check (status in ('DUE','PAID','CANCELLED','HISTORICAL'));

alter table public.commission_entries
  add constraint commission_entries_calculation_source_check
  check (calculation_source in ('RULE','IMPORT'));

update public.commission_entries ce
set calculation_source='IMPORT',
    status='HISTORICAL',
    rule_id=null
from public.payment_allocations pa
join public.sales s on s.id=pa.sale_id
where ce.payment_allocation_id=pa.id
  and s.source='IMPORT';

create or replace function private.rebuild_commissions_for_allocation(p_allocation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','private'
as $function$
declare
  v_payment_status text;
  v_allocation_amount numeric;
  v_sale_id uuid;
  v_sale_source text;
  v_responsible uuid;
  v_sold_at date;
  v_category text;
begin
  select p.status, pa.amount, pa.sale_id, s.source
    into v_payment_status, v_allocation_amount, v_sale_id, v_sale_source
  from public.payment_allocations pa
  join public.payments p on p.id=pa.payment_id
  join public.sales s on s.id=pa.sale_id
  where pa.id=p_allocation_id;

  if v_sale_id is null then return; end if;

  -- Imported history is immutable: never recalculate it using the current rule.
  if v_sale_source='IMPORT' then return; end if;

  select s.responsible_member_id, s.sold_at::date, sv.category
    into v_responsible, v_sold_at, v_category
  from public.sales s
  left join public.services sv on sv.id=s.service_id
  where s.id=v_sale_id;

  delete from public.commission_entries
  where payment_allocation_id=p_allocation_id;

  if v_payment_status <> 'PAID' or v_responsible is null then return; end if;

  insert into public.commission_entries(
    payment_allocation_id,
    responsible_member_id,
    beneficiary_member_id,
    rule_id,
    percentage,
    amount,
    status,
    calculation_source
  )
  select
    p_allocation_id,
    v_responsible,
    r.beneficiary_member_id,
    r.id,
    r.percentage,
    round((v_allocation_amount*r.percentage/100.0)::numeric,2),
    'DUE',
    'RULE'
  from public.commission_rules r
  where r.responsible_member_id=v_responsible
    and r.active=true
    and r.valid_from <= coalesce(v_sold_at,current_date)
    and (r.valid_until is null or r.valid_until >= coalesce(v_sold_at,current_date))
    and (r.service_category is null or r.service_category=v_category);
end;
$function$;
