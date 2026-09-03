create or replace function public.complete_manual_entry_v354(
  p_idempotency_key text,
  p_existing_payment_id uuid default null,
  p_client_id uuid default null,
  p_client_name text default null,
  p_client_phone text default null,
  p_client_email text default null,
  p_client_birth_date date default null,
  p_service_id uuid default null,
  p_work_id uuid default null,
  p_responsible_member_id uuid default null,
  p_sale_type text default 'OUTRO',
  p_amount numeric default 0,
  p_fees numeric default 0,
  p_payment_status text default 'PAID',
  p_payment_method text default null,
  p_paid_at timestamptz default now(),
  p_notes text default null,
  p_participants jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
set search_path = public, private, pg_temp
as $$
declare
  v_member_id uuid;
  v_client_id uuid;
  v_client_name text;
  v_client_birth date;
  v_sale_id uuid;
  v_payment_id uuid;
  v_allocation_id uuid;
  v_existing_allocation uuid;
  v_existing_external text;
  v_payment public.payments%rowtype;
  v_participant jsonb;
  v_registration_ids jsonb := '[]'::jsonb;
  v_registration_id uuid;
  v_quantity integer := 1;
  v_sale_status text;
begin
  if not private.is_internal_member() then
    raise exception 'Usuário não autorizado para operar a Sunshine.';
  end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception 'Identificador da operação é obrigatório.';
  end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
  if coalesce(p_fees,0) < 0 or p_fees > p_amount then raise exception 'Taxas incompatíveis com o valor recebido.'; end if;
  if p_payment_status not in ('PAID','PENDING','OVERDUE','REFUNDED','CANCELLED') then raise exception 'Status de pagamento inválido.'; end if;
  if p_sale_type not in ('CONSULTA','PERGUNTA','MENSALIDADE','TRABALHO','OUTRO') then raise exception 'Tipo de contratação inválido.'; end if;
  if p_work_id is null and p_service_id is null then raise exception 'Selecione o serviço ou o trabalho contratado.'; end if;
  if p_work_id is not null and (jsonb_typeof(p_participants) <> 'array' or jsonb_array_length(p_participants)=0) then
    raise exception 'Informe ao menos uma pessoa inscrita no trabalho.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('manual-entry:'||p_idempotency_key,0));
  select id into v_member_id from public.team_members where auth_user_id=auth.uid() and active=true limit 1;

  select p.id into v_payment_id from public.payments p
  where p.external_ref='MANUAL:'||p_idempotency_key limit 1;
  if v_payment_id is not null then
    select pa.sale_id into v_sale_id from public.payment_allocations pa where pa.payment_id=v_payment_id limit 1;
    return jsonb_build_object('client_id',(select client_id from public.payments where id=v_payment_id),'sale_id',v_sale_id,'payment_id',v_payment_id,'already_processed',true);
  end if;

  if p_client_id is not null then
    select id,full_name,birth_date into v_client_id,v_client_name,v_client_birth from public.clients where id=p_client_id;
    if v_client_id is null then raise exception 'Cliente selecionado não foi encontrado.'; end if;
  else
    if nullif(trim(coalesce(p_client_name,'')),'') is null then raise exception 'Selecione um cliente ou cadastre o novo cliente.'; end if;
    insert into public.clients(full_name,phone,email,birth_date,source,created_by,updated_by)
    values(trim(p_client_name),nullif(trim(coalesce(p_client_phone,'')),''),nullif(trim(coalesce(p_client_email,'')),''),p_client_birth_date,'MANUAL',v_member_id,v_member_id)
    returning id,full_name,birth_date into v_client_id,v_client_name,v_client_birth;
  end if;

  if p_work_id is not null then
    if not exists(select 1 from public.works where id=p_work_id and status<>'CANCELLED') then raise exception 'Trabalho não encontrado ou cancelado.'; end if;
    v_quantity := jsonb_array_length(p_participants);
    for v_participant in select value from jsonb_array_elements(p_participants) loop
      if nullif(trim(coalesce(v_participant->>'name','')),'') is null then raise exception 'Informe o nome de todas as pessoas inscritas.'; end if;
    end loop;
  end if;

  v_sale_status := case when p_payment_status='PAID' then 'CONFIRMED' when p_payment_status='REFUNDED' then 'REFUNDED' when p_payment_status='CANCELLED' then 'CANCELLED' else 'PENDING' end;
  insert into public.sales(client_id,service_id,work_id,responsible_member_id,sale_type,source,sales_channel,status,quantity,unit_price,discount_amount,notes)
  values(v_client_id,p_service_id,p_work_id,p_responsible_member_id,case when p_work_id is not null then 'TRABALHO' else p_sale_type end,'MANUAL','MANUAL',v_sale_status,v_quantity,p_amount/v_quantity,0,p_notes)
  returning id into v_sale_id;

  if p_existing_payment_id is not null then
    select * into v_payment from public.payments where id=p_existing_payment_id for update;
    if v_payment.id is null then raise exception 'Pagamento incompleto não encontrado.'; end if;
    if v_payment.source<>'MANUAL' then raise exception 'Somente pagamento manual pode ser completado neste fluxo.'; end if;
    select id into v_existing_allocation from public.payment_allocations where payment_id=v_payment.id limit 1;
    if v_existing_allocation is not null then raise exception 'Este pagamento já foi conciliado.'; end if;
    if abs(v_payment.gross_amount-p_amount)>0.009 then raise exception 'O valor informado não corresponde ao pagamento existente.'; end if;
    update public.payments set client_id=v_client_id,external_ref='MANUAL:'||p_idempotency_key,updated_at=now() where id=v_payment.id;
    v_payment_id:=v_payment.id;
  else
    insert into public.payments(client_id,source,external_ref,status,gross_amount,fees_amount,payment_method,paid_at,competence_date,notes)
    values(v_client_id,'MANUAL','MANUAL:'||p_idempotency_key,p_payment_status,p_amount,p_fees,p_payment_method,case when p_payment_status='PAID' then coalesce(p_paid_at,now()) else null end,coalesce(p_paid_at,now())::date,p_notes)
    returning id into v_payment_id;
  end if;

  insert into public.payment_allocations(payment_id,sale_id,amount) values(v_payment_id,v_sale_id,p_amount) returning id into v_allocation_id;

  if p_work_id is not null then
    for v_participant in select value from jsonb_array_elements(p_participants) loop
      insert into public.work_registrations(work_id,client_id,sale_id,participant_name,participant_birth_date,loved_person_name,rival_name,participant_data,status)
      values(p_work_id,v_client_id,v_sale_id,trim(v_participant->>'name'),nullif(v_participant->>'birth_date','')::date,nullif(trim(coalesce(v_participant->>'loved_person_name','')),''),nullif(trim(coalesce(v_participant->>'rival_name','')),''),coalesce(v_participant->'participant_data','{}'::jsonb),case when p_payment_status='PAID' then 'CONFIRMED' else 'REGISTERED' end)
      returning id into v_registration_id;
      v_registration_ids:=v_registration_ids||jsonb_build_array(v_registration_id);
    end loop;
  end if;

  return jsonb_build_object('client_id',v_client_id,'sale_id',v_sale_id,'payment_id',v_payment_id,'allocation_id',v_allocation_id,'registration_ids',v_registration_ids,'already_processed',false);
end;
$$;

revoke all on function public.complete_manual_entry_v354(text,uuid,uuid,text,text,text,date,uuid,uuid,uuid,text,numeric,numeric,text,text,timestamptz,text,jsonb) from public, anon;
grant execute on function public.complete_manual_entry_v354(text,uuid,uuid,text,text,text,date,uuid,uuid,uuid,text,numeric,numeric,text,text,timestamptz,text,jsonb) to authenticated, service_role;
