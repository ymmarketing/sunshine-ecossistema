begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from sunshine_v4.team_members where active and lower(full_name)='yasmin' limit 1),true);
do $test$
declare
 k text:='__TEST_PRIVATE_'||gen_random_uuid();mode text;p uuid;s uuid;t uuid;payment uuid;payments uuid[];entry uuid;
 payload jsonb;r jsonb;replay jsonb;proof jsonb;contract uuid;item uuid;obligation uuid;first_return date;failed boolean;details jsonb;commissions_before jsonb;i integer;
begin
 select id into t from sunshine_v4.team_members where active and lower(full_name)='yasmin';
 select id into s from sunshine_v4.services where active and category='TRABALHO_PARTICULAR' limit 1;
 p:=public.v4_api_save_person(null,jsonb_build_object('fullName',k,'birthDate','1990-01-01','status','ACTIVE'));
 foreach mode in array array['MANUAL','EXISTING','ASAAS','GROUP'] loop
  payload:=jsonb_build_object('idempotencyKey',k||mode,'customerPersonId',p,'payerPersonId',p,'source','MANUAL_V4','paymentMethod','PIX','receivedCents',80000,'paidAt','2026-11-01T12:00:00-03:00','items',jsonb_build_array(
  jsonb_build_object('beneficiaryPersonId',p,'serviceId',s,'serviceCategory','TRABALHO_PARTICULAR','serviceName','Limpeza espiritual','responsibleMemberId',t,'amountCents',120000,'allocateCents',60000,'privateWorkCategory','LIMPEZA_ESPIRITUAL','privateWorkDetails','Teste retorno'),
  jsonb_build_object('beneficiaryPersonId',p,'serviceId',s,'serviceCategory','TRABALHO_PARTICULAR','serviceName','Agrado','responsibleMemberId',t,'amountCents',20000,'allocateCents',20000,'privateWorkCategory','AGRADO','privateWorkEntities','Exu Tranca Ruas; Maria Padilha; Cabocla Jurema','privateWorkDetails','Múltiplas entidades <teste>')));
  if mode='MANUAL' then r:=public.v4_api_register_manual_entry_operational(payload);replay:=public.v4_api_register_manual_entry_operational(payload);
  elsif mode='EXISTING' then
   insert into sunshine_v4.payments(payer_person_id,source,amount_cents,net_cents,paid_at,idempotency_key,status) values(p,'MANUAL_V4',80000,80000,'2026-11-01T12:00:00-03:00',k||mode,'PAID') returning id into payment;
   r:=public.v4_api_associate_existing_payment_operational(payment,payload);replay:=public.v4_api_associate_existing_payment_operational(payment,payload);
  elsif mode='ASAAS' then
   insert into public.asaas_incoming_payments(asaas_payment_id,asaas_status,latest_event_type,gross_amount,net_amount,payment_date,customer_name) values(k||mode,'RECEIVED','PAYMENT_RECEIVED',800,800,'2026-11-01T12:00:00-03:00',k) returning id into entry;
   r:=public.v4_api_register_asaas_entry_operational(entry,payload);replay:=public.v4_api_register_asaas_entry_operational(entry,payload);
  else
   payments:='{}';for i in 1..2 loop
    insert into sunshine_v4.payments(payer_person_id,source,amount_cents,net_cents,paid_at,idempotency_key,status) values(p,'MANUAL_V4',40000,40000,'2026-11-01T12:00:00-03:00',k||mode||i,'PAID') returning id into payment;
    payments:=array_append(payments,payment);
   end loop;
   r:=public.v4_api_associate_payment_group_operational(payments,'{}',payload);replay:=public.v4_api_associate_payment_group_operational(payments,'{}',payload);
  end if;
  contract:=(r->>'contractId')::uuid;proof:=public.v4_entry_receipt(contract);
  if replay->>'contractId'<>contract::text or jsonb_array_length(proof->'items')<>2 then raise exception 'Idempotency/count failed: %',mode;end if;
  if proof->'items'->0->>'privateWorkCategory'<>'LIMPEZA_ESPIRITUAL' or proof->'items'->0->>'returnDueOn'<>'2026-11-22'
   or proof->'items'->1->>'privateWorkEntities'<>'Exu Tranca Ruas; Maria Padilha; Cabocla Jurema' then raise exception 'Private metadata proof failed: % %',mode,proof;end if;
  if (select count(*) from sunshine_v4.audit_events where action='PRIVATE_WORK_CLASSIFIED' and entity_id in (select id from sunshine_v4.contract_items where contract_id=contract))<>2 then raise exception 'Replay duplicated audit: %',mode;end if;
  item:=(proof->'items'->0->>'itemId')::uuid;
  select id into obligation from sunshine_v4.obligations where contract_item_id=item;
  insert into sunshine_v4.payments(payer_person_id,source,amount_cents,net_cents,paid_at,idempotency_key,status) values(p,'MANUAL_V4',60000,60000,'2026-11-05T12:00:00-03:00',k||mode||'-second','PAID') returning id into payment;
  insert into sunshine_v4.payment_allocations(payment_id,obligation_id,amount_cents,idempotency_key) values(payment,obligation,60000,k||mode||'-second-alloc');
  if private.sunshine_private_work_json(item)->>'returnDueOn'<>'2026-11-22' then raise exception 'Second payment restarted return clock';end if;
  details:=public.v4_payment_detail(payment);
  if details->'allocations'->0->>'privateWorkCategory'<>'LIMPEZA_ESPIRITUAL' then raise exception 'Payment detail missing metadata';end if;
 end loop;
 -- Classifying an existing item changes no paid/commission base and preserves identity.
 select jsonb_agg(to_jsonb(ce) order by ce.id) into commissions_before from sunshine_v4.commission_entries ce
 join sunshine_v4.payment_allocations pa on pa.id=ce.allocation_id join sunshine_v4.obligations o on o.id=pa.obligation_id where o.contract_item_id=item;
 perform public.v4_api_edit_financial_item(item,jsonb_build_object('beneficiaryPersonId',p,'amountCents',120000,'serviceName','Limpeza espiritual','serviceCategory','TRABALHO_PARTICULAR','responsibleMemberId',t,'privateWorkCategory','LIMPEZA_ESPIRITUAL','privateWorkDetails','Classificação revisada'),'Teste de classificação');
 if commissions_before is distinct from (select jsonb_agg(to_jsonb(ce) order by ce.id) from sunshine_v4.commission_entries ce
 join sunshine_v4.payment_allocations pa on pa.id=ce.allocation_id join sunshine_v4.obligations o on o.id=pa.obligation_id where o.contract_item_id=item) then raise exception 'Metadata edit changed commissions';end if;
 -- Existing agent endpoint, its restricted reader and the ERP query see the same metadata.
 details:=public.agent_sql('SELECT private_work_category, private_work_entities FROM itens_venda WHERE private_work_category = ''AGRADO'' AND private_work_entities ILIKE ''%Tranca Ruas%''');
 if jsonb_array_length(details)<4 then raise exception 'Agent existing view cannot query category/entities';end if;
 details:=public.agent_sql('SELECT person_name, return_due_on FROM trabalhos_particulares WHERE private_work_category = ''LIMPEZA_ESPIRITUAL'' AND return_due_on = DATE ''2026-11-22''');
 if jsonb_array_length(details)<4 then raise exception 'Agent return query failed';end if;
 details:=public.v4_private_works('AGRADO','padilha',null,200);
 if (details->>'total')::int<4 then raise exception 'ERP entity search failed';end if;
 if not exists(select 1 from jsonb_array_elements(public.agent_person_history(k)->'people'->0->'ultimas')x where x->>'categoria_particular'='AGRADO') then raise exception 'Agent person history missing category';end if;
 payload:=jsonb_set(payload,'{idempotencyKey}',to_jsonb(k||'-invalid'));
 payload:=jsonb_set(payload,'{items,1,privateWorkEntities}','null');failed:=false;
 begin perform public.v4_api_register_manual_entry_operational(payload);exception when check_violation then failed:=true;end;
 if not failed then raise exception 'Missing agrado entities accepted';end if;
 if exists(select 1 from sunshine_v4.contracts where idempotency_key like '%'||k||'-invalid%') then raise exception 'Invalid metadata committed financial records';end if;
 if has_table_privilege('anon','agent_ro.trabalhos_particulares','SELECT') or has_table_privilege('authenticated','agent_ro.trabalhos_particulares','SELECT')
  or not has_table_privilege('agent_reader','agent_ro.trabalhos_particulares','SELECT') or has_table_privilege('agent_reader','agent_ro.trabalhos_particulares','UPDATE') then raise exception 'Wrong agent view grants';end if;
 perform set_config('sunshine.private_test','PASS: 4 entry modes; category and multiple entities; atomic validation; idempotent retry; partial payments; 21 days from first payment; receipt and payment detail; existing Robovaldo SQL endpoint; entity search; restricted reader',true);
end $test$;
select current_setting('sunshine.private_test') result;
rollback;
