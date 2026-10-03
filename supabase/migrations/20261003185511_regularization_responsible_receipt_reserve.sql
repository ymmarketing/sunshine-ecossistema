-- Regularization uses the existing item. Commission policy follows each receipt.

CREATE OR REPLACE FUNCTION private.sunshine_uses_october_rule(p_allocation uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 select i.commission_override is not null or
   (p.paid_at at time zone 'America/Sao_Paulo')::date >= date '2026-10-01'
 from sunshine_v4.payment_allocations a
 join sunshine_v4.payments p on p.id=a.payment_id
 join sunshine_v4.obligations o on o.id=a.obligation_id
 join sunshine_v4.contract_items i on i.id=o.contract_item_id where a.id=p_allocation;
$$;

CREATE OR REPLACE FUNCTION sunshine_v4.v4_recalculate_item_commissions(p_item_id uuid, p_responsible_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare v_allocation uuid;
begin
 if exists(select 1 from sunshine_v4.commission_effective_status s
   join sunshine_v4.payment_allocations a on a.id=s.allocation_id
   join sunshine_v4.obligations o on o.id=a.obligation_id
   where o.contract_item_id=p_item_id and s.paid_cents>0) then
   raise exception 'Há comissão paga; a base financeira está protegida.';
 end if;
 update sunshine_v4.legacy_commission_entries lc set responsible_member_id=p_responsible_id,
   percentage=case when lc.beneficiary_member_id=p_responsible_id then 80 else 10 end,
   amount_cents=case when lc.beneficiary_member_id=p_responsible_id then a.amount_cents-2*round(a.amount_cents*.10)::bigint else round(a.amount_cents*.10)::bigint end
 from sunshine_v4.payment_allocations a join sunshine_v4.obligations o on o.id=a.obligation_id
 where lc.payment_allocation_id=a.id and o.contract_item_id=p_item_id and lc.status<>'CANCELLED'
   and not private.sunshine_uses_october_rule(a.id);
 update sunshine_v4.commission_entries ce set responsible_member_id=p_responsible_id,
   percentage=case when ce.beneficiary_member_id=p_responsible_id then 80 else 10 end,
   amount_cents=case when ce.beneficiary_member_id=p_responsible_id then a.amount_cents-2*round(a.amount_cents*.10)::bigint else round(a.amount_cents*.10)::bigint end
 from sunshine_v4.payment_allocations a join sunshine_v4.obligations o on o.id=a.obligation_id
 where ce.allocation_id=a.id and o.contract_item_id=p_item_id and ce.status<>'CANCELLED'
   and not private.sunshine_uses_october_rule(a.id);
 for v_allocation in select a.id from sunshine_v4.payment_allocations a
   join sunshine_v4.obligations o on o.id=a.obligation_id
   where o.contract_item_id=p_item_id and private.sunshine_uses_october_rule(a.id)
 loop perform private.sunshine_build_october_commissions(v_allocation);end loop;
end $$;

CREATE OR REPLACE FUNCTION public.v4_api_regularize_obligation(p_obligation_id uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare
  v_auth uuid;
  v_member uuid;
  v_mode text := upper(coalesce(nullif(btrim(p_payload->>'mode'),''),'MANUAL'));
  v_key text := nullif(btrim(p_payload->>'idempotencyKey'),'');
  v_payment_id uuid;
  v_entry_id uuid;
  v_entry public.asaas_incoming_payments%rowtype;
  v_payment sunshine_v4.payments%rowtype;
  v_obligation sunshine_v4.obligations%rowtype;
  v_person_id uuid;
  v_requested bigint := 0;
  v_available bigint := 0;
  v_pending bigint := 0;
  v_allocated bigint := 0;
  v_credit bigint := 0;
  v_received bigint := 0;
  v_paid_at timestamptz;
  v_method text;
  v_source text;
  v_external_ref text;
  v_notes text;
  v_snapshot jsonb := '{}'::jsonb;
  v_allocation_id uuid;
  v_item sunshine_v4.contract_items%rowtype;
  v_responsible uuid;
begin
  v_auth := public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('allocation.create');

  if p_obligation_id is null then
    raise exception 'Pendência não informada.';
  end if;
  if v_key is null then
    raise exception 'idempotencyKey required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'regularize-obligation:'||p_obligation_id::text||':'||v_key,0
  ));

  select * into v_obligation
  from sunshine_v4.obligations
  where id=p_obligation_id
  for update;

  if v_obligation.id is null then
    raise exception 'Pendência não encontrada.';
  end if;
  if upper(coalesce(v_obligation.explicit_status,''))='CANCELLED' then
    raise exception 'Esta pendência está cancelada.';
  end if;

  v_person_id := coalesce(
    nullif(p_payload->>'beneficiaryPersonId','')::uuid,
    v_obligation.beneficiary_person_id,
    (select ci.beneficiary_person_id
       from sunshine_v4.contract_items ci
      where ci.id=v_obligation.contract_item_id)
  );

  select greatest(
    v_obligation.total_cents
      - coalesce((select sum(pa.amount_cents)
                    from sunshine_v4.payment_allocations pa
                   where pa.obligation_id=p_obligation_id),0),
    0
  )::bigint
  into v_pending;

  if v_pending<=0 then
    raise exception 'Esta pendência já está quitada.';
  end if;

  if v_mode='EXISTING' then
    v_payment_id := nullif(p_payload->>'paymentId','')::uuid;
    if v_payment_id is null then
      raise exception 'Selecione o pagamento já recebido.';
    end if;

    select * into v_payment
    from sunshine_v4.payments
    where id=v_payment_id
    for update;

    if v_payment.id is null then
      raise exception 'Pagamento não encontrado.';
    end if;

    select greatest(
      v_payment.amount_cents
        - coalesce((select sum(pa.amount_cents)
                      from sunshine_v4.payment_allocations pa
                     where pa.payment_id=v_payment_id),0)
        - coalesce(v_payment.retained_excess_cents,0),
      0
    )::bigint
    into v_available;

    v_requested := coalesce(nullif(p_payload->>'amountCents','')::bigint, least(v_available,v_pending));
    if v_requested<=0 then
      raise exception 'Informe um valor maior que zero.';
    end if;
    if v_requested>v_available then
      raise exception 'O valor informado supera o saldo disponível deste pagamento.';
    end if;
    if v_requested>v_pending then
      raise exception 'O valor informado supera esta pendência.';
    end if;

    v_allocated := v_requested;

  elsif v_mode='ASAAS' then
    perform sunshine_v4.v4_assert_permission('payment.create');
    v_entry_id := nullif(p_payload->>'asaasEntryId','')::uuid;
    if v_entry_id is null then
      raise exception 'Selecione o recebimento do Asaas.';
    end if;

    select * into v_entry
    from public.asaas_incoming_payments
    where id=v_entry_id
    for update;

    if v_entry.id is null then
      raise exception 'Recebimento do Asaas não encontrado.';
    end if;

    select id into v_payment_id
    from sunshine_v4.payments
    where source='ASAAS'
      and external_ref=v_entry.asaas_payment_id
    limit 1;

    if v_payment_id is null then
      if coalesce(v_entry.classification_status,'')<>'PENDING' then
        raise exception 'Este recebimento do Asaas já foi tratado.';
      end if;

      v_person_id := coalesce(
        nullif(p_payload->>'payerPersonId','')::uuid,
        v_person_id,
        (select p.id
           from sunshine_v4.people p
          where p.legacy_v3_id=v_entry.matched_client_id
          limit 1)
      );

      if v_person_id is null then
        raise exception 'Selecione a pessoa vinculada ao pagamento.';
      end if;

      insert into sunshine_v4.payments(
        payer_person_id,payer_snapshot,source,external_ref,amount_cents,paid_at,
        idempotency_key,created_at,legacy_imported,payer_resolution_status,
        fees_cents,net_cents,retained_excess_cents,payment_method,notes,
        legacy_status,status
      ) values(
        v_person_id,
        jsonb_build_object(
          'name',v_entry.customer_name,
          'email',v_entry.customer_email,
          'phone',coalesce(v_entry.customer_mobile_phone,v_entry.customer_phone),
          'document',v_entry.customer_document,
          'asaasCustomerId',v_entry.asaas_customer_id
        ),
        'ASAAS',
        v_entry.asaas_payment_id,
        round(coalesce(v_entry.gross_amount,0)*100)::bigint,
        coalesce(v_entry.payment_date,v_entry.received_at),
        'regularization-asaas:'||v_entry.asaas_payment_id,
        now(),
        false,
        case when v_entry.matched_client_id is null then 'EXPLICIT' else 'INFERRED_LEGACY_CLIENT' end,
        greatest(round((coalesce(v_entry.gross_amount,0)-coalesce(v_entry.net_amount,v_entry.gross_amount,0))*100),0)::bigint,
        round(coalesce(v_entry.net_amount,v_entry.gross_amount,0)*100)::bigint,
        0,
        v_entry.billing_type,
        'Recebido pelo Asaas e associado como regularização de pendência',
        'PAID',
        'PAID'
      )
      returning id into v_payment_id;

      perform sunshine_v4.v4_write_audit(
        'PAYMENT_CREATED','payment',v_payment_id,
        jsonb_build_object(
          'payer_person_id',v_person_id,
          'amount_cents',round(coalesce(v_entry.gross_amount,0)*100)::bigint,
          'source','ASAAS',
          'external_ref',v_entry.asaas_payment_id,
          'regularization',true
        )
      );
    end if;

    select * into v_payment
    from sunshine_v4.payments
    where id=v_payment_id
    for update;

    select greatest(
      v_payment.amount_cents
        - coalesce((select sum(pa.amount_cents)
                      from sunshine_v4.payment_allocations pa
                     where pa.payment_id=v_payment_id),0)
        - coalesce(v_payment.retained_excess_cents,0),
      0
    )::bigint
    into v_available;

    v_requested := coalesce(nullif(p_payload->>'amountCents','')::bigint, least(v_available,v_pending));
    if v_requested<=0 then
      raise exception 'Informe um valor maior que zero.';
    end if;
    if v_requested>v_available then
      raise exception 'O valor informado supera o saldo disponível deste recebimento.';
    end if;
    if v_requested>v_pending then
      raise exception 'O valor informado supera esta pendência.';
    end if;

    v_allocated := v_requested;

  elsif v_mode='MANUAL' then
    perform sunshine_v4.v4_assert_permission('payment.create');

    v_received := coalesce(nullif(p_payload->>'receivedCents','')::bigint,0);
    if v_received<=0 then
      raise exception 'Informe o valor recebido.';
    end if;

    v_person_id := coalesce(
      nullif(p_payload->>'payerPersonId','')::uuid,
      v_person_id
    );
    if v_person_id is null or not exists(
      select 1 from sunshine_v4.people where id=v_person_id
    ) then
      raise exception 'Pessoa vinculada ao pagamento não encontrada.';
    end if;

    v_paid_at := coalesce(nullif(p_payload->>'paidAt','')::timestamptz,now());
    v_method := coalesce(nullif(btrim(p_payload->>'paymentMethod'),''),'OUTRO');
    v_source := coalesce(nullif(btrim(p_payload->>'source'),''),'MANUAL_V4');
    v_external_ref := nullif(btrim(p_payload->>'externalRef'),'');
    v_notes := nullif(btrim(p_payload->>'notes'),'');
    v_snapshot := coalesce(p_payload->'payerSnapshot','{}'::jsonb);

    if v_snapshot='{}'::jsonb then
      select jsonb_build_object(
        'name',coalesce(p.full_name,p.preferred_name),
        'email',p.email,
        'phone',p.phone,
        'document',p.document_number
      )
      into v_snapshot
      from sunshine_v4.people p
      where p.id=v_person_id;
    end if;

    select id into v_payment_id
    from sunshine_v4.payments
    where idempotency_key='regularization:'||p_obligation_id::text||':'||v_key||':payment'
    limit 1;

    if v_payment_id is null then
      insert into sunshine_v4.payments(
        payer_person_id,payer_snapshot,source,external_ref,amount_cents,paid_at,
        idempotency_key,created_at,legacy_imported,payer_resolution_status,
        fees_cents,net_cents,retained_excess_cents,payment_method,notes,
        legacy_status,status
      ) values(
        v_person_id,
        v_snapshot,
        v_source,
        v_external_ref,
        v_received,
        v_paid_at,
        'regularization:'||p_obligation_id::text||':'||v_key||':payment',
        now(),
        false,
        'EXPLICIT',
        0,
        v_received,
        0,
        v_method,
        v_notes,
        'PAID',
        'PAID'
      )
      returning id into v_payment_id;

      perform sunshine_v4.v4_write_audit(
        'PAYMENT_CREATED','payment',v_payment_id,
        jsonb_build_object(
          'payer_person_id',v_person_id,
          'amount_cents',v_received,
          'source',v_source,
          'regularization',true
        )
      );
    end if;

    select * into v_payment
    from sunshine_v4.payments
    where id=v_payment_id
    for update;

    select greatest(
      v_payment.amount_cents
        - coalesce((select sum(pa.amount_cents)
                      from sunshine_v4.payment_allocations pa
                     where pa.payment_id=v_payment_id),0)
        - coalesce(v_payment.retained_excess_cents,0),
      0
    )::bigint
    into v_available;

    v_allocated := least(v_available,v_pending);
    if v_allocated<=0 then
      raise exception 'Este pagamento não possui saldo disponível para regularização.';
    end if;

  else
    raise exception 'Modo de regularização inválido.';
  end if;

  select * into v_item from sunshine_v4.contract_items
  where id=v_obligation.contract_item_id for update;
  if v_item.id is null then raise exception 'Serviço da pendência não encontrado.';end if;
  v_responsible:=coalesce(nullif(p_payload->>'responsibleMemberId','')::uuid,v_item.responsible_member_id);
  if v_responsible is null or not exists(
    select 1 from sunshine_v4.team_members where id=v_responsible and active
  ) then raise exception 'Selecione o responsável pelo atendimento/trabalho.';end if;
  if v_item.responsible_member_id is distinct from v_responsible then
    perform sunshine_v4.v4_assert_permission('record.update');
    update sunshine_v4.contract_items set responsible_member_id=v_responsible where id=v_item.id;
    perform sunshine_v4.v4_recalculate_item_commissions(v_item.id,v_responsible);
    perform sunshine_v4.v4_write_audit('REGULARIZATION_RESPONSIBLE_UPDATED','contract_item',v_item.id,
      jsonb_build_object('obligation_id',p_obligation_id,'before',v_item.responsible_member_id,'after',v_responsible));
  end if;

  v_allocation_id := sunshine_v4.v4_allocate_payment(
    v_payment_id,
    p_obligation_id,
    v_allocated,
    'regularization:'||p_obligation_id::text||':'||v_key||':allocation'
  );

  if v_mode='ASAAS' then
    select id into v_member
    from public.team_members
    where auth_user_id=v_auth and active
    limit 1;

    update public.asaas_incoming_payments
       set classification_status='RESOLVED',
           resolved_client_id=coalesce(resolved_client_id,matched_client_id),
           resolved_by=v_member,
           resolved_at=now()
     where id=v_entry_id;
  end if;

  if v_mode='MANUAL'
     and upper(coalesce(p_payload->>'excessDisposition',''))='CREDIT'
  then
    v_credit := sunshine_v4.v4_record_remaining_as_credit(
      v_payment_id,
      coalesce(nullif(p_payload->>'creditPersonId','')::uuid,v_person_id),
      'regularization-credit:'||p_obligation_id::text||':'||v_key
    );
  end if;

  perform sunshine_v4.v4_write_audit(
    'OBLIGATION_PAYMENT_REGULARIZED',
    'obligation',
    p_obligation_id,
    jsonb_build_object(
      'payment_id',v_payment_id,
      'allocation_id',v_allocation_id,
      'mode',v_mode,
      'pending_before_cents',v_pending,
      'allocated_cents',v_allocated,
      'pending_after_cents',greatest(v_pending-v_allocated,0),
      'credit_cents',v_credit
    )
  );

  return jsonb_build_object(
    'obligationId',p_obligation_id,
    'paymentId',v_payment_id,
    'allocationId',v_allocation_id,
    'mode',v_mode,
    'allocatedCents',v_allocated,
    'pendingBeforeCents',v_pending,
    'pendingAfterCents',greatest(v_pending-v_allocated,0),
    'creditCents',v_credit
  );
end
$function$

;

CREATE OR REPLACE FUNCTION public.v4_person_financial_position(p_person_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('person.read');
  if not exists(select 1 from sunshine_v4.people where id=p_person_id) then
    raise exception 'Pessoa não encontrada.';
  end if;
  with credit_rows as (
    select e.*,
      case when e.amount_cents>0 then 'Crédito recebido' else 'Crédito utilizado' end label
    from sunshine_v4.person_credit_entries e where e.person_id=p_person_id
  ), debt_rows as (
    select o.id obligation_id,ci.service_name,o.total_cents,
      ci.id item_id,ci.responsible_member_id,ci.service_category,ci.event_name,coalesce(ci.work_id,w.id) work_id,w.title work_title,
      w.scheduled_at work_date,ci.reference_month,coalesce(c.sold_at,c.created_at) sold_at,o.explicit_status,
      coalesce(sum(pa.amount_cents),0)::bigint received_cents,
      greatest(o.total_cents-coalesce(sum(pa.amount_cents),0),0)::bigint pending_cents,
      coalesce(o.next_collection_date,o.expected_payment_date,o.due_date) due_date
    from sunshine_v4.obligations o
    join sunshine_v4.contract_items ci on ci.id=o.contract_item_id
    join sunshine_v4.contracts c on c.id=ci.contract_id
    left join lateral (
      select count(distinct wr.work_id) work_count,(array_agg(distinct wr.work_id))[1] work_id
      from sunshine_v4.work_registrations wr where wr.contract_item_id=ci.id
    ) linked on ci.work_id is null
    left join sunshine_v4.works w on w.id=coalesce(ci.work_id,case when linked.work_count=1 then linked.work_id end)
    left join sunshine_v4.payment_allocations pa on pa.obligation_id=o.id
    where coalesce(o.beneficiary_person_id,ci.beneficiary_person_id)=p_person_id
      and coalesce(o.explicit_status,'')<>'CANCELLED'
      and coalesce(c.status,'CONFIRMED')<>'CANCELLED'
    group by o.id,ci.id,c.id,w.id
    having o.total_cents>coalesce(sum(pa.amount_cents),0)
  )
  select jsonb_build_object(
    'creditCents',coalesce((select sum(amount_cents) from credit_rows),0),
    'debtCents',coalesce((select sum(pending_cents) from debt_rows),0),
    'creditEvidence',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'paymentId',payment_id,'amountCents',amount_cents,'entryType',entry_type,
      'label',label,'notes',notes,'createdAt',created_at
    ) order by created_at desc) from credit_rows),'[]'::jsonb),
    'debtEvidence',coalesce((select jsonb_agg(jsonb_build_object(
      'obligationId',obligation_id,'serviceName',service_name,'totalCents',total_cents,
      'receivedCents',received_cents,'pendingCents',pending_cents,'dueDate',due_date,
      'itemId',item_id,'responsibleMemberId',responsible_member_id,'serviceCategory',service_category,'eventName',event_name,'workId',work_id,
      'workTitle',work_title,'workDate',work_date,'referenceMonth',reference_month,'soldAt',sold_at,'explicitStatus',explicit_status
    ) order by due_date nulls last,service_name) from debt_rows),'[]'::jsonb)
  ) into v_result;
  return v_result;
