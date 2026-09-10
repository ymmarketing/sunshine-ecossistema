-- Resolve the contract item through the obligation exposed by the receivables
-- view. The view intentionally does not expose contract_item_id.
create or replace function public.v4_receivables(
  p_only_open boolean default false,
  p_limit integer default 200
)
returns table(
  obligation_id uuid,
  contract_id uuid,
  contract_item_id uuid,
  customer_person_id uuid,
  beneficiary_person_id uuid,
  beneficiary_name text,
  service_name text,
  total_cents bigint,
  received_cents bigint,
  signed_balance_cents bigint,
  liquidation_status text,
  due_status text,
  due_date date,
  expected_payment_date date,
  next_collection_date date,
  is_overallocated boolean
)
language plpgsql
security definer
set search_path to 'public', 'sunshine_v4', 'auth', 'pg_temp'
as $function$
begin
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('receivable.read');

  return query
  select
    r.obligation_id,
    c.id,
    i.id,
    c.customer_person_id,
    r.beneficiary_person_id,
    coalesce(p.preferred_name, p.full_name, 'Pessoa não identificada'),
    r.service_name,
    r.total_cents,
    r.received_cents,
    r.signed_balance_cents,
    r.liquidation_status,
    r.due_status,
    r.due_date,
    r.expected_payment_date,
    r.next_collection_date,
    r.is_overallocated
  from sunshine_v4.receivables r
  join sunshine_v4.obligations o on o.id = r.obligation_id
  join sunshine_v4.contract_items i on i.id = o.contract_item_id
  join sunshine_v4.contracts c on c.id = i.contract_id
  left join sunshine_v4.people p on p.id = r.beneficiary_person_id
  where (not p_only_open) or r.signed_balance_cents <> 0
  order by
    case
      when r.signed_balance_cents < 0 then 0
      when r.signed_balance_cents > 0 then 1
      else 2
    end,
    coalesce(r.next_collection_date, r.expected_payment_date, r.due_date) asc nulls last,
    c.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end
$function$;
