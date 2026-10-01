create or replace function public.v4_finance_management(p_start date,p_end date,p_year integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_revenue bigint;v_costs bigint;v_sales bigint;v_result jsonb;v_annual jsonb;v_profile jsonb;v_categories jsonb;
begin
  perform private.sunshine_finance_guard();
  if p_start is null or p_end is null or p_start>p_end or p_year not between 2000 and 2100 then raise exception 'Período inválido.'; end if;
  select coalesce(sum(gross_cents),0) into v_revenue from private.sunshine_receipts() where paid_on between p_start and p_end;
  select coalesce(sum(amount_cents),0) into v_costs from private.sunshine_paid_costs() where paid_on between p_start and p_end;
  select coalesce(sum(i.amount_cents),0) into v_sales from sunshine_v4.contract_items i
    join sunshine_v4.contracts c on c.id=i.contract_id
    join sunshine_v4.obligations o on o.contract_item_id=i.id
    where (coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo')::date between p_start and p_end
    and coalesce(c.status,'')<>'CANCELLED' and coalesce(o.explicit_status,'')<>'CANCELLED';
  with months as (select make_date(p_year,m,1) as month from generate_series(1,12)m),
    rev as(select date_trunc('month',paid_on)::date as month,sum(gross_cents)::bigint cents from private.sunshine_receipts() group by 1),
    cost as(select date_trunc('month',paid_on)::date as month,sum(amount_cents)::bigint cents from private.sunshine_paid_costs() group by 1),
    sales as(select date_trunc('month',coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo')::date as month,sum(i.amount_cents)::bigint cents
      from sunshine_v4.contract_items i join sunshine_v4.contracts c on c.id=i.contract_id join sunshine_v4.obligations o on o.contract_item_id=i.id
      where coalesce(c.status,'')<>'CANCELLED' and coalesce(o.explicit_status,'')<>'CANCELLED' group by 1)
  select jsonb_agg(jsonb_build_object('month',m.month,'revenueCents',coalesce(r.cents,0),'costsCents',coalesce(c.cents,0),
    'profitCents',coalesce(r.cents,0)-coalesce(c.cents,0),'salesCents',coalesce(s.cents,0),
    'marginBp',case when r.cents>0 then round((r.cents-coalesce(c.cents,0))*10000.0/r.cents) end,'goals',to_jsonb(g)) order by m.month)
    into v_annual from months m left join rev r using(month) left join cost c using(month)
    left join sales s using(month) left join sunshine_v4.monthly_finance_goals g using(month);
  with entries as (
    select p.id,p.full_name,p.birth_date,p.sex,i.service_category
    from sunshine_v4.contract_items i join sunshine_v4.contracts c on c.id=i.contract_id
    join sunshine_v4.obligations o on o.contract_item_id=i.id join sunshine_v4.people p on p.id=i.beneficiary_person_id
    where (coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo')::date between p_start and p_end
      and coalesce(c.status,'')<>'CANCELLED' and coalesce(o.explicit_status,'')<>'CANCELLED'
  ), ranked as (select id,full_name,birth_date,sex,count(*) participations,
      string_agg(distinct service_category,', ') categories from entries group by 1,2,3,4),
    ages as (select case when birth_date is null then 'Não informado'
       when extract(year from age(p_end,birth_date))<18 then 'Até 17'
       when extract(year from age(p_end,birth_date))<30 then '18 a 29'
       when extract(year from age(p_end,birth_date))<45 then '30 a 44'
       when extract(year from age(p_end,birth_date))<60 then '45 a 59' else '60+' end age_group,count(*) total from ranked group by 1),
    sexes as(select sex,count(*) total from ranked group by 1), cats as(select service_category,count(*) total from entries group by 1)
  select jsonb_build_object('peopleCount',(select count(*) from ranked),'participations',(select count(*) from entries),
    'topPeople',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from ranked order by participations desc,full_name limit 50)x),'[]'),
    'ageGroups',coalesce((select jsonb_agg(to_jsonb(x)) from ages x),'[]'),
    'sexGroups',coalesce((select jsonb_agg(to_jsonb(x)) from sexes x),'[]'),
    'serviceGroups',coalesce((select jsonb_agg(to_jsonb(x)) from cats x),'[]')) into v_profile;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_categories from (
    select coalesce(i.service_category,'OUTRO') category,sum(a.amount_cents)::bigint amount_cents
    from sunshine_v4.payment_allocations a join sunshine_v4.obligations o on o.id=a.obligation_id
    join sunshine_v4.contract_items i on i.id=o.contract_item_id join sunshine_v4.payments p on p.id=a.payment_id
    where (p.paid_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
      and p.status='PAID' and coalesce(o.explicit_status,'')<>'CANCELLED' group by 1 order by 2 desc)x;
  return jsonb_build_object('startDate',p_start,'endDate',p_end,'revenueCents',v_revenue,'costsCents',v_costs,'salesCents',v_sales,
    'profitCents',v_revenue-v_costs,'marginBp',case when v_revenue>0 then round((v_revenue-v_costs)*10000.0/v_revenue) end,
    'salesEvidence',coalesce((select jsonb_agg(jsonb_build_object('itemId',i.id,'name',p.full_name,'service',i.service_name,'amountCents',i.amount_cents,'date',(coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo')::date)) from sunshine_v4.contract_items i join sunshine_v4.contracts c on c.id=i.contract_id join sunshine_v4.obligations o on o.contract_item_id=i.id left join sunshine_v4.people p on p.id=i.beneficiary_person_id where (coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo')::date between p_start and p_end and c.status<>'CANCELLED' and coalesce(o.explicit_status,'')<>'CANCELLED'),'[]'),
    'reserveEvidence',coalesce((select jsonb_agg(jsonb_build_object('paymentId',p.id,'payer',coalesce(pp.full_name,p.payer_snapshot->>'name'),'amountCents',a.amount_cents-coalesce((select sum(ce.amount_cents) from sunshine_v4.commission_entries ce where ce.allocation_id=a.id and ce.status not in ('CANCELLED','REVERSED')),a.amount_cents),'paidOn',(p.paid_at at time zone 'America/Sao_Paulo')::date)) from sunshine_v4.payment_allocations a join sunshine_v4.payments p on p.id=a.payment_id left join sunshine_v4.people pp on pp.id=p.payer_person_id where p.status='PAID' and (p.paid_at at time zone 'America/Sao_Paulo')::date between p_start and p_end and private.sunshine_uses_october_rule(a.id)),'[]'),
    'cash',public.v4_cash_availability(p_start,p_end),'annual',v_annual,'profile',v_profile,'incomeCategories',v_categories,
    'costEvidence',coalesce((select jsonb_agg(to_jsonb(e) order by paid_on desc) from private.sunshine_paid_costs() e where paid_on between p_start and p_end),'[]'),
    'expenses',coalesce((select jsonb_agg(to_jsonb(e) order by occurred_on desc,created_at desc) from sunshine_v4.expenses e where occurred_on between p_start and p_end),'[]'),
    'pendingCostsCents',coalesce((select sum(amount_cents) from sunshine_v4.expenses where status='PENDING' and occurred_on between p_start and p_end),0),
    'reserveCents',coalesce((select sum(a.amount_cents-coalesce((select sum(ce.amount_cents) from sunshine_v4.commission_entries ce where ce.allocation_id=a.id and ce.status not in ('CANCELLED','REVERSED')),a.amount_cents)) from sunshine_v4.payment_allocations a join sunshine_v4.payments p on p.id=a.payment_id where p.status='PAID' and (p.paid_at at time zone 'America/Sao_Paulo')::date between p_start and p_end and private.sunshine_uses_october_rule(a.id)),0),
    'voids',coalesce((select jsonb_agg(jsonb_build_object('id',id,'paymentId',payment_id,'reason',reason,'createdAt',created_at))
      from sunshine_v4.financial_voids where restored_at is null),'[]'));
end $$;

CREATE OR REPLACE FUNCTION public.v4_api_associate_payment_group(p_payment_ids uuid[] DEFAULT '{}'::uuid[], p_asaas_entry_ids uuid[] DEFAULT '{}'::uuid[], p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare
  v_auth uuid;
  v_member uuid;
  v_key text;
  v_existing uuid;
  v_entry_id uuid;
  v_entry public.asaas_incoming_payments%rowtype;
  v_payment_id uuid;
  v_payer uuid;
  v_payment_ids uuid[] := '{}'::uuid[];
  v_first_payment uuid;
  v_payment uuid;
  v_available bigint;
  v_first_available bigint;
  v_requested bigint := 0;
  v_group_available bigint := 0;
  v_use bigint;
  v_remaining bigint;
  v_item jsonb;
  v_first_items jsonb := '[]'::jsonb;
  v_first_payload jsonb;
  v_result jsonb;
  v_result_item jsonb;
  v_obligation uuid;
  v_allocation uuid;
  v_idx integer := 0;
  v_alloc_idx integer := 0;
  v_reference date;
  v_promised date;
  v_next_collection date;
begin
  v_auth := public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('payment.create');
  perform sunshine_v4.v4_assert_permission('contract.create');
  perform sunshine_v4.v4_assert_permission('allocation.create');

  v_key := nullif(btrim(p_payload->>'idempotencyKey'),'');
  if v_key is null then raise exception 'idempotencyKey required'; end if;
  if coalesce(cardinality(p_payment_ids),0)+coalesce(cardinality(p_asaas_entry_ids),0)=0 then
    raise exception 'Selecione ao menos um pagamento.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('associate-payment-group:'||v_key,0));
  select id into v_existing from sunshine_v4.contracts where idempotency_key like 'associate-payment:%:group-'||v_key;
  if v_existing is not null then
    return private.sunshine_entry_receipt(v_existing)||jsonb_build_object('idempotent',true);
  end if;


  -- Import each selected Asaas receipt only once. Its original date, gross
  -- amount and external reference remain on the individual payment record.
  foreach v_entry_id in array coalesce(p_asaas_entry_ids,'{}'::uuid[])
  loop
    select * into v_entry
    from public.asaas_incoming_payments
    where id=v_entry_id
    for update;
    if v_entry.id is null then raise exception 'Recebimento do Asaas não encontrado.'; end if;
    if v_entry.asaas_status not in ('RECEIVED','RECEIVED_IN_CASH','CONFIRMED') then raise exception 'Um recebimento Asaas está estornado ou não confirmado.';end if;

    select id into v_payment_id
    from sunshine_v4.payments
    where source='ASAAS' and external_ref=v_entry.asaas_payment_id
    limit 1;

    if v_payment_id is null then
      if v_entry.classification_status<>'PENDING' then
        raise exception 'Um dos recebimentos do Asaas já foi tratado.';
      end if;
      v_payer := nullif(p_payload->>'payerPersonId','')::uuid;
      if v_payer is null then
        select id into v_payer from sunshine_v4.people
        where legacy_v3_id=v_entry.matched_client_id limit 1;
      end if;
      if v_payer is null then raise exception 'Selecione quem realizou os pagamentos.'; end if;

      insert into sunshine_v4.payments(
        payer_person_id,payer_snapshot,source,external_ref,amount_cents,paid_at,idempotency_key,
        created_at,legacy_imported,payer_resolution_status,fees_cents,net_cents,retained_excess_cents,
        payment_method,notes,legacy_status,status
      ) values(
        v_payer,jsonb_build_object('name',v_entry.customer_name,'email',v_entry.customer_email,
          'phone',coalesce(v_entry.customer_mobile_phone,v_entry.customer_phone),'document',v_entry.customer_document,
          'asaasCustomerId',v_entry.asaas_customer_id),
        'ASAAS',v_entry.asaas_payment_id,round(coalesce(v_entry.gross_amount,0)*100)::bigint,
        coalesce(v_entry.payment_date,v_entry.received_at),'asaas-inbox:'||v_entry.asaas_payment_id,now(),false,
        case when v_entry.matched_client_id is null then 'EXPLICIT' else 'INFERRED_LEGACY_CLIENT' end,
        greatest(round((coalesce(v_entry.gross_amount,0)-coalesce(v_entry.net_amount,v_entry.gross_amount,0))*100),0)::bigint,
        round(coalesce(v_entry.net_amount,v_entry.gross_amount,0)*100)::bigint,0,v_entry.billing_type,
        'Recebido pelo webhook do Asaas','PAID','PAID'
      ) returning id into v_payment_id;

      perform sunshine_v4.v4_write_audit('PAYMENT_CREATED','payment',v_payment_id,
        jsonb_build_object('payer_person_id',v_payer,'amount_cents',round(coalesce(v_entry.gross_amount,0)*100)::bigint,
          'source','ASAAS','external_ref',v_entry.asaas_payment_id,'group_association',true));
    end if;
    if not (v_payment_id=any(v_payment_ids)) then v_payment_ids:=array_append(v_payment_ids,v_payment_id); end if;
  end loop;

  foreach v_payment_id in array coalesce(p_payment_ids,'{}'::uuid[])
  loop
    if not exists(select 1 from sunshine_v4.payments where id=v_payment_id) then
      raise exception 'Pagamento selecionado não encontrado.';
    end if;
    if not (v_payment_id=any(v_payment_ids)) then v_payment_ids:=array_append(v_payment_ids,v_payment_id); end if;
  end loop;

  if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items')=0 then
    raise exception 'Informe o serviço que os pagamentos cobrem.';
  end if;
  for v_item in select value from jsonb_array_elements(p_payload->'items')
  loop
    v_use:=coalesce(nullif(v_item->>'allocateCents','')::bigint,0);
    if v_use<0 or v_use>coalesce(nullif(v_item->>'amountCents','')::bigint,0) then
      raise exception 'Valor de associação inválido.';
    end if;
    v_requested:=v_requested+v_use;
  end loop;

  select array_agg(x order by x) into v_payment_ids from unnest(v_payment_ids)x;
  foreach v_payment in array v_payment_ids
  loop
    perform 1 from sunshine_v4.payments where id=v_payment and status='PAID' for update;
    if not found then raise exception 'Pagamento cancelado ou estornado não pode ser associado.'; end if;
    select p.amount_cents-coalesce((select sum(pa.amount_cents) from sunshine_v4.payment_allocations pa where pa.payment_id=p.id),0)::bigint
      into v_available from sunshine_v4.payments p where p.id=v_payment;
    if v_available>0 then
      v_group_available:=v_group_available+v_available;
      if v_first_payment is null then
        v_first_payment:=v_payment;
        v_first_available:=v_available;
      end if;
    end if;
  end loop;
  -- Locks are acquired by UUID, but sale date is based on the earliest available receipt.
  select p.id,p.amount_cents-coalesce((select sum(a.amount_cents) from sunshine_v4.payment_allocations a where a.payment_id=p.id),0)
    into v_first_payment,v_first_available from sunshine_v4.payments p where p.id=any(v_payment_ids) and p.status='PAID'
    and p.amount_cents>coalesce((select sum(a.amount_cents) from sunshine_v4.payment_allocations a where a.payment_id=p.id),0)
    order by p.paid_at,p.id limit 1;
  if v_first_payment is null then raise exception 'Os pagamentos selecionados não possuem saldo disponível.'; end if;
  if v_requested>v_group_available then raise exception 'A associação supera o total disponível nos pagamentos selecionados.'; end if;

  -- The existing association routine creates the one contract, items,
  -- obligations and work registrations. Only the first receipt is allocated
  -- there; the remaining receipts are allocated to those same obligations.
  v_remaining:=least(v_first_available,v_requested);
  for v_item in select value from jsonb_array_elements(p_payload->'items')
  loop
    v_use:=least(coalesce(nullif(v_item->>'allocateCents','')::bigint,0),v_remaining);
    v_remaining:=v_remaining-v_use;
    v_first_items:=v_first_items||jsonb_build_array(
      (v_item-'expectedPaymentDate'-'nextCollectionDate'-'promiseNote')||jsonb_build_object('allocateCents',v_use)
    );
  end loop;
  v_first_payload:=p_payload||jsonb_build_object('items',v_first_items,'idempotencyKey','group-'||v_key);
  v_result:=public.v4_api_associate_existing_payment(v_first_payment,v_first_payload);

  -- Continue each requested item across the remaining selected receipts.
  v_idx:=0;
  for v_item in select value from jsonb_array_elements(p_payload->'items')
  loop
    v_idx:=v_idx+1;
    v_result_item:=v_result->'items'->(v_idx-1);
    v_obligation:=(v_result_item->>'obligationId')::uuid;
    v_remaining:=coalesce(nullif(v_item->>'allocateCents','')::bigint,0)
      -coalesce(nullif(v_result_item->>'allocatedCents','')::bigint,0);

    foreach v_payment in array v_payment_ids
    loop
      exit when v_remaining<=0;
      if v_payment=v_first_payment then continue; end if;
      perform 1 from sunshine_v4.payments where id=v_payment and status='PAID' for update;
    if not found then raise exception 'Pagamento cancelado ou estornado não pode ser associado.'; end if;
      select p.amount_cents-coalesce((select sum(pa.amount_cents) from sunshine_v4.payment_allocations pa where pa.payment_id=p.id),0)::bigint
        into v_available from sunshine_v4.payments p where p.id=v_payment;
      v_use:=least(greatest(coalesce(v_available,0),0),v_remaining);
      if v_use>0 then
        v_alloc_idx:=v_alloc_idx+1;
        insert into sunshine_v4.payment_allocations(
          payment_id,obligation_id,amount_cents,idempotency_key,allocated_at,legacy_imported
        ) values(
          v_payment,v_obligation,v_use,
          'associate-payment-group:'||v_key||':'||v_idx||':'||v_alloc_idx,now(),false
        ) returning id into v_allocation;
        perform sunshine_v4.v4_write_audit('PAYMENT_ALLOCATED','allocation',v_allocation,
          jsonb_build_object('payment_id',v_payment,'obligation_id',v_obligation,'amount_cents',v_use,'group_association',true));
        v_remaining:=v_remaining-v_use;
      end if;
    end loop;

    if v_remaining>0 then raise exception 'Não foi possível distribuir todo o valor solicitado.'; end if;
    v_remaining:=coalesce(nullif(v_item->>'amountCents','')::bigint,0)
      -coalesce(nullif(v_item->>'allocateCents','')::bigint,0);
    v_promised:=nullif(v_item->>'expectedPaymentDate','')::date;
    v_next_collection:=coalesce(nullif(v_item->>'nextCollectionDate','')::date,v_promised,nullif(v_item->>'dueDate','')::date);
    if v_remaining>0 and v_promised is not null then
      perform sunshine_v4.v4_assert_permission('promise.create');
      insert into sunshine_v4.payment_promises(obligation_id,promised_for,next_collection_date,note,created_by)
      values(v_obligation,v_promised,v_next_collection,nullif(btrim(v_item->>'promiseNote'),''),sunshine_v4.v4_current_user_id());
      if v_next_collection is not null then
        perform sunshine_v4.v4_assert_permission('collection.create');
        insert into sunshine_v4.collection_tasks(obligation_id,scheduled_for,status,note,created_by)
        values(v_obligation,v_next_collection,'SCHEDULED','Cobrança criada pela associação agrupada',sunshine_v4.v4_current_user_id());
      end if;
    end if;
  end loop;

  if (select count(distinct date_trunc('month',(x->>'referenceMonth')::date)::date)
      from jsonb_array_elements(p_payload->'items') x where nullif(x->>'referenceMonth','') is not null)=1
     and (select count(*) from jsonb_array_elements(p_payload->'items') x
          where upper(coalesce(x->>'serviceCategory',''))='MENSALIDADE')=jsonb_array_length(p_payload->'items') then
    select date_trunc('month',(x->>'referenceMonth')::date)::date into v_reference
    from jsonb_array_elements(p_payload->'items') x where nullif(x->>'referenceMonth','') is not null limit 1;
    update sunshine_v4.payments set competence_date=v_reference where id=any(v_payment_ids);
  end if;

  select id into v_member from public.team_members where auth_user_id=v_auth and active limit 1;
  update public.asaas_incoming_payments
  set classification_status='RESOLVED',resolved_client_id=coalesce(resolved_client_id,matched_client_id),
      resolved_by=v_member,resolved_at=now()
  where id=any(coalesce(p_asaas_entry_ids,'{}'::uuid[]));

  perform sunshine_v4.v4_write_audit('PAYMENT_GROUP_ASSOCIATED','contract',(v_result->>'contractId')::uuid,
    jsonb_build_object('payment_ids',to_jsonb(v_payment_ids),'payment_count',cardinality(v_payment_ids),
      'available_cents',v_group_available,'allocated_cents',v_requested));
  return v_result||jsonb_build_object('paymentIds',to_jsonb(v_payment_ids),'paymentCount',cardinality(v_payment_ids),
    'selectedAvailableCents',v_group_available,'allocatedCents',v_requested);
end
$function$;

notify pgrst,'reload schema';
