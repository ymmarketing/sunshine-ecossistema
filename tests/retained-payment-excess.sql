begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team_members where active and lower(full_name)='yasmin' limit 1),true);
do $test$
declare person uuid; member uuid; payment uuid; payload jsonb; proof jsonb; key text:='test-excess-'||gen_random_uuid();
begin
perform public.v4_bind_authenticated_user();
select id into person from sunshine_v4.people limit 1;
select id into member from sunshine_v4.team_members where active limit 1;
insert into sunshine_v4.payments(payer_person_id,source,amount_cents,net_cents,paid_at,idempotency_key,status)
values(person,'MANUAL_V4',9998,9998,now(),key,'PAID') returning id into payment;
payload:=jsonb_build_object('idempotencyKey',key,'customerPersonId',person,'excessDisposition','KEEP_AS_SALE','items',
jsonb_build_array(jsonb_build_object('beneficiaryPersonId',person,'serviceName','Agrado teste temporário','serviceCategory','AGRADO_COLETIVO','responsibleMemberId',member,'amountCents',7000,'allocateCents',7000)));
proof:=public.v4_api_associate_existing_payment_operational(payment,payload);
if (select retained_excess_cents from sunshine_v4.payments where id=payment)<>2998 then raise exception 'Excess not retained';end if;
if (select sum(amount_cents) from sunshine_v4.payment_allocations where payment_id=payment)<>7000 then raise exception 'Wrong allocation';end if;
if (select sum(amount_cents) from sunshine_v4.contract_items where contract_id=(proof->>'contractId')::uuid)<>7000 then raise exception 'Service value changed';end if;
if exists(select 1 from sunshine_v4.person_credit_entries where payment_id=payment) then raise exception 'Credit incorrectly created';end if;
perform public.v4_api_associate_existing_payment_operational(payment,payload);
if (select retained_excess_cents from sunshine_v4.payments where id=payment)<>2998 then raise exception 'Replay duplicated excess';end if;
if exists(select 1 from jsonb_array_elements(public.v4_unassociated_receipts()->'payments') x where x->>'payment_id'=payment::text) then raise exception 'Retained excess still queued';end if;
end $test$;
select 'PASS: 7000 service/allocation, 2998 retained, no credit, no duplicate, no queue' result;
rollback;