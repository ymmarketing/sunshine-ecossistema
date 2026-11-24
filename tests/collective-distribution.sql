-- Run after the migration against a test database. All synthetic records are rolled back.
begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team_members where active and lower(full_name)='yasmin' limit 1),true);
do $test$
declare v_person uuid;v_service uuid;v_member uuid;v_allocation uuid;v_item uuid;v_payload jsonb;
 v_result jsonb;v_split jsonb;v_cutoff timestamptz;v_paid_at timestamptz;v_category text;
 v_amount bigint;v_case integer;v_commission bigint;v_owner bigint;v_house bigint;v_operating bigint;v_other bigint;
 v_key text:='test-collective-'||gen_random_uuid();v_before text;v_existing uuid;v_failed boolean;
begin
 perform public.v4_bind_authenticated_user();
 if has_function_privilege('anon','public.v4_open_work_finance()','execute')
 or has_function_privilege('authenticated','private.sunshine_allocation_split(uuid)','execute') then
 raise exception 'Financial permissions too broad';end if;
 select valid_from into v_cutoff from sunshine_v4.collective_distribution_policy where code='COLLECTIVE_PILOT_20261124';
 select a.id into v_existing from sunshine_v4.payment_allocations a join sunshine_v4.payments p on p.id=a.payment_id
 where p.created_at<v_cutoff and p.status='PAID' limit 1;
 if v_existing is not null and private.sunshine_allocation_split(v_existing)?'policyCode' then raise exception 'Historical receipt reclassified';end if;
 select id into v_service from sunshine_v4.services where coalesce(metadata->>'commission_mode','')<>'LOURDES_100' limit 1;
 v_person:=public.v4_api_save_person(null,jsonb_build_object('fullName','TESTE DISTRIBUIÇÃO ROLLBACK','status','ACTIVE'));
 for v_case in 0..20 loop
 select id into v_member from sunshine_v4.team_members where active and lower(full_name)=case v_case%3 when 0 then 'yasmin' when 1 then 'lourdes' else 'rosely' end;
 v_category:=case (v_case/3)%7 when 0 then 'AGRADO_COLETIVO' when 1 then 'TRABALHO_COLETIVO' when 2 then 'TRABALHO_COLETIVO_PREMIUM' when 3 then 'CONSULTA' when 4 then 'PERGUNTA' when 5 then 'TRABALHO_PARTICULAR' else 'MENSALIDADE' end;
 v_amount:=case when v_case%2=0 then 100003 else 7000 end;
 v_paid_at:=greatest(clock_timestamp(),v_cutoff+interval '1 second');
 v_payload:=jsonb_build_object('idempotencyKey',v_key||'-'||v_case,'customerPersonId',v_person,'payerPersonId',v_person,'source','MANUAL_V4','paymentMethod','PIX','receivedCents',v_amount,'paidAt',v_paid_at,
 'items',jsonb_build_array(jsonb_build_object('beneficiaryPersonId',v_person,'serviceId',v_service,'serviceName','Validação temporária','serviceCategory',v_category,'responsibleMemberId',v_member,'amountCents',v_amount*2,'allocateCents',v_amount,'participantName','Pessoa teste','questionText','Teste','referenceMonth',date '2026-11-01')));
 v_result:=public.v4_api_register_manual_entry_operational(v_payload);
 select a.id,i.id into v_allocation,v_item from sunshine_v4.payment_allocations a join sunshine_v4.obligations o on o.id=a.obligation_id join sunshine_v4.contract_items i on i.id=o.contract_item_id where a.payment_id=(v_result->>'paymentId')::uuid;
 v_split:=private.sunshine_allocation_split(v_allocation);
 if v_category in ('AGRADO_COLETIVO','TRABALHO_COLETIVO','TRABALHO_COLETIVO_PREMIUM') then
 if v_split->>'policyCode' is distinct from 'COLLECTIVE_PILOT_20261124' then raise exception 'Pilot not applied';end if;
 v_house:=round(v_amount*.20);v_operating:=round(v_amount*.20);v_other:=round(v_amount*.15);
 select sum(amount_cents),sum(amount_cents)filter(where beneficiary_member_id=v_member) into v_commission,v_owner from sunshine_v4.commission_entries where allocation_id=v_allocation;
 if v_commission+v_house+v_operating<>v_amount or v_owner<>v_amount-v_house-v_operating-2*v_other then raise exception 'Incorrect gross receipt split';end if;
 if exists(select 1 from sunshine_v4.commission_entries where allocation_id=v_allocation and beneficiary_member_id<>v_member and(amount_cents<>v_other or percentage<>15)) then raise exception 'Other members changed';end if;
 if exists(select 1 from sunshine_v4.commission_entries where allocation_id=v_allocation and beneficiary_member_id=v_member and percentage<>30) then raise exception 'Owner rate incorrect';end if;
 else
 if v_split?'policyCode' or v_split<>private.sunshine_item_split(v_item,(v_paid_at at time zone 'America/Sao_Paulo')::date) then raise exception 'Non-collective rule changed';end if;
 end if;
 end loop;
 perform public.v4_open_work_finance();
end $test$;
select 'Collective split, gross partial receipts, cents, three members, history, non-collective rules, and permissions passed; rollback follows' result;
rollback;
