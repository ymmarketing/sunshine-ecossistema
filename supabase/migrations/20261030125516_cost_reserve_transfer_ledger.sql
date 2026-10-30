-- The operational cost-reserve transfer ledger starts on 27/10/2026 (São Paulo).
-- This is an internal transfer, never a second expense, receipt or commission.
create table sunshine_v4.cost_reserve_transfers (
 id uuid primary key default gen_random_uuid(),
 idempotency_key text not null unique,
 request jsonb not null,
 amount_cents bigint not null check(amount_cents>0),
 transferred_on date not null check(transferred_on>=date '2026-10-27'),
 notes text,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 reversed_at timestamptz,
 reversed_by uuid,
 reversal_reason text
);
create table sunshine_v4.cost_reserve_transfer_entries (
 id uuid primary key default gen_random_uuid(),
 transfer_id uuid not null references sunshine_v4.cost_reserve_transfers(id),
 allocation_id uuid references sunshine_v4.payment_allocations(id) on delete set null,
 amount_cents bigint not null check(amount_cents>0),
 snapshot jsonb not null,
 unique(transfer_id,allocation_id)
);
create index cost_reserve_transfer_allocation_idx on sunshine_v4.cost_reserve_transfer_entries(allocation_id);
alter table sunshine_v4.cost_reserve_transfers enable row level security;
alter table sunshine_v4.cost_reserve_transfer_entries enable row level security;
revoke all on sunshine_v4.cost_reserve_transfers,sunshine_v4.cost_reserve_transfer_entries from public,anon,authenticated;

-- Private source shared by the read and write APIs. Reuse the financial split,
-- including Roseli and consultation/question exemptions and individual overrides.
create function private.sunshine_cost_reserve_rows()
returns table(allocation_id uuid,payment_id uuid,paid_on date,responsible_name text,
 person_name text,service_name text,event_name text,base_cents bigint,cost_bp integer,
 reserve_cents bigint,transferred_cents bigint,pending_cents bigint)
language sql stable security definer set search_path='' as $$
 with source as (
  select a.id allocation_id,p.id payment_id,(p.paid_at at time zone 'America/Sao_Paulo')::date paid_on,
   t.full_name responsible_name,coalesce(bp.preferred_name,bp.full_name,p.payer_snapshot->>'name','Pessoa não identificada') person_name,
   i.service_name,coalesce(nullif(btrim(i.event_name),''),w.title,i.service_name) event_name,a.amount_cents base_cents,
   (private.sunshine_item_split(i.id,(p.paid_at at time zone 'America/Sao_Paulo')::date)->>'costBp')::integer cost_bp
  from sunshine_v4.payment_allocations a
  join sunshine_v4.payments p on p.id=a.payment_id
  join sunshine_v4.obligations o on o.id=a.obligation_id
  join sunshine_v4.contract_items i on i.id=o.contract_item_id
  join sunshine_v4.team_members t on t.id=i.responsible_member_id
  left join sunshine_v4.people bp on bp.id=coalesce(o.beneficiary_person_id,i.beneficiary_person_id)
  left join sunshine_v4.works w on w.id=i.work_id
  where p.status='PAID' and (p.paid_at at time zone 'America/Sao_Paulo')::date>=date '2026-10-27'
   and (p.paid_at at time zone 'America/Sao_Paulo')::date<=(now() at time zone 'America/Sao_Paulo')::date
   and lower(btrim(t.full_name)) in ('yasmin','lourdes')
 ), generated as (
  select *,round(base_cents*cost_bp/10000.0)::bigint reserve_cents from source where cost_bp>0
 ), transferred as (
  select e.allocation_id,sum(e.amount_cents)::bigint amount_cents
  from sunshine_v4.cost_reserve_transfer_entries e join sunshine_v4.cost_reserve_transfers t on t.id=e.transfer_id
  where t.reversed_at is null group by e.allocation_id
 )
 select g.*,coalesce(t.amount_cents,0),greatest(g.reserve_cents-coalesce(t.amount_cents,0),0)
 from generated g left join transferred t using(allocation_id) where g.reserve_cents>0;
$$;
revoke all on function private.sunshine_cost_reserve_rows() from public,anon,authenticated;

