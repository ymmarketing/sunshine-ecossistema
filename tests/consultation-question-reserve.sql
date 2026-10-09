-- Exercise real registration/allocation and dashboard RPCs; every synthetic row rolls back.
begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team_members where active and lower(full_name)='yasmin' limit 1),true);
do $test$
declare
 v_person uuid;v_service uuid;v_member uuid;v_item uuid;v_allocation uuid;
 v_case integer;v_category text;v_date text;v_key text:='test-no-reserve-'||gen_random_uuid();
 v_result jsonb;v_payload jsonb;v_dashboard jsonb;v_override jsonb;
 v_reserve_bp integer;v_commission_bp integer;v_cash bigint;v_other bigint;v_total bigint;v_owner bigint;
 v_amount bigint:=100003;v_failed boolean;
begin
 if has_function_privilege('authenticated','private.sunshine_item_split(uuid,date)','EXECUTE')
  or has_function_privilege('anon','public.v4_receipt_distribution_policies()','EXECUTE') then
  raise exception 'Distribution permissions changed';
 end if;
 select id into v_service from sunshine_v4.services where coalesce(metadata->>'commission_mode','')<>'LOURDES_100' limit 1;
 v_person:=public.v4_api_save_person(null,jsonb_build_object('fullName','VALIDAÇÃO TEMPORÁRIA - não manter','birthDate','2000-01-01','status','ACTIVE'));
 for v_case in 0..26 loop
  select id into v_member from sunshine_v4.team_members where active and lower(full_name)=case v_case%3 when 0 then 'yasmin' when 1 then 'lourdes' else 'rosely' end;
  v_category:=case (v_case/3)%3 when 0 then 'CONSULTA' when 1 then 'PERGUNTA' else 'TRABALHO_COLETIVO' end;
  v_date:=case v_case/9 when 0 then '2026-10-08T02:59:59Z' when 1 then '2026-10-08T03:00:00Z' else '2026-11-01T03:00:00Z' end;
  v_commission_bp:=case when v_case/9=2 then 1500 else 1050 end;
  v_reserve_bp:=case when v_case/9>0 and v_category in('CONSULTA','PERGUNTA') then 0 else 3000 end;
  v_cash:=round(v_amount*v_reserve_bp/10000.0)::bigint;
  v_other:=round(v_amount*v_commission_bp/10000.0)::bigint;
  -- Partial receipt: the service's full price must never become the commission base.
  v_payload:=jsonb_build_object('idempotencyKey',v_key||'-'||v_case,'customerPersonId',v_person,'payerPersonId',v_person,'source','MANUAL_V4','paymentMethod','PIX','receivedCents',v_amount,'paidAt',v_date,
   'items',jsonb_build_array(jsonb_build_object('beneficiaryPersonId',v_person,'serviceId',v_service,'serviceName','Validação isenção','serviceCategory',v_category,'responsibleMemberId',v_member,'amountCents',200000,'allocateCents',v_amount,'participantName','Pessoa de teste','questionText','Pergunta temporária de validação')));
  v_result:=public.v4_api_register_manual_entry_operational(v_payload);
  select a.id,i.id into v_allocation,v_item from sunshine_v4.payment_allocations a join sunshine_v4.obligations o on o.id=a.obligation_id join sunshine_v4.contract_items i on i.id=o.contract_item_id where a.payment_id=(v_result->>'paymentId')::uuid;
  select sum(amount_cents),sum(amount_cents)filter(where beneficiary_member_id=v_member)
  into v_total,v_owner from sunshine_v4.commission_entries where allocation_id=v_allocation;
  if v_total+v_cash<>v_amount or v_owner<>v_amount-v_cash-2*v_other
   or exists(select 1 from sunshine_v4.commission_entries where allocation_id=v_allocation and beneficiary_member_id<>v_member and(amount_cents<>v_other or percentage<>v_commission_bp/100.0))
   or exists(select 1 from sunshine_v4.commission_entries where allocation_id=v_allocation and base_cents<>v_amount-v_cash) then
   raise exception 'Gross receipt distribution failed: case %, total %, owner %',v_case,v_total,v_owner;
  end if;
  v_dashboard:=public.v4_finance_dashboard_filtered(date '2026-10-01',date '2026-11-30','RECEIPT',null,null);
  if not exists(select 1 from jsonb_array_elements(v_dashboard->'reserveEvidence')e where (e->>'allocationId')::uuid=v_allocation and (e->>'amountCents')::bigint=v_cash and (e->>'costBp')::integer=v_reserve_bp) then
   raise exception 'Reserve dashboard differs from actual commissions: case %',v_case;
  end if;
 end loop;
 -- An existing individual division cannot accidentally restore reserve on an exempt consultation.
 update sunshine_v4.contract_items set service_category='CONSULTA',commission_override=jsonb_build_object('costBp',2000,'shares',(select jsonb_agg(jsonb_build_object('memberId',id,'basisPoints',case when id=v_member then 6000 else 1000 end))from sunshine_v4.team_members where active)) where id=v_item;
 perform private.sunshine_build_october_commissions(v_allocation);
 select sum(amount_cents),sum(amount_cents)filter(where beneficiary_member_id=v_member) into v_total,v_owner from sunshine_v4.commission_entries where allocation_id=v_allocation;
 if v_total<>v_amount or v_owner<>v_amount-2*round(v_amount*.10)::bigint then raise exception 'Individual gross commission percentages were not preserved';end if;
 insert into sunshine_v4.commission_payment_entries(batch_key,commission_table,commission_id,recipient_name,amount_cents,paid_on,created_by)
 select v_key||'-payout','V4',id,'Teste',100,date '2026-11-01',auth.uid() from sunshine_v4.commission_entries where allocation_id=v_allocation and beneficiary_member_id=v_member;
 v_failed:=false;
 begin perform private.sunshine_build_october_commissions(v_allocation);exception when raise_exception then v_failed:=true;end;
 if not v_failed then raise exception 'Paid commission protection was removed';end if;
end $test$;
rollback;
