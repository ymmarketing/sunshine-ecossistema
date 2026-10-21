-- Find existing debts without date or amount-equality restrictions.
create or replace function public.v4_payment_debt_candidates()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb;
begin
 perform public.v4_bind_authenticated_user();
 perform sunshine_v4.v4_assert_permission('receivable.read');
 select coalesce(jsonb_agg(to_jsonb(x) order by x."personName",x."soldAt"),'[]') into v from (
  select o.id "obligationId",o.beneficiary_person_id "personId",c.customer_person_id "customerPersonId",
   coalesce(p.preferred_name,p.full_name,'Pessoa não identificada') "personName",
   i.service_name "serviceName",coalesce(w.title,i.event_name,i.service_name) "eventName",
   coalesce(w.scheduled_at,c.sold_at,c.created_at) "soldAt",i.reference_month "referenceMonth",
   i.responsible_member_id "responsibleMemberId",o.total_cents "totalCents",
   o.total_cents-coalesce(a.received,0) "pendingCents"
  from sunshine_v4.obligations o
  join sunshine_v4.contract_items i on i.id=o.contract_item_id
  join sunshine_v4.contracts c on c.id=i.contract_id
  left join sunshine_v4.people p on p.id=o.beneficiary_person_id
  left join sunshine_v4.works w on w.id=i.work_id
  left join lateral (select sum(amount_cents) received from sunshine_v4.payment_allocations where obligation_id=o.id)a on true
  where coalesce(o.explicit_status,'')<>'CANCELLED' and c.status<>'CANCELLED'
   and o.total_cents>coalesce(a.received,0)
 )x;
 return v;
end $$;
revoke all on function public.v4_payment_debt_candidates() from public,anon;
grant execute on function public.v4_payment_debt_candidates() to authenticated;

