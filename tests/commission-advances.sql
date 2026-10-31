-- All financial writes, audit records and test people are rolled back.
begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team_members where active and lower(full_name)='yasmin' limit 1),true);
do $test$
declare
 v_base jsonb;v_read jsonb;v_items jsonb;v_result jsonb;v_other jsonb;v_due bigint;v_count bigint;
 v_key text:='test-advance-'||gen_random_uuid();v_person uuid;v_member uuid;v_service uuid;v_payload jsonb;v_failed boolean;
begin
 if has_function_privilege('anon','public.v4_api_record_commission_payments(jsonb,date,text,text)','execute')
  or has_function_privilege('authenticated','private.sunshine_apply_commission_credit(jsonb,date,date,boolean)','execute') then
  raise exception 'Advance API permissions too broad';end if;
 v_base:=public.v4_finance_commission_control_filtered('1900-01-01','2099-12-31','RECEIPT',null,null);
 v_due:=coalesce((v_base->'pendingByPerson'->>'Rosely')::bigint,0);
 v_other:=(v_base->'pendingByPerson')-'Rosely';
 select coalesce(jsonb_agg(jsonb_build_object('commissionId',e->>'commissionId','commissionTable',e->>'commissionTable')),'[]'::jsonb)
 into v_items from jsonb_array_elements(v_base->'evidence')e where e->>'recipientName'='Rosely' and (e->>'pendingCents')::bigint>0;
 v_items:=jsonb_build_array(jsonb_build_object('recipientName','Rosely','amountCents',v_due+10500,'commissions',v_items));
 v_result:=public.v4_api_record_commission_payments(v_items,'2026-10-31','TESTE ROLLBACK',v_key);
 if (v_result->>'totalPaidCents')::bigint<>v_due+10500 then raise exception 'Cash payment truncated';end if;
 v_read:=public.v4_finance_commission_control_filtered('1900-01-01','2099-12-31','RECEIPT',null,null);
 if (v_read->'pendingByPerson'->>'Rosely')::bigint<>-10500 then raise exception 'Excess must be -105: %',v_read->'pendingByPerson';end if;
 if ((v_read->'pendingByPerson')-'Rosely')<>v_other then raise exception 'Other recipients changed';end if;
 if (v_read->'paidByPerson'->>'Rosely')::bigint-coalesce((v_base->'paidByPerson'->>'Rosely')::bigint,0)<>v_due+10500 then raise exception 'Paid total differs from cash';end if;
 select count(*) into v_count from sunshine_v4.commission_payment_entries where batch_key=v_key;
 v_result:=public.v4_api_record_commission_payments(v_items,'2026-10-31','TESTE ROLLBACK',v_key);
 if not (v_result->>'replayed')::boolean or (select count(*) from sunshine_v4.commission_payment_entries where batch_key=v_key)<>v_count then raise exception 'Duplicate payment';end if;
 v_read:=public.v4_finance_commission_control_filtered('2026-11-01','2026-11-30','RECEIPT',null,null);
 if (v_read->'pendingByPerson'->>'Rosely')::bigint<>-10500 then raise exception 'Credit lost on month change';end if;
 select id into v_member from sunshine_v4.team_members where active and lower(full_name)='rosely';
 select id into v_service from sunshine_v4.services where active and coalesce(metadata->>'commission_mode','')<>'LOURDES_100' limit 1;
 v_person:=public.v4_api_save_person(null,jsonb_build_object('fullName','TESTE ADIANTAMENTO - ROLLBACK','status','ACTIVE'));
 for v_count in 1..2 loop
  v_payload:=jsonb_build_object('idempotencyKey',v_key||'-entry-'||v_count,'customerPersonId',v_person,'payerPersonId',v_person,
   'source','MANUAL_V4','paymentMethod','PIX','receivedCents',10000,'paidAt','2026-11-01T12:00:00Z',
   'items',jsonb_build_array(jsonb_build_object('beneficiaryPersonId',v_person,'serviceId',v_service,'serviceName','Teste adiantamento',
    'serviceCategory','PERGUNTA','responsibleMemberId',v_member,'amountCents',10000,'allocateCents',10000,'questionText','Teste')));
  perform public.v4_api_register_manual_entry_operational(v_payload);
  v_read:=public.v4_finance_commission_control_filtered('2026-11-01','2026-11-30','RECEIPT',null,null);
  if (v_read->'pendingByPerson'->>'Rosely')::bigint<>-10500+v_count*7000 then raise exception 'New earnings did not offset credit: %',v_read->'pendingByPerson';end if;
 end loop;
 -- Adiantamento is allowed with no selected commission and never creates another recipient's credit.
 v_result:=public.v4_api_record_commission_payments('[{"recipientName":"Rosely","amountCents":2500,"commissions":[]}]','2026-10-31',null,v_key||'-empty');
 v_read:=public.v4_finance_commission_control_filtered('2026-11-01','2026-11-30','RECEIPT',null,null);
 if (v_read->'pendingByPerson'->>'Rosely')::bigint<>1000 then raise exception 'Second advance did not preserve balance';end if;
 v_failed:=false;
 begin perform public.v4_api_record_commission_payments('[{"recipientName":"Rosely","amountCents":0,"commissions":[]}]','2026-10-31',null,v_key||'-bad');exception when raise_exception then v_failed:=true;end;
 if not v_failed then raise exception 'Zero cash accepted';end if;
 perform set_config('sunshine.advance_test','PASS: overpayment; negative balance; exact cash; recipient isolation; idempotency; month carry; new earnings offset; advance without debt; permissions; all rolled back',true);
end $test$;
select current_setting('sunshine.advance_test') result;
rollback;
