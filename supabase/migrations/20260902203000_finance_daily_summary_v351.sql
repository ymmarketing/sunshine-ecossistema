create or replace function public.finance_daily_summary_v351(p_start date, p_end date)
returns table(member_id uuid, member_name text, due_amount numeric, paid_amount numeric, period_revenue numeric)
language plpgsql security invoker set search_path=public,private,pg_temp as $$
begin
  if not private.is_internal_member() then raise exception 'Usuário não autorizado.'; end if;
  if p_start is null or p_end is null or p_start > p_end then raise exception 'Período inválido.'; end if;
  return query
  with period_payments as (
    select p.id,p.gross_amount from public.payments p where p.status='PAID'
      and (p.paid_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
  ), revenue as (
    select coalesce(sum(pp.gross_amount),0)::numeric total from period_payments pp
  ), commission_totals as (
    select ce.beneficiary_member_id,
      coalesce(sum(ce.amount) filter(where ce.status='DUE'),0)::numeric due,
      coalesce(sum(ce.amount) filter(where ce.status='PAID'),0)::numeric paid
    from public.commission_entries ce join period_payments pp on pp.id=ce.payment_id
    where ce.status in ('DUE','PAID') group by ce.beneficiary_member_id
  )
  select tm.id,tm.full_name,coalesce(ct.due,0),coalesce(ct.paid,0),r.total
  from public.team_members tm cross join revenue r
  left join commission_totals ct on ct.beneficiary_member_id=tm.id
  where tm.active=true and lower(tm.full_name) in ('yasmin','lourdes','rosely','roseli')
  order by case lower(tm.full_name) when 'yasmin' then 1 when 'lourdes' then 2 else 3 end;
end; $$;
revoke all on function public.finance_daily_summary_v351(date,date) from public,anon;
grant execute on function public.finance_daily_summary_v351(date,date) to authenticated;
