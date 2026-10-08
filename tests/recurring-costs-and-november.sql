-- Synthetic records roll back. Use current authenticated Yasmin claims as migration operator.
begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team_members where active and lower(full_name)='yasmin' limit 1),true);
do $test$
declare
 v_count integer;v_amount bigint;v_pending bigint;v_row jsonb;v_before jsonb;v_after jsonb;
 v_cost uuid;v_id uuid;v_person uuid;v_service uuid;v_member uuid;v_other uuid;v_allocation uuid;
 v_payload jsonb;v_result jsonb;v_split jsonb;v_override jsonb;v_failed boolean;v_case integer;
 v_at text;v_responsible_amount bigint;v_other_amount bigint;v_total bigint;v_key text:='test-recurring-'||gen_random_uuid();
begin
 if (select count(*) from sunshine_v4.recurring_fixed_costs)<>10 then raise exception 'Expected ten seeded recurring costs';end if;
 select count(*),sum(amount_cents) into v_count,v_amount from sunshine_v4.expenses where competence_month='2026-10-01' and recurring_cost_id is not null;
 if v_count<>10 or v_amount<>866890 then raise exception 'October adoption: %, %',v_count,v_amount;end if;
 if public.v4_ensure_monthly_costs('2026-10-01','2026-10-31')<>0 then raise exception 'October duplicated';end if;
 if (select sum(amount_cents) from sunshine_v4.expenses where cost_kind='LIABILITY')<>1600000 then raise exception 'Debt balances must remain distinct';end if;
 if exists(select 1 from private.sunshine_contribution_costs() where origin in ('COMMISSION','LEGACY_COMMISSION')) then raise exception 'Commissions included in contribution margin';end if;
 if has_function_privilege('anon','public.v4_api_pay_expense(uuid,date)','EXECUTE')
  or has_table_privilege('authenticated','sunshine_v4.recurring_fixed_costs','SELECT')
  or has_function_privilege('authenticated','private.sunshine_generate_recurring_costs(date,date)','EXECUTE') then raise exception 'Access boundary failed';end if;

 perform private.sunshine_generate_recurring_costs('2026-11-01','2026-11-01');
 if private.sunshine_generate_recurring_costs('2026-11-01','2026-11-01')<>0 then raise exception 'November replay duplicated';end if;
 select count(*),sum(amount_cents) into v_count,v_amount from sunshine_v4.expenses where competence_month='2026-11-01' and recurring_cost_id is not null;
 if v_count<>10 or v_amount<>866890 then raise exception 'November native costs: %, %',v_count,v_amount;end if;
 if exists(select 1 from sunshine_v4.expenses where competence_month='2026-11-01' and recurring_cost_id is not null and (status<>'PENDING' or paid_on is not null)) then raise exception 'Month opening presumed payment';end if;
 perform private.sunshine_generate_recurring_costs('2027-01-01','2027-12-01');
 if (select sum(e.amount_cents) from sunshine_v4.expenses e join sunshine_v4.recurring_fixed_costs r on r.id=e.recurring_cost_id where r.code='certificado' and e.competence_month between '2027-01-01' and '2027-12-01')<>20000 then raise exception 'Annual provision did not close at 200 reais';end if;
 perform private.sunshine_generate_recurring_costs('2029-03-01','2029-04-01');
 if exists(select 1 from sunshine_v4.expenses e join sunshine_v4.recurring_fixed_costs r on r.id=e.recurring_cost_id where r.code='pronampe' and e.competence_month='2029-04-01') then raise exception 'Pronampe continued after March 2029';end if;
 if (select count(*) from sunshine_v4.expenses where competence_month='2029-04-01' and recurring_cost_id is not null)<>9 then raise exception 'Other recurrences stopped with Pronampe';end if;

 select id into v_id from sunshine_v4.expenses where idempotency_key='fixed:2026-10:instagram';
 v_before:=public.v4_finance_management('2026-10-01','2026-10-31',2026);
 perform public.v4_api_pay_expense(v_id,(now() at time zone 'America/Sao_Paulo')::date);
 v_after:=public.v4_finance_management('2026-10-01','2026-10-31',2026);
 if v_before->>'costsCents' is distinct from v_after->>'costsCents' or v_before->>'profitCents' is distinct from v_after->>'profitCents' then raise exception 'Settlement double-counted a cost';end if;
 if (v_after->>'paidCostsCents')::bigint-(v_before->>'paidCostsCents')::bigint<>5900 or (v_before->>'pendingCostsCents')::bigint-(v_after->>'pendingCostsCents')::bigint<>5900 then raise exception 'Paid/pending balance did not move exactly once';end if;
 perform public.v4_api_set_expense_status(v_id,'PENDING','Reabrir teste');
 perform public.v4_api_set_expense_status(v_id,'CANCELLED','Excluir apenas este mês');
 perform public.v4_ensure_monthly_costs('2026-10-01','2026-10-31');
 if (select status from sunshine_v4.expenses where id=v_id)<>'CANCELLED' then raise exception 'Cancelled month recreated';end if;
 if (select status from sunshine_v4.expenses where idempotency_key='fixed:2026-11:instagram')<>'PENDING' then raise exception 'Single cancellation affected another month';end if;
 perform public.v4_api_set_expense_status(v_id,'PENDING','Restaurar teste');
 select id into v_cost from sunshine_v4.recurring_fixed_costs where code='manychat';
 perform public.v4_api_stop_recurring_cost(v_cost,'2026-11-01','Encerrar recorrência de teste');
 perform private.sunshine_generate_recurring_costs('2026-11-01','2026-11-01');
 if (select status from sunshine_v4.expenses where idempotency_key='fixed:2026-11:manychat')<>'CANCELLED' then raise exception 'Stopped recurrence recreated';end if;
 if (select status from sunshine_v4.expenses where idempotency_key='fixed:2026-10:manychat')<>'PENDING' then raise exception 'Stopping next month changed this month';end if;

 v_row:=public.v4_api_save_recurring_cost(null,jsonb_build_object('code',v_key,'description','VALIDAÇÃO TEMPORÁRIA - não manter','category','OPERACIONAL','amountCents',1200,'startMonth','2099-01-01'));
 if (public.v4_api_save_recurring_cost(null,jsonb_build_object('code',v_key,'description','VALIDAÇÃO TEMPORÁRIA - não manter','amountCents',1200,'startMonth','2099-01-01'))->>'id')<>v_row->>'id' then raise exception 'Template retry duplicated';end if;
 v_before:=public.v4_finance_management('2099-01-01','2099-01-31',2099);
 perform private.sunshine_generate_recurring_costs('2099-01-01','2099-01-01');
 v_after:=public.v4_finance_management('2099-01-01','2099-01-31',2099);
 if (v_after->>'costsCents')::bigint<1200 or (v_after->>'paidCostsCents')::bigint+(v_after->>'pendingCostsCents')::bigint<>(v_after->>'costsCents')::bigint then raise exception 'Complete cost breakdown did not close';end if;

 select id into v_member from sunshine_v4.team_members where active and lower(full_name)='yasmin';
 select id into v_other from sunshine_v4.team_members where active and lower(full_name)='lourdes';
 select id into v_service from sunshine_v4.services where coalesce(metadata->>'commission_mode','')<>'LOURDES_100' limit 1;
 v_person:=public.v4_api_save_person(null,jsonb_build_object('fullName','VALIDAÇÃO TEMPORÁRIA - não manter','birthDate','2000-01-01','status','ACTIVE'));
 -- Each recipient can be responsible; categories keep their current reserve until another approval.
 for v_case in 0..5 loop
  v_at:=case when v_case=0 then '2026-11-01T02:59:59Z' else '2026-11-01T03:00:00Z' end;
  select id into v_member from sunshine_v4.team_members where active and lower(full_name)=case when v_case in (2,4) then 'lourdes' when v_case in (3,5) then 'rosely' else 'yasmin' end;
  v_payload:=jsonb_build_object('idempotencyKey',v_key||'-entry-'||v_case,'customerPersonId',v_person,'payerPersonId',v_person,'source','MANUAL_V4','paymentMethod','PIX','receivedCents',100000,'paidAt',v_at,'items',jsonb_build_array(jsonb_build_object('beneficiaryPersonId',v_person,'serviceId',v_service,'serviceName','Validação regra mensal','serviceCategory',case when v_case=4 then 'CONSULTA' when v_case=5 then 'PERGUNTA' else 'TRABALHO_COLETIVO' end,'responsibleMemberId',v_member,'amountCents',100000,'allocateCents',100000,'participantName','Pessoa de teste')));
  if v_case=5 then v_payload:=jsonb_set(v_payload,'{items,0,questionText}',to_jsonb('Pergunta objetiva de validação temporária'::text));end if;
  v_result:=public.v4_api_register_manual_entry_operational(v_payload);
  select id into v_allocation from sunshine_v4.payment_allocations where payment_id=(v_result->>'paymentId')::uuid;
  select sum(amount_cents),sum(amount_cents) filter(where beneficiary_member_id=v_member),min(amount_cents) filter(where beneficiary_member_id<>v_member)
   into v_total,v_responsible_amount,v_other_amount from sunshine_v4.commission_entries where allocation_id=v_allocation;
  if v_total<>70000 or v_responsible_amount<>(case when v_case=0 then 49000 else 40000 end) or v_other_amount<>(case when v_case=0 then 10500 else 15000 end) then raise exception 'Receipt rule, case %: %, %, %',v_case,v_total,v_responsible_amount,v_other_amount;end if;
  if v_total+30000<>100000 then raise exception 'Gross split did not close';end if;
  -- A paid commission must not enter the margin or allow its base to be silently rebuilt.
  v_before:=public.v4_finance_management('2026-11-01','2026-11-30',2026);
  insert into sunshine_v4.commission_payment_entries(batch_key,commission_table,commission_id,recipient_name,amount_cents,paid_on,created_by)
   select v_key||'-payout-'||v_case,'V4',id,'Teste',100,date '2026-11-01',auth.uid() from sunshine_v4.commission_entries where allocation_id=v_allocation and beneficiary_member_id=v_member;
  v_after:=public.v4_finance_management('2026-11-01','2026-11-30',2026);
  if v_before->>'costsCents' is distinct from v_after->>'costsCents' then raise exception 'Commission payment changed contribution costs';end if;
  v_failed:=false;
  begin perform private.sunshine_build_october_commissions(v_allocation);exception when raise_exception then v_failed:=true;end;
  if not v_failed then raise exception 'Paid commission lost its protection';end if;
 end loop;
 -- No caller identity cannot mark a bill paid.
 v_failed:=false;
 begin
  perform set_config('request.jwt.claim.sub','',true);
  perform public.v4_api_pay_expense(v_id,current_date);
 exception when insufficient_privilege then v_failed:=true;end;
 if not v_failed then raise exception 'Unauthenticated expense payment allowed';end if;
end $test$;
rollback;
