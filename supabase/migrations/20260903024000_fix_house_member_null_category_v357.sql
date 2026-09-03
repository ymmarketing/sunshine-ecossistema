create or replace function private.ensure_house_member_from_monthly_allocation(p_allocation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_client_id uuid;
  v_payment_status text;
  v_paid_date date;
  v_category text;
  v_default_price numeric;
begin
  select s.client_id,
         p.status,
         coalesce(p.competence_date,p.paid_at::date,p.created_at::date),
         sv.category,
         sv.default_price
    into v_client_id,v_payment_status,v_paid_date,v_category,v_default_price
  from public.payment_allocations pa
  join public.payments p on p.id=pa.payment_id
  join public.sales s on s.id=pa.sale_id
  left join public.services sv on sv.id=s.service_id
  where pa.id=p_allocation_id;

  -- NULL não pode ser interpretado como mensalidade. Trabalho não possui service_id.
  if v_client_id is null
     or v_payment_status is distinct from 'PAID'
     or v_category is distinct from 'MENSALIDADE' then
    return;
  end if;

  insert into public.house_members(
    client_id,joined_at,monthly_fee,status,notes,billing_exempt,billing_due_day
  ) values (
    v_client_id,coalesce(v_paid_date,current_date),
    coalesce(nullif(v_default_price,0),200),'ACTIVE',
    'Vínculo criado automaticamente a partir de pagamento de mensalidade.',false,10
  )
  on conflict (client_id) do update set status='ACTIVE',updated_at=now();
end;
$$;

revoke all on function private.ensure_house_member_from_monthly_allocation(uuid) from public, anon, authenticated;
grant execute on function private.ensure_house_member_from_monthly_allocation(uuid) to service_role;
