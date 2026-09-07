-- Sunshine v3.58 — lançamento manual simples com pagamento total, parcial ou fiado.
-- Venda e recebimento permanecem separados: comissão nasce somente sobre dinheiro pago.

create unique index if not exists uq_sales_manual_v358_operation
  on public.sales(legacy_ref)
  where source='MANUAL' and legacy_ref like 'MANUAL-V358:%';

create or replace function private.refresh_sale_financial_state_v358(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_received numeric := 0;
  v_paid boolean := false;
begin
  if p_sale_id is null then return; end if;

  select * into v_sale from public.sales where id=p_sale_id;
  if v_sale.id is null or v_sale.status in ('CANCELLED','REFUNDED','COMPLETED') then return; end if;

  select coalesce(sum(pa.amount),0) into v_received
  from public.payment_allocations pa
  join public.payments p on p.id=pa.payment_id
  where pa.sale_id=p_sale_id and p.status='PAID';

  v_paid := coalesce(v_sale.total_amount,0)>0
    and v_received+0.005>=coalesce(v_sale.total_amount,0);

  update public.sales
  set status=case when v_paid then 'CONFIRMED' else 'PENDING' end,
      updated_at=now()
  where id=p_sale_id and status in ('PENDING','CONFIRMED');

  update public.work_registrations
  set status=case when v_paid then 'CONFIRMED' else 'REGISTERED' end,
      updated_at=now()
  where sale_id=p_sale_id and status in ('REGISTERED','CONFIRMED');
end;
$$;

revoke all on function private.refresh_sale_financial_state_v358(uuid) from public, anon, authenticated;

create or replace function private.trg_refresh_sale_financial_state_v358()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if tg_op='DELETE' then
    perform private.refresh_sale_financial_state_v358(old.sale_id);
    return old;
  end if;
  perform private.refresh_sale_financial_state_v358(new.sale_id);
  if tg_op='UPDATE' and old.sale_id is distinct from new.sale_id then
    perform private.refresh_sale_financial_state_v358(old.sale_id);
  end if;
  return new;
end;
$$;

revoke all on function private.trg_refresh_sale_financial_state_v358() from public, anon, authenticated;

drop trigger if exists trg_sale_financial_state_v358 on public.payment_allocations;
create trigger trg_sale_financial_state_v358
after insert or update or delete on public.payment_allocations
for each row execute function private.trg_refresh_sale_financial_state_v358();

create or replace function private.trg_refresh_sales_from_payment_v358()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare r record;
begin
  if new.status is distinct from old.status then
    for r in select distinct sale_id from public.payment_allocations where payment_id=new.id loop
      perform private.refresh_sale_financial_state_v358(r.sale_id);
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.trg_refresh_sales_from_payment_v358() from public, anon, authenticated;

drop trigger if exists trg_sale_financial_state_from_payment_v358 on public.payments;
create trigger trg_sale_financial_state_from_payment_v358
after update of status on public.payments
for each row execute function private.trg_refresh_sales_from_payment_v358();

create or replace function public.register_manual_sale_v358(
  p_idempotency_key text,
  p_client_id uuid default null,
  p_client_name text default null,
  p_client_phone text default null,
  p_client_email text default null,
  p_client_birth_date date default null,
  p_received_total numeric default 0,
  p_payment_method text default null,
  p_paid_at timestamptz default now(),
  p_notes text default null,
  p_items jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_member_id uuid;
  v_client_id uuid;
  v_client_name text;
  v_client_birth date;
  v_client_count integer := 0;
  v_phone text := regexp_replace(coalesce(p_client_phone,''),'[^0-9]','','g');
  v_email text := lower(trim(coalesce(p_client_email,'')));
  v_name text := lower(regexp_replace(trim(coalesce(p_client_name,'')),'\s+',' ','g'));
  v_payment_id uuid;
  v_sale_id uuid;
  v_registration_id uuid;
  v_item jsonb;
  v_participant jsonb;
  v_service_id uuid;
  v_work_id uuid;
  v_responsible uuid;
  v_sale_type text;
  v_category text;
  v_quantity integer;
  v_total numeric;
  v_received numeric;
  v_received_sum numeric := 0;
  v_index integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if not private.is_internal_member() then raise exception 'Usuário não autorizado para operar a Sunshine.'; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'Identificador da operação é obrigatório.'; end if;
  if coalesce(p_received_total,0)<0 then raise exception 'O valor recebido não pode ser negativo.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Escolha o que será cadastrado.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('manual-v358:'||p_idempotency_key,0));
  select id into v_sale_id from public.sales where legacy_ref='MANUAL-V358:'||p_idempotency_key||':1' limit 1;
  if v_sale_id is not null then
    select pa.payment_id into v_payment_id from public.payment_allocations pa where pa.sale_id=v_sale_id limit 1;
    return jsonb_build_object('sale_id',v_sale_id,'payment_id',v_payment_id,'already_processed',true);
  end if;

  select id into v_member_id from public.team_members where auth_user_id=auth.uid() and active=true limit 1;

  if p_client_id is not null then
    select id,full_name,birth_date into v_client_id,v_client_name,v_client_birth
    from public.clients where id=p_client_id;
    if v_client_id is null then raise exception 'A cliente selecionada não foi encontrada.'; end if;
  else
    if v_name='' then raise exception 'Busque uma cliente ou informe o nome da nova cliente.'; end if;

    if length(v_phone)>=8 then
      select count(*) into v_client_count from public.clients
      where right(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),11)=right(v_phone,11);
      if v_client_count=1 then
        select id into v_client_id from public.clients
        where right(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),11)=right(v_phone,11)
        limit 1;
      elsif v_client_count>1 then
        raise exception 'Este telefone aparece em mais de uma cliente. Busque e selecione o cadastro correto.';
      end if;
    end if;
    if v_client_id is null and v_email<>'' then
      select count(*) into v_client_count from public.clients where lower(trim(coalesce(email,'')))=v_email;
      if v_client_count=1 then
        select id into v_client_id from public.clients where lower(trim(coalesce(email,'')))=v_email limit 1;
      elsif v_client_count>1 then
        raise exception 'Este e-mail aparece em mais de uma cliente. Busque e selecione o cadastro correto.';
      end if;
    end if;
    if v_client_id is null then
      select count(*) into v_client_count from public.clients
      where lower(regexp_replace(trim(full_name),'\s+',' ','g'))=v_name;
      if v_client_count=1 then
        select id into v_client_id from public.clients
        where lower(regexp_replace(trim(full_name),'\s+',' ','g'))=v_name limit 1;
      elsif v_client_count>1 then
        raise exception 'Há mais de uma cliente com esse nome. Busque e selecione o cadastro correto.';
      end if;
    end if;

    if v_client_id is not null then
      select full_name,birth_date into v_client_name,v_client_birth from public.clients where id=v_client_id;
    else
      insert into public.clients(full_name,phone,email,birth_date,source,created_by,updated_by)
      values(trim(p_client_name),nullif(trim(coalesce(p_client_phone,'')),''),nullif(trim(coalesce(p_client_email,'')),''),p_client_birth_date,'MANUAL',v_member_id,v_member_id)
      returning id,full_name,birth_date into v_client_id,v_client_name,v_client_birth;
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_total:=coalesce(nullif(v_item->>'total_amount','')::numeric,0);
    v_received:=coalesce(nullif(v_item->>'received_amount','')::numeric,0);
    v_service_id:=nullif(v_item->>'service_id','')::uuid;
    v_work_id:=nullif(v_item->>'work_id','')::uuid;
    if v_total<=0 then raise exception 'Informe o valor total de cada item.'; end if;
    if v_received<0 then raise exception 'O valor pago não pode ser negativo.'; end if;
    if (v_service_id is null)=(v_work_id is null) then raise exception 'Escolha um serviço ou trabalho em cada item.'; end if;
    if v_service_id is not null and not exists(select 1 from public.services where id=v_service_id and active=true) then raise exception 'Serviço inválido.'; end if;
    if v_work_id is not null and not exists(select 1 from public.works where id=v_work_id and status<>'CANCELLED') then raise exception 'Trabalho inválido.'; end if;
    if v_work_id is not null and (jsonb_typeof(coalesce(v_item->'participants','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(v_item->'participants','[]'::jsonb))=0) then
      raise exception 'Informe ao menos uma pessoa inscrita no trabalho.';
    end if;
    for v_participant in select value from jsonb_array_elements(coalesce(v_item->'participants','[]'::jsonb)) loop
      if nullif(trim(coalesce(v_participant->>'name','')),'') is null then raise exception 'Informe o nome de todas as pessoas inscritas.'; end if;
    end loop;
    v_received_sum:=v_received_sum+v_received;
  end loop;
  if abs(v_received_sum-coalesce(p_received_total,0))>0.009 then
    raise exception 'A soma do que foi pago (%) não corresponde ao total recebido (%).',v_received_sum,p_received_total;
  end if;

  if p_received_total>0 then
    insert into public.payments(client_id,source,external_ref,status,gross_amount,fees_amount,net_amount,payment_method,paid_at,competence_date,notes)
    values(v_client_id,'MANUAL','MANUAL-V358:'||p_idempotency_key,'PAID',p_received_total,0,p_received_total,
      nullif(trim(coalesce(p_payment_method,'')),''),coalesce(p_paid_at,now()),
      (coalesce(p_paid_at,now()) at time zone 'America/Sao_Paulo')::date,nullif(trim(coalesce(p_notes,'')),''))
    returning id into v_payment_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_index:=v_index+1;
    v_total:=(v_item->>'total_amount')::numeric;
    v_received:=coalesce(nullif(v_item->>'received_amount','')::numeric,0);
    v_service_id:=nullif(v_item->>'service_id','')::uuid;
    v_work_id:=nullif(v_item->>'work_id','')::uuid;
    v_responsible:=nullif(v_item->>'responsible_member_id','')::uuid;

    if v_responsible is null and v_work_id is not null then
      select responsible_member_id into v_responsible from public.works where id=v_work_id;
    end if;
    if v_responsible is null and v_service_id is not null then
      select s.responsible_member_id into v_responsible
      from public.sales s
      where s.service_id=v_service_id and s.responsible_member_id is not null and s.source<>'IMPORT'
      order by s.sold_at desc limit 1;
    end if;
    if v_responsible is null then raise exception 'Informe quem é responsável por este serviço.'; end if;

    if v_work_id is not null then
      v_quantity:=jsonb_array_length(v_item->'participants');
      v_sale_type:='TRABALHO';
    else
      v_quantity:=greatest(coalesce(nullif(v_item->>'quantity','')::integer,1),1);
      select category into v_category from public.services where id=v_service_id;
      v_sale_type:=case when v_category='CONSULTA' then 'CONSULTA'
                        when v_category='PERGUNTA' then 'PERGUNTA'
                        when v_category='MENSALIDADE' then 'MENSALIDADE'
                        when coalesce(v_category,'') like 'TRABALHO_%' then 'TRABALHO'
                        else 'OUTRO' end;
    end if;

    insert into public.sales(client_id,service_id,work_id,responsible_member_id,sale_type,source,sales_channel,status,quantity,unit_price,discount_amount,notes,legacy_ref)
    values(v_client_id,v_service_id,v_work_id,v_responsible,v_sale_type,'MANUAL','MANUAL',
      case when v_received+0.005>=v_total then 'CONFIRMED' else 'PENDING' end,
      v_quantity,v_total/v_quantity,0,concat_ws(' | ',nullif(trim(coalesce(p_notes,'')),''),nullif(trim(coalesce(v_item->>'notes','')),'')),
      'MANUAL-V358:'||p_idempotency_key||':'||v_index)
    returning id into v_sale_id;

    if v_payment_id is not null and v_received>0 then
      insert into public.payment_allocations(payment_id,sale_id,amount)
      values(v_payment_id,v_sale_id,v_received);
    end if;

    if v_work_id is not null then
      for v_participant in select value from jsonb_array_elements(v_item->'participants') loop
        insert into public.work_registrations(work_id,client_id,sale_id,participant_name,participant_birth_date,loved_person_name,rival_name,participant_data,status)
        values(v_work_id,v_client_id,v_sale_id,trim(v_participant->>'name'),
          nullif(v_participant->>'birth_date','')::date,
          nullif(trim(coalesce(v_participant->>'loved_person_name','')),''),
          nullif(trim(coalesce(v_participant->>'rival_name','')),''),
          coalesce(v_participant->'participant_data','{}'::jsonb),
          case when v_received+0.005>=v_total then 'CONFIRMED' else 'REGISTERED' end)
        returning id into v_registration_id;
      end loop;
    end if;

    v_results:=v_results||jsonb_build_array(jsonb_build_object(
      'sale_id',v_sale_id,'sale_total',v_total,'received_amount',v_received,
      'remaining',greatest(v_total-v_received,0),'financial_status',
      case when v_received<=0 then 'PENDING' when v_received+0.005<v_total then 'PARTIAL' else 'PAID' end));
  end loop;

  return jsonb_build_object('client_id',v_client_id,'payment_id',v_payment_id,'items',v_results,'received_total',p_received_total,'already_processed',false);
end;
$$;

revoke all on function public.register_manual_sale_v358(text,uuid,text,text,text,date,numeric,text,timestamptz,text,jsonb) from public, anon;
grant execute on function public.register_manual_sale_v358(text,uuid,text,text,text,date,numeric,text,timestamptz,text,jsonb) to authenticated, service_role;
