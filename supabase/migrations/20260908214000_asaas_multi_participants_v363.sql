-- Sunshine v3.63 — Asaas deve suportar múltiplos inscritos por trabalho.
-- Fonte de verdade operacional: docs/FLUXO_FINANCEIRO_INSCRICOES_V1.md

create or replace function public.resolve_asaas_entry_multi_core_v363(
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
set search_path to 'public','private'
as $$
declare
  e public.asaas_incoming_payments%rowtype;
  v_member_id uuid; v_client_id uuid; v_client_name text; v_client_birth date;
  v_payment_id uuid; v_existing_payment_id uuid; v_fees numeric; v_phone text; v_document text; v_email text;
  v_item jsonb; v_service_id uuid; v_work_id uuid; v_responsible uuid; v_amount numeric; v_sum numeric:=0;
  v_sale_type text; v_category text; v_unit_price numeric; v_expected_total numeric; v_difference numeric; v_sale_id uuid; v_alloc_id uuid;
  v_registration_id uuid; v_first_sale uuid; v_first_registration uuid; v_sales jsonb:='[]'::jsonb;
  v_appointment_id uuid; v_appointment_count integer; v_used numeric:=0;
  v_participants jsonb; v_participant jsonb; v_quantity integer; v_participant_count integer; v_sale_status text; v_registration_status text;
begin
  if not private.is_internal_member() then raise exception 'Usuário não autorizado.'; end if;
  select * into e from public.asaas_incoming_payments where id=p_entry_id for update;
  if e.id is null then raise exception 'Entrada Asaas não encontrada.'; end if;
  if e.classification_status='RESOLVED' then raise exception 'Esta entrada já foi registrada.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Adicione pelo menos um item ao pagamento.'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_service_id:=nullif(v_item->>'service_id','')::uuid;
    v_work_id:=nullif(v_item->>'work_id','')::uuid;
    v_responsible:=nullif(v_item->>'responsible_member_id','')::uuid;
    v_amount:=coalesce(nullif(v_item->>'amount','')::numeric,0);
    if (v_service_id is null)=(v_work_id is null) then raise exception 'Cada parte do pagamento precisa de um serviço ou trabalho.'; end if;
    if v_responsible is null then raise exception 'Defina o responsável em todas as partes do pagamento.'; end if;
    if v_amount<=0 then raise exception 'O valor de cada parte deve ser maior que zero.'; end if;
    v_participants:=coalesce(v_item->'participants','[]'::jsonb);
    if jsonb_typeof(v_participants)<>'array' then raise exception 'Lista de inscritos inválida.'; end if;
    if v_work_id is not null and jsonb_array_length(v_participants)>0 then
      for v_participant in select value from jsonb_array_elements(v_participants) loop
        if nullif(trim(coalesce(v_participant->>'name','')),'') is null then raise exception 'Informe o nome de todos os inscritos.'; end if;
      end loop;
    end if;
    v_sum:=v_sum+v_amount;
  end loop;
  if abs(v_sum-coalesce(e.gross_amount,0))>0.009 then raise exception 'Distribua todo o valor recebido. A soma dos itens precisa fechar R$ %.',to_char(e.gross_amount,'FM999999990D00'); end if;

  select id into v_member_id from public.team_members where auth_user_id=auth.uid() and active=true limit 1;
  v_phone:=regexp_replace(coalesce(p_client_phone,e.customer_mobile_phone,e.customer_phone,''),'[^0-9]','','g');
  v_document:=regexp_replace(coalesce(p_document_number,e.customer_document,''),'[^0-9]','','g');
  v_email:=lower(trim(coalesce(p_client_email,e.customer_email,'')));

  if p_client_id is not null then
    select id,full_name,birth_date into v_client_id,v_client_name,v_client_birth from public.clients where id=p_client_id;
  else
    select c.id,c.full_name,c.birth_date into v_client_id,v_client_name,v_client_birth from public.clients c
    where (e.asaas_customer_id is not null and c.asaas_customer_id=e.asaas_customer_id)
       or (v_document<>'' and regexp_replace(coalesce(c.document_number,''),'[^0-9]','','g')=v_document)
       or (v_email<>'' and lower(trim(coalesce(c.email,'')))=v_email)
       or (length(v_phone)>=8 and right(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),11)=right(v_phone,11))
    order by case when e.asaas_customer_id is not null and c.asaas_customer_id=e.asaas_customer_id then 0 when v_document<>'' and regexp_replace(coalesce(c.document_number,''),'[^0-9]','','g')=v_document then 1 when v_email<>'' and lower(trim(coalesce(c.email,'')))=v_email then 2 else 3 end,c.created_at limit 1;
    if v_client_id is null then
      v_client_name:=coalesce(nullif(trim(p_client_name),''),nullif(trim(e.customer_name),''));
      if v_client_name is null then raise exception 'Informe o nome do cliente.'; end if;
      if length(v_phone)<8 then raise exception 'Informe o telefone do novo cliente.'; end if;
      insert into public.clients(full_name,phone,email,birth_date,document_number,asaas_customer_id,postal_code,address_line,address_number,address_complement,district,city,state,source,created_by,updated_by)
      values(v_client_name,nullif(trim(coalesce(p_client_phone,e.customer_mobile_phone,e.customer_phone,'')),''),nullif(trim(coalesce(p_client_email,e.customer_email,'')),''),p_client_birth_date,nullif(trim(coalesce(p_document_number,e.customer_document,'')),''),e.asaas_customer_id,e.customer_postal_code,e.customer_address,e.customer_address_number,e.customer_address_complement,e.customer_district,e.customer_city,e.customer_state,'ASAAS',v_member_id,v_member_id)
      returning id,birth_date into v_client_id,v_client_birth;
    end if;
  end if;
  if v_client_id is null then raise exception 'Cliente selecionado não encontrado.'; end if;

  update public.clients set phone=coalesce(phone,nullif(trim(coalesce(p_client_phone,e.customer_mobile_phone,e.customer_phone,'')),'')),email=coalesce(email,nullif(trim(coalesce(p_client_email,e.customer_email,'')),'')),birth_date=coalesce(birth_date,p_client_birth_date),document_number=coalesce(document_number,nullif(trim(coalesce(p_document_number,e.customer_document,'')),'')),asaas_customer_id=coalesce(asaas_customer_id,e.asaas_customer_id),updated_by=v_member_id,updated_at=now() where id=v_client_id;
  select full_name,birth_date into v_client_name,v_client_birth from public.clients where id=v_client_id;

  v_fees:=greatest(e.gross_amount-coalesce(e.net_amount,e.gross_amount),0);
  select id into v_existing_payment_id from public.payments where source='ASAAS' and external_ref=e.asaas_payment_id limit 1;
  if v_existing_payment_id is null then
    insert into public.payments(client_id,source,external_ref,status,gross_amount,fees_amount,net_amount,payment_method,due_at,paid_at,competence_date,notes,retained_excess_amount)
    values(v_client_id,'ASAAS',e.asaas_payment_id,'PAID',e.gross_amount,v_fees,e.net_amount,e.billing_type,e.due_date::timestamptz,coalesce(e.payment_date,e.received_at),coalesce(e.payment_date,e.received_at)::date,concat_ws(' | ','Importado automaticamente do Asaas',p_notes),0)
    returning id into v_payment_id;
  else
    v_payment_id:=v_existing_payment_id;
    select coalesce(sum(amount),0) into v_used from public.payment_allocations where payment_id=v_payment_id;
    if v_used>0.009 then raise exception 'Este pagamento já possui associações. Revise antes de reclassificar.'; end if;
    update public.payments set client_id=v_client_id,status='PAID',gross_amount=e.gross_amount,fees_amount=v_fees,net_amount=e.net_amount,payment_method=e.billing_type,paid_at=coalesce(e.payment_date,e.received_at),updated_at=now() where id=v_payment_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_service_id:=nullif(v_item->>'service_id','')::uuid;
    v_work_id:=nullif(v_item->>'work_id','')::uuid;
    v_responsible:=nullif(v_item->>'responsible_member_id','')::uuid;
    v_amount:=(v_item->>'amount')::numeric;
    v_participants:=coalesce(v_item->'participants','[]'::jsonb);
    v_participant_count:=jsonb_array_length(v_participants);
    v_category:=null; v_unit_price:=null;

    if v_work_id is not null then
      select unit_price into v_unit_price from public.works where id=v_work_id and status<>'CANCELLED';
      if not found then raise exception 'Trabalho inválido.'; end if;
      v_quantity:=case when v_participant_count>0 then v_participant_count else greatest(coalesce(nullif(v_item->>'quantity','')::integer,1),1) end;
      if v_quantity>1 and v_participant_count=0 then raise exception 'Informe o nome das % pessoas inscritas.',v_quantity; end if;
      v_sale_type:='TRABALHO';
    else
      select category,default_price into v_category,v_unit_price from public.services where id=v_service_id and active=true;
      if not found then raise exception 'Serviço inválido.'; end if;
      v_quantity:=greatest(coalesce(nullif(v_item->>'quantity','')::integer,1),1);
      v_sale_type:=case when v_category='CONSULTA' then 'CONSULTA' when v_category='PERGUNTA' then 'PERGUNTA' when v_category='MENSALIDADE' then 'MENSALIDADE' when coalesce(v_category,'') like 'TRABALHO_%' then 'TRABALHO' else 'OUTRO' end;
    end if;

    v_unit_price:=coalesce(nullif(v_unit_price,0),v_amount/v_quantity);
    v_expected_total:=v_unit_price*v_quantity;
    v_difference:=greatest(v_amount-v_expected_total,0);
    v_sale_status:=case when v_amount+0.009>=v_expected_total then 'CONFIRMED' else 'PENDING' end;
    v_registration_status:=case when v_sale_status='CONFIRMED' then 'CONFIRMED' else 'REGISTERED' end;

    insert into public.sales(client_id,service_id,work_id,responsible_member_id,sale_type,source,sales_channel,status,quantity,unit_price,discount_amount,sold_at,notes)
    values(v_client_id,v_service_id,v_work_id,v_responsible,v_sale_type,'ASAAS','ASAAS',v_sale_status,v_quantity,v_unit_price,0,coalesce(e.payment_date,e.received_at),concat_ws(' | ',nullif(v_item->>'notes',''),p_notes,e.description,case when v_difference>0 then format('Diferença recebida R$ %s aguardando classificação.',to_char(v_difference,'FM999999990D00')) end))
    returning id into v_sale_id;
    if v_first_sale is null then v_first_sale:=v_sale_id; end if;

    insert into public.payment_allocations(payment_id,sale_id,amount) values(v_payment_id,v_sale_id,v_amount) returning id into v_alloc_id;

    if v_work_id is not null then
      if v_participant_count>0 then
        for v_participant in select value from jsonb_array_elements(v_participants) loop
          insert into public.work_registrations(work_id,client_id,sale_id,participant_name,participant_birth_date,loved_person_name,rival_name,participant_data,status)
          values(v_work_id,v_client_id,v_sale_id,trim(v_participant->>'name'),nullif(v_participant->>'birth_date','')::date,nullif(trim(coalesce(v_participant->>'loved_person_name','')),''),nullif(trim(coalesce(v_participant->>'rival_name','')),''),coalesce(v_participant->'participant_data','{}'::jsonb),v_registration_status)
          returning id into v_registration_id;
          if v_first_registration is null then v_first_registration:=v_registration_id; end if;
        end loop;
      else
        insert into public.work_registrations(work_id,client_id,sale_id,participant_name,participant_birth_date,loved_person_name,rival_name,status)
        values(v_work_id,v_client_id,v_sale_id,v_client_name,coalesce(p_client_birth_date,v_client_birth),nullif(v_item->>'loved_person_name',''),nullif(v_item->>'rival_name',''),v_registration_status)
        returning id into v_registration_id;
        if v_first_registration is null then v_first_registration:=v_registration_id; end if;
      end if;
    end if;

    select count(*) into v_appointment_count from public.appointments a where a.client_id=v_client_id and a.status not in ('CANCELLED','NO_SHOW') and a.starts_at>=now()-interval '12 hours' and not exists(select 1 from public.sales sx where sx.appointment_id=a.id) and (v_service_id is null or a.service_id=v_service_id) and (v_work_id is null or a.work_id=v_work_id);
    if v_appointment_count=1 then
      select a.id into v_appointment_id from public.appointments a where a.client_id=v_client_id and a.status not in ('CANCELLED','NO_SHOW') and a.starts_at>=now()-interval '12 hours' and not exists(select 1 from public.sales sx where sx.appointment_id=a.id) and (v_service_id is null or a.service_id=v_service_id) and (v_work_id is null or a.work_id=v_work_id) order by a.starts_at limit 1;
      update public.sales set appointment_id=v_appointment_id,updated_at=now() where id=v_sale_id;
      update public.appointments set service_id=coalesce(v_service_id,service_id),work_id=coalesce(v_work_id,work_id),responsible_member_id=coalesce(v_responsible,responsible_member_id),updated_at=now() where id=v_appointment_id;
    else v_appointment_id:=null; end if;

    v_sales:=v_sales||jsonb_build_array(jsonb_build_object('sale_id',v_sale_id,'quantity',v_quantity,'unit_price',v_unit_price,'contracted_amount',v_expected_total,'received_amount',v_amount,'difference_received',v_difference,'registration_id',v_registration_id,'appointment_id',v_appointment_id));
    v_registration_id:=null;
  end loop;

  update public.payments p set retained_excess_amount=coalesce((select sum(greatest((x->>'received_amount')::numeric-(x->>'contracted_amount')::numeric,0)) from jsonb_array_elements(v_sales) x),0),updated_at=now() where p.id=v_payment_id;
  update public.asaas_incoming_payments set classification_status='RESOLVED',resolved_client_id=v_client_id,resolved_sale_id=v_first_sale,resolved_payment_id=v_payment_id,resolved_work_registration_id=v_first_registration,resolved_by=v_member_id,resolved_at=now() where id=e.id;
  return jsonb_build_object('client_id',v_client_id,'payment_id',v_payment_id,'sales',v_sales,'allocated_total',v_sum);
