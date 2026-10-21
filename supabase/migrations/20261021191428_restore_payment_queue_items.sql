alter table sunshine_v4.payment_queue_dismissals add column restored_at timestamptz, add column restored_by uuid, add column restoration_reason text;
CREATE OR REPLACE FUNCTION public.v4_api_match_payments_to_debt(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     and not exists(select 1 from sunshine_v4.payment_queue_dismissals d where d.restored_at is null and d.entity_kind='ASAAS' and d.entity_id=v_id);
   end if;
  end if;
  if v_payment is not null then
   select p.amount_cents-p.retained_excess_cents-coalesce((select sum(a.amount_cents) from sunshine_v4.payment_allocations a where a.payment_id=p.id),0)
    into v_available from sunshine_v4.payments p where p.id=v_payment and p.status='PAID'
     and not exists(select 1 from sunshine_v4.payment_queue_dismissals d where d.restored_at is null and d.entity_kind='EXISTING' and d.entity_id=p.id);
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
end $function$
;
CREATE OR REPLACE FUNCTION public.v4_unassociated_receipts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_payments jsonb;v_asaas jsonb;
begin
 perform public.v4_bind_authenticated_user();
 perform sunshine_v4.v4_assert_permission('payment.read');
 select coalesce(jsonb_agg(to_jsonb(x) order by x.paid_at desc),'[]') into v_payments from (
  select p.id payment_id,p.payer_person_id,coalesce(pp.preferred_name,pp.full_name,p.payer_snapshot->>'name','Pagador não identificado') payer_name,
   p.amount_cents,r.allocated_cents,r.signed_unallocated_cents signed_unallocated_cents,
   p.paid_at,p.source,p.payment_method,p.payer_resolution_status
  from sunshine_v4.payments p join sunshine_v4.payment_reconciliation r on r.payment_id=p.id
  left join sunshine_v4.people pp on pp.id=p.payer_person_id
  where p.status='PAID' and p.source<>'IMPORT' and r.signed_unallocated_cents>0
   and not exists(select 1 from sunshine_v4.payment_queue_dismissals d where d.restored_at is null and d.entity_kind='EXISTING' and d.entity_id=p.id)
 )x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.paid_at desc),'[]') into v_asaas from (
  select e.id entry_id,e.asaas_payment_id,coalesce(e.customer_name,'Pagador não identificado') payer_name,
   round(e.gross_amount*100)::bigint amount_cents,round(coalesce(e.net_amount,e.gross_amount)*100)::bigint net_cents,
   coalesce(e.payment_date,e.received_at) paid_at,e.billing_type payment_method,
   (select p.id from sunshine_v4.people p where p.legacy_v3_id=e.matched_client_id or p.asaas_customer_id=e.asaas_customer_id
    order by (p.asaas_customer_id=e.asaas_customer_id) desc nulls last,p.id limit 1) matched_person_id
  from public.asaas_incoming_payments e
  where e.classification_status='PENDING' and e.latest_event_type in ('PAYMENT_RECEIVED','PAYMENT_CONFIRMED')
   and not exists(select 1 from sunshine_v4.payments p where p.source='ASAAS' and p.external_ref=e.asaas_payment_id)
   and not exists(select 1 from sunshine_v4.payment_queue_dismissals d where d.restored_at is null and d.entity_kind='ASAAS' and d.entity_id=e.id)
 )x;
 return jsonb_build_object('payments',v_payments,'asaas',v_asaas);
