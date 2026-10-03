begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team_members where active and lower(full_name)='yasmin' limit 1),true);
do $test$
declare v_mode text;v_obligation uuid;v_person uuid;v_responsible uuid;v_payment uuid;v_entry uuid;v_result jsonb;
 v_key text:='test-reg-modes-'||gen_random_uuid();v_data jsonb;v_allocation uuid;
begin
 select o.id,coalesce(o.beneficiary_person_id,i.beneficiary_person_id) into v_obligation,v_person
 from sunshine_v4.obligations o join sunshine_v4.contract_items i on i.id=o.contract_item_id
 join sunshine_v4.people bp on bp.id=coalesce(o.beneficiary_person_id,i.beneficiary_person_id)
 where lower(bp.full_name)='edna barboza' and o.total_cents=22000 and i.responsible_member_id is null
 and not exists(select 1 from sunshine_v4.payment_allocations a where a.obligation_id=o.id);
 select id into v_responsible from sunshine_v4.team_members where active and lower(full_name)='lourdes';
 foreach v_mode in array array['EXISTING','ASAAS'] loop
  begin
   v_data:=jsonb_build_object('mode',v_mode,'responsibleMemberId',v_responsible,'amountCents',22000,'idempotencyKey',v_key||v_mode);
   if v_mode='EXISTING' then
    insert into sunshine_v4.payments(payer_person_id,source,amount_cents,net_cents,paid_at,idempotency_key,status)
    values(v_person,'MANUAL_V4',22000,22000,'2026-10-03T12:00:00-03:00',v_key||v_mode,'PAID') returning id into v_payment;
    v_data:=v_data||jsonb_build_object('paymentId',v_payment);
   else
    insert into public.asaas_incoming_payments(asaas_payment_id,asaas_status,latest_event_type,gross_amount,net_amount,payment_date,customer_name,classification_status)
    values(v_key||v_mode,'RECEIVED','PAYMENT_RECEIVED',220,220,'2026-10-03T12:00:00-03:00','Pessoa temporária','PENDING') returning id into v_entry;
    v_data:=v_data||jsonb_build_object('asaasEntryId',v_entry);
   end if;
   v_result:=public.v4_api_regularize_obligation(v_obligation,v_data);
   v_allocation:=(v_result->>'allocationId')::uuid;
   if (v_result->>'pendingAfterCents')::bigint<>0 or
     (select sum(amount_cents) from sunshine_v4.commission_entries where allocation_id=v_allocation)<>15400 or
     (select sum(amount_cents) from sunshine_v4.commission_entries where allocation_id=v_allocation and beneficiary_member_id=v_responsible)<>10780
     then raise exception 'Received mode % failed',v_mode;end if;
   if v_mode='ASAAS' and (select classification_status from public.asaas_incoming_payments where id=v_entry)<>'RESOLVED' then raise exception 'Asaas not resolved';end if;
   -- Undo this mode before exercising the same original debt with the next one.
   raise exception using errcode='ZX001',message='Rollback successful mode';
  exception when sqlstate 'ZX001' then null;
  end;
 end loop;
 perform set_config('sunshine.test_result','PASS: EXISTING and ASAAS regularization save responsible and generate 30/70 policy on September sale; both modes rolled back',true);
end $test$;
select current_setting('sunshine.test_result') test_result;
rollback;