end;
$$;

create or replace function public.resolve_asaas_entry_multi(
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
set search_path to 'public','private','pg_temp'
as $$
declare
  v_effective_client uuid;
  v_before public.clients%rowtype;
  v_manual boolean:=p_client_id is not null;
  v_result jsonb;
  v_payer text;
begin
  v_effective_client:=public.safe_asaas_client_for_entry(p_entry_id,p_client_id);
  if v_manual then select * into v_before from public.clients where id=p_client_id; end if;

  v_result:=public.resolve_asaas_entry_multi_core_v363(
    p_entry_id,v_effective_client,p_client_name,p_client_phone,p_client_email,p_client_birth_date,p_document_number,p_items,p_notes
  );

  if v_manual then
    update public.clients set
      phone=v_before.phone,email=v_before.email,birth_date=v_before.birth_date,document_number=v_before.document_number,
      asaas_customer_id=v_before.asaas_customer_id,postal_code=v_before.postal_code,address_line=v_before.address_line,
      address_number=v_before.address_number,address_complement=v_before.address_complement,district=v_before.district,
      city=v_before.city,state=v_before.state,updated_by=v_before.updated_by,updated_at=v_before.updated_at
    where id=p_client_id;
  end if;

  select customer_name into v_payer from public.asaas_incoming_payments where id=p_entry_id;
  if nullif(trim(v_payer),'') is not null and nullif(v_result->>'payment_id','') is not null then
    update public.payments
    set notes=case when coalesce(notes,'') ilike '%Pagador Asaas: '||v_payer||'%'
                   then notes else concat_ws(' | ',notes,'Pagador Asaas: '||v_payer) end,
        updated_at=now()
    where id=(v_result->>'payment_id')::uuid;
  end if;
  return v_result;
end;
$$;

revoke all on function public.resolve_asaas_entry_multi_core_v363(uuid,uuid,text,text,text,date,text,jsonb,text) from public,anon;
revoke all on function public.resolve_asaas_entry_multi(uuid,uuid,text,text,text,date,text,jsonb,text) from public,anon;
grant execute on function public.resolve_asaas_entry_multi(uuid,uuid,text,text,text,date,text,jsonb,text) to authenticated;
