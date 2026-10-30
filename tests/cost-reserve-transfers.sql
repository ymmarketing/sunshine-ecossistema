-- Real entry/allocation APIs and transfer APIs, with every test row rolled back.
begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team_members where active and lower(full_name)='yasmin' limit 1),true);
do $test$
declare
 v_person uuid;v_service uuid;v_member uuid;v_allocation uuid;v_ids uuid[]:='{}';v_result jsonb;v_read jsonb;
 v_payload jsonb;v_request jsonb;v_replay jsonb;v_id uuid;v_case integer;v_received text;v_category text;
 v_key text:='test-cost-reserve-'||gen_random_uuid();v_failed boolean;v_before bigint;v_after bigint;
 v_expected bigint:=0;v_expenses bigint;v_payments bigint;
begin
 if has_function_privilege('anon','public.v4_api_record_cost_reserve_transfer(jsonb)','execute')
  or has_function_privilege('anon','public.v4_cost_reserve_control(date,date,text,uuid,text)','execute')
  or has_table_privilege('authenticated','sunshine_v4.cost_reserve_transfers','insert')
  or has_table_privilege('authenticated','sunshine_v4.cost_reserve_transfer_entries','select') then
  raise exception 'Reserve API access is too broad';end if;
 select id into v_service from sunshine_v4.services where coalesce(metadata->>'commission_mode','')<>'LOURDES_100' limit 1;
 v_person:=public.v4_api_save_person(null,jsonb_build_object('fullName','TESTE RESERVA - ROLLBACK','birthDate','2000-01-01','status','ACTIVE'));
 -- Receipt date boundary in São Paulo; old receipts, Roseli, consultations and questions do not enter.
 for v_case in 0..7 loop
  select id into v_member from sunshine_v4.team_members where active and lower(full_name) in
   (case when v_case=3 then 'roseli' when v_case=2 then 'lourdes' else 'yasmin' end,case when v_case=3 then 'rosely' else '' end) limit 1;
  v_category:=case when v_case=4 then 'CONSULTA' when v_case=5 then 'PERGUNTA' else 'TRABALHO_COLETIVO' end;
  v_received:=case when v_case=0 then '2026-10-27T02:59:59Z' when v_case=1 then '2026-10-27T03:00:00Z' else '2026-10-28T12:00:00Z' end;
  v_payload:=jsonb_build_object('idempotencyKey',v_key||'-entry-'||v_case,'customerPersonId',v_person,'payerPersonId',v_person,
   'source','MANUAL_V4','paymentMethod','PIX','receivedCents',10003,'paidAt',v_received,
   'items',jsonb_build_array(jsonb_build_object('beneficiaryPersonId',v_person,'serviceId',v_service,
    'serviceName','Teste reserva retroativa','serviceCategory',v_category,'responsibleMemberId',v_member,
    'amountCents',20000,'allocateCents',10003,'participantName','Teste rollback','questionText','Teste')));
  v_result:=public.v4_api_register_manual_entry_operational(v_payload);
  select id into v_allocation from sunshine_v4.payment_allocations where payment_id=(v_result->>'paymentId')::uuid;
  if v_case in(1,2,6,7) then
   v_ids:=array_append(v_ids,v_allocation);v_expected:=v_expected+3001;
   if not exists(select 1 from private.sunshine_cost_reserve_rows() where allocation_id=v_allocation and reserve_cents=3001 and pending_cents=3001) then raise exception 'Eligible receipt missing: %',v_case;end if;
  elsif exists(select 1 from private.sunshine_cost_reserve_rows() where allocation_id=v_allocation) then raise exception 'Ineligible reserve: %',v_case;end if;
 end loop;
 v_read:=public.v4_cost_reserve_control(date '2026-10-27',date '2026-10-30','RECEIPT',null,null);
 if (select sum((e->>'pendingCents')::bigint) from jsonb_array_elements(v_read->'evidence')e where (e->>'allocationId')::uuid=any(v_ids))<>v_expected then raise exception 'Filtered summary differs';end if;
 select sum(amount_cents) into v_before from sunshine_v4.commission_entries where allocation_id=any(v_ids);
 select count(*) into v_expenses from sunshine_v4.expenses;
 select count(*) into v_payments from sunshine_v4.payments;
 v_request:=jsonb_build_object('idempotencyKey',v_key,'amountCents',3500,'transferredOn','2026-10-30','notes','Teste sem persistir','allocationIds',to_jsonb(v_ids));
 v_result:=public.v4_api_record_cost_reserve_transfer(v_request);v_id:=(v_result->>'id')::uuid;
 v_replay:=public.v4_api_record_cost_reserve_transfer(v_request);
 if v_replay->>'id'<>v_result->>'id' or not (v_replay->>'replayed')::boolean then raise exception 'Retry was not idempotent';end if;
 if (select sum(pending_cents) from private.sunshine_cost_reserve_rows() where allocation_id=any(v_ids))<>v_expected-3500 then raise exception 'Partial transfer did not leave exact remainder';end if;
 if (select sum(amount_cents) from sunshine_v4.cost_reserve_transfer_entries where transfer_id=v_id)<>3500 then raise exception 'Transfer did not close';end if;
 select sum(amount_cents) into v_after from sunshine_v4.commission_entries where allocation_id=any(v_ids);
 if v_after<>v_before or (select count(*) from sunshine_v4.expenses)<>v_expenses or (select count(*) from sunshine_v4.payments)<>v_payments then raise exception 'Transfer changed commissions, costs or receipts';end if;
 v_failed:=false;
 begin perform public.v4_api_record_cost_reserve_transfer(v_request||jsonb_build_object('amountCents',3501));exception when raise_exception then v_failed:=true;end;
 if not v_failed then raise exception 'Key reuse with different content accepted';end if;
 v_failed:=false;
 begin perform public.v4_api_record_cost_reserve_transfer(v_request||jsonb_build_object('idempotencyKey',v_key||'-overpay','amountCents',v_expected));exception when raise_exception then v_failed:=true;end;
 if not v_failed then raise exception 'Overpayment accepted';end if;
 v_failed:=false;
 begin perform public.v4_api_record_cost_reserve_transfer(v_request||jsonb_build_object('idempotencyKey',v_key||'-early','transferredOn','2026-10-26'));exception when raise_exception then v_failed:=true;end;
 if not v_failed then raise exception 'Invalid date accepted';end if;
 v_failed:=false;
 begin update sunshine_v4.payment_allocations set amount_cents=amount_cents+1 where id=(select allocation_id from sunshine_v4.cost_reserve_transfer_entries where transfer_id=v_id limit 1);exception when raise_exception then v_failed:=true;end;
 if not v_failed then raise exception 'Settled base correction was not blocked';end if;
 perform public.v4_api_reverse_cost_reserve_transfer(v_id,'Estorno de validação');
 perform public.v4_api_reverse_cost_reserve_transfer(v_id,'Repetição idempotente');
 if (select sum(pending_cents) from private.sunshine_cost_reserve_rows() where allocation_id=any(v_ids))<>v_expected then raise exception 'Reversal did not restore pending balance';end if;
 perform set_config('request.jwt.claim.sub','',true);
 v_failed:=false;
 begin perform public.v4_cost_reserve_control(date '2026-10-27',date '2026-10-30','RECEIPT',null,null);exception when insufficient_privilege then v_failed:=true;end;
 if not v_failed then raise exception 'Unauthenticated read accepted';end if;
end $test$;
rollback;
