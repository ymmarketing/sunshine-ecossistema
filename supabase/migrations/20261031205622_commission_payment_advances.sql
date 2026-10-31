-- Preserve actual cash paid, including payments made before any commission exists.
alter table sunshine_v4.commission_payment_entries drop constraint commission_payment_entries_commission_table_check;
alter table sunshine_v4.commission_payment_entries add constraint commission_payment_entries_commission_table_check check(commission_table in ('LEGACY','V4','ADVANCE'));
create index commission_advances_recipient_date_idx on sunshine_v4.commission_payment_entries(recipient_name,paid_on) where commission_table='ADVANCE';
-- Advances are cash payments. Compensation is computed per recipient, oldest earning first,
-- across all receipt dates up to the selected end date, so a month change cannot lose credit.
create or replace function private.sunshine_apply_commission_credit(p_base jsonb,p_start date,p_end date,p_include_balance boolean)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_all jsonb;v_evidence jsonb;v_pending jsonb;v_paid jsonb;v_pending_total bigint;v_paid_total bigint;
begin
 v_all:=private.agent_core_v4_finance_commission_control(date '1900-01-01',p_end,'RECEIPT');
 with advances as (
  select a.*,sum(a.amount_cents) over(partition by a.recipient_name order by a.paid_on,a.created_at,a.id rows between unbounded preceding and 1 preceding) prior_cents
  from sunshine_v4.commission_payment_entries a where a.commission_table='ADVANCE' and a.paid_on<=p_end
 ), totals as (
  select recipient_name,sum(amount_cents)::bigint total from advances group by 1
 ), raw_rows as (
  select e,(e->>'pendingCents')::bigint due,coalesce(t.total,0) credit,
   coalesce(sum((e->>'pendingCents')::bigint) over(partition by e->>'recipientName' order by (e->>'occurredAt')::timestamptz,e->>'commissionTable',e->>'commissionId' rows between unbounded preceding and 1 preceding),0)::bigint prior_due
  from jsonb_array_elements(v_all->'evidence') e left join totals t on t.recipient_name=e->>'recipientName'
 ), applied as (
  select e->>'commissionTable' source,e->>'commissionId' id,least(due,greatest(credit-prior_due,0))::bigint used from raw_rows
 ), due_totals as (
  select e->>'recipientName' recipient,coalesce(sum(due),0)::bigint total from raw_rows group by 1
 ), rows as (
  select e||jsonb_build_object('pendingCents',(e->>'pendingCents')::bigint-coalesce(a.used,0),'creditAppliedCents',coalesce(a.used,0)) obj
  from jsonb_array_elements(p_base->'evidence') e left join applied a on a.source=e->>'commissionTable' and a.id=e->>'commissionId'
  union all
  select jsonb_build_object('commissionId',a.id,'commissionTable','ADVANCE','recipientName',a.recipient_name,
   'amountCents',a.amount_cents,'paidCents',case when a.paid_on between p_start and p_end then a.amount_cents else 0 end,
   'pendingCents',-greatest(a.amount_cents-greatest(coalesce(d.total,0)-coalesce(a.prior_cents,0),0),0),
   'status','ADVANCE','occurredAt',a.paid_on,'paidAt',a.paid_on,'payerName','Adiantamento de comissão',
   'serviceContext','Crédito de pagamento para próximas comissões','notes',a.notes)
  from advances a left join due_totals d on d.recipient=a.recipient_name where p_include_balance
   and (a.paid_on between p_start and p_end or a.amount_cents>greatest(coalesce(d.total,0)-coalesce(a.prior_cents,0),0))
 ), grouped as (
  select obj->>'recipientName' recipient,sum((obj->>'pendingCents')::bigint)::bigint pending,sum((obj->>'paidCents')::bigint)::bigint paid from rows group by 1
 )
 select coalesce((select jsonb_agg(obj order by obj->>'occurredAt' desc) from rows),'[]'::jsonb),
  coalesce(jsonb_object_agg(recipient,pending),'{}'::jsonb),coalesce(jsonb_object_agg(recipient,paid),'{}'::jsonb),coalesce(sum(pending),0),coalesce(sum(paid),0)
 into v_evidence,v_pending,v_paid,v_pending_total,v_paid_total from grouped;
 return p_base||jsonb_build_object('evidence',v_evidence,'pendingByPerson',v_pending,'paidByPerson',v_paid,
  'pendingTotalCents',v_pending_total,'paidTotalCents',v_paid_total,'creditCompensation',true);
