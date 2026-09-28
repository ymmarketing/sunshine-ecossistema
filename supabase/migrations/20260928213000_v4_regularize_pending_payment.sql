create or replace function public.v4_api_regularize_obligation(
  p_obligation_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','sunshine_v4','auth','pg_temp'
as $function$
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
$function$;

revoke all on function public.v4_api_regularize_obligation(uuid,jsonb) from public, anon;
grant execute on function public.v4_api_regularize_obligation(uuid,jsonb) to authenticated;