end
$function$

;

CREATE OR REPLACE FUNCTION public.v4_finance_dashboard_filtered(p_start date, p_end date, p_basis text DEFAULT 'RECEIPT'::text, p_responsible_member_id uuid DEFAULT NULL::uuid, p_service_category text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare v_result jsonb; v_payments jsonb; v_unassociated bigint; v_reserve bigint; v_reserve_evidence jsonb;
begin
  v_result:=public.v4_finance_dashboard_filtered_before_queue_dismissals(p_start,p_end,p_basis,p_responsible_member_id,p_service_category);
  select coalesce(jsonb_agg(case when d.entity_id is not null then e.value || jsonb_build_object('unassociatedCents',0) else e.value end
      order by e.ordinality),'[]'::jsonb),
    coalesce(sum(case when d.entity_id is null then (e.value->>'unassociatedCents')::bigint else 0 end),0)
  into v_payments,v_unassociated
  from jsonb_array_elements(coalesce(v_result->'paymentEvidence','[]'::jsonb)) with ordinality e(value,ordinality)
  left join sunshine_v4.payment_queue_dismissals d on d.entity_kind='EXISTING' and d.entity_id=(e.value->>'paymentId')::uuid;
  -- Reuse the filtered sales evidence to keep period, responsible and category in sync.
  with rows as (
    select a.id,a.amount_cents base_cents,p.paid_at,i.service_name,
      coalesce(bp.preferred_name,bp.full_name,p.payer_snapshot->>'name','Pessoa não identificada') person_name,
      (private.sunshine_item_split(i.id)->>'costBp')::integer cost_bp
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
  return v_result || jsonb_build_object('paymentEvidence',v_payments,'unassociatedCents',v_unassociated,
    'reserveCents',v_reserve,'reserveEvidence',v_reserve_evidence);
end $function$

;

revoke all on function public.v4_api_regularize_obligation(uuid,jsonb), public.v4_person_financial_position(uuid),
 public.v4_finance_dashboard_filtered(date,date,text,uuid,text) from public,anon;
grant execute on function public.v4_api_regularize_obligation(uuid,jsonb), public.v4_person_financial_position(uuid),
 public.v4_finance_dashboard_filtered(date,date,text,uuid,text) to authenticated;
NOTIFY pgrst, 'reload schema';