end $function$
;
CREATE OR REPLACE FUNCTION public.v4_recent_payments(p_start date, p_end date, p_limit integer DEFAULT 50)
 RETURNS TABLE(payment_id uuid, payer_person_id uuid, payer_name text, amount_cents bigint, allocated_cents bigint, signed_unallocated_cents bigint, paid_at timestamp with time zone, source text, payment_method text, payer_resolution_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
begin
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('payment.read');
  return query
  select p.id,p.payer_person_id,coalesce(pp.preferred_name,pp.full_name,p.payer_snapshot->>'name','Pagador não identificado'),
    p.amount_cents,r.allocated_cents,r.signed_unallocated_cents,p.paid_at,p.source,p.payment_method,p.payer_resolution_status
  from sunshine_v4.payments p join sunshine_v4.payment_reconciliation r on r.payment_id=p.id
  left join sunshine_v4.people pp on pp.id=p.payer_person_id
  where p.status='PAID' and p.paid_at::date between p_start and p_end
    and not exists(select 1 from sunshine_v4.payment_queue_dismissals d where d.restored_at is null and d.entity_kind='EXISTING' and d.entity_id=p.id)
  order by p.paid_at desc limit least(greatest(coalesce(p_limit,50),1),200);
end $function$
;
CREATE OR REPLACE FUNCTION public.v4_asaas_pending(p_limit integer DEFAULT 100)
 RETURNS TABLE(entry_id uuid, asaas_payment_id text, payer_name text, amount_cents bigint, net_cents bigint, paid_at timestamp with time zone, payment_method text, matched_person_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
begin
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('payment.read');
  return query
  select aip.id,aip.asaas_payment_id,coalesce(aip.customer_name,'Pagador não identificado'),
    round(coalesce(aip.gross_amount,0)*100)::bigint,round(coalesce(aip.net_amount,aip.gross_amount,0)*100)::bigint,
    coalesce(aip.payment_date,aip.received_at),aip.billing_type,vp.id
  from public.asaas_incoming_payments aip left join sunshine_v4.people vp on vp.legacy_v3_id=aip.matched_client_id
  where aip.classification_status='PENDING'
    and upper(coalesce(aip.latest_event_type,'')) in ('PAYMENT_RECEIVED','PAYMENT_CONFIRMED')
    and not exists(select 1 from sunshine_v4.payments p where p.source='ASAAS' and p.external_ref=aip.asaas_payment_id)
    and not exists(select 1 from sunshine_v4.payment_queue_dismissals d where d.restored_at is null and d.entity_kind='ASAAS' and d.entity_id=aip.id)
  order by coalesce(aip.payment_date,aip.received_at) desc
  limit least(greatest(coalesce(p_limit,100),1),500);
end $function$
;
CREATE OR REPLACE FUNCTION public.v4_api_dismiss_pending_items(p_items jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare v_user uuid; v_item jsonb; v_kind text; v_id uuid; v_count integer:=0;
begin
  v_user:=public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('payment.dismiss');
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Selecione ao menos um lançamento.'; end if;
  if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Informe a justificativa.'; end if;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_kind:=upper(coalesce(v_item->>'kind',''));
    v_id:=nullif(v_item->>'id','')::uuid;
    if v_kind not in ('EXISTING','ASAAS') or v_id is null then raise exception 'Lançamento inválido.'; end if;
    if v_kind='EXISTING' and not exists(select 1 from sunshine_v4.payments where id=v_id) then raise exception 'Pagamento não encontrado.'; end if;
    if v_kind='ASAAS' and not exists(select 1 from public.asaas_incoming_payments where id=v_id) then raise exception 'Entrada Asaas não encontrada.'; end if;
    if v_kind='EXISTING' then
      perform 1 from sunshine_v4.payments where id=v_id for update;
      if exists(select 1 from sunshine_v4.payment_allocations where payment_id=v_id) then
        raise exception 'Este recebimento já tem valor associado. Associe o saldo restante ou corrija os vínculos; ele não pode ser retirado como duplicado.';
      end if;
    end if;
    insert into sunshine_v4.payment_queue_dismissals(entity_kind,entity_id,reason,dismissed_by)
    values(v_kind,v_id,btrim(p_reason),v_user)
    on conflict(entity_kind,entity_id) do update set reason=excluded.reason,dismissed_by=excluded.dismissed_by,dismissed_at=now(),restored_at=null,restored_by=null,restoration_reason=null;
    perform sunshine_v4.v4_write_audit('PAYMENT_QUEUE_DISMISSED',case when v_kind='ASAAS' then 'asaas_incoming_payment' else 'payment' end,v_id,
      jsonb_build_object('reason',btrim(p_reason),'evidencePreserved',true));
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('dismissedCount',v_count);
end $function$
;
CREATE OR REPLACE FUNCTION private.sunshine_receipts()
 RETURNS TABLE(payment_id uuid, entry_id uuid, payer_name text, gross_cents bigint, net_cents bigint, fees_cents bigint, paid_on date, source text, method text, availability text, credit_on date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id,a.id,coalesce(pp.preferred_name,pp.full_name,p.payer_snapshot->>'name','Sem identificação'),
    p.amount_cents,coalesce(p.net_cents,p.amount_cents-p.fees_cents),p.fees_cents,
    (p.paid_at at time zone 'America/Sao_Paulo')::date,p.source,p.payment_method,
    case when p.source<>'ASAAS' then 'AVAILABLE'
      when coalesce(a.asaas_status,p.payer_snapshot->>'asaasStatus') in ('RECEIVED','RECEIVED_IN_CASH') then 'AVAILABLE'
      when coalesce(a.asaas_status,p.payer_snapshot->>'asaasStatus')='CONFIRMED' then 'PENDING_TRANSFER'
      else 'UNKNOWN' end,
    nullif(coalesce(a.payment_snapshot->>'creditDate',a.payment_snapshot->>'estimatedCreditDate'),'')::date
  from sunshine_v4.payments p left join sunshine_v4.people pp on pp.id=p.payer_person_id
  left join public.asaas_incoming_payments a on p.source='ASAAS' and a.asaas_payment_id=p.external_ref
  where upper(coalesce(p.status,'PAID'))='PAID'
    and (a.id is null or upper(coalesce(a.asaas_status,'')) not in ('REFUNDED','REFUND_IN_PROGRESS','CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE'))
    and not exists(select 1 from sunshine_v4.payment_queue_dismissals d where d.restored_at is null and d.entity_kind='EXISTING' and d.entity_id=p.id)
  union all
  select null,a.id,coalesce(a.customer_name,'Sem identificação'),round(a.gross_amount*100)::bigint,
    round(coalesce(a.net_amount,a.gross_amount)*100)::bigint,
    greatest(round((a.gross_amount-coalesce(a.net_amount,a.gross_amount))*100)::bigint,0),
    (coalesce(a.payment_date,a.received_at) at time zone 'America/Sao_Paulo')::date,'ASAAS',a.billing_type,
    case when a.asaas_status in ('RECEIVED','RECEIVED_IN_CASH') then 'AVAILABLE' else 'PENDING_TRANSFER' end,
    nullif(coalesce(a.payment_snapshot->>'creditDate',a.payment_snapshot->>'estimatedCreditDate'),'')::date
  from public.asaas_incoming_payments a
  where a.classification_status='PENDING' and a.asaas_status in ('RECEIVED','RECEIVED_IN_CASH','CONFIRMED')
    and not exists(select 1 from sunshine_v4.payments p where p.source='ASAAS' and p.external_ref=a.asaas_payment_id)
    and not exists(select 1 from sunshine_v4.payment_queue_dismissals d where d.restored_at is null and d.entity_kind='ASAAS' and d.entity_id=a.id);
$function$
;
CREATE OR REPLACE FUNCTION public.v4_finance_dashboard_filtered(p_start date, p_end date, p_basis text DEFAULT 'RECEIPT'::text, p_responsible_member_id uuid DEFAULT NULL::uuid, p_service_category text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare v_result jsonb; v_payments jsonb; v_unassociated bigint; v_reserve bigint; v_reserve_evidence jsonb; v_sales jsonb;
begin
  v_result:=public.v4_finance_dashboard_filtered_before_queue_dismissals(p_start,p_end,p_basis,p_responsible_member_id,p_service_category);
  select coalesce(jsonb_agg(case when d.entity_id is not null then e.value || jsonb_build_object('unassociatedCents',0) else e.value end
      order by e.ordinality),'[]'::jsonb),
    coalesce(sum(case when d.entity_id is null then (e.value->>'unassociatedCents')::bigint else 0 end),0)
  into v_payments,v_unassociated
  from jsonb_array_elements(coalesce(v_result->'paymentEvidence','[]'::jsonb)) with ordinality e(value,ordinality)
  left join sunshine_v4.payment_queue_dismissals d on d.restored_at is null and d.entity_kind='EXISTING' and d.entity_id=(e.value->>'paymentId')::uuid;
  -- Reuse the filtered sales evidence to keep period, responsible and category in sync.
  with rows as (
    select a.id,a.amount_cents base_cents,p.paid_at,i.service_name,
      coalesce(bp.preferred_name,bp.full_name,p.payer_snapshot->>'name','Pessoa não identificada') person_name,
      (private.sunshine_item_split(i.id,(p.paid_at at time zone 'America/Sao_Paulo')::date)->>'costBp')::integer cost_bp
    from sunshine_v4.payment_allocations a
    join sunshine_v4.payments p on p.id=a.payment_id
    join sunshine_v4.obligations o on o.id=a.obligation_id
    join sunshine_v4.contract_items i on i.id=o.contract_item_id
    left join sunshine_v4.people bp on bp.id=coalesce(o.beneficiary_person_id,i.beneficiary_person_id)
    where p.status='PAID' and private.sunshine_uses_october_rule(a.id)
      and exists(select 1 from jsonb_array_elements(coalesce(v_result->'salesEvidence','[]'::jsonb)) e
        where case when upper(coalesce(p_basis,'RECEIPT'))='RECEIPT'
          then (e->>'evidenceId')::uuid=a.id else (e->>'obligationId')::uuid=o.id end)
  ), amounts as (select *,round(base_cents*cost_bp/10000.0)::bigint reserve_cents from rows)
  select coalesce(sum(reserve_cents),0),coalesce(jsonb_agg(jsonb_build_object(
    'allocationId',id,'personName',person_name,'serviceName',service_name,'paidAt',paid_at,
    'baseCents',base_cents,'costBp',cost_bp,'amountCents',reserve_cents
  ) order by paid_at desc,id),'[]'::jsonb) into v_reserve,v_reserve_evidence from amounts;
  -- Keep the filtered evidence and cents; add only the identifying detail for each service.
  select coalesce(jsonb_agg(e.value || jsonb_build_object(
    'eventName',nullif(btrim(i.event_name),''),
    'workTitle',w.title,
    'responsibleName',t.full_name,
    'referenceMonth',i.reference_month,
    'questionText',nullif(btrim(i.question_text),'')
  ) order by e.ordinality),'[]'::jsonb) into v_sales
  from jsonb_array_elements(coalesce(v_result->'salesEvidence','[]'::jsonb)) with ordinality e(value,ordinality)
  left join sunshine_v4.obligations o on o.id=(e.value->>'obligationId')::uuid
  left join sunshine_v4.contract_items i on i.id=o.contract_item_id
  left join sunshine_v4.works w on w.id=i.work_id
  left join sunshine_v4.team_members t on t.id=i.responsible_member_id;
  return v_result || jsonb_build_object('salesEvidence',v_sales,'paymentEvidence',v_payments,'unassociatedCents',v_unassociated,
    'reserveCents',v_reserve,'reserveEvidence',v_reserve_evidence);
end $function$
;

create or replace function public.v4_api_restore_pending_item(p_kind text,p_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;before_row jsonb;
begin
 u:=public.v4_bind_authenticated_user();perform sunshine_v4.v4_assert_permission('record.update');
 if upper(p_kind) not in('EXISTING','ASAAS') or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Informe o lançamento e a justificativa.';end if;
 select to_jsonb(d) into before_row from sunshine_v4.payment_queue_dismissals d where entity_kind=upper(p_kind) and entity_id=p_id for update;
 if before_row is null then raise exception 'Retirada da fila não encontrada.';end if;
 if before_row->>'restored_at' is not null then return jsonb_build_object('restored',true,'alreadyRestored',true);end if;
 update sunshine_v4.payment_queue_dismissals set restored_at=now(),restored_by=u,restoration_reason=btrim(p_reason)
 where entity_kind=upper(p_kind) and entity_id=p_id;
 perform sunshine_v4.v4_write_audit('PAYMENT_QUEUE_DISMISSAL_REVERSED','payment',p_id,
  jsonb_build_object('before',before_row,'reason',p_reason,'evidencePreserved',true));
 return jsonb_build_object('restored',true);
end $$;
revoke all on function public.v4_api_restore_pending_item(text,uuid,text) from public,anon;
grant execute on function public.v4_api_restore_pending_item(text,uuid,text) to authenticated;

-- Payment association synchronizes the financial and registration state in the same transaction.
create or replace function private.sunshine_sync_obligation_payment(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare o sunshine_v4.obligations%rowtype;paid bigint;s text;
begin
 select * into o from sunshine_v4.obligations where id=p_id for update;
 if not found or coalesce(o.explicit_status,'')='CANCELLED' then return;end if;
 select coalesce(sum(a.amount_cents),0) into paid from sunshine_v4.payment_allocations a
 join sunshine_v4.payments p on p.id=a.payment_id where a.obligation_id=p_id and p.status='PAID';
 s:=case when paid>=o.total_cents then 'SETTLED' else 'PENDING' end;
 update sunshine_v4.obligations set explicit_status=case when s='PENDING' then null else s end where id=p_id;
 update sunshine_v4.work_registrations set status=case when s='SETTLED' then 'CONFIRMED' else 'ACTIVE' end,updated_at=now()
 where contract_item_id=o.contract_item_id and status<>'CANCELLED';
end $$;
revoke all on function private.sunshine_sync_obligation_payment(uuid) from public,anon,authenticated;
create or replace function private.sunshine_sync_allocation_status()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.obligation_id is distinct from new.obligation_id then perform private.sunshine_sync_obligation_payment(old.obligation_id);end if;
 perform private.sunshine_sync_obligation_payment(new.obligation_id);
 return new;
end $$;
revoke all on function private.sunshine_sync_allocation_status() from public,anon,authenticated;
create trigger trg_v4_sync_allocation_status after insert or update of obligation_id,amount_cents,payment_id on sunshine_v4.payment_allocations
for each row execute function private.sunshine_sync_allocation_status();
