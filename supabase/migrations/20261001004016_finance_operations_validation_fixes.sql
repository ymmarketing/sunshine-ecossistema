alter table sunshine_v4.contract_items add column entry_position integer;


create or replace function private.sunshine_entry_receipt(p_contract uuid) returns jsonb
language sql stable security definer set search_path='' as $$
select jsonb_build_object('contractId',c.id,'items',coalesce((select jsonb_agg(jsonb_build_object(
  'itemId',i.id,'obligationId',o.id,'beneficiaryPersonId',i.beneficiary_person_id,'amountCents',i.amount_cents,
  'allocatedCents',coalesce((select sum(a.amount_cents) from sunshine_v4.payment_allocations a where a.obligation_id=o.id),0),
  'referenceMonth',i.reference_month,'workId',i.work_id,'registrationId',(select r.id from sunshine_v4.work_registrations r where r.contract_item_id=i.id limit 1)
) order by i.entry_position nulls last,i.created_at,i.id) from sunshine_v4.contract_items i join sunshine_v4.obligations o on o.contract_item_id=i.id where i.contract_id=c.id),'[]'))
from sunshine_v4.contracts c where c.id=p_contract;
$$;

CREATE OR REPLACE FUNCTION public.v4_api_associate_existing_payment(p_payment_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare
  v_actor uuid;
  v_key text;
  v_contract uuid;
  v_existing uuid;
  v_customer uuid;
  v_payment sunshine_v4.payments%rowtype;
  v_allocated bigint;
  v_available bigint;
  v_alloc_sum bigint:=0;
  v_total bigint:=0;
  v_item jsonb;
  v_idx integer:=0;
  v_item_id uuid;
  v_obligation_id uuid;
  v_beneficiary uuid;
  v_amount bigint;
  v_allocate bigint;
  v_work uuid;
  v_service uuid;
  v_responsible uuid;
  v_promised date;
  v_next_collection date;
  v_reference date;
  v_items_out jsonb:='[]'::jsonb;
begin
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('contract.create');
  perform sunshine_v4.v4_assert_permission('allocation.create');
  v_actor:=sunshine_v4.v4_current_user_id();
  v_key:=nullif(btrim(p_payload->>'idempotencyKey'),'');
  if v_key is null then raise exception 'idempotencyKey required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('associate-payment:'||p_payment_id::text||':'||v_key,0));

  select id into v_existing from sunshine_v4.contracts
  where idempotency_key='associate-payment:'||p_payment_id::text||':'||v_key;
  if v_existing is not null then
    return private.sunshine_entry_receipt(v_existing)||jsonb_build_object('idempotent',true,'paymentId',p_payment_id);
  end if;

  select * into v_payment from sunshine_v4.payments where id=p_payment_id for update;
  if v_payment.id is null then raise exception 'Pagamento não encontrado.'; end if;
  if v_payment.status<>'PAID' then raise exception 'Pagamento cancelado ou estornado não pode ser associado.'; end if;
  select coalesce(sum(amount_cents),0)::bigint into v_allocated
  from sunshine_v4.payment_allocations where payment_id=p_payment_id;
  v_available:=v_payment.amount_cents-v_allocated;
  if v_available<=0 then raise exception 'Este pagamento não possui valor disponível para associação.'; end if;


  if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items')=0 then
    raise exception 'Informe ao menos um item para associação.';
  end if;
  for v_item in select value from jsonb_array_elements(p_payload->'items') loop
    v_amount:=nullif(v_item->>'amountCents','')::bigint;
    v_allocate:=coalesce(nullif(v_item->>'allocateCents','')::bigint,0);
    if v_amount is null or v_amount<=0 then raise exception 'O valor do item deve ser maior que zero.'; end if;
    if v_allocate<0 or v_allocate>v_amount then raise exception 'Valor de associação inválido.'; end if;
    v_total:=v_total+v_amount;
    v_alloc_sum:=v_alloc_sum+v_allocate;
  end loop;
  if v_alloc_sum>v_available then raise exception 'A associação supera o valor disponível no pagamento.'; end if;

  v_customer:=nullif(p_payload->>'customerPersonId','')::uuid;
  if v_customer is null or not exists(select 1 from sunshine_v4.people where id=v_customer) then
    raise exception 'Selecione a pessoa vinculada ao lançamento.';
  end if;

  insert into sunshine_v4.contracts(
    customer_person_id,source,status,idempotency_key,created_at,legacy_imported,
    legacy_unresolved,sale_type,sales_channel,sold_at,legacy_status,notes
  ) values(
    v_customer,v_payment.source,'CONFIRMED','associate-payment:'||p_payment_id::text||':'||v_key,
    now(),false,false,'ASSOCIATION',null,coalesce(v_payment.paid_at,now()),'CONFIRMED',
    nullif(btrim(p_payload->>'notes'),'')
  ) returning id into v_contract;

  for v_item in select value from jsonb_array_elements(p_payload->'items') loop
    v_idx:=v_idx+1;
    v_beneficiary:=nullif(v_item->>'beneficiaryPersonId','')::uuid;
    if v_beneficiary is null or not exists(select 1 from sunshine_v4.people where id=v_beneficiary) then
      raise exception 'Selecione cada beneficiário.';
    end if;
    v_amount:=(v_item->>'amountCents')::bigint;
    v_allocate:=coalesce(nullif(v_item->>'allocateCents','')::bigint,0);
    v_work:=nullif(v_item->>'workId','')::uuid;
    v_service:=nullif(v_item->>'serviceId','')::uuid;
    v_responsible:=nullif(v_item->>'responsibleMemberId','')::uuid;
    v_reference:=case when nullif(v_item->>'referenceMonth','') is not null
      then date_trunc('month',(v_item->>'referenceMonth')::date)::date end;
    v_promised:=nullif(v_item->>'expectedPaymentDate','')::date;
    v_next_collection:=coalesce(nullif(v_item->>'nextCollectionDate','')::date,v_promised,nullif(v_item->>'dueDate','')::date);

    insert into sunshine_v4.contract_items(
      contract_id,beneficiary_person_id,service_code,service_name,amount_cents,
      legacy_imported,legacy_unresolved,service_id,work_id,responsible_member_id,
      service_category,reference_month,entry_position
    ) values(
      v_contract,v_beneficiary,
      coalesce(nullif(btrim(v_item->>'serviceCode'),''),case when v_service is not null then 'SERVICE:'||v_service::text when v_work is not null then 'WORK:'||v_work::text else 'MANUAL' end),
      coalesce(nullif(btrim(v_item->>'serviceName'),''),(select name from sunshine_v4.services where id=v_service),(select title from sunshine_v4.works where id=v_work),'Lançamento'),
      v_amount,false,false,v_service,v_work,v_responsible,nullif(btrim(v_item->>'serviceCategory'),''),v_reference,v_idx
    ) returning id into v_item_id;

    insert into sunshine_v4.obligations(
      contract_item_id,beneficiary_person_id,total_cents,due_date,
      expected_payment_date,next_collection_date,legacy_imported,legacy_unresolved
    ) values(
      v_item_id,v_beneficiary,v_amount,nullif(v_item->>'dueDate','')::date,
      v_promised,v_next_collection,false,false
    ) returning id into v_obligation_id;

    if v_work is not null then
      perform sunshine_v4.v4_assert_permission('work.registration.create');
      insert into sunshine_v4.work_registrations(
        work_id,beneficiary_person_id,contract_item_id,participant_name,
        participant_birth_date,rival_name,loved_person_name,participant_data,status,legacy_imported
      ) values(
        v_work,v_beneficiary,v_item_id,
        coalesce(nullif(btrim(v_item->>'participantName'),''),(select coalesce(preferred_name,full_name) from sunshine_v4.people where id=v_beneficiary)),
        nullif(v_item->>'participantBirthDate','')::date,nullif(btrim(v_item->>'rivalName'),''),
        nullif(btrim(v_item->>'lovedPersonName'),''),coalesce(v_item->'participantData','{}'::jsonb),'ACTIVE',false
      );
    end if;

    if v_allocate>0 then
      insert into sunshine_v4.payment_allocations(payment_id,obligation_id,amount_cents,idempotency_key,allocated_at,legacy_imported)
      values(p_payment_id,v_obligation_id,v_allocate,'associate-payment:'||p_payment_id::text||':'||v_key||':'||v_idx,now(),false);
      perform sunshine_v4.v4_write_audit('PAYMENT_ALLOCATED','allocation',
        (select id from sunshine_v4.payment_allocations where idempotency_key='associate-payment:'||p_payment_id::text||':'||v_key||':'||v_idx),
        jsonb_build_object('payment_id',p_payment_id,'obligation_id',v_obligation_id,'amount_cents',v_allocate));
    end if;

    if (v_amount-v_allocate)>0 and v_promised is not null then
      perform sunshine_v4.v4_assert_permission('promise.create');
      insert into sunshine_v4.payment_promises(obligation_id,promised_for,next_collection_date,note,created_by)
      values(v_obligation_id,v_promised,v_next_collection,nullif(btrim(v_item->>'promiseNote'),''),v_actor);
      if v_next_collection is not null then
        perform sunshine_v4.v4_assert_permission('collection.create');
        insert into sunshine_v4.collection_tasks(obligation_id,scheduled_for,status,note,created_by)
        values(v_obligation_id,v_next_collection,'SCHEDULED','Cobrança criada pela associação',v_actor);
      end if;
    end if;

    v_items_out:=v_items_out||jsonb_build_array(jsonb_build_object(
      'itemId',v_item_id,'obligationId',v_obligation_id,'beneficiaryPersonId',v_beneficiary,
      'amountCents',v_amount,'allocatedCents',v_allocate,'pendingCents',v_amount-v_allocate
    ));
  end loop;

  if (select count(distinct date_trunc('month',(x->>'referenceMonth')::date)::date)
      from jsonb_array_elements(p_payload->'items') x where nullif(x->>'referenceMonth','') is not null)=1
     and (select count(*) from jsonb_array_elements(p_payload->'items') x
          where upper(coalesce(x->>'serviceCategory',''))='MENSALIDADE')=jsonb_array_length(p_payload->'items') then
    update sunshine_v4.payments set competence_date=(
      select date_trunc('month',(x->>'referenceMonth')::date)::date
      from jsonb_array_elements(p_payload->'items') x where nullif(x->>'referenceMonth','') is not null limit 1
    ) where id=p_payment_id;
  end if;

  perform sunshine_v4.v4_write_audit('PAYMENT_ASSOCIATED','payment',p_payment_id,
    jsonb_build_object('contract_id',v_contract,'contract_total_cents',v_total,'allocated_cents',v_alloc_sum,'item_count',v_idx));
  return jsonb_build_object('idempotent',false,'contractId',v_contract,'paymentId',p_payment_id,
    'contractTotalCents',v_total,'allocatedCents',v_alloc_sum,'remainingCents',v_available-v_alloc_sum,'items',v_items_out);
end
$function$;

CREATE OR REPLACE FUNCTION sunshine_v4.v4_register_manual_entry(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'sunshine_v4', 'pg_temp'
AS $function$
declare
 v_actor uuid; v_key text; v_contract uuid; v_payment uuid; v_existing uuid;
 v_customer uuid; v_payer uuid; v_received bigint; v_alloc_sum bigint:=0; v_total bigint:=0;
 v_source text; v_payment_method text; v_paid_at timestamptz; v_payer_snapshot jsonb;
 v_item jsonb; v_idx integer:=0; v_item_id uuid; v_obligation_id uuid; v_beneficiary uuid;
 v_amount bigint; v_allocate bigint; v_work uuid; v_service uuid; v_responsible uuid; v_promised date; v_next_collection date;
 v_items_out jsonb:='[]'::jsonb;
begin
 perform v4_assert_permission('contract.create');
 v_actor:=v4_current_user_id();
 v_key:=nullif(btrim(p_payload->>'idempotencyKey'),'');
 if v_key is null then raise exception 'idempotencyKey required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('manual-entry:'||v_key,0));
 select id into v_existing from contracts where idempotency_key='manual-entry:'||v_key;
 if v_existing is not null then
   select p.id into v_payment from payments p where p.idempotency_key='manual-entry:'||v_key||':payment';
   return private.sunshine_entry_receipt(v_existing)||jsonb_build_object('idempotent',true,'paymentId',v_payment);
 end if;

 v_customer:=nullif(p_payload->>'customerPersonId','')::uuid;
 if v_customer is null or not exists(select 1 from people where id=v_customer) then raise exception 'valid customerPersonId required'; end if;
 v_payer:=nullif(p_payload->>'payerPersonId','')::uuid;
 if v_payer is not null and not exists(select 1 from people where id=v_payer) then raise exception 'payer person not found'; end if;
 v_received:=coalesce(nullif(p_payload->>'receivedCents','')::bigint,0);
 if v_received<0 then raise exception 'receivedCents cannot be negative'; end if;
 v_source:=coalesce(nullif(btrim(p_payload->>'source'),''),'MANUAL_V4');
 v_payment_method:=nullif(btrim(p_payload->>'paymentMethod'),'');
 v_paid_at:=coalesce(nullif(p_payload->>'paidAt','')::timestamptz,now());
 v_payer_snapshot:=coalesce(p_payload->'payerSnapshot','{}'::jsonb);
 if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items')=0 then raise exception 'items required'; end if;

 for v_item in select value from jsonb_array_elements(p_payload->'items') loop
   v_amount:=nullif(v_item->>'amountCents','')::bigint;
   v_allocate:=coalesce(nullif(v_item->>'allocateCents','')::bigint,0);
   if v_amount is null or v_amount<=0 then raise exception 'item amount must be positive'; end if;
   if v_allocate<0 or v_allocate>v_amount then raise exception 'invalid item allocation'; end if;
   v_total:=v_total+v_amount; v_alloc_sum:=v_alloc_sum+v_allocate;
 end loop;
 if v_alloc_sum>v_received then raise exception 'allocations exceed received amount'; end if;
 if v_received>0 then perform v4_assert_permission('payment.create'); perform v4_assert_permission('allocation.create'); end if;

 insert into contracts(customer_person_id,source,status,idempotency_key,created_at,legacy_imported,legacy_unresolved,sale_type,sales_channel,sold_at,legacy_status,notes)
 values(v_customer,v_source,'CONFIRMED','manual-entry:'||v_key,now(),false,false,coalesce(nullif(btrim(p_payload->>'saleType'),''),'MANUAL'),nullif(btrim(p_payload->>'salesChannel'),''),coalesce(nullif(p_payload->>'soldAt','')::timestamptz,v_paid_at),'CONFIRMED',nullif(btrim(p_payload->>'notes'),'')) returning id into v_contract;

 if v_received>0 then
   insert into payments(payer_person_id,payer_snapshot,source,external_ref,amount_cents,paid_at,idempotency_key,created_at,legacy_imported,legacy_client_id,payer_resolution_status,fees_cents,net_cents,retained_excess_cents,payment_method,notes,legacy_status,status)
   values(v_payer,v_payer_snapshot,v_source,nullif(btrim(p_payload->>'externalRef'),''),v_received,v_paid_at,'manual-entry:'||v_key||':payment',now(),false,null,'EXPLICIT',0,v_received,0,v_payment_method,nullif(btrim(p_payload->>'paymentNotes'),''),'PAID','PAID') returning id into v_payment;
   perform v4_write_audit('PAYMENT_CREATED','payment',v_payment,jsonb_build_object('payer_person_id',v_payer,'amount_cents',v_received,'source',v_source));
 end if;

 for v_item in select value from jsonb_array_elements(p_payload->'items') loop
   v_idx:=v_idx+1;
   v_beneficiary:=nullif(v_item->>'beneficiaryPersonId','')::uuid;
   if v_beneficiary is null or not exists(select 1 from people where id=v_beneficiary) then raise exception 'valid beneficiaryPersonId required'; end if;
   v_amount:=(v_item->>'amountCents')::bigint;
   v_allocate:=coalesce(nullif(v_item->>'allocateCents','')::bigint,0);
   v_work:=nullif(v_item->>'workId','')::uuid;
   v_service:=nullif(v_item->>'serviceId','')::uuid;
   v_responsible:=nullif(v_item->>'responsibleMemberId','')::uuid;
   if v_work is not null and not exists(select 1 from works where id=v_work) then raise exception 'work not found'; end if;
   if v_service is not null and not exists(select 1 from services where id=v_service) then raise exception 'service not found'; end if;

   insert into contract_items(contract_id,beneficiary_person_id,service_code,service_name,amount_cents,legacy_imported,legacy_unresolved,service_id,work_id,responsible_member_id,service_category,entry_position)
   values(v_contract,v_beneficiary,coalesce(nullif(btrim(v_item->>'serviceCode'),''),case when v_service is not null then 'SERVICE:'||v_service::text when v_work is not null then 'WORK:'||v_work::text else 'MANUAL' end),coalesce(nullif(btrim(v_item->>'serviceName'),''),(select name from services where id=v_service),(select title from works where id=v_work),'Lançamento manual'),v_amount,false,false,v_service,v_work,v_responsible,nullif(btrim(v_item->>'serviceCategory'),''),v_idx) returning id into v_item_id;

   v_promised:=nullif(v_item->>'expectedPaymentDate','')::date;
   v_next_collection:=coalesce(nullif(v_item->>'nextCollectionDate','')::date,v_promised,nullif(v_item->>'dueDate','')::date);
   insert into obligations(contract_item_id,beneficiary_person_id,total_cents,due_date,expected_payment_date,next_collection_date,legacy_imported,legacy_unresolved)
   values(v_item_id,v_beneficiary,v_amount,nullif(v_item->>'dueDate','')::date,v_promised,v_next_collection,false,false) returning id into v_obligation_id;

   if v_work is not null then
     perform v4_assert_permission('work.registration.create');
     insert into work_registrations(work_id,beneficiary_person_id,contract_item_id,participant_name,participant_birth_date,rival_name,loved_person_name,participant_data,status,legacy_imported)
     values(v_work,v_beneficiary,v_item_id,coalesce(nullif(btrim(v_item->>'participantName'),''),(select coalesce(preferred_name,full_name) from people where id=v_beneficiary)),nullif(v_item->>'participantBirthDate','')::date,nullif(btrim(v_item->>'rivalName'),''),nullif(btrim(v_item->>'lovedPersonName'),''),coalesce(v_item->'participantData','{}'::jsonb),'ACTIVE',false);
   end if;

   if v_allocate>0 then
     insert into payment_allocations(payment_id,obligation_id,amount_cents,idempotency_key,allocated_at,legacy_imported)
     values(v_payment,v_obligation_id,v_allocate,'manual-entry:'||v_key||':allocation:'||v_idx,now(),false);
     perform v4_write_audit('PAYMENT_ALLOCATED','allocation',(select id from payment_allocations where idempotency_key='manual-entry:'||v_key||':allocation:'||v_idx),jsonb_build_object('payment_id',v_payment,'obligation_id',v_obligation_id,'amount_cents',v_allocate));
   end if;

   if (v_amount-v_allocate)>0 and v_promised is not null then
     perform v4_assert_permission('promise.create');
     insert into payment_promises(obligation_id,promised_for,next_collection_date,note,created_by)
     values(v_obligation_id,v_promised,v_next_collection,nullif(btrim(v_item->>'promiseNote'),''),v_actor);
     if v_next_collection is not null then
       perform v4_assert_permission('collection.create');
       insert into collection_tasks(obligation_id,scheduled_for,status,note,created_by)
       values(v_obligation_id,v_next_collection,'SCHEDULED','Cobrança criada pelo lançamento manual',v_actor);
     end if;
   end if;

   v_items_out:=v_items_out||jsonb_build_array(jsonb_build_object('itemId',v_item_id,'obligationId',v_obligation_id,'beneficiaryPersonId',v_beneficiary,'amountCents',v_amount,'allocatedCents',v_allocate,'pendingCents',v_amount-v_allocate));
 end loop;

 perform v4_write_audit('MANUAL_ENTRY_CREATED','contract',v_contract,jsonb_build_object('payment_id',v_payment,'contract_total_cents',v_total,'received_cents',v_received,'allocated_cents',v_alloc_sum,'item_count',v_idx));
 return jsonb_build_object('idempotent',false,'contractId',v_contract,'paymentId',v_payment,'contractTotalCents',v_total,'receivedCents',v_received,'allocatedCents',v_alloc_sum,'unallocatedCents',v_received-v_alloc_sum,'items',v_items_out);
end $function$;

notify pgrst,'reload schema';