create function public.v4_cost_reserve_control(p_start date,p_end date,p_basis text default 'RECEIPT',
 p_responsible_member_id uuid default null,p_service_category text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_dashboard jsonb;v_rows jsonb;v_history jsonb;v_total bigint;v_sent bigint;v_pending bigint;
begin
 perform public.v4_bind_authenticated_user();
 perform sunshine_v4.v4_assert_permission('commission.read');
 v_dashboard:=public.v4_finance_dashboard_filtered(p_start,p_end,p_basis,p_responsible_member_id,p_service_category);
 select coalesce(jsonb_agg(jsonb_build_object('allocationId',r.allocation_id,'paymentId',r.payment_id,
  'paidOn',r.paid_on,'personName',r.person_name,'serviceName',r.service_name,'eventName',r.event_name,
  'responsibleName',r.responsible_name,'baseCents',r.base_cents,'costBp',r.cost_bp,
  'amountCents',r.reserve_cents,'transferredCents',r.transferred_cents,'pendingCents',r.pending_cents)
  order by r.paid_on,r.allocation_id),'[]'),coalesce(sum(r.reserve_cents),0),
  coalesce(sum(r.transferred_cents),0),coalesce(sum(r.pending_cents),0)
 into v_rows,v_total,v_sent,v_pending
 from private.sunshine_cost_reserve_rows() r
 where exists(select 1 from jsonb_array_elements(v_dashboard->'reserveEvidence') e where (e->>'allocationId')::uuid=r.allocation_id);
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'transferredOn',t.transferred_on,'amountCents',t.amount_cents,
  'selectedCents',(select sum(e.amount_cents) from sunshine_v4.cost_reserve_transfer_entries e where e.transfer_id=t.id
    and exists(select 1 from jsonb_array_elements(v_rows)r where (r->>'allocationId')::uuid=e.allocation_id)),
  'notes',t.notes,'reversedAt',t.reversed_at,'reversalReason',t.reversal_reason) order by t.created_at desc),'[]')
 into v_history from sunshine_v4.cost_reserve_transfers t
 where exists(select 1 from sunshine_v4.cost_reserve_transfer_entries e where e.transfer_id=t.id
   and exists(select 1 from jsonb_array_elements(v_rows)r where (r->>'allocationId')::uuid=e.allocation_id))
  or (p_responsible_member_id is null and nullif(btrim(p_service_category),'') is null and t.transferred_on between p_start and p_end);
 return jsonb_build_object('startsOn','2026-10-27','generatedCents',v_total,'transferredCents',v_sent,
  'pendingCents',v_pending,'evidence',v_rows,'transfers',v_history);
end $$;