end $function$;
revoke all on function private.sunshine_apply_commission_credit(jsonb,date,date,boolean) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.v4_api_record_commission_payments(p_items jsonb, p_paid_on date, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare
  v_actor uuid;
  v_key text:=nullif(btrim(p_idempotency_key),'');
  v_item jsonb;
  v_candidate jsonb;
  v_recipient text;
  v_actual_recipient text;
  v_requested bigint;
  v_remaining bigint;
  v_chunk bigint;
  v_table text;
  v_id uuid;
  v_total bigint;
  v_source_status text;
  v_ledger_paid bigint;
  v_effective_paid bigint;
  v_pending bigint;
  v_total_paid bigint:=0;
  v_by_person jsonb:='{}'::jsonb;
  v_batch_id uuid:=gen_random_uuid();
  v_existing jsonb;
  v_member uuid;
begin
  v_actor:=public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('commission.update');

  if p_paid_on is null then raise exception 'Informe a data do pagamento da comissão.'; end if;
  if p_paid_on>current_date then raise exception 'A data do pagamento não pode estar no futuro.'; end if;
  if v_key is null then raise exception 'Chave de idempotência obrigatória.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Informe ao menos um valor de comissão pago.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('commission-payment:'||v_key,0));

  if exists(select 1 from sunshine_v4.commission_payment_entries where batch_key=v_key) then
    select jsonb_build_object(
      'idempotencyKey',v_key,
      'totalPaidCents',coalesce(sum(x.total_cents),0),
      'byPerson',coalesce(jsonb_object_agg(x.recipient_name,x.total_cents),'{}'::jsonb),
      'replayed',true
    ) into v_existing
    from (
      select recipient_name,sum(amount_cents)::bigint total_cents
      from sunshine_v4.commission_payment_entries
      where batch_key=v_key
      group by recipient_name
    ) x;
    return v_existing;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) order by lower(value->>'recipientName')
  loop
    v_recipient:=nullif(btrim(v_item->>'recipientName'),'');
    v_requested:=coalesce(nullif(v_item->>'amountCents','')::bigint,0);
    if v_recipient is null then raise exception 'Beneficiário da comissão não informado.'; end if;
    if v_requested<=0 then raise exception 'O valor pago para % deve ser maior que zero.',v_recipient; end if;
    select id,full_name into v_member,v_recipient from sunshine_v4.team_members
    where active and lower(full_name)=case when lower(v_recipient)='roseli' then 'rosely' else lower(v_recipient) end
    for update;
    if v_member is null then raise exception 'Beneficiário da comissão inválido.'; end if;
    if jsonb_typeof(coalesce(v_item->'commissions','[]'::jsonb))<>'array' then
      raise exception 'Seleção de comissões inválida.';
    end if;

    v_remaining:=v_requested;

    for v_candidate in select value from jsonb_array_elements(coalesce(v_item->'commissions','[]'::jsonb))
    loop
      exit when v_remaining<=0;
      v_table:=upper(coalesce(v_candidate->>'commissionTable',''));
      v_id:=nullif(v_candidate->>'commissionId','')::uuid;
      v_total:=null;
      v_source_status:=null;
      v_actual_recipient:=null;

      if v_table='LEGACY' then
        select lc.amount_cents,upper(coalesce(lc.status,'')),
               coalesce(b.full_name,r.full_name,'Sem identificação')
          into v_total,v_source_status,v_actual_recipient
        from sunshine_v4.legacy_commission_entries lc
        left join sunshine_v4.team_members b on b.id=lc.beneficiary_member_id
        left join sunshine_v4.team_members r on r.id=lc.responsible_member_id
        where lc.legacy_v3_id=v_id
        for update of lc;
      elsif v_table='V4' then
        select ce.amount_cents,upper(coalesce(ce.status,'')),
               coalesce(b.full_name,r.full_name,nullif(ce.recipient_code,''),'Sem identificação')
          into v_total,v_source_status,v_actual_recipient
        from sunshine_v4.commission_entries ce
        left join sunshine_v4.team_members b on b.id=ce.beneficiary_member_id
        left join sunshine_v4.team_members r on r.id=ce.responsible_member_id
        where ce.id=v_id
        for update of ce;
      else
        raise exception 'Origem de comissão inválida.';
      end if;

      if v_total is null then raise exception 'Comissão selecionada não encontrada.'; end if;
      if lower(v_actual_recipient)<>lower(v_recipient) then
        raise exception 'A comissão selecionada pertence a %, não a %.',v_actual_recipient,v_recipient;
      end if;
      if v_source_status not in ('DUE','PARTIAL','PAID') then
        raise exception 'A comissão de % não pode receber baixa no estado %.',v_recipient,v_source_status;
      end if;

      select coalesce(sum(amount_cents),0)::bigint into v_ledger_paid
      from sunshine_v4.commission_payment_entries
      where commission_table=v_table and commission_id=v_id;

      v_effective_paid:=case
        when v_source_status='PAID' and v_ledger_paid=0 then v_total
        else least(v_total,v_ledger_paid)
      end;
      v_pending:=greatest(v_total-v_effective_paid,0);
      if v_pending<=0 then continue; end if;

      v_chunk:=least(v_remaining,v_pending);

      insert into sunshine_v4.commission_payment_entries(
        batch_key,commission_table,commission_id,recipient_name,amount_cents,paid_on,notes,created_by
      ) values(
        v_key,v_table,v_id,v_actual_recipient,v_chunk,p_paid_on,nullif(btrim(p_notes),''),v_actor
      );

      perform sunshine_v4.v4_refresh_commission_settlement_status(v_table,v_id);
      v_remaining:=v_remaining-v_chunk;
    end loop;

    if v_remaining>0 then
      insert into sunshine_v4.commission_payment_entries(
        batch_key,commission_table,commission_id,recipient_name,amount_cents,paid_on,notes,created_by
      ) values(v_key,'ADVANCE',v_member,v_recipient,v_remaining,p_paid_on,
        nullif(btrim(p_notes),''),v_actor);
    end if;

    v_total_paid:=v_total_paid+v_requested;
    v_by_person:=v_by_person||jsonb_build_object(v_recipient,v_requested);
  end loop;

  if v_total_paid<=0 then raise exception 'Nenhum valor de comissão foi informado.'; end if;

  perform sunshine_v4.v4_write_audit(
    'COMMISSION_PAYMENT_RECORDED','commission_payment_batch',v_batch_id,
    jsonb_build_object('idempotencyKey',v_key,'paidOn',p_paid_on,'totalPaidCents',v_total_paid,'byPerson',v_by_person,'notes',p_notes)
  );

  return jsonb_build_object(
    'batchId',v_batch_id,
    'idempotencyKey',v_key,
    'paidOn',p_paid_on,
    'totalPaidCents',v_total_paid,
    'byPerson',v_by_person,
    'replayed',false
  );
