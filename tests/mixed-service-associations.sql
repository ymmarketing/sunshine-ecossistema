-- No real payment is associated: fixtures and every write are rolled back.
begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team_members where active and lower(full_name)='yasmin' limit 1),true);
do $test$
declare
 v_key text:='test-mixed-'||gen_random_uuid();v_mode text;v_person uuid;v_other uuid;v_agr uuid;v_question uuid;v_work uuid;
 v_yasmin uuid;v_roseli uuid;v_payment uuid;v_payments uuid[];v_entry uuid;v_contract uuid;
 v_payload jsonb;v_result jsonb;v_replay jsonb;v_proof jsonb;v_count integer;v_failed boolean;v_total bigint;v_reserve bigint;
begin
 select id into v_yasmin from sunshine_v4.team_members where active and lower(full_name)='yasmin';
 select id into v_roseli from sunshine_v4.team_members where active and lower(full_name) in ('roseli','rosely') limit 1;
 select id into v_agr from sunshine_v4.services where active and category='TRABALHO_COLETIVO' and name='Agrado Coletivo 2026' limit 1;
 select id into v_question from sunshine_v4.services where active and category='PERGUNTA' limit 1;
 select w.id into v_work from sunshine_v4.works w where w.service_id=v_agr and w.responsible_member_id=v_yasmin order by w.scheduled_at desc limit 1;
 if v_agr is null or v_question is null or v_work is null then raise exception 'Mixed service fixtures missing';end if;
 foreach v_mode in array array['MANUAL','EXISTING','ASAAS','GROUP'] loop
  v_person:=public.v4_api_save_person(null,jsonb_build_object('fullName',v_key||' '||v_mode||' pessoa A','birthDate','1990-01-01','status','ACTIVE'));
  v_other:=public.v4_api_save_person(null,jsonb_build_object('fullName',v_key||' '||v_mode||' pessoa B','birthDate','1991-01-01','status','ACTIVE'));
  v_payload:=jsonb_build_object('idempotencyKey',v_key||'-'||v_mode,'customerPersonId',v_person,'payerPersonId',v_person,
   'source','MANUAL_V4','paymentMethod','PIX','receivedCents',36000,'paidAt','2026-10-30T12:00:00-03:00',
   'items',jsonb_build_array(
    jsonb_build_object('beneficiaryPersonId',v_person,'participantName','Pessoa A','participantBirthDate','1990-01-01','serviceId',v_agr,'serviceCategory','AGRADO_COLETIVO','serviceName','Agrado Tata teste','workId',v_work,'responsibleMemberId',v_yasmin,'amountCents',15000,'allocateCents',15000),
    jsonb_build_object('beneficiaryPersonId',v_other,'participantName','Pessoa B','participantBirthDate','1991-01-01','serviceId',v_agr,'serviceCategory','AGRADO_COLETIVO','serviceName','Agrado Tata teste','workId',v_work,'responsibleMemberId',v_yasmin,'amountCents',15000,'allocateCents',15000),
    jsonb_build_object('beneficiaryPersonId',v_person,'serviceId',v_question,'serviceCategory','PERGUNTA','serviceName','Pergunta objetiva','responsibleMemberId',v_roseli,'questionText','Primeira pergunta de teste','amountCents',3000,'allocateCents',3000),
    jsonb_build_object('beneficiaryPersonId',v_person,'serviceId',v_question,'serviceCategory','PERGUNTA','serviceName','Pergunta objetiva','responsibleMemberId',v_roseli,'questionText','Segunda pergunta de teste','amountCents',3000,'allocateCents',3000)));
  if v_mode='MANUAL' then
   v_result:=public.v4_api_register_manual_entry_operational(v_payload);
   v_replay:=public.v4_api_register_manual_entry_operational(v_payload);
  elsif v_mode='EXISTING' then
   insert into sunshine_v4.payments(payer_person_id,source,amount_cents,net_cents,paid_at,idempotency_key,status)
   values(v_person,'MANUAL_V4',36000,36000,'2026-10-30T12:00:00-03:00',v_key||'-existing','PAID') returning id into v_payment;
   v_result:=public.v4_api_associate_existing_payment_operational(v_payment,v_payload);
   v_replay:=public.v4_api_associate_existing_payment_operational(v_payment,v_payload);
   if (select count(*) from sunshine_v4.payments where id=v_payment)<>1 then raise exception 'Existing payment duplicated';end if;
  elsif v_mode='ASAAS' then
   insert into public.asaas_incoming_payments(asaas_payment_id,asaas_status,latest_event_type,gross_amount,net_amount,payment_date,customer_name)
   values(v_key||'-asaas','RECEIVED','PAYMENT_RECEIVED',360,360,'2026-10-30T12:00:00-03:00','Teste rollback') returning id into v_entry;
   v_failed:=false;
   begin perform public.v4_api_register_asaas_entry_operational(v_entry,jsonb_set(v_payload,'{items,3,questionText}','""'::jsonb));exception when raise_exception then v_failed:=true;end;
   if not v_failed or (select classification_status from public.asaas_incoming_payments where id=v_entry)<>'PENDING' then raise exception 'Invalid question committed an incomplete association';end if;
   v_result:=public.v4_api_register_asaas_entry_operational(v_entry,v_payload);
   v_replay:=public.v4_api_register_asaas_entry_operational(v_entry,v_payload);
   if (select count(*) from sunshine_v4.payments where source='ASAAS' and external_ref=v_key||'-asaas')<>1 then raise exception 'Asaas payment duplicated';end if;
  else
   v_payments:='{}';
   for v_count in 1..2 loop
    insert into sunshine_v4.payments(payer_person_id,source,amount_cents,net_cents,paid_at,idempotency_key,status)
    values(v_person,'MANUAL_V4',18000,18000,'2026-10-30T12:00:00-03:00',v_key||'-group-'||v_count,'PAID') returning id into v_payment;
    v_payments:=array_append(v_payments,v_payment);
   end loop;
   v_result:=public.v4_api_associate_payment_group_operational(v_payments,'{}'::uuid[],v_payload);
   v_replay:=public.v4_api_associate_payment_group_operational(v_payments,'{}'::uuid[],v_payload);
  end if;
  v_contract:=(v_result->>'contractId')::uuid;
  if v_replay->>'contractId'<>v_contract::text then raise exception 'Mixed association replay failed: %',v_mode;end if;
  v_proof:=public.v4_entry_receipt(v_contract);
  if jsonb_array_length(v_proof->'items')<>4 or (select sum((x->>'allocatedCents')::bigint) from jsonb_array_elements(v_proof->'items')x)<>36000 then raise exception 'Mixed total or item count wrong: %',v_mode;end if;
  if (select count(*) from sunshine_v4.work_registrations r join sunshine_v4.contract_items i on i.id=r.contract_item_id where i.contract_id=v_contract)<>2 then raise exception 'Expected two work registrations: %',v_mode;end if;
  if (select count(*) from sunshine_v4.appointments a join sunshine_v4.contract_items i on i.id=a.source_contract_item_id where i.contract_id=v_contract and a.person_id=v_person and a.question_status='AWAITING_RESPONSE' and a.responsible_member_id=v_roseli)<>2 then raise exception 'Two questions for the same person were not queued separately: %',v_mode;end if;
  if (v_proof->'items'->2->>'questionText')<>'Primeira pergunta de teste' or (v_proof->'items'->3->>'questionText')<>'Segunda pergunta de teste'
   or (v_proof->'items'->2->>'questionId') is null or (v_proof->'items'->2->>'questionId')=(v_proof->'items'->3->>'questionId')
   or (v_proof->'items'->2->>'serviceId')<>v_question::text or (v_proof->'items'->0->>'serviceId')<>v_agr::text
   or (v_proof->'items'->0->>'responsibleMemberId')<>v_yasmin::text or (v_proof->'items'->2->>'responsibleMemberId')<>v_roseli::text
   or (v_proof->'items'->2->>'workId') is not null then raise exception 'Mixed proof is incomplete: %',v_mode;end if;
  select sum(a.amount_cents),sum(round(a.amount_cents*(private.sunshine_item_split(i.id,(p.paid_at at time zone 'America/Sao_Paulo')::date)->>'costBp')::integer/10000.0))
   into v_total,v_reserve from sunshine_v4.contract_items i join sunshine_v4.obligations o on o.contract_item_id=i.id
   join sunshine_v4.payment_allocations a on a.obligation_id=o.id join sunshine_v4.payments p on p.id=a.payment_id where i.contract_id=v_contract;
  if v_total<>36000 or v_reserve<>9000 then raise exception 'Mixed distribution or consultation exemption failed: %',v_mode;end if;
 end loop;
 perform set_config('sunshine.mixed_test','PASS: manual/existing/Asaas/group; 360 = 150+150+30+30; two registrations; two separate questions for same person; atomic validation rollback; idempotent retries; reserve by service',true);
end $test$;
select current_setting('sunshine.mixed_test') test_result;
rollback;
