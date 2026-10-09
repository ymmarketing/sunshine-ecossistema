-- Full registration exercises the canonical category, preserving receipt and commission cents.
begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team_members where active and lower(full_name)='yasmin' limit 1),true);
do $test$
declare v_person uuid;v_service uuid;v_other uuid;v_member uuid;v_item uuid;v_allocation uuid;
 v_payload jsonb;v_result jsonb;v_total bigint;v_owner bigint;v_key text:='test-premium-'||gen_random_uuid();
begin
 if has_function_privilege('authenticated','private.sunshine_classify_collective_premium()','EXECUTE')
  or has_function_privilege('anon','private.sunshine_is_collective_premium(uuid,uuid,text)','EXECUTE') then raise exception 'Private classification exposed';end if;
 select id into v_service from sunshine_v4.services where active and category='TRABALHO_COLETIVO_PREMIUM' limit 1;
 select id into v_other from sunshine_v4.services where active and category='TRABALHO_PARTICULAR' and coalesce(metadata->>'commission_mode','')<>'LOURDES_100' limit 1;
 select id into v_member from sunshine_v4.team_members where active and lower(full_name)='yasmin';
 v_person:=public.v4_api_save_person(null,jsonb_build_object('fullName','VALIDAÇÃO TEMPORÁRIA - não manter','birthDate','2000-01-01','status','ACTIVE'));
 -- A stale client submits the premium catalog service under Particular.
 v_payload:=jsonb_build_object('idempotencyKey',v_key,'customerPersonId',v_person,'payerPersonId',v_person,'source','MANUAL_V4','paymentMethod','PIX','receivedCents',100000,'paidAt','2026-10-08T12:00:00Z',
  'items',jsonb_build_array(jsonb_build_object('beneficiaryPersonId',v_person,'serviceId',v_service,'serviceName','Trabalho Coletivo Premium','serviceCategory','TRABALHO_PARTICULAR','responsibleMemberId',v_member,'amountCents',100000,'allocateCents',100000,'participantName','Pessoa de teste')));
 v_result:=public.v4_api_register_manual_entry_operational(v_payload);
 select a.id,i.id into v_allocation,v_item from sunshine_v4.payment_allocations a join sunshine_v4.obligations o on o.id=a.obligation_id join sunshine_v4.contract_items i on i.id=o.contract_item_id where a.payment_id=(v_result->>'paymentId')::uuid;
 if(select service_category from sunshine_v4.contract_items where id=v_item)<>'TRABALHO_COLETIVO_PREMIUM' then raise exception 'Premium saved under wrong category';end if;
 select sum(amount_cents),sum(amount_cents)filter(where beneficiary_member_id=v_member)into v_total,v_owner from sunshine_v4.commission_entries where allocation_id=v_allocation;
 if v_total<>70000 or v_owner<>49000 then raise exception 'Category classification changed the gross split';end if;
 -- Correct Particular services remain Particular.
 v_payload:=jsonb_set(v_payload,'{idempotencyKey}',to_jsonb((v_key||'-private')::text));
 v_payload:=jsonb_set(v_payload,'{items,0,serviceId}',to_jsonb(v_other));
 v_payload:=jsonb_set(v_payload,'{items,0,serviceName}',to_jsonb('Trabalho Particular'::text));
 v_result:=public.v4_api_register_manual_entry_operational(v_payload);
 if exists(select 1 from sunshine_v4.contract_items i join sunshine_v4.obligations o on o.contract_item_id=i.id join sunshine_v4.payment_allocations a on a.obligation_id=o.id where a.payment_id=(v_result->>'paymentId')::uuid and i.service_category<>'TRABALHO_PARTICULAR')then raise exception 'Genuine Particular changed category';end if;
end $test$;
rollback;
