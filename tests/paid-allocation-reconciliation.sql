begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team_members where active and lower(full_name)='yasmin' limit 1),true);
select public.v4_bind_authenticated_user();
do $test$
declare person uuid;owner uuid;other_owner uuid;payment uuid;allocation uuid;contract uuid;item uuid;
 debts uuid[]:='{}';members uuid[];commission uuid;comm_before jsonb;comm_after jsonb;key text:='test-paid-relink-'||gen_random_uuid();failed boolean;proof jsonb;n integer;
begin
 select id into owner from sunshine_v4.team_members where active and lower(full_name)='rosely';
 select id into other_owner from sunshine_v4.team_members where active and lower(full_name)='yasmin';
 person:=public.v4_api_save_person(null,jsonb_build_object('fullName','VALIDAÇÃO TEMPORÁRIA RECONCILIAÇÃO','status','ACTIVE'));
 for n in 1..3 loop
  insert into sunshine_v4.contracts(customer_person_id,source,status,idempotency_key,sold_at)
   values(person,'MANUAL_V4','CONFIRMED',key||':contract:'||n,'2026-10-21T12:00:00-03:00') returning id into contract;
  insert into sunshine_v4.contract_items(contract_id,beneficiary_person_id,service_code,service_name,amount_cents,responsible_member_id,service_category)
   values(contract,person,'TEST:RELINK','Serviço temporário',10000,case when n=3 then other_owner else owner end,'TRABALHO_PARTICULAR') returning id into item;
  insert into sunshine_v4.obligations(contract_item_id,beneficiary_person_id,total_cents) values(item,person,10000) returning id into contract;
  debts:=array_append(debts,contract);
 end loop;
 insert into sunshine_v4.payments(payer_person_id,source,amount_cents,net_cents,paid_at,idempotency_key,status)
  values(person,'MANUAL_V4',10000,10000,'2026-10-21T12:00:00-03:00',key||':receipt','PAID') returning id into payment;
 allocation:=public.v4_api_allocate_payment(payment,debts[1],4000,key||':partial');
 if (select explicit_status from sunshine_v4.obligations where id=debts[1]) is not null then raise exception 'Partial association marked settled';end if;
 failed:=false;begin perform public.v4_api_dismiss_pending_items(jsonb_build_array(jsonb_build_object('kind','EXISTING','id',payment)),'Não pode retirar parcial');exception when raise_exception then failed:=true;end;
 if not failed then raise exception 'Partial receipt dismissal accepted';end if;
 perform public.v4_api_allocate_payment(payment,debts[1],6000,key||':remainder');
 if (select explicit_status from sunshine_v4.obligations where id=debts[1])<>'SETTLED' then raise exception 'Association did not settle automatically';end if;
 select id into commission from sunshine_v4.commission_entries where allocation_id=allocation and beneficiary_member_id=owner;
 insert into sunshine_v4.commission_payment_entries(batch_key,commission_table,commission_id,recipient_name,amount_cents,paid_on,created_by)
  values(key,'V4',commission,'Rosely',100,'2026-10-21',auth.uid());
 select jsonb_agg(to_jsonb(c) order by id) into comm_before from sunshine_v4.commission_entries c where allocation_id=allocation;
 update sunshine_v4.payment_allocations set obligation_id=debts[2] where id=allocation;
 select jsonb_agg(to_jsonb(c) order by id) into comm_after from sunshine_v4.commission_entries c where allocation_id=allocation;
 if comm_before<>comm_after or not exists(select 1 from sunshine_v4.commission_payment_entries where commission_id=commission and amount_cents=100) then raise exception 'Paid commission ledger changed';end if;
 failed:=false;begin update sunshine_v4.payment_allocations set obligation_id=debts[3] where id=allocation;exception when raise_exception then failed:=true;end;
 if not failed then raise exception 'Different financial split accepted';end if;
 failed:=false;begin update sunshine_v4.payment_allocations set amount_cents=4001 where id=allocation;exception when raise_exception then failed:=true;end;
 if not failed then raise exception 'Settled base mutation accepted';end if;
 if has_function_privilege('anon','public.v4_api_restore_pending_item(text,uuid,text)','execute') then raise exception 'Anonymous restoration allowed';end if;
 perform set_config('sunshine.test_result','PASS: partial receipt cannot be dismissed; association automatically settles; equivalent relink preserves exact commission IDs/ledger; different split and amount changes blocked; anonymous blocked',true);
end $test$;
select current_setting('sunshine.test_result') result;
rollback;
