CREATE OR REPLACE FUNCTION public.v4_api_associate_existing_payment_with_credit(p_payment_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare v_result jsonb; v_credit bigint:=0; v_person uuid;
begin
  perform public.v4_bind_authenticated_user();
  v_result:=public.v4_api_associate_existing_payment(p_payment_id,p_payload);
  if upper(coalesce(p_payload->>'excessDisposition',''))='CREDIT' then
    v_person:=coalesce(nullif(p_payload->>'creditPersonId','')::uuid,
      nullif(p_payload->>'customerPersonId','')::uuid);
    v_credit:=sunshine_v4.v4_record_remaining_as_credit(
      p_payment_id,v_person,
      'existing-credit:'||p_payment_id::text||':'||coalesce(nullif(p_payload->>'idempotencyKey',''),'default')
    );
  end if;

  if upper(coalesce(p_payload->>'excessDisposition',''))='KEEP_AS_SALE'
     and not coalesce((v_result->>'idempotent')::boolean,false) then
    perform sunshine_v4.v4_assert_permission('allocation.create');
    update sunshine_v4.payments p
       set retained_excess_cents=coalesce(p.retained_excess_cents,0)+greatest(
         p.amount_cents-coalesce(p.retained_excess_cents,0)-
         coalesce((select sum(a.amount_cents) from sunshine_v4.payment_allocations a where a.payment_id=p.id),0),0)
     where p.id=p_payment_id;
    perform sunshine_v4.v4_write_audit('PAYMENT_EXCESS_RETAINED','payment',p_payment_id,
      jsonb_build_object('contract_id',v_result->>'contractId','retained_excess_cents',
        (select retained_excess_cents from sunshine_v4.payments where id=p_payment_id)));
    v_result:=v_result||jsonb_build_object('remainingCents',0,'retainedExcessCents',
      (select retained_excess_cents from sunshine_v4.payments where id=p_payment_id));
  end if;
  return v_result||jsonb_build_object('creditCents',v_credit);
end
$function$
;

CREATE OR REPLACE FUNCTION public.v4_api_associate_payment_group_with_credit(p_payment_ids uuid[] DEFAULT '{}'::uuid[], p_asaas_entry_ids uuid[] DEFAULT '{}'::uuid[], p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_payment uuid;
  v_credit bigint:=0;
  v_total_credit bigint:=0;
  v_person uuid;
begin
  perform public.v4_bind_authenticated_user();
  v_result:=public.v4_api_associate_payment_group(p_payment_ids,p_asaas_entry_ids,p_payload-'excessDisposition');
  if upper(coalesce(p_payload->>'excessDisposition',''))='CREDIT' then
    v_person:=coalesce(nullif(p_payload->>'creditPersonId','')::uuid,
      nullif(p_payload->>'customerPersonId','')::uuid);
    for v_payment in
      select value::uuid from jsonb_array_elements_text(coalesce(v_result->'paymentIds','[]'::jsonb)) value
    loop
      v_credit:=sunshine_v4.v4_record_remaining_as_credit(
        v_payment,v_person,
        'group-credit:'||coalesce(nullif(p_payload->>'idempotencyKey',''),'default')||':'||v_payment::text
      );
      v_total_credit:=v_total_credit+v_credit;
    end loop;
  end if;
  if upper(coalesce(p_payload->>'excessDisposition',''))='KEEP_AS_SALE'
     and not coalesce((v_result->>'idempotent')::boolean,false) then
    perform sunshine_v4.v4_assert_permission('allocation.create');
    update sunshine_v4.payments p
       set retained_excess_cents=coalesce(p.retained_excess_cents,0)+greatest(
         p.amount_cents-coalesce(p.retained_excess_cents,0)-
         coalesce((select sum(a.amount_cents) from sunshine_v4.payment_allocations a where a.payment_id=p.id),0),0)
     where p.id in (select value::uuid from jsonb_array_elements_text(v_result->'paymentIds'));
    v_result:=v_result||jsonb_build_object('remainingCents',0,'retainedExcessCents',
      (select sum(retained_excess_cents) from sunshine_v4.payments where id in (select value::uuid from jsonb_array_elements_text(v_result->'paymentIds'))));
  end if;
  return v_result||jsonb_build_object('creditCents',v_total_credit);
end
$function$
;

CREATE OR REPLACE FUNCTION public.v4_api_register_asaas_entry_with_credit(p_entry_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare v_result jsonb; v_credit bigint:=0; v_person uuid;
begin
  perform public.v4_bind_authenticated_user();
  v_result:=public.v4_api_register_asaas_entry(p_entry_id,p_payload);
  if upper(coalesce(p_payload->>'excessDisposition',''))='CREDIT'
     and nullif(v_result->>'paymentId','') is not null then
    v_person:=coalesce(nullif(p_payload->>'creditPersonId','')::uuid,
      nullif(p_payload->>'customerPersonId','')::uuid);
    v_credit:=sunshine_v4.v4_record_remaining_as_credit(
      (v_result->>'paymentId')::uuid,v_person,
      'asaas-credit:'||p_entry_id::text
    );
  end if;
  if upper(coalesce(p_payload->>'excessDisposition',''))='KEEP_AS_SALE'
     and not coalesce((v_result->>'idempotent')::boolean,false) then
    perform sunshine_v4.v4_assert_permission('allocation.create');
    update sunshine_v4.payments p
       set retained_excess_cents=coalesce(p.retained_excess_cents,0)+greatest(
         p.amount_cents-coalesce(p.retained_excess_cents,0)-
         coalesce((select sum(a.amount_cents) from sunshine_v4.payment_allocations a where a.payment_id=p.id),0),0)
     where p.id=(v_result->>'paymentId')::uuid;
    perform sunshine_v4.v4_write_audit('PAYMENT_EXCESS_RETAINED','payment',(v_result->>'paymentId')::uuid,
      jsonb_build_object('contract_id',v_result->>'contractId','retained_excess_cents',
        (select retained_excess_cents from sunshine_v4.payments where id=(v_result->>'paymentId')::uuid)));
    v_result:=v_result||jsonb_build_object('remainingCents',0,'retainedExcessCents',
      (select retained_excess_cents from sunshine_v4.payments where id=(v_result->>'paymentId')::uuid));
  end if;
  return v_result||jsonb_build_object('creditCents',v_credit);
end
$function$
;

CREATE OR REPLACE FUNCTION public.v4_api_register_manual_entry_with_credit(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare v_result jsonb; v_credit bigint:=0; v_person uuid;
begin
  perform public.v4_bind_authenticated_user();
  v_result:=public.v4_api_register_manual_entry(p_payload);
  if upper(coalesce(p_payload->>'excessDisposition',''))='CREDIT'
     and nullif(v_result->>'paymentId','') is not null then
    v_person:=coalesce(nullif(p_payload->>'creditPersonId','')::uuid,
      nullif(p_payload->>'customerPersonId','')::uuid);
    v_credit:=sunshine_v4.v4_record_remaining_as_credit(
      (v_result->>'paymentId')::uuid,v_person,
      'manual-credit:'||coalesce(nullif(p_payload->>'idempotencyKey',''),v_result->>'paymentId')
    );
  end if;
  if upper(coalesce(p_payload->>'excessDisposition',''))='KEEP_AS_SALE'
     and not coalesce((v_result->>'idempotent')::boolean,false) then
    perform sunshine_v4.v4_assert_permission('allocation.create');
    update sunshine_v4.payments p
       set retained_excess_cents=coalesce(p.retained_excess_cents,0)+greatest(
         p.amount_cents-coalesce(p.retained_excess_cents,0)-
         coalesce((select sum(a.amount_cents) from sunshine_v4.payment_allocations a where a.payment_id=p.id),0),0)
     where p.id=(v_result->>'paymentId')::uuid;
    perform sunshine_v4.v4_write_audit('PAYMENT_EXCESS_RETAINED','payment',(v_result->>'paymentId')::uuid,
      jsonb_build_object('contract_id',v_result->>'contractId','retained_excess_cents',
        (select retained_excess_cents from sunshine_v4.payments where id=(v_result->>'paymentId')::uuid)));
    v_result:=v_result||jsonb_build_object('remainingCents',0,'retainedExcessCents',
      (select retained_excess_cents from sunshine_v4.payments where id=(v_result->>'paymentId')::uuid));
  end if;
  return v_result||jsonb_build_object('creditCents',v_credit);
end
$function$
;
