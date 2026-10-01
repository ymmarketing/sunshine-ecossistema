-- Registered expense destinations. No existing costs are changed by this migration.
create function public.v4_cost_destinations() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform private.sunshine_finance_guard('record.update');
  select coalesce(jsonb_agg(jsonb_build_object('kind',d.kind,'id',d.id,'label',d.label)
    order by d.rank,d.reference desc nulls last,d.label,d.id),'[]'::jsonb) into v_result
  from (
    select 'WORK'::text kind,w.id,w.title||' · '||case when w.status='OPEN' then 'Aberto' else 'Concluído' end||
      coalesce(' · '||to_char(w.scheduled_at at time zone 'America/Sao_Paulo','DD/MM/YYYY'),'') label,
      1 rank,w.scheduled_at reference from sunshine_v4.works w
    union all
    select 'ITEM',i.id,'Trabalho particular — '||coalesce(p.preferred_name,p.full_name,'Pessoa não identificada')||
      ' · '||coalesce(nullif(i.event_name,''),i.service_name)||' · '||
      to_char(coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo','DD/MM/YYYY')||' · '||left(i.id::text,8),
      2,coalesce(c.sold_at,c.created_at)
      from sunshine_v4.contract_items i join sunshine_v4.contracts c on c.id=i.contract_id
      left join sunshine_v4.people p on p.id=i.beneficiary_person_id
      where i.service_category='TRABALHO_PARTICULAR'
    union all
    select 'SERVICE',s.id,'Serviço — '||s.name||case when s.active then '' else ' · Inativo' end,3,null::timestamptz
      from sunshine_v4.services s
  )d;
  return v_result;
end $$;

create or replace function public.v4_api_save_expense(p_id uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_old jsonb; v_row sunshine_v4.expenses%rowtype;
  v_amount bigint:=(p_data->>'amountCents')::bigint; v_scope text:=p_data->>'scope';
  v_status text:=p_data->>'status'; v_alloc jsonb:=coalesce(p_data->'allocations','[]'); v_sum bigint;
begin
  perform private.sunshine_finance_guard('record.update');
  if v_amount is null or v_amount<=0 then raise exception 'Informe um custo maior que zero.'; end if;
  if jsonb_typeof(v_alloc)<>'array' then raise exception 'Rateio inválido.'; end if;
  if v_scope in ('WORK','SHARED') then
    select sum((x->>'amountCents')::bigint) into v_sum from jsonb_array_elements(v_alloc)x;
    if v_sum is distinct from v_amount or jsonb_array_length(v_alloc)=0
       or (v_scope='WORK' and jsonb_array_length(v_alloc)<>1)
       or (v_scope='SHARED' and jsonb_array_length(v_alloc)<2) then
      raise exception 'O rateio precisa somar exatamente o custo e respeitar a quantidade de destinos.';
    end if;
    -- Each allocation identifies exactly one registered destination, including past works.
    if exists(select 1 from jsonb_array_elements(v_alloc)x
      where jsonb_typeof(x)<>'object' or coalesce((x->>'amountCents')::bigint,0)<=0
       or num_nonnulls(nullif(x->>'workId',''),nullif(x->>'itemId',''),nullif(x->>'serviceId',''))<>1
       or (nullif(x->>'workId','') is not null and not exists(select 1 from sunshine_v4.works w where w.id=(x->>'workId')::uuid))
       or (nullif(x->>'itemId','') is not null and not exists(select 1 from sunshine_v4.contract_items i where i.id=(x->>'itemId')::uuid and i.service_category='TRABALHO_PARTICULAR'))
       or (nullif(x->>'serviceId','') is not null and not exists(select 1 from sunshine_v4.services s where s.id=(x->>'serviceId')::uuid)))
       or (select count(distinct coalesce('WORK:'||nullif(x->>'workId',''),'ITEM:'||nullif(x->>'itemId',''),'SERVICE:'||nullif(x->>'serviceId',''))) from jsonb_array_elements(v_alloc)x)<>jsonb_array_length(v_alloc) then
      raise exception 'Selecione um trabalho, trabalho particular ou serviço válido por destino, sem repetir, com valores positivos.';
    end if;
  elsif v_scope='FIXED' then
    if jsonb_array_length(v_alloc)<>0 then raise exception 'Custo fixo não pode ter rateio por destino.'; end if;
  else
    raise exception 'Todo custo não fixo precisa de um destino. Para estoque, selecione o trabalho ou serviço.';
  end if;
  if v_status='PAID' and nullif(p_data->>'paidOn','') is null then raise exception 'Informe quando o custo foi pago.'; end if;
  if nullif(p_data->>'receiptUrl','') is not null and p_data->>'receiptUrl' !~ '^https://' then
    raise exception 'Use um link HTTPS para o comprovante.';
  end if;
  if p_id is not null then
    select to_jsonb(e) into v_old from sunshine_v4.expenses e where id=p_id for update;
    if v_old is null then raise exception 'Custo não encontrado.'; end if;
    v_id:=p_id;
  else
    if nullif(p_data->>'idempotencyKey','') is null then raise exception 'Referência de gravação obrigatória.'; end if;
    perform pg_advisory_xact_lock(hashtextextended('expense:'||(p_data->>'idempotencyKey'),0));
    select id into v_id from sunshine_v4.expenses where idempotency_key=p_data->>'idempotencyKey';
    if v_id is not null then return jsonb_build_object('id',v_id,'idempotent',true); end if;
    v_id:=gen_random_uuid();
  end if;
  insert into sunshine_v4.expenses(id,description,category,scope,amount_cents,occurred_on,paid_on,status,
    allocations,notes,receipt_url,idempotency_key,created_by)
  values(v_id,btrim(p_data->>'description'),coalesce(nullif(p_data->>'category',''),'OUTRO'),v_scope,v_amount,
    (p_data->>'occurredOn')::date,case when v_status='PAID' then (p_data->>'paidOn')::date end,
    v_status,v_alloc,nullif(btrim(p_data->>'notes'),''),nullif(p_data->>'receiptUrl',''),
    coalesce(v_old->>'idempotency_key',p_data->>'idempotencyKey'),auth.uid())
  on conflict(id) do update set description=excluded.description,category=excluded.category,scope=excluded.scope,
    amount_cents=excluded.amount_cents,occurred_on=excluded.occurred_on,paid_on=excluded.paid_on,status=excluded.status,
    allocations=excluded.allocations,notes=excluded.notes,receipt_url=excluded.receipt_url,updated_at=now()
  returning * into v_row;
  perform sunshine_v4.v4_write_audit('EXPENSE_SAVED','expense',v_id,jsonb_build_object('before',v_old,'after',to_jsonb(v_row)));
  return to_jsonb(v_row);
end $$;

revoke all on function public.v4_cost_destinations() from public,anon;
grant execute on function public.v4_cost_destinations() to authenticated,service_role;
revoke all on function public.v4_api_save_expense(uuid,jsonb) from public,anon;
grant execute on function public.v4_api_save_expense(uuid,jsonb) to authenticated,service_role;
