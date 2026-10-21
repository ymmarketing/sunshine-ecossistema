-- The operational queue must not hide older, partial or third-party receipts.
create or replace function public.v4_unassociated_receipts()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_payments jsonb;v_asaas jsonb;
begin
 perform public.v4_bind_authenticated_user();
 perform sunshine_v4.v4_assert_permission('payment.read');
 select coalesce(jsonb_agg(to_jsonb(x) order by x.paid_at desc),'[]') into v_payments from (
  select p.id payment_id,p.payer_person_id,coalesce(pp.preferred_name,pp.full_name,p.payer_snapshot->>'name','Pagador não identificado') payer_name,
   p.amount_cents,r.allocated_cents,(r.signed_unallocated_cents-coalesce(p.retained_excess_cents,0))::bigint signed_unallocated_cents,
   p.paid_at,p.source,p.payment_method,p.payer_resolution_status
  from sunshine_v4.payments p join sunshine_v4.payment_reconciliation r on r.payment_id=p.id
  left join sunshine_v4.people pp on pp.id=p.payer_person_id
  where p.status='PAID' and p.source<>'IMPORT' and r.signed_unallocated_cents>coalesce(p.retained_excess_cents,0)
   and not exists(select 1 from sunshine_v4.payment_queue_dismissals d where d.entity_kind='EXISTING' and d.entity_id=p.id)
 )x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.paid_at desc),'[]') into v_asaas from (
  select e.id entry_id,e.asaas_payment_id,coalesce(e.customer_name,'Pagador não identificado') payer_name,
   round(e.gross_amount*100)::bigint amount_cents,round(coalesce(e.net_amount,e.gross_amount)*100)::bigint net_cents,
   coalesce(e.payment_date,e.received_at) paid_at,e.billing_type payment_method,
   (select p.id from sunshine_v4.people p where p.legacy_v3_id=e.matched_client_id or p.asaas_customer_id=e.asaas_customer_id
    order by (p.asaas_customer_id=e.asaas_customer_id) desc nulls last,p.id limit 1) matched_person_id
  from public.asaas_incoming_payments e
  where e.classification_status='PENDING' and e.latest_event_type in ('PAYMENT_RECEIVED','PAYMENT_CONFIRMED')
   and not exists(select 1 from sunshine_v4.payments p where p.source='ASAAS' and p.external_ref=e.asaas_payment_id)
   and not exists(select 1 from sunshine_v4.payment_queue_dismissals d where d.entity_kind='ASAAS' and d.entity_id=e.id)
 )x;
 return jsonb_build_object('payments',v_payments,'asaas',v_asaas);
end $$;
revoke all on function public.v4_unassociated_receipts() from public,anon;
grant execute on function public.v4_unassociated_receipts() to authenticated;