create function public.v4_api_record_cost_reserve_transfer(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid;v_key text:=nullif(btrim(p_payload->>'idempotencyKey'),'');
 v_amount bigint:=(p_payload->>'amountCents')::bigint;v_on date:=(p_payload->>'transferredOn')::date;
 v_old sunshine_v4.cost_reserve_transfers%rowtype;v_id uuid;v_ids uuid[];v_row record;
 v_remaining bigint;v_chunk bigint;v_available bigint;v_count integer;
begin
 v_user:=public.v4_bind_authenticated_user();
 perform sunshine_v4.v4_assert_permission('commission.update');
 if v_key is null then raise exception 'Chave de confirmação obrigatória.';end if;
 -- One lock serializes all transfers/reversals. Locks on source rows also protect corrections.
 perform pg_advisory_xact_lock(hashtextextended('sunshine-cost-reserve-transfers',0));
 select * into v_old from sunshine_v4.cost_reserve_transfers where idempotency_key=v_key;
 if found then
  if v_old.created_by<>v_user or v_old.request is distinct from p_payload then raise exception 'Esta confirmação já foi usada com outros dados.';end if;
  return jsonb_build_object('id',v_old.id,'amountCents',v_old.amount_cents,'replayed',true);
 end if;
 if v_amount is null or v_amount<=0 then raise exception 'Informe um valor maior que zero.';end if;
 if v_on is null or v_on<date '2026-10-27' or v_on>(now() at time zone 'America/Sao_Paulo')::date then
  raise exception 'A data do envio deve estar entre 27/10/2026 e hoje.';end if;
 if jsonb_typeof(p_payload->'allocationIds') is distinct from 'array' then raise exception 'Selecione os recebimentos da reserva.';end if;
 select array_agg(value::uuid),count(*) into v_ids,v_count from jsonb_array_elements_text(p_payload->'allocationIds');
 if v_count=0 or v_count<>(select count(distinct x) from unnest(v_ids)x) or array_position(v_ids,null) is not null then
  raise exception 'Seleção vazia ou repetida.';end if;
 perform 1 from sunshine_v4.payments p where p.id in(select payment_id from sunshine_v4.payment_allocations where id=any(v_ids)) order by p.id for update;
 perform 1 from sunshine_v4.contract_items i where i.id in(select o.contract_item_id from sunshine_v4.obligations o join sunshine_v4.payment_allocations a on a.obligation_id=o.id where a.id=any(v_ids)) order by i.id for update;
 perform 1 from sunshine_v4.payment_allocations where id=any(v_ids) order by id for update;
 select count(*),coalesce(sum(pending_cents),0) into v_count,v_available
 from private.sunshine_cost_reserve_rows() where allocation_id=any(v_ids) and paid_on<=v_on;
 if v_count<>cardinality(v_ids) then raise exception 'Há recebimentos sem reserva elegível ou posteriores ao envio. Atualize a seleção.';end if;
 if v_amount>v_available then raise exception 'O valor enviado ultrapassa a reserva pendente (% centavos). Atualize a tela.',v_available;end if;
 insert into sunshine_v4.cost_reserve_transfers(idempotency_key,request,amount_cents,transferred_on,notes,created_by)
 values(v_key,p_payload,v_amount,v_on,nullif(btrim(p_payload->>'notes'),''),v_user) returning id into v_id;
 v_remaining:=v_amount;
 for v_row in select * from private.sunshine_cost_reserve_rows() where allocation_id=any(v_ids) and pending_cents>0 order by paid_on,allocation_id loop
  exit when v_remaining=0;
  v_chunk:=least(v_remaining,v_row.pending_cents);
  insert into sunshine_v4.cost_reserve_transfer_entries(transfer_id,allocation_id,amount_cents,snapshot)
  values(v_id,v_row.allocation_id,v_chunk,to_jsonb(v_row));
  v_remaining:=v_remaining-v_chunk;
 end loop;
 if v_remaining<>0 then raise exception 'O saldo da reserva mudou. Atualize a tela.';end if;
 perform sunshine_v4.v4_write_audit('COST_RESERVE_TRANSFERRED','cost_reserve_transfer',v_id,
  jsonb_build_object('amountCents',v_amount,'transferredOn',v_on));
 return jsonb_build_object('id',v_id,'amountCents',v_amount,'replayed',false);
end $$;

create function public.v4_api_reverse_cost_reserve_transfer(p_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
 v_user:=public.v4_bind_authenticated_user();
 perform sunshine_v4.v4_assert_permission('commission.update');
 if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Informe o motivo do estorno.';end if;
 perform pg_advisory_xact_lock(hashtextextended('sunshine-cost-reserve-transfers',0));
 update sunshine_v4.cost_reserve_transfers set reversed_at=now(),reversed_by=v_user,reversal_reason=btrim(p_reason)
 where id=p_id and reversed_at is null;
 if found then perform sunshine_v4.v4_write_audit('COST_RESERVE_TRANSFER_REVERSED','cost_reserve_transfer',p_id,jsonb_build_object('reason',p_reason));end if;
end $$;

-- Settled source amounts and rules cannot silently change. A recorded reversal
-- reopens them for correction, retaining the complete transfer history.
create function private.sunshine_guard_transferred_reserve()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_exists boolean;
begin
 if tg_table_name='payment_allocations' then
  select exists(select 1 from sunshine_v4.cost_reserve_transfer_entries e join sunshine_v4.cost_reserve_transfers t on t.id=e.transfer_id where e.allocation_id=old.id and t.reversed_at is null) into v_exists;
 else
  select exists(select 1 from sunshine_v4.cost_reserve_transfer_entries e join sunshine_v4.cost_reserve_transfers t on t.id=e.transfer_id
   join sunshine_v4.payment_allocations a on a.id=e.allocation_id join sunshine_v4.obligations o on o.id=a.obligation_id
   where t.reversed_at is null and case tg_table_name when 'payments' then a.payment_id=old.id
    when 'obligations' then o.id=old.id when 'contract_items' then o.contract_item_id=old.id else false end) into v_exists;
 end if;
 if v_exists then raise exception 'Há reserva já enviada ao caixa. Estorne a baixa da reserva antes de corrigir sua base financeira.';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function private.sunshine_guard_transferred_reserve() from public,anon,authenticated;
create trigger guard_transferred_reserve before delete or update of amount_cents,payment_id,obligation_id on sunshine_v4.payment_allocations
for each row execute function private.sunshine_guard_transferred_reserve();
create trigger guard_transferred_reserve before update of amount_cents,paid_at,status on sunshine_v4.payments
for each row when (old.amount_cents is distinct from new.amount_cents or old.paid_at is distinct from new.paid_at or old.status is distinct from new.status)
execute function private.sunshine_guard_transferred_reserve();
create trigger guard_transferred_reserve before update of responsible_member_id,commission_override,service_category on sunshine_v4.contract_items
for each row when (old.responsible_member_id is distinct from new.responsible_member_id or old.commission_override is distinct from new.commission_override or old.service_category is distinct from new.service_category)
execute function private.sunshine_guard_transferred_reserve();
create trigger guard_transferred_reserve before update of contract_item_id on sunshine_v4.obligations
for each row when (old.contract_item_id is distinct from new.contract_item_id) execute function private.sunshine_guard_transferred_reserve();

revoke all on function public.v4_cost_reserve_control(date,date,text,uuid,text),public.v4_api_record_cost_reserve_transfer(jsonb),public.v4_api_reverse_cost_reserve_transfer(uuid,text) from public,anon;
grant execute on function public.v4_cost_reserve_control(date,date,text,uuid,text),public.v4_api_record_cost_reserve_transfer(jsonb),public.v4_api_reverse_cost_reserve_transfer(uuid,text) to authenticated;
notify pgrst,'reload schema';
