-- Run against Supabase as the migration operator. Every synthetic change rolls back.
begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team_members where active and lower(full_name)='yasmin' limit 1),true);
do $test$
declare
 v_person uuid;v_service uuid;v_work uuid;v_responsible uuid;v_other uuid;v_payment uuid;v_contract uuid;v_item uuid;v_allocation uuid;
 v_result jsonb;v_replay jsonb;v_payload jsonb;v_before jsonb;v_after jsonb;v_expense uuid;v_void uuid;v_commission uuid;
 v_base bigint;v_amount bigint;v_failed boolean;v_count integer;v_payments uuid[];v_entry uuid;v_key text:='test-finance-'||gen_random_uuid();
begin
 select id into v_responsible from sunshine_v4.team_members where active and lower(full_name)='yasmin';
 select id into v_other from sunshine_v4.team_members where active and lower(full_name)='lourdes';
 select id into v_service from sunshine_v4.services where coalesce(metadata->>'commission_mode','')<>'LOURDES_100' limit 1;
 select id into v_work from sunshine_v4.works where status='OPEN' limit 1;
 v_person:=public.v4_api_save_person(null,jsonb_build_object('fullName','VALIDAÇÃO TEMPORÁRIA — não manter','birthDate','2000-02-29','sex','NAO_INFORMADO','status','ACTIVE'));
 if not exists(select 1 from jsonb_array_elements(public.v4_birthdays('2027-02-28',2))x where x->>'id'=v_person::text and x->>'birthday'='2027-02-28') then raise exception 'Birthday leap year failed';end if;

 v_before:=public.v4_finance_management('2099-01-01','2099-01-31',2099);
 v_result:=public.v4_api_save_expense(null,jsonb_build_object('description','Despesa temporária','category','OUTRO','scope','FIXED','amountCents',1000,'occurredOn','2099-01-10','paidOn','2099-01-12','status','PAID','allocations','[]'::jsonb,'idempotencyKey',v_key||'-expense'));
 v_expense:=(v_result->>'id')::uuid;
 v_replay:=public.v4_api_save_expense(null,jsonb_build_object('description','Despesa temporária','scope','FIXED','amountCents',1000,'occurredOn','2099-01-10','paidOn','2099-01-12','status','PAID','idempotencyKey',v_key||'-expense'));
 if (v_replay->>'id')::uuid<>v_expense then raise exception 'Expense retry duplicated';end if;
 v_after:=public.v4_finance_management('2099-01-01','2099-01-31',2099);
 if (v_after->>'costsCents')::bigint-(v_before->>'costsCents')::bigint<>1000 or (v_after->>'profitCents')::bigint-(v_before->>'profitCents')::bigint<>-1000 then raise exception 'Paid expense calculation failed';end if;
 v_failed:=false;
 begin
  perform public.v4_api_save_expense(null,jsonb_build_object('description','Rateio inválido','scope','WORK','amountCents',1000,'occurredOn','2099-01-10','status','PENDING','allocations',jsonb_build_array(jsonb_build_object('workId',v_work,'amountCents',999)),'idempotencyKey',v_key||'-invalid'));
 exception when raise_exception then v_failed:=true;end;
 if not v_failed then raise exception 'Invalid allocation accepted';end if;
 perform public.v4_api_save_expense(v_expense,jsonb_build_object('description','Despesa temporária alterada','category','OUTRO','scope','WORK','amountCents',1200,'occurredOn','2099-01-10','status','PENDING','allocations',jsonb_build_array(jsonb_build_object('serviceId',v_service,'amountCents',1200))));
 perform public.v4_api_set_expense_status(v_expense,'CANCELLED','Validação temporária');
 perform public.v4_api_set_expense_status(v_expense,'PENDING','Restaurar teste');
 if (public.v4_finance_management('2099-01-01','2099-01-31',2099)->>'pendingCostsCents')::bigint<>1200 then raise exception 'Pending expense status failed';end if;
 perform public.v4_api_save_finance_goal('2099-01-19',jsonb_build_object('revenueCents',10000,'costsCents',2000,'profitCents',8000,'marginBp',8000,'salesCents',10000));
 if (public.v4_finance_management('2099-01-01','2099-01-31',2099)->'annual'->0->'goals'->>'revenue_cents')::bigint<>10000 then raise exception 'Goals failed';end if;

 v_payload:=jsonb_build_object('idempotencyKey',v_key||'-october','customerPersonId',v_person,'payerPersonId',v_person,'source','MANUAL_V4','paymentMethod','PIX','receivedCents',10000,'paidAt','2026-10-01T12:00:00-03:00','items',jsonb_build_array(jsonb_build_object('beneficiaryPersonId',v_person,'serviceId',v_service,'serviceName','Validação','serviceCategory','TRABALHO_COLETIVO','responsibleMemberId',v_responsible,'workId',v_work,'amountCents',10000,'allocateCents',10000,'participantName','Pessoa de teste')));
 v_result:=public.v4_api_register_manual_entry_operational(v_payload);
 v_contract:=(v_result->>'contractId')::uuid;v_payment:=(v_result->>'paymentId')::uuid;v_item:=(v_result->'items'->0->>'itemId')::uuid;
 select a.id into v_allocation from sunshine_v4.payment_allocations a join sunshine_v4.obligations o on o.id=a.obligation_id where o.contract_item_id=v_item;
 if (public.v4_entry_receipt(v_contract)->'items'->0->>'registrationId') is null then raise exception 'Persisted work registration missing';end if;
 select sum(amount_cents),sum(amount_cents) filter(where beneficiary_member_id=v_responsible) into v_base,v_amount from sunshine_v4.commission_entries where allocation_id=v_allocation;
 if v_base<>7000 or v_amount<>4900 then raise exception 'October split failed: %, %',v_base,v_amount;end if;
 v_replay:=public.v4_api_register_manual_entry_operational(v_payload);
 if v_replay->>'contractId'<>v_result->>'contractId' or jsonb_array_length(v_replay->'items')<>1 then raise exception 'Manual retry failed';end if;

 perform public.v4_api_edit_financial_item(v_item,jsonb_build_object('beneficiaryPersonId',v_person,'amountCents',10000,'workId',v_work,'serviceName','Corrigido','serviceCategory','TRABALHO_COLETIVO','responsibleMemberId',v_responsible,'commissionOverride',jsonb_build_object('costBp',2000,'shares',jsonb_build_array(jsonb_build_object('memberId',v_responsible,'basisPoints',6000),jsonb_build_object('memberId',v_other,'basisPoints',1000),(select jsonb_build_object('memberId',id,'basisPoints',1000) from sunshine_v4.team_members where active and id not in(v_responsible,v_other) limit 1)))),'Divisão individual de teste');
 if (select sum(amount_cents) from sunshine_v4.commission_entries where allocation_id=v_allocation)<>8000 then raise exception 'Individual split failed';end if;
 v_void:=public.v4_api_void_financial_record(v_payment,v_allocation,'Remover associação temporária');
 if exists(select 1 from sunshine_v4.payment_allocations where id=v_allocation) then raise exception 'Detach failed';end if;
 perform public.v4_api_restore_financial_record(v_void,'Restaurar associação temporária');
 if (select sum(amount_cents) from sunshine_v4.commission_entries where allocation_id=v_allocation)<>8000 then raise exception 'Restore failed';end if;
 select id into v_commission from sunshine_v4.commission_entries where allocation_id=v_allocation and beneficiary_member_id=v_responsible;
 insert into sunshine_v4.commission_payment_entries(batch_key,commission_table,commission_id,recipient_name,amount_cents,paid_on,created_by) values(v_key||'-payout','V4',v_commission,'Yasmin',100,'2026-10-02',auth.uid());
 v_failed:=false;
 begin perform public.v4_api_void_financial_record(v_payment,v_allocation,'Não deve excluir comissão paga');exception when raise_exception then v_failed:=true;end;
 if not v_failed then raise exception 'Paid commission was not protected';end if;
 -- Metadata edits must not erase or recompute the settled ledger.
 perform public.v4_api_update_contract_item(v_item,'Evento corrigido','Corrigido','TRABALHO_COLETIVO',v_responsible,null,null);
 if not exists(select 1 from sunshine_v4.commission_payment_entries where commission_id=v_commission and amount_cents=100) then raise exception 'Paid ledger changed';end if;

 v_payload:=jsonb_set(jsonb_set(v_payload,'{idempotencyKey}',to_jsonb(v_key||'-september')),'{paidAt}','"2026-09-30T12:00:00-03:00"');
 v_result:=public.v4_api_register_manual_entry_operational(v_payload);
 select sum(ce.amount_cents) into v_amount from sunshine_v4.commission_entries ce join sunshine_v4.payment_allocations a on a.id=ce.allocation_id where a.payment_id=(v_result->>'paymentId')::uuid;
 if v_amount<>10000 then raise exception 'Historical sale rule changed: %',v_amount;end if;

 -- Before/after midnight in Sao Paulo, despite both timestamps being October UTC.
 for v_count in 0..1 loop
  v_payload:=v_payload||jsonb_build_object('idempotencyKey',v_key||'-boundary-'||v_count,'paidAt',case when v_count=0 then '2026-10-01T02:59:59Z' else '2026-10-01T03:00:00Z' end);
  v_result:=public.v4_api_register_manual_entry_operational(v_payload);
  select sum(ce.amount_cents) into v_amount from sunshine_v4.commission_entries ce join sunshine_v4.payment_allocations a on a.id=ce.allocation_id where a.payment_id=(v_result->>'paymentId')::uuid;
  if v_amount<>(case when v_count=0 then 10000 else 7000 end) then raise exception 'Sao Paulo midnight commission boundary failed: %, %',v_count,v_amount;end if;
 end loop;

 -- A fully associated receipt can be replayed with the same key.
 insert into sunshine_v4.payments(payer_person_id,source,amount_cents,net_cents,paid_at,idempotency_key,status) values(v_person,'MANUAL_V4',10000,10000,'2026-10-03T12:00:00-03:00',v_key||'-existing-payment','PAID') returning id into v_payment;
 v_payload:=jsonb_set(v_payload,'{idempotencyKey}',to_jsonb(v_key||'-existing'));
 v_result:=public.v4_api_associate_existing_payment_operational(v_payment,v_payload);
 v_replay:=public.v4_api_associate_existing_payment_operational(v_payment,v_payload);
 if v_result->>'contractId'<>v_replay->>'contractId' or jsonb_array_length(v_replay->'items')<>1 then raise exception 'Existing receipt retry failed';end if;

 -- Two receipts cover one service. Retry returns the same fully persisted association.
 v_payments:='{}';
 for v_count in 1..2 loop
  insert into sunshine_v4.payments(payer_person_id,source,amount_cents,net_cents,paid_at,idempotency_key,status) values(v_person,'MANUAL_V4',5000,5000,'2026-10-03T12:00:00-03:00',v_key||'-group-payment-'||v_count,'PAID') returning id into v_payment;
  v_payments:=array_append(v_payments,v_payment);
 end loop;
 v_payload:=jsonb_set(v_payload,'{idempotencyKey}',to_jsonb(v_key||'-group'));
 v_result:=public.v4_api_associate_payment_group_operational(v_payments,'{}',v_payload);
 v_replay:=public.v4_api_associate_payment_group_operational(v_payments,'{}',v_payload);
 if v_result->>'contractId'<>v_replay->>'contractId' or (v_replay->'items'->0->>'allocatedCents')::bigint<>10000 then raise exception 'Grouped retry failed';end if;

 -- Multiple references keep their original order on retry, not UUID order.
 v_payload:=jsonb_set(v_payload,'{idempotencyKey}',to_jsonb(v_key||'-references'))||jsonb_build_object('receivedCents',20000,'paidAt','2026-10-04T12:00:00-03:00','items',jsonb_build_array(
  (v_payload->'items'->0)||jsonb_build_object('serviceCategory','MENSALIDADE','referenceMonth','2026-10-01'),
  (v_payload->'items'->0)||jsonb_build_object('serviceCategory','MENSALIDADE','referenceMonth','2026-11-01')));
 v_result:=public.v4_api_register_manual_entry_operational(v_payload);
 v_replay:=public.v4_api_register_manual_entry_operational(v_payload);
 if (public.v4_entry_receipt((v_result->>'contractId')::uuid)->'items'->0->>'referenceMonth')<>'2026-10-01'
  or (public.v4_entry_receipt((v_result->>'contractId')::uuid)->'items'->1->>'referenceMonth')<>'2026-11-01' then raise exception 'Retry changed reference order';end if;

 insert into public.asaas_incoming_payments(asaas_payment_id,asaas_status,latest_event_type,gross_amount,net_amount,payment_date,customer_name)
 values(v_key||'-asaas','CONFIRMED','PAYMENT_CONFIRMED',100,95,'2099-01-08T12:00:00-03:00','Pessoa de teste') returning id into v_entry;
 v_payload:=jsonb_set(jsonb_set(v_payload,'{idempotencyKey}',to_jsonb(v_key||'-asaas')),'{items}',jsonb_build_array(v_payload->'items'->0))||jsonb_build_object('receivedCents',10000);
 v_before:=public.v4_cash_availability('2099-01-01','2099-01-31');
 if (v_before->>'pendingTransferCents')::bigint<>9500 then raise exception 'Confirmed Asaas counted as available';end if;
 v_result:=public.v4_api_register_asaas_entry_operational(v_entry,v_payload);
 v_replay:=public.v4_api_register_asaas_entry_operational(v_entry,v_payload);
 if v_result->>'contractId'<>v_replay->>'contractId' then raise exception 'Asaas retry failed';end if;
 if (public.v4_cash_availability('2099-01-01','2099-01-31')->>'pendingTransferCents')::bigint<>9500 then raise exception 'Asaas receipt duplicated after import';end if;
 update public.asaas_incoming_payments set asaas_status='RECEIVED',latest_event_type='PAYMENT_RECEIVED' where id=v_entry;
 v_after:=public.v4_cash_availability('2099-01-01','2099-01-31');
 if (v_after->>'availableCents')::bigint<>9500 or (v_after->>'pendingTransferCents')::bigint<>0 then raise exception 'Asaas release did not update cash';end if;

 v_result:=public.v4_prepare_accountant_report('2099-01-01','2099-01-31','https://drive.google.com/drive/folders/test',v_key||'-report');
 if v_result->>'recipient'<>'bksm00@gmail.com' or v_result->>'status'<>'DRAFT' then raise exception 'Accountant draft failed';end if;
 if exists(select 1 from sunshine_v4.accountant_reports where id=(v_result->>'id')::uuid and status='SENT') then raise exception 'Test unexpectedly sent email';end if;
 perform set_config('sunshine.test_result','PASS: expenses, goals, birthdays, all four entry retries, multi-reference ordering, October and historical splits including Sao Paulo midnight, individual split, reversible exclusion, protected payout, Asaas pending/released cash and deduplication, draft without sending',true);
end $test$;
select current_setting('sunshine.test_result') as test_result;
rollback;
