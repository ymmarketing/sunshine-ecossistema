create or replace function public.v4_open_work_finance() returns jsonb
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
  select work_id,sum(amount_cents+excess_cents)::bigint cents,sum(amount_cents)::bigint registered_cents,sum(excess_cents)::bigint excess_cents from allocations group by work_id
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
  'workId',w.id,'title',w.title,'receivedCents',coalesce(r.cents,0),'registeredCents',coalesce(r.registered_cents,0),'retainedExcessCents',coalesce(r.excess_cents,0),
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
notify pgrst, 'reload schema';
