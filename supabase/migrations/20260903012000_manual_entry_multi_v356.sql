create or replace function public.register_manual_entry_multi_v356(
  p_idempotency_key text,
  p_client_id uuid default null,
  p_client_name text default null,
  p_client_phone text default null,
  p_client_email text default null,
  p_client_birth_date date default null,
  p_gross_amount numeric default 0,
  p_fees numeric default 0,
  p_payment_status text default 'PAID',
  p_payment_method text default null,
  p_paid_at timestamptz default now(),
  p_notes text default null,
  p_items jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
set search_path = public, private, pg_temp
as $$
declare
  v_member_id uuid; v_client_id uuid; v_client_name text; v_client_birth date;
  v_payment_id uuid; v_sale_id uuid; v_allocation_id uuid; v_registration_id uuid;
  v_item jsonb; v_participant jsonb; v_item_amount numeric; v_sum numeric:=0;
  v_service_id uuid; v_work_id uuid; v_responsible uuid; v_sale_type text;
  v_quantity integer; v_sale_status text; v_results jsonb:='[]'::jsonb;
begin
  if not private.is_internal_member() then raise exception 'Usuário não autorizado para operar a Sunshine.'; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'Identificador da operação é obrigatório.'; end if;
  if coalesce(p_gross_amount,0)<=0 then raise exception 'Informe o total recebido.'; end if;
  if coalesce(p_fees,0)<0 or p_fees>p_gross_amount then raise exception 'Taxas incompatíveis com o total recebido.'; end if;
  if p_payment_status not in ('PAID','PENDING','OVERDUE','REFUNDED','CANCELLED') then raise exception 'Status de pagamento inválido.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Adicione ao menos uma parte do pagamento.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('manual-multi:'||p_idempotency_key,0));
  select id into v_payment_id from public.payments where external_ref='MANUAL-MULTI:'||p_idempotency_key limit 1;
  if v_payment_id is not null then
    return jsonb_build_object('payment_id',v_payment_id,'already_processed',true);
  end if;

  select id into v_member_id from public.team_members where auth_user_id=auth.uid() and active=true limit 1;
  if p_client_id is not null then
    select id,full_name,birth_date into v_client_id,v_client_name,v_client_birth from public.clients where id=p_client_id;
    if v_client_id is null then raise exception 'Cliente selecionado não foi encontrado.'; end if;
  else
    if nullif(trim(coalesce(p_client_name,'')),'') is null then raise exception 'Selecione um cliente ou cadastre o novo cliente.'; end if;
    insert into public.clients(full_name,phone,email,birth_date,source,created_by,updated_by)
    values(trim(p_client_name),nullif(trim(coalesce(p_client_phone,'')),''),nullif(trim(coalesce(p_client_email,'')),''),p_client_birth_date,'MANUAL',v_member_id,v_member_id)
    returning id,full_name,birth_date into v_client_id,v_client_name,v_client_birth;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_item_amount:=coalesce((v_item->>'amount')::numeric,0);
    if v_item_amount<=0 then raise exception 'Toda parte precisa ter valor maior que zero.'; end if;
    v_service_id:=nullif(v_item->>'service_id','')::uuid;
    v_work_id:=nullif(v_item->>'work_id','')::uuid;
    if (v_service_id is null)=(v_work_id is null) then raise exception 'Cada parte deve ter um serviço ou um trabalho.'; end if;
    if v_service_id is not null and not exists(select 1 from public.services where id=v_service_id and active=true) then raise exception 'Serviço inválido.'; end if;
    if v_work_id is not null and not exists(select 1 from public.works where id=v_work_id and status<>'CANCELLED') then raise exception 'Trabalho inválido.'; end if;
    if v_work_id is not null and (jsonb_typeof(coalesce(v_item->'participants','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(v_item->'participants','[]'::jsonb))=0) then raise exception 'Informe os inscritos de cada trabalho.'; end if;
    for v_participant in select value from jsonb_array_elements(coalesce(v_item->'participants','[]'::jsonb)) loop
      if nullif(trim(coalesce(v_participant->>'name','')),'') is null then raise exception 'Informe o nome de todos os inscritos.'; end if;
    end loop;
    v_sum:=v_sum+v_item_amount;
  end loop;
  if abs(v_sum-p_gross_amount)>0.009 then raise exception 'A soma das partes (%) deve ser igual ao total recebido (%).',v_sum,p_gross_amount; end if;

  insert into public.payments(client_id,source,external_ref,status,gross_amount,fees_amount,payment_method,paid_at,competence_date,notes)
  values(v_client_id,'MANUAL','MANUAL-MULTI:'||p_idempotency_key,p_payment_status,p_gross_amount,p_fees,p_payment_method,case when p_payment_status='PAID' then coalesce(p_paid_at,now()) else null end,coalesce(p_paid_at,now())::date,p_notes)
  returning id into v_payment_id;
  v_sale_status:=case when p_payment_status='PAID' then 'CONFIRMED' when p_payment_status='REFUNDED' then 'REFUNDED' when p_payment_status='CANCELLED' then 'CANCELLED' else 'PENDING' end;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_item_amount:=(v_item->>'amount')::numeric;
    v_service_id:=nullif(v_item->>'service_id','')::uuid; v_work_id:=nullif(v_item->>'work_id','')::uuid;
    v_responsible:=nullif(v_item->>'responsible_member_id','')::uuid;
    v_quantity:=case when v_work_id is not null then jsonb_array_length(v_item->'participants') else greatest(coalesce((v_item->>'quantity')::integer,1),1) end;
    v_sale_type:=case when v_work_id is not null then 'TRABALHO' else coalesce(nullif(v_item->>'sale_type',''),'OUTRO') end;
    if v_sale_type not in ('CONSULTA','PERGUNTA','MENSALIDADE','TRABALHO','OUTRO') then raise exception 'Tipo de contratação inválido.'; end if;
    insert into public.sales(client_id,service_id,work_id,responsible_member_id,sale_type,source,sales_channel,status,quantity,unit_price,discount_amount,notes)
    values(v_client_id,v_service_id,v_work_id,v_responsible,v_sale_type,'MANUAL','MANUAL',v_sale_status,v_quantity,v_item_amount/v_quantity,0,concat_ws(' | ',p_notes,nullif(v_item->>'notes','')))
    returning id into v_sale_id;
    insert into public.payment_allocations(payment_id,sale_id,amount) values(v_payment_id,v_sale_id,v_item_amount) returning id into v_allocation_id;
    if v_work_id is not null then
      for v_participant in select value from jsonb_array_elements(v_item->'participants') loop
        insert into public.work_registrations(work_id,client_id,sale_id,participant_name,participant_birth_date,loved_person_name,rival_name,participant_data,status)
        values(v_work_id,v_client_id,v_sale_id,trim(v_participant->>'name'),nullif(v_participant->>'birth_date','')::date,nullif(trim(coalesce(v_participant->>'loved_person_name','')),''),nullif(trim(coalesce(v_participant->>'rival_name','')),''),coalesce(v_participant->'participant_data','{}'::jsonb),case when p_payment_status='PAID' then 'CONFIRMED' else 'REGISTERED' end)
        returning id into v_registration_id;
      end loop;
    end if;
    v_results:=v_results||jsonb_build_array(jsonb_build_object('sale_id',v_sale_id,'allocation_id',v_allocation_id,'amount',v_item_amount));
  end loop;
  return jsonb_build_object('client_id',v_client_id,'payment_id',v_payment_id,'items',v_results,'already_processed',false);
end;
$$;

revoke all on function public.register_manual_entry_multi_v356(text,uuid,text,text,text,date,numeric,numeric,text,text,timestamptz,text,jsonb) from public,anon;
grant execute on function public.register_manual_entry_multi_v356(text,uuid,text,text,text,date,numeric,numeric,text,text,timestamptz,text,jsonb) to authenticated,service_role;
