create table if not exists sunshine_v4.commission_payment_entries (
  id uuid primary key default gen_random_uuid(),
  batch_key text not null,
  commission_table text not null check (commission_table in ('LEGACY','V4')),
  commission_id uuid not null,
  recipient_name text not null,
  amount_cents bigint not null check (amount_cents > 0),
  paid_on date not null,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists commission_payment_entries_batch_commission_uidx
  on sunshine_v4.commission_payment_entries(batch_key, commission_table, commission_id);

create index if not exists commission_payment_entries_commission_idx
  on sunshine_v4.commission_payment_entries(commission_table, commission_id);

create index if not exists commission_payment_entries_paid_on_idx
  on sunshine_v4.commission_payment_entries(paid_on);

alter table sunshine_v4.commission_payment_entries enable row level security;

comment on table sunshine_v4.commission_payment_entries is
  'Ledger de baixas de comissão. Permite pagamentos parciais sem alterar o valor original da comissão.';

create or replace view sunshine_v4.commission_effective_status as
with settlements as (
  select commission_table, commission_id,
         sum(amount_cents)::bigint paid_ledger_cents,
         min(paid_on) first_paid_on,
         max(paid_on) last_paid_on
  from sunshine_v4.commission_payment_entries
  group by commission_table, commission_id
),
legacy_rows as (
  select
    lc.legacy_v3_id commission_id,
    'LEGACY'::text commission_table,
    lc.payment_allocation_id allocation_id,
    lc.responsible_member_id,
    lc.beneficiary_member_id,
    coalesce(b.full_name,r.full_name,'Sem identificação') recipient_name,
    lc.amount_cents::bigint amount_cents,
    upper(coalesce(lc.status,'')) source_status,
    coalesce(s.paid_ledger_cents,0)::bigint paid_ledger_cents,
    s.first_paid_on,
    s.last_paid_on,
    lc.paid_at source_paid_at
  from sunshine_v4.legacy_commission_entries lc
  left join sunshine_v4.team_members b on b.id=lc.beneficiary_member_id
  left join sunshine_v4.team_members r on r.id=lc.responsible_member_id
  left join settlements s on s.commission_table='LEGACY' and s.commission_id=lc.legacy_v3_id
),
v4_rows as (
  select
    ce.id commission_id,
    'V4'::text commission_table,
    ce.allocation_id,
    ce.responsible_member_id,
    ce.beneficiary_member_id,
    coalesce(b.full_name,r.full_name,nullif(ce.recipient_code,''),'Sem identificação') recipient_name,
    ce.amount_cents::bigint amount_cents,
    upper(coalesce(ce.status,'')) source_status,
    coalesce(s.paid_ledger_cents,0)::bigint paid_ledger_cents,
    s.first_paid_on,
    s.last_paid_on,
    ce.paid_at source_paid_at
  from sunshine_v4.commission_entries ce
  left join sunshine_v4.team_members b on b.id=ce.beneficiary_member_id
  left join sunshine_v4.team_members r on r.id=ce.responsible_member_id
  left join settlements s on s.commission_table='V4' and s.commission_id=ce.id
),
all_rows as (
  select * from legacy_rows
  union all
  select * from v4_rows
),
normalized as (
  select a.*,
    case
      when a.source_status='PAID' and a.paid_ledger_cents=0 then a.amount_cents
      else least(a.amount_cents, greatest(a.paid_ledger_cents,0))
    end::bigint effective_paid_cents
  from all_rows a
)
select
  n.commission_id,
  n.commission_table,
  n.allocation_id,
  n.responsible_member_id,
  n.beneficiary_member_id,
  n.recipient_name,
  n.amount_cents,
  n.effective_paid_cents paid_cents,
  greatest(n.amount_cents-n.effective_paid_cents,0)::bigint pending_cents,
  case
    when n.source_status not in ('DUE','PAID','PARTIAL') then n.source_status
    when n.effective_paid_cents >= n.amount_cents then 'PAID'
    when n.effective_paid_cents > 0 then 'PARTIAL'
    else 'DUE'
  end effective_status,
  n.source_status,
  case
    when n.effective_paid_cents > 0 then coalesce(n.first_paid_on,n.source_paid_at::date)
  end first_paid_on,
  case
    when n.effective_paid_cents > 0 then coalesce(n.last_paid_on,n.source_paid_at::date)
  end last_paid_on
from normalized n;

create or replace function sunshine_v4.v4_refresh_commission_settlement_status(
  p_commission_table text,
  p_commission_id uuid
) returns void
language plpgsql
security definer
set search_path to 'sunshine_v4','pg_temp'
as $$
declare
  v_table text := upper(coalesce(nullif(btrim(p_commission_table),''),''));
  v_total bigint;
  v_paid bigint := 0;
  v_last date;
  v_status text;
begin
  if v_table='LEGACY' then
    select amount_cents into v_total
    from sunshine_v4.legacy_commission_entries
    where legacy_v3_id=p_commission_id
    for update;
  elsif v_table='V4' then
    select amount_cents into v_total
    from sunshine_v4.commission_entries
    where id=p_commission_id
    for update;
  else
    raise exception 'Origem de comissão inválida.';
  end if;

  if v_total is null then raise exception 'Comissão não encontrada.'; end if;

  select coalesce(sum(amount_cents),0)::bigint,max(paid_on)
    into v_paid,v_last
  from sunshine_v4.commission_payment_entries
  where commission_table=v_table and commission_id=p_commission_id;

  if v_paid > v_total then
    raise exception 'Baixas da comissão ultrapassam o valor gerado.';
  end if;

  v_status:=case when v_paid>=v_total then 'PAID' when v_paid>0 then 'PARTIAL' else 'DUE' end;

  if v_table='LEGACY' then
    update sunshine_v4.legacy_commission_entries
      set status=v_status,
          paid_at=case when v_status='PAID' then v_last::timestamp at time zone 'America/Sao_Paulo' else null end
    where legacy_v3_id=p_commission_id;
  else
    update sunshine_v4.commission_entries
      set status=v_status,
          paid_at=case when v_status='PAID' then v_last::timestamp at time zone 'America/Sao_Paulo' else null end
    where id=p_commission_id;
  end if;
end
$$;

create or replace function public.v4_api_record_commission_payments(
  p_items jsonb,
  p_paid_on date,
  p_notes text default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public','sunshine_v4','auth','pg_temp'
as $$
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
begin
  v_actor:=public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('commission.update');

  if p_paid_on is null then raise exception 'Informe a data do pagamento da comissão.'; end if;
  if p_paid_on>current_date then raise exception 'A data do pagamento não pode estar no futuro.'; end if;
  if v_key is null then raise exception 'Chave de idempotência obrigatória.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
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

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_recipient:=nullif(btrim(v_item->>'recipientName'),'');
    v_requested:=coalesce(nullif(v_item->>'amountCents','')::bigint,0);
    if v_recipient is null then raise exception 'Beneficiário da comissão não informado.'; end if;
    if v_requested<=0 then raise exception 'O valor pago para % deve ser maior que zero.',v_recipient; end if;
    if jsonb_typeof(v_item->'commissions')<>'array' or jsonb_array_length(v_item->'commissions')=0 then
      raise exception 'Não há comissões pendentes selecionadas para %.',v_recipient;
    end if;

    v_remaining:=v_requested;

    for v_candidate in select value from jsonb_array_elements(v_item->'commissions')
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
      raise exception 'O valor informado para % (% centavos) supera a pendência disponível nesta seleção em % centavos.',
        v_recipient,v_requested,v_remaining;
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
$$;

revoke all on function public.v4_api_record_commission_payments(jsonb,date,text,text) from public, anon;
grant execute on function public.v4_api_record_commission_payments(jsonb,date,text,text) to authenticated;

create or replace function public.v4_api_set_commission_status(
  p_items jsonb,
  p_status text,
  p_paid_on date default null
) returns integer
language plpgsql
security definer
set search_path to 'public','sunshine_v4','auth','pg_temp'
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_table text;
  v_status text:=upper(coalesce(nullif(btrim(p_status),''),''));
  v_changed integer:=0;
  v_rows integer;
  v_total bigint;
  v_source_status text;
  v_recipient text;
  v_ledger_paid bigint;
  v_remaining bigint;
  v_actor uuid;
  v_key text;
begin
  v_actor:=public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('commission.update');

  if v_status not in ('DUE','PAID') then raise exception 'Situação de comissão inválida.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Selecione ao menos uma comissão.'; end if;
  if v_status='PAID' and p_paid_on is null then raise exception 'Informe a data em que a comissão foi paga.'; end if;
  if p_paid_on>current_date then raise exception 'A data da baixa não pode estar no futuro.'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_id:=nullif(v_item->>'commissionId','')::uuid;
    v_table:=upper(coalesce(v_item->>'commissionTable',''));
    v_total:=null;
    v_source_status:=null;
    v_recipient:=null;
    v_rows:=0;

    if v_table='LEGACY' then
      select lc.amount_cents,upper(coalesce(lc.status,'')),
             coalesce(b.full_name,r.full_name,'Sem identificação')
        into v_total,v_source_status,v_recipient
      from sunshine_v4.legacy_commission_entries lc
      left join sunshine_v4.team_members b on b.id=lc.beneficiary_member_id
      left join sunshine_v4.team_members r on r.id=lc.responsible_member_id
      where lc.legacy_v3_id=v_id
      for update of lc;
    elsif v_table='V4' then
      select ce.amount_cents,upper(coalesce(ce.status,'')),
             coalesce(b.full_name,r.full_name,nullif(ce.recipient_code,''),'Sem identificação')
        into v_total,v_source_status,v_recipient
      from sunshine_v4.commission_entries ce
      left join sunshine_v4.team_members b on b.id=ce.beneficiary_member_id
      left join sunshine_v4.team_members r on r.id=ce.responsible_member_id
      where ce.id=v_id
      for update of ce;
    else
      raise exception 'Origem de comissão inválida.';
    end if;

    if v_total is null then raise exception 'Comissão não encontrada.'; end if;
    if v_source_status not in ('DUE','PARTIAL','PAID') then
      raise exception 'Comissão no estado % não pode ser alterada pelo controle operacional.',v_source_status;
    end if;

    if v_status='DUE' then
      delete from sunshine_v4.commission_payment_entries
      where commission_table=v_table and commission_id=v_id;

      if v_table='LEGACY' then
        update sunshine_v4.legacy_commission_entries
          set status='DUE',paid_at=null,
              notes=concat_ws(' | ',nullif(notes,''),'Baixas de comissão reabertas')
        where legacy_v3_id=v_id;
      else
        update sunshine_v4.commission_entries
          set status='DUE',paid_at=null,
              notes=concat_ws(' | ',nullif(notes,''),'Baixas de comissão reabertas')
        where id=v_id;
      end if;
      v_rows:=1;
    else
      select coalesce(sum(amount_cents),0)::bigint into v_ledger_paid
      from sunshine_v4.commission_payment_entries
      where commission_table=v_table and commission_id=v_id;

      if v_ledger_paid>=v_total then
        update sunshine_v4.commission_payment_entries
          set paid_on=p_paid_on
        where commission_table=v_table and commission_id=v_id;
      else
        v_remaining:=v_total-v_ledger_paid;
        v_key:='status-paid:'||v_table||':'||v_id::text||':'||p_paid_on::text;
        insert into sunshine_v4.commission_payment_entries(
          batch_key,commission_table,commission_id,recipient_name,amount_cents,paid_on,notes,created_by
        ) values(
          v_key,v_table,v_id,v_recipient,v_remaining,p_paid_on,'Baixa integral pelo detalhamento',v_actor
        )
        on conflict (batch_key,commission_table,commission_id)
        do update set paid_on=excluded.paid_on;
      end if;

      perform sunshine_v4.v4_refresh_commission_settlement_status(v_table,v_id);

      if v_table='LEGACY' then
        update sunshine_v4.legacy_commission_entries
          set notes=concat_ws(' | ',nullif(notes,''),'Baixa integral em '||to_char(p_paid_on,'DD/MM/YYYY'))
        where legacy_v3_id=v_id;
      else
        update sunshine_v4.commission_entries
          set notes=concat_ws(' | ',nullif(notes,''),'Baixa integral em '||to_char(p_paid_on,'DD/MM/YYYY'))
        where id=v_id;
      end if;
      v_rows:=1;
    end if;

    v_changed:=v_changed+v_rows;
    perform sunshine_v4.v4_write_audit(
      'COMMISSION_STATUS_UPDATED','commission',v_id,
      jsonb_build_object('sourceTable',v_table,'status',v_status,'paidOn',p_paid_on)
    );
  end loop;

  return v_changed;
end
$$;

revoke all on function public.v4_api_set_commission_status(jsonb,text,date) from public, anon;
grant execute on function public.v4_api_set_commission_status(jsonb,text,date) to authenticated;

create or replace function public.v4_finance_commission_control(
  p_start date,
  p_end date,
  p_basis text default 'RECEIPT'
) returns jsonb
language plpgsql
security definer
set search_path to 'public','sunshine_v4','auth','pg_temp'
as $$
declare
  v_basis text:=upper(coalesce(nullif(btrim(p_basis),''),'RECEIPT'));
  v_result jsonb;
begin
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('commission.read');
  if p_start is null or p_end is null or p_start>p_end then raise exception 'Informe um período válido.'; end if;
  if v_basis not in ('RECEIPT','SALE','COMPETENCE','DUE','SETTLEMENT') then
    raise exception 'Base de data financeira inválida: %',p_basis;
  end if;

  with obligation_dates as (
    select o.id obligation_id,coalesce(c.sold_at,c.created_at)::date sold_date,
      coalesce(ci.reference_month,max(pay.competence_date),coalesce(c.sold_at,c.created_at)::date) competence_date,
      coalesce(o.due_date,o.expected_payment_date,coalesce(c.sold_at,c.created_at)::date) due_date,
      case when coalesce(sum(pa.amount_cents),0)>=o.total_cents then max(pay.paid_at)::date end settlement_date
    from sunshine_v4.obligations o
    join sunshine_v4.contract_items ci on ci.id=o.contract_item_id
    join sunshine_v4.contracts c on c.id=ci.contract_id
    left join sunshine_v4.payment_allocations pa on pa.obligation_id=o.id
    left join sunshine_v4.payments pay on pay.id=pa.payment_id
    where coalesce(o.explicit_status,'')<>'CANCELLED' and coalesce(c.status,'CONFIRMED')<>'CANCELLED'
    group by o.id,o.total_cents,c.sold_at,c.created_at,ci.reference_month,o.due_date,o.expected_payment_date
  ),
  scope_ids as (
    select od.obligation_id from obligation_dates od
    where (v_basis='SALE' and od.sold_date between p_start and p_end)
      or (v_basis='COMPETENCE' and od.competence_date between p_start and p_end)
      or (v_basis='DUE' and od.due_date between p_start and p_end)
      or (v_basis='SETTLEMENT' and od.settlement_date between p_start and p_end)
  ),
  commission_rows as (
    select ecs.commission_id,ecs.commission_table,ecs.recipient_name,
      ecs.amount_cents,ecs.paid_cents,ecs.pending_cents,ecs.effective_status commission_status,
      pay.paid_at occurred_at,ecs.first_paid_on,ecs.last_paid_on,
      coalesce(pp.preferred_name,pp.full_name,pay.payer_snapshot->>'name','Pagador não identificado') payer_name,
      coalesce(ci.event_name,w.title,ci.service_name,'Serviço não informado') service_context
    from sunshine_v4.commission_effective_status ecs
    join sunshine_v4.payment_allocations pa on pa.id=ecs.allocation_id
    join sunshine_v4.payments pay on pay.id=pa.payment_id
    join sunshine_v4.obligations o on o.id=pa.obligation_id
    join sunshine_v4.contract_items ci on ci.id=o.contract_item_id
    left join sunshine_v4.works w on w.id=ci.work_id
    left join sunshine_v4.people pp on pp.id=pay.payer_person_id
    where ecs.source_status in ('DUE','PAID','PARTIAL')
      and (
        (v_basis='RECEIPT' and pay.paid_at::date between p_start and p_end)
        or (v_basis<>'RECEIPT' and exists(select 1 from scope_ids s where s.obligation_id=pa.obligation_id))
      )
  ),
  pending_totals as (
    select recipient_name,sum(pending_cents)::bigint total_cents
    from commission_rows where pending_cents>0 group by recipient_name
  ),
  paid_totals as (
    select recipient_name,sum(paid_cents)::bigint total_cents
    from commission_rows where paid_cents>0 group by recipient_name
  )
  select jsonb_build_object(
    'pendingTotalCents',coalesce((select sum(pending_cents) from commission_rows),0),
    'paidTotalCents',coalesce((select sum(paid_cents) from commission_rows),0),
    'pendingStartDate',(select min(occurred_at::date) from commission_rows where pending_cents>0),
    'pendingEndDate',(select max(occurred_at::date) from commission_rows where pending_cents>0),
    'paidStartDate',(select min(first_paid_on) from commission_rows where paid_cents>0),
    'paidEndDate',(select max(last_paid_on) from commission_rows where paid_cents>0),
    'pendingByPerson',coalesce((select jsonb_object_agg(recipient_name,total_cents order by recipient_name) from pending_totals),'{}'::jsonb),
    'paidByPerson',coalesce((select jsonb_object_agg(recipient_name,total_cents order by recipient_name) from paid_totals),'{}'::jsonb),
    'evidence',coalesce((
      select jsonb_agg(jsonb_build_object(
        'commissionId',commission_id,
        'commissionTable',commission_table,
        'recipientName',recipient_name,
        'amountCents',amount_cents,
        'paidCents',paid_cents,
        'pendingCents',pending_cents,
        'status',commission_status,
        'occurredAt',occurred_at,
        'paidAt',last_paid_on,
        'payerName',payer_name,
        'serviceContext',service_context
      ) order by occurred_at desc nulls last,recipient_name)
      from commission_rows
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end
$$;

create or replace function public.v4_finance_commission_control_filtered(
  p_start date,
  p_end date,
  p_basis text default 'RECEIPT',
  p_responsible_member_id uuid default null,
  p_service_category text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public','sunshine_v4','auth','pg_temp'
as $$
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
  if p_responsible_member_id is null and nullif(btrim(p_service_category),'') is null then return v_base; end if;

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

  return jsonb_build_object(
    'pendingTotalCents',v_pending_total,
    'paidTotalCents',v_paid_total,
    'pendingStartDate',v_start,
    'pendingEndDate',v_end,
    'paidStartDate',v_paid_start,
    'paidEndDate',v_paid_end,
    'pendingByPerson',v_pending,
    'paidByPerson',v_paid,
    'evidence',v_evidence
  );
end
$$;

revoke all on function public.v4_finance_commission_control(date,date,text) from public, anon;
grant execute on function public.v4_finance_commission_control(date,date,text) to authenticated;
revoke all on function public.v4_finance_commission_control_filtered(date,date,text,uuid,text) from public, anon;
grant execute on function public.v4_finance_commission_control_filtered(date,date,text,uuid,text) to authenticated;
