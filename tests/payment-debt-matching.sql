begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team_members where active and lower(full_name)='yasmin' limit 1),true);
do $test$
declare d jsonb; debt uuid; person uuid; responsible uuid; payment uuid; extra uuid; entry uuid;
 payload jsonb; proof jsonb; replay jsonb; key text:='test-match-'||gen_random_uuid();
 before_counts bigint[]; after_counts bigint[]; balance bigint; failed boolean;
begin
 select value into d from jsonb_array_elements(public.v4_payment_debt_candidates()) where (value->>'pendingCents')::bigint>=10000 limit 1;
 if d is null then raise exception 'No suitable debt fixture';end if;
 debt:=(d->>'obligationId')::uuid;person:=(d->>'personId')::uuid;balance:=(d->>'pendingCents')::bigint;
 select id into responsible from sunshine_v4.team_members where active and lower(full_name)='rosely';
 select array[(select count(*) from sunshine_v4.contracts),(select count(*) from sunshine_v4.contract_items),(select count(*) from sunshine_v4.work_registrations)] into before_counts;
 insert into sunshine_v4.payments(payer_person_id,source,amount_cents,net_cents,paid_at,idempotency_key,status)
 values(person,'MANUAL_V4',3000,3000,'2026-10-21T12:00:00-03:00',key,'PAID') returning id into payment;
 insert into public.asaas_incoming_payments(asaas_payment_id,asaas_status,latest_event_type,gross_amount,net_amount,payment_date,customer_name,classification_status)
 values(key,'RECEIVED','PAYMENT_RECEIVED',20,20,'2026-10-21T12:00:00-03:00','Teste temporário','PENDING') returning id into entry;
 payload:=jsonb_build_object('idempotencyKey',key,'obligationId',debt,'amountCents',5000,'responsibleMemberId',responsible,
  'payments',jsonb_build_array(jsonb_build_object('kind','EXISTING','id',payment),jsonb_build_object('kind','ASAAS','id',entry)));
 proof:=public.v4_api_match_payments_to_debt(payload);
 if (proof->>'pendingAfterCents')::bigint<>balance-5000 or jsonb_array_length(proof->'receipts')<>2 then raise exception 'Partial batch failed';end if;
 replay:=public.v4_api_match_payments_to_debt(payload);
 if replay<>proof then raise exception 'Replay failed';end if;
 if (select classification_status from public.asaas_incoming_payments where id=entry)<>'RESOLVED' then raise exception 'Asaas not resolved';end if;
 failed:=false;begin perform public.v4_api_match_payments_to_debt(payload||'{"amountCents":4999}'::jsonb);exception when raise_exception then failed:=true;end;
 if not failed then raise exception 'Changed replay accepted';end if;
 insert into sunshine_v4.payments(payer_person_id,source,amount_cents,net_cents,paid_at,idempotency_key,status)
 values(person,'MANUAL_V4',balance-4000,balance-4000,now(),key||'-extra','PAID') returning id into extra;
 payload:=jsonb_build_object('idempotencyKey',key||'-settle','obligationId',debt,'amountCents',balance-5000,'responsibleMemberId',responsible,
  'payments',jsonb_build_array(jsonb_build_object('kind','EXISTING','id',extra)));
 proof:=public.v4_api_match_payments_to_debt(payload);
 if (proof->>'pendingAfterCents')::bigint<>0 then raise exception 'Settlement failed';end if;
 if (select amount_cents-coalesce((select sum(amount_cents) from sunshine_v4.payment_allocations where payment_id=extra),0) from sunshine_v4.payments where id=extra)<>1000 then raise exception 'Surplus lost';end if;
 if public.v4_api_match_payments_to_debt(payload)<>proof then raise exception 'Settled replay failed';end if;
 select array[(select count(*) from sunshine_v4.contracts),(select count(*) from sunshine_v4.contract_items),(select count(*) from sunshine_v4.work_registrations)] into after_counts;
 if before_counts<>after_counts then raise exception 'New sale or registration created';end if;
 if has_function_privilege('anon','public.v4_api_match_payments_to_debt(jsonb)','execute') or has_function_privilege('anon','public.v4_payment_debt_candidates()','execute') then raise exception 'Anonymous access';end if;
 perform set_config('sunshine.match_test','PASS: partial/mixed receipts; complete settlement; retained surplus; replay after settlement; conflicting key rejected; same original sale/registration; anonymous blocked',true);
end $test$;
select current_setting('sunshine.match_test') test_result;
rollback;