-- An atomic batch links existing receipts to one original debt. Replays return the
-- committed proof before examining the now reduced balance.
create or replace function public.v4_api_match_payments_to_debt(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_user uuid;v_key text:=nullif(btrim(p_payload->>'idempotencyKey'),'');
 v_debt uuid:=(p_payload->>'obligationId')::uuid;v_request bigint:=(p_payload->>'amountCents')::bigint;
 v_old jsonb;v_result jsonb;v_row jsonb;v_proofs jsonb:='[]';v_ids uuid[]:='{}';
 v_id uuid;v_payment uuid;v_available bigint;v_remaining bigint;v_before bigint;v_part bigint;v_item uuid;
 v_responsible uuid;v_person uuid;
begin
 v_user:=public.v4_bind_authenticated_user();
 perform sunshine_v4.v4_assert_permission('allocation.create');
 if v_key is null then raise exception 'Chave da confirmação obrigatória.';end if;
 perform pg_advisory_xact_lock(hashtextextended('debt-match:'||v_user::text||':'||v_key,0));
 select payload into v_old from sunshine_v4.audit_events
 where action='PAYMENTS_MATCHED_TO_DEBT' and actor_id=v_user and payload->>'key'=v_key limit 1;
 if v_old is not null then
  if v_old->'request' is distinct from p_payload then raise exception 'Esta confirmação já foi usada com outros dados.';end if;
  return v_old->'result';
 end if;
 if v_request is null or v_request<=0 then raise exception 'Informe um valor maior que zero.';end if;
 if jsonb_typeof(p_payload->'payments') is distinct from 'array' or jsonb_array_length(p_payload->'payments')=0 then
  raise exception 'Selecione ao menos um pagamento.';end if;
 if (select count(*) from jsonb_array_elements(p_payload->'payments')) <> (select count(distinct (value->>'kind',value->>'id')) from jsonb_array_elements(p_payload->'payments')) then raise exception 'Pagamento repetido na seleção.';end if;
 -- Deterministic receipt locks precede debt locks, also across different batches.
 for v_row in select value from jsonb_array_elements(p_payload->'payments') order by value->>'kind',value->>'id' loop
  v_id:=(v_row->>'id')::uuid;
  if upper(v_row->>'kind')='EXISTING' then
   perform 1 from sunshine_v4.payments where id=v_id for update;
   v_payment:=v_id;
  elsif upper(v_row->>'kind')='ASAAS' then
   perform 1 from public.asaas_incoming_payments where id=v_id for update;
   select p.id into v_payment from sunshine_v4.payments p join public.asaas_incoming_payments e
    on p.source='ASAAS' and p.external_ref=e.asaas_payment_id where e.id=v_id;
   if v_payment is not null then perform 1 from sunshine_v4.payments where id=v_payment for update;end if;
  else raise exception 'Tipo de pagamento inválido.';end if;
  if v_payment is not null then
   if v_payment=any(v_ids) then raise exception 'Pagamento repetido na seleção.';end if;
   v_ids:=array_append(v_ids,v_payment);
  end if;
 end loop;
 select o.total_cents-coalesce((select sum(a.amount_cents) from sunshine_v4.payment_allocations a where a.obligation_id=o.id),0),
  o.contract_item_id,o.beneficiary_person_id into v_before,v_item,v_person
 from sunshine_v4.obligations o join sunshine_v4.contract_items i on i.id=o.contract_item_id
 join sunshine_v4.contracts c on c.id=i.contract_id
 where o.id=v_debt and coalesce(o.explicit_status,'')<>'CANCELLED' and c.status<>'CANCELLED' for update of o;
 if v_before is null or v_before<=0 then raise exception 'Pendência não encontrada ou já quitada.';end if;
 if v_request>v_before then raise exception 'O valor supera o saldo atual desta pendência.';end if;
 select coalesce(nullif(p_payload->>'responsibleMemberId','')::uuid,responsible_member_id) into v_responsible
 from sunshine_v4.contract_items where id=v_item;
 v_remaining:=v_request;
 for v_row in select value from jsonb_array_elements(p_payload->'payments') order by value->>'kind',value->>'id' loop
  exit when v_remaining<=0;
  v_id:=(v_row->>'id')::uuid;v_payment:=null;v_available:=0;
  if upper(v_row->>'kind')='EXISTING' then v_payment:=v_id;
  else
   select p.id into v_payment from sunshine_v4.payments p join public.asaas_incoming_payments e
    on p.source='ASAAS' and p.external_ref=e.asaas_payment_id where e.id=v_id;
   if v_payment is null then
    select round(gross_amount*100)::bigint into v_available from public.asaas_incoming_payments
     where id=v_id and classification_status='PENDING' and latest_event_type in ('PAYMENT_RECEIVED','PAYMENT_CONFIRMED')
     and not exists(select 1 from sunshine_v4.payment_queue_dismissals d where d.entity_kind='ASAAS' and d.entity_id=v_id);
   end if;
  end if;
  if v_payment is not null then
   select p.amount_cents-p.retained_excess_cents-coalesce((select sum(a.amount_cents) from sunshine_v4.payment_allocations a where a.payment_id=p.id),0)
    into v_available from sunshine_v4.payments p where p.id=v_payment and p.status='PAID'
     and not exists(select 1 from sunshine_v4.payment_queue_dismissals d where d.entity_kind='EXISTING' and d.entity_id=p.id);
  end if;
  if coalesce(v_available,0)<=0 then raise exception 'Um pagamento selecionado não está mais disponível. Atualize a seleção.';end if;
  v_part:=least(v_available,v_remaining);
  v_result:=public.v4_api_regularize_obligation(v_debt,jsonb_build_object(
   'mode',upper(v_row->>'kind'),'paymentId',v_payment,'asaasEntryId',case when upper(v_row->>'kind')='ASAAS' then v_id end,
   'amountCents',v_part,'responsibleMemberId',v_responsible,'beneficiaryPersonId',v_person,
   'idempotencyKey','match:'||v_key||':'||v_id::text));
  v_proofs:=v_proofs||jsonb_build_array(v_result);v_remaining:=v_remaining-v_part;
 end loop;
 if v_remaining<>0 then raise exception 'Os pagamentos selecionados não cobrem o valor informado.';end if;
 v_result:=jsonb_build_object('obligationId',v_debt,'allocatedCents',v_request,'pendingBeforeCents',v_before,
  'pendingAfterCents',v_before-v_request,'receipts',v_proofs);
 perform sunshine_v4.v4_write_audit('PAYMENTS_MATCHED_TO_DEBT','obligation',v_debt,
  jsonb_build_object('key',v_key,'request',p_payload,'result',v_result));
 return v_result;
end $$;
revoke all on function public.v4_api_match_payments_to_debt(jsonb) from public,anon;
grant execute on function public.v4_api_match_payments_to_debt(jsonb) to authenticated;