end
$function$
;
CREATE OR REPLACE FUNCTION public.v4_finance_commission_control_filtered(p_start date, p_end date, p_basis text DEFAULT 'RECEIPT'::text, p_responsible_member_id uuid DEFAULT NULL::uuid, p_service_category text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare
  v_base jsonb;
  v_evidence jsonb;
  v_pending jsonb;
  v_paid jsonb;
  v_pending_total bigint:=0;
  v_paid_total bigint:=0;
  v_start date;
  v_end date;
  v_paid_start date;
  v_paid_end date;
begin
  v_base:=public.v4_finance_commission_control(p_start,p_end,p_basis);
  if p_responsible_member_id is null and nullif(btrim(p_service_category),'') is null then return private.sunshine_apply_commission_credit(v_base,p_start,p_end,true); end if;

  with mapped as (
    select e.value obj,ci.responsible_member_id,ci.service_category
    from jsonb_array_elements(coalesce(v_base->'evidence','[]'::jsonb)) e
    left join sunshine_v4.legacy_commission_entries lc
      on e.value->>'commissionTable'='LEGACY' and lc.legacy_v3_id=(e.value->>'commissionId')::uuid
    left join sunshine_v4.commission_entries ce
      on e.value->>'commissionTable'='V4' and ce.id=(e.value->>'commissionId')::uuid
    join sunshine_v4.payment_allocations pa on pa.id=coalesce(lc.payment_allocation_id,ce.allocation_id)
    join sunshine_v4.obligations o on o.id=pa.obligation_id
    join sunshine_v4.contract_items ci on ci.id=o.contract_item_id
  ),
  rows as (
    select obj from mapped
    where (p_responsible_member_id is null or responsible_member_id=p_responsible_member_id)
      and (nullif(btrim(p_service_category),'') is null or upper(coalesce(service_category,'OUTRO'))=upper(p_service_category))
  ),
  pending as (
    select obj->>'recipientName' recipient,sum((obj->>'pendingCents')::bigint)::bigint total
    from rows where (obj->>'pendingCents')::bigint>0 group by 1
  ),
  paid as (
    select obj->>'recipientName' recipient,sum((obj->>'paidCents')::bigint)::bigint total
    from rows where (obj->>'paidCents')::bigint>0 group by 1
  )
  select
    coalesce(jsonb_agg(obj),'[]'::jsonb),
    coalesce(sum((obj->>'pendingCents')::bigint),0),
    coalesce(sum((obj->>'paidCents')::bigint),0),
    (min((obj->>'occurredAt')::timestamptz) filter(where (obj->>'pendingCents')::bigint>0))::date,
    (max((obj->>'occurredAt')::timestamptz) filter(where (obj->>'pendingCents')::bigint>0))::date,
    min(nullif(obj->>'paidAt','')::date) filter(where (obj->>'paidCents')::bigint>0),
    max(nullif(obj->>'paidAt','')::date) filter(where (obj->>'paidCents')::bigint>0),
    coalesce((select jsonb_object_agg(recipient,total) from pending),'{}'::jsonb),
    coalesce((select jsonb_object_agg(recipient,total) from paid),'{}'::jsonb)
  into v_evidence,v_pending_total,v_paid_total,v_start,v_end,v_paid_start,v_paid_end,v_pending,v_paid
  from rows;

  return private.sunshine_apply_commission_credit(jsonb_build_object(
    'pendingTotalCents',v_pending_total,
    'paidTotalCents',v_paid_total,
    'pendingStartDate',v_start,
    'pendingEndDate',v_end,
    'paidStartDate',v_paid_start,
    'paidEndDate',v_paid_end,
    'pendingByPerson',v_pending,
    'paidByPerson',v_paid,
    'evidence',v_evidence
  ),p_start,p_end,false);
end
$function$
;
revoke all on function public.v4_api_record_commission_payments(jsonb,date,text,text) from public,anon;
grant execute on function public.v4_api_record_commission_payments(jsonb,date,text,text) to authenticated;
revoke all on function public.v4_finance_commission_control_filtered(date,date,text,uuid,text) from public,anon;
grant execute on function public.v4_finance_commission_control_filtered(date,date,text,uuid,text) to authenticated;
notify pgrst,'reload schema';
