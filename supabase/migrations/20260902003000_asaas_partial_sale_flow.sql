-- Sunshine v3.37 — Asaas can complete an existing sale or open a sale with a total greater than the first payment.
create or replace function public.resolve_asaas_entry_unified(
  p_entry_id uuid,
  p_client_id uuid default null,
  p_client_name text default null,
  p_client_phone text default null,
  p_client_email text default null,
  p_client_birth_date date default null,
  p_document_number text default null,
  p_items jsonb default '[]'::jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  e public.asaas_incoming_payments%rowtype;
  v_member_id uuid;
  v_client_id uuid;
  v_client_name text;
  v_client_birth date;
  v_payment_id uuid;
  v_existing_payment_id uuid;
  v_fees numeric;
  v_phone text;
  v_document text;
  v_email text;
  v_item jsonb;
  v_existing_sale_id uuid;
  v_service_id uuid;
  v_work_id uuid;
  v_responsible uuid;
  v_received numeric;
  v_sale_total numeric;
  v_sum numeric := 0;
  v_sale_type text;
  v_category text;
  v_sale_id uuid;
  v_sale public.sales%rowtype;
  v_paid_sale numeric;
  v_remaining_sale numeric;
  v_registration_id uuid;
  v_first_sale uuid;
  v_first_registration uuid;
  v_sales jsonb := '[]'::jsonb;
  v_appointment_id uuid;
  v_appointment_count integer;
  v_used numeric := 0;
begin
  if not private.is_internal_member() then
    raise exception 'Usuário não autorizado.';
  end if;

  select * into e
  from public.asaas_incoming_payments
  where id = p_entry_id
  for update;

  if e.id is null then raise exception 'Entrada Asaas não encontrada.'; end if;
  if e.classification_status = 'RESOLVED' then raise exception 'Esta entrada já foi registrada.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione pelo menos uma associação ao pagamento.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_existing_sale_id := nullif(v_item->>'existing_sale_id','')::uuid;
    v_service_id := nullif(v_item->>'service_id','')::uuid;
    v_work_id := nullif(v_item->>'work_id','')::uuid;
    v_responsible := nullif(v_item->>'responsible_member_id','')::uuid;
    v_received := coalesce(nullif(v_item->>'received_amount','')::numeric,nullif(v_item->>'amount','')::numeric,0);
    v_sale_total := coalesce(nullif(v_item->>'sale_total','')::numeric,v_received);

    if v_received <= 0 then raise exception 'O valor recebido em cada parte deve ser maior que zero.'; end if;
    if v_existing_sale_id is null then
      if v_service_id is null and v_work_id is null then raise exception 'Cada nova venda precisa de serviço ou trabalho.'; end if;
      if v_responsible is null then raise exception 'Defina o responsável em todas as novas vendas.'; end if;
      if v_sale_total + 0.009 < v_received then raise exception 'O valor total da venda não pode ser menor que a parcela recebida.'; end if;
    end if;
    v_sum := v_sum + v_received;
  end loop;

  if abs(v_sum - coalesce(e.gross_amount,0)) > 0.009 then
    raise exception 'A soma das partes (R$ %) precisa fechar exatamente o valor recebido (R$ %).',
      to_char(v_sum,'FM999999990D00'),to_char(e.gross_amount,'FM999999990D00');
  end if;

  select id into v_member_id
  from public.team_members
  where auth_user_id = auth.uid() and active = true
  limit 1;

  v_phone := regexp_replace(coalesce(p_client_phone,e.customer_mobile_phone,e.customer_phone,''),'[^0-9]','','g');
  v_document := regexp_replace(coalesce(p_document_number,e.customer_document,''),'[^0-9]','','g');
  v_email := lower(trim(coalesce(p_client_email,e.customer_email,'')));

  if p_client_id is not null then
    select id,full_name,birth_date into v_client_id,v_client_name,v_client_birth
    from public.clients where id=p_client_id;
    if v_client_id is null then raise exception 'Cliente selecionado não encontrado.'; end if;
  else
    select c.id,c.full_name,c.birth_date into v_client_id,v_client_name,v_client_birth
    from public.clients c
    where (e.asaas_customer_id is not null and c.asaas_customer_id=e.asaas_customer_id)
       or (v_document<>'' and regexp_replace(coalesce(c.document_number,''),'[^0-9]','','g')=v_document)
       or (v_email<>'' and lower(trim(coalesce(c.email,'')))=v_email)
       or (length(v_phone)>=8 and regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=v_phone)
    order by case when e.asaas_customer_id is not null and c.asaas_customer_id=e.asaas_customer_id then 0
                  when v_document<>'' and regexp_replace(coalesce(c.document_number,''),'[^0-9]','','g')=v_document then 1
                  when v_email<>'' and lower(trim(coalesce(c.email,'')))=v_email then 2 else 3 end,
             c.created_at
    limit 1;

    if v_client_id is null then
      v_client_name := coalesce(nullif(trim(p_client_name),''),nullif(trim(e.customer_name),''));
      if v_client_name is null then raise exception 'Informe o nome do cliente.'; end if;
      if length(v_phone)<8 then raise exception 'Informe o telefone do novo cliente.'; end if;
      insert into public.clients(
        full_name,phone,email,birth_date,document_number,asaas_customer_id,postal_code,address_line,address_number,
        address_complement,district,city,state,source,created_by,updated_by
      ) values (
        v_client_name,nullif(trim(coalesce(p_client_phone,e.customer_mobile_phone,e.customer_phone,'')),''),
        nullif(trim(coalesce(p_client_email,e.customer_email,'')),''),p_client_birth_date,
        nullif(trim(coalesce(p_document_number,e.customer_document,'')),''),e.asaas_customer_id,e.customer_postal_code,
        e.customer_address,e.customer_address_number,e.customer_address_complement,e.customer_district,e.customer_city,
        e.customer_state,'ASAAS',v_member_id,v_member_id
      ) returning id,birth_date into v_client_id,v_client_birth;
    end if;
  end if;

  update public.clients set
    phone=coalesce(phone,nullif(trim(coalesce(p_client_phone,e.customer_mobile_phone,e.customer_phone,'')),'')),
    email=coalesce(email,nullif(trim(coalesce(p_client_email,e.customer_email,'')),'')),
    birth_date=coalesce(birth_date,p_client_birth_date),
    document_number=coalesce(document_number,nullif(trim(coalesce(p_document_number,e.customer_document,'')),'')),
    asaas_customer_id=coalesce(asaas_customer_id,e.asaas_customer_id),
    postal_code=coalesce(postal_code,e.customer_postal_code),address_line=coalesce(address_line,e.customer_address),
    address_number=coalesce(address_number,e.customer_address_number),address_complement=coalesce(address_complement,e.customer_address_complement),
    district=coalesce(district,e.customer_district),city=coalesce(city,e.customer_city),state=coalesce(state,e.customer_state),
    updated_by=v_member_id,updated_at=now()
  where id=v_client_id;

  select full_name,birth_date into v_client_name,v_client_birth from public.clients where id=v_client_id;

  v_fees := greatest(e.gross_amount-coalesce(e.net_amount,e.gross_amount),0);
  select id into v_existing_payment_id from public.payments where source='ASAAS' and external_ref=e.asaas_payment_id limit 1;
  if v_existing_payment_id is null then
    insert into public.payments(
      client_id,source,external_ref,status,gross_amount,fees_amount,net_amount,payment_method,due_at,paid_at,competence_date,notes
    ) values (
      v_client_id,'ASAAS',e.asaas_payment_id,'PAID',e.gross_amount,v_fees,coalesce(e.net_amount,e.gross_amount),e.billing_type,
      e.due_date::timestamptz,coalesce(e.payment_date,e.received_at),
      (coalesce(e.payment_date,e.received_at) at time zone 'America/Sao_Paulo')::date,
      concat_ws(' | ','Importado automaticamente do Asaas',p_notes)
    ) returning id into v_payment_id;
  else
    v_payment_id := v_existing_payment_id;
    select coalesce(sum(amount),0) into v_used from public.payment_allocations where payment_id=v_payment_id;
    if v_used>0.009 then raise exception 'Este pagamento já possui associações. Revise antes de reclassificar.'; end if;
    update public.payments set
      client_id=v_client_id,status='PAID',gross_amount=e.gross_amount,fees_amount=v_fees,net_amount=coalesce(e.net_amount,e.gross_amount),
      payment_method=e.billing_type,paid_at=coalesce(e.payment_date,e.received_at),
      competence_date=(coalesce(e.payment_date,e.received_at) at time zone 'America/Sao_Paulo')::date,updated_at=now()
    where id=v_payment_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_existing_sale_id := nullif(v_item->>'existing_sale_id','')::uuid;
    v_service_id := nullif(v_item->>'service_id','')::uuid;
    v_work_id := nullif(v_item->>'work_id','')::uuid;
    v_responsible := nullif(v_item->>'responsible_member_id','')::uuid;
    v_received := coalesce(nullif(v_item->>'received_amount','')::numeric,nullif(v_item->>'amount','')::numeric,0);
    v_sale_total := coalesce(nullif(v_item->>'sale_total','')::numeric,v_received);
    v_registration_id := null;
    v_appointment_id := null;

    if v_existing_sale_id is not null then
      select * into v_sale from public.sales where id=v_existing_sale_id for update;
      if v_sale.id is null then raise exception 'A venda em aberto selecionada não existe mais.'; end if;
      if v_sale.client_id<>v_client_id then raise exception 'A venda em aberto pertence a outro cliente.'; end if;
      if v_sale.status in ('CANCELLED','REFUNDED') then raise exception 'A venda selecionada foi cancelada ou estornada.'; end if;

      select coalesce(sum(pa.amount),0) into v_paid_sale
      from public.payment_allocations pa
      join public.payments p on p.id=pa.payment_id
      where pa.sale_id=v_existing_sale_id and p.status='PAID';
      v_remaining_sale := greatest(coalesce(v_sale.total_amount,0)-v_paid_sale,0);
      if v_remaining_sale<=0.005 then raise exception 'A venda selecionada já está totalmente paga.'; end if;
      if v_received>v_remaining_sale+0.009 then
        raise exception 'Esta parcela é maior que o saldo da venda selecionada (R$ %). Divida o pagamento em mais de uma associação.',to_char(v_remaining_sale,'FM999999990D00');
      end if;
      v_sale_id := v_existing_sale_id;
    else
      v_category := null;
      if v_service_id is not null then select category into v_category from public.services where id=v_service_id; end if;
      v_sale_type := case when v_work_id is not null then 'TRABALHO'
                          when v_category='CONSULTA' then 'CONSULTA'
                          when v_category='PERGUNTA' then 'PERGUNTA'
                          when v_category='MENSALIDADE' then 'MENSALIDADE'
                          when coalesce(v_category,'') like 'TRABALHO_%' then 'TRABALHO'
                          else 'OUTRO' end;

      insert into public.sales(
        client_id,service_id,work_id,responsible_member_id,sale_type,source,sales_channel,status,quantity,unit_price,discount_amount,total_amount,notes
      ) values (
        v_client_id,v_service_id,v_work_id,v_responsible,v_sale_type,'ASAAS','ASAAS','CONFIRMED',1,v_sale_total,0,v_sale_total,
        concat_ws(' | ',nullif(v_item->>'notes',''),p_notes,e.description)
      ) returning id into v_sale_id;

      if v_work_id is not null then
        insert into public.work_registrations(
          work_id,client_id,sale_id,participant_name,participant_birth_date,loved_person_name,rival_name,status
        ) values (
          v_work_id,v_client_id,v_sale_id,v_client_name,coalesce(p_client_birth_date,v_client_birth),
          nullif(v_item->>'loved_person_name',''),nullif(v_item->>'rival_name',''),'CONFIRMED'
        ) returning id into v_registration_id;
      end if;

      select count(*) into v_appointment_count
      from public.appointments a
      where a.client_id=v_client_id and a.status not in ('CANCELLED','NO_SHOW') and a.starts_at>=now()-interval '12 hours'
        and not exists(select 1 from public.sales sx where sx.appointment_id=a.id)
        and (v_service_id is null or a.service_id=v_service_id) and (v_work_id is null or a.work_id=v_work_id);

      if v_appointment_count=1 then
        select a.id into v_appointment_id
        from public.appointments a
        where a.client_id=v_client_id and a.status not in ('CANCELLED','NO_SHOW') and a.starts_at>=now()-interval '12 hours'
          and not exists(select 1 from public.sales sx where sx.appointment_id=a.id)
          and (v_service_id is null or a.service_id=v_service_id) and (v_work_id is null or a.work_id=v_work_id)
        order by a.starts_at limit 1;
        update public.sales set appointment_id=v_appointment_id,updated_at=now() where id=v_sale_id;
        update public.appointments set
          service_id=coalesce(v_service_id,service_id),work_id=coalesce(v_work_id,work_id),
          responsible_member_id=coalesce(v_responsible,responsible_member_id),updated_at=now()
        where id=v_appointment_id;
      end if;
    end if;

    if v_first_sale is null then v_first_sale:=v_sale_id; end if;
    insert into public.payment_allocations(payment_id,sale_id,amount) values(v_payment_id,v_sale_id,v_received);
    if v_first_registration is null and v_registration_id is not null then v_first_registration:=v_registration_id; end if;

    v_sales := v_sales || jsonb_build_array(jsonb_build_object(
      'sale_id',v_sale_id,
      'existing_sale',v_existing_sale_id is not null,
      'received_amount',v_received,
      'sale_total',case when v_existing_sale_id is not null then v_sale.total_amount else v_sale_total end,
      'registration_id',v_registration_id,
      'appointment_id',v_appointment_id
    ));
  end loop;

  update public.asaas_incoming_payments set
    classification_status='RESOLVED',resolved_client_id=v_client_id,resolved_sale_id=v_first_sale,resolved_payment_id=v_payment_id,
    resolved_work_registration_id=v_first_registration,resolved_by=v_member_id,resolved_at=now()
  where id=e.id;

  return jsonb_build_object('client_id',v_client_id,'payment_id',v_payment_id,'sales',v_sales,'allocated_total',v_sum);
end;
$$;

revoke all on function public.resolve_asaas_entry_unified(uuid,uuid,text,text,text,date,text,jsonb,text) from public;
grant execute on function public.resolve_asaas_entry_unified(uuid,uuid,text,text,text,date,text,jsonb,text) to authenticated;
