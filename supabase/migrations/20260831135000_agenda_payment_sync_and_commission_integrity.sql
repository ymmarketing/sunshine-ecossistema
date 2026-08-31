-- Sunshine v3.26 — agenda/pagamento no mesmo fluxo e integridade de comissões
-- Aplicado em produção no projeto Supabase dhpsvwkytcqasmtaeayv em 31/08/2026.

create or replace function private.trg_refresh_commissions_sale()
returns trigger
language plpgsql
security definer
set search_path=public,private
as $$
declare r record;
begin
  if new.responsible_member_id is distinct from old.responsible_member_id
     or new.service_id is distinct from old.service_id
     or new.sold_at is distinct from old.sold_at
     or new.source is distinct from old.source then
    for r in select id from public.payment_allocations where sale_id=new.id loop
      perform private.rebuild_commissions_for_allocation(r.id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_commission_on_sale_change on public.sales;
create trigger trg_commission_on_sale_change
after update of responsible_member_id,service_id,sold_at,source on public.sales
for each row execute function private.trg_refresh_commissions_sale();

create or replace function public.associate_payment_to_appointment(p_appointment_id uuid, p_payment_id uuid)
returns jsonb
language plpgsql
set search_path=public,private
as $$
declare
  a public.appointments%rowtype;
  p public.payments%rowtype;
  v_sale public.sales%rowtype;
  v_sale_id uuid;
  v_category text;
  v_sale_type text;
  v_expected numeric;
  v_payment_used numeric;
  v_payment_available numeric;
  v_sale_allocated numeric;
  v_sale_outstanding numeric;
  v_allocate numeric;
  v_paid_total numeric;
  v_sale_total numeric;
begin
  if not private.is_internal_member() then raise exception 'Usuário não autorizado.'; end if;
  select * into a from public.appointments where id=p_appointment_id for update;
  if a.id is null then raise exception 'Compromisso não encontrado.'; end if;
  select * into p from public.payments where id=p_payment_id for update;
  if p.id is null then raise exception 'Pagamento não encontrado.'; end if;
  if p.status<>'PAID' then raise exception 'Somente pagamentos pagos podem ser associados à agenda.'; end if;
  if p.client_id is null then
    update public.payments set client_id=a.client_id,updated_at=now() where id=p.id;
    p.client_id:=a.client_id;
  elsif p.client_id<>a.client_id then
    raise exception 'Este pagamento pertence a outro cliente.';
  end if;

  select * into v_sale from public.sales s where s.appointment_id=a.id order by s.created_at desc limit 1;
  if v_sale.id is null then
    select s.* into v_sale
    from public.payment_allocations pa join public.sales s on s.id=pa.sale_id
    where pa.payment_id=p.id and s.client_id=a.client_id and s.appointment_id is null
    order by case when a.service_id is not null and s.service_id=a.service_id then 0 else 1 end,
             case when a.work_id is not null and s.work_id=a.work_id then 0 else 1 end,
             s.created_at desc
    limit 1;
    if v_sale.id is not null then
      update public.sales
      set appointment_id=a.id,responsible_member_id=coalesce(responsible_member_id,a.responsible_member_id),updated_at=now()
      where id=v_sale.id returning * into v_sale;
      update public.appointments
      set service_id=coalesce(v_sale.service_id,service_id),
          work_id=coalesce(v_sale.work_id,work_id),
          responsible_member_id=coalesce(v_sale.responsible_member_id,responsible_member_id),
          event_type=case when v_sale.sale_type='CONSULTA' then 'CONSULTA' when v_sale.sale_type='PERGUNTA' then 'PERGUNTA' when v_sale.sale_type='TRABALHO' then 'TRABALHO' else event_type end,
          updated_at=now()
      where id=a.id returning * into a;
    end if;
  end if;
  if v_sale.id is not null then v_sale_id:=v_sale.id; end if;

  select coalesce(sum(amount),0) into v_payment_used from public.payment_allocations where payment_id=p.id;
  v_payment_available:=greatest(coalesce(p.gross_amount,0)-v_payment_used,0);
  if v_sale_id is null then
    if v_payment_available<=0 then raise exception 'Este pagamento já está totalmente associado a outra venda.'; end if;
    select category,default_price into v_category,v_expected from public.services where id=a.service_id;
    if a.work_id is not null then
      select unit_price into v_expected from public.works where id=a.work_id;
      v_sale_type:='TRABALHO';
    else
      v_sale_type:=case when v_category='CONSULTA' then 'CONSULTA' when v_category='PERGUNTA' then 'PERGUNTA' when v_category='MENSALIDADE' then 'MENSALIDADE' when coalesce(v_category,'') like 'TRABALHO_%' then 'TRABALHO' else 'OUTRO' end;
    end if;
    v_expected:=coalesce(v_expected,v_payment_available);
    insert into public.sales(client_id,service_id,work_id,appointment_id,responsible_member_id,sale_type,source,sales_channel,status,quantity,unit_price,discount_amount,sold_at,notes)
    values(a.client_id,a.service_id,a.work_id,a.id,a.responsible_member_id,v_sale_type,p.source,p.source,'PENDING',1,v_expected,0,coalesce(p.paid_at,now()),'Venda vinculada ao compromisso pela associação financeira.')
    returning * into v_sale;
    v_sale_id:=v_sale.id;
  end if;

  select coalesce(total_amount,unit_price,0) into v_sale_total from public.sales where id=v_sale_id;
  select coalesce(sum(amount),0) into v_sale_allocated from public.payment_allocations where sale_id=v_sale_id;
  v_sale_outstanding:=greatest(v_sale_total-v_sale_allocated,0);
  if not exists(select 1 from public.payment_allocations where payment_id=p.id and sale_id=v_sale_id) then
    select coalesce(sum(amount),0) into v_payment_used from public.payment_allocations where payment_id=p.id;
    v_payment_available:=greatest(coalesce(p.gross_amount,0)-v_payment_used,0);
    v_allocate:=least(v_payment_available,v_sale_outstanding);
    if v_allocate>0 then insert into public.payment_allocations(payment_id,sale_id,amount) values(p.id,v_sale_id,v_allocate); end if;
  end if;
  select coalesce(sum(pa.amount),0) into v_paid_total
  from public.payment_allocations pa join public.payments py on py.id=pa.payment_id
  where pa.sale_id=v_sale_id and py.status='PAID';
  update public.sales set status=case when v_paid_total>=coalesce(total_amount,0) and coalesce(total_amount,0)>0 then 'CONFIRMED' else 'PENDING' end,updated_at=now() where id=v_sale_id;
  return jsonb_build_object('appointment_id',a.id,'payment_id',p.id,'sale_id',v_sale_id,'payment_status',p.status,'sale_total',v_sale_total,'paid_total',v_paid_total,'financial_status',case when v_paid_total<=0 then 'PENDING' when v_paid_total<v_sale_total then 'PARTIAL' else 'PAID' end);
end;
$$;

create or replace function public.resolve_asaas_entry(
  p_entry_id uuid,
  p_client_id uuid default null,
  p_client_name text default null,
  p_client_phone text default null,
  p_client_email text default null,
  p_client_birth_date date default null,
  p_document_number text default null,
  p_service_id uuid default null,
  p_work_id uuid default null,
  p_responsible_member_id uuid default null,
  p_sale_type text default 'OUTRO',
  p_loved_person_name text default null,
  p_rival_name text default null,
  p_notes text default null
) returns jsonb
language plpgsql
set search_path=public,private
as $$
declare
  e public.asaas_incoming_payments%rowtype;
  v_member_id uuid;
  v_client_id uuid;
  v_client_name text;
  v_client_birth date;
  v_sale_id uuid;
  v_payment_id uuid;
  v_registration_id uuid;
  v_existing_payment_id uuid;
  v_fees numeric;
  v_phone text;
  v_document text;
  v_email text;
  v_appointment_id uuid;
  v_appointment_count integer;
begin
  if not private.is_internal_member() then raise exception 'Usuário não autorizado.'; end if;
  select * into e from public.asaas_incoming_payments where id=p_entry_id for update;
  if e.id is null then raise exception 'Entrada Asaas não encontrada.'; end if;
  if e.classification_status='RESOLVED' then raise exception 'Esta entrada já foi registrada.'; end if;
  if p_sale_type not in ('CONSULTA','PERGUNTA','MENSALIDADE','TRABALHO','OUTRO') then raise exception 'Tipo de venda inválido.'; end if;
  if coalesce(e.gross_amount,0)>0 and p_responsible_member_id is null then raise exception 'Selecione o responsável antes de concluir. Sem responsável a comissão não pode ser calculada.'; end if;
  select id into v_member_id from public.team_members where auth_user_id=auth.uid() and active=true limit 1;
  v_phone:=regexp_replace(coalesce(p_client_phone,e.customer_mobile_phone,e.customer_phone,''),'[^0-9]','','g');
  v_document:=regexp_replace(coalesce(p_document_number,e.customer_document,''),'[^0-9]','','g');
  v_email:=lower(trim(coalesce(p_client_email,e.customer_email,'')));

  if p_client_id is not null then
    select id,full_name,birth_date into v_client_id,v_client_name,v_client_birth from public.clients where id=p_client_id;
    if v_client_id is null then raise exception 'Cliente selecionado não encontrado.'; end if;
  else
    select c.id,c.full_name,c.birth_date into v_client_id,v_client_name,v_client_birth
    from public.clients c
    where (e.asaas_customer_id is not null and c.asaas_customer_id=e.asaas_customer_id)
       or (v_document<>'' and regexp_replace(coalesce(c.document_number,''),'[^0-9]','','g')=v_document)
       or (v_email<>'' and lower(trim(coalesce(c.email,'')))=v_email)
       or (length(v_phone)>=8 and regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=v_phone)
    order by case when e.asaas_customer_id is not null and c.asaas_customer_id=e.asaas_customer_id then 0 when v_document<>'' and regexp_replace(coalesce(c.document_number,''),'[^0-9]','','g')=v_document then 1 when v_email<>'' and lower(trim(coalesce(c.email,'')))=v_email then 2 else 3 end,c.created_at
    limit 1;
    if v_client_id is null then
      v_client_name:=coalesce(nullif(trim(p_client_name),''),nullif(trim(e.customer_name),''));
      if v_client_name is null then raise exception 'Informe o nome do cliente.'; end if;
      insert into public.clients(full_name,phone,email,birth_date,document_number,asaas_customer_id,postal_code,address_line,address_number,address_complement,district,city,state,source,created_by,updated_by)
      values(v_client_name,nullif(trim(coalesce(p_client_phone,e.customer_mobile_phone,e.customer_phone,'')),''),nullif(trim(coalesce(p_client_email,e.customer_email,'')),''),p_client_birth_date,nullif(trim(coalesce(p_document_number,e.customer_document,'')),''),e.asaas_customer_id,e.customer_postal_code,e.customer_address,e.customer_address_number,e.customer_address_complement,e.customer_district,e.customer_city,e.customer_state,'ASAAS',v_member_id,v_member_id)
      returning id,birth_date into v_client_id,v_client_birth;
    end if;
  end if;

  update public.clients set
    phone=coalesce(phone,nullif(trim(coalesce(p_client_phone,e.customer_mobile_phone,e.customer_phone,'')),'')),
    email=coalesce(email,nullif(trim(coalesce(p_client_email,e.customer_email,'')),'')),
    birth_date=coalesce(birth_date,p_client_birth_date),
    document_number=coalesce(document_number,nullif(trim(coalesce(p_document_number,e.customer_document,'')),'')),
    asaas_customer_id=coalesce(asaas_customer_id,e.asaas_customer_id),
    postal_code=coalesce(postal_code,e.customer_postal_code),
    address_line=coalesce(address_line,e.customer_address),
    address_number=coalesce(address_number,e.customer_address_number),
    address_complement=coalesce(address_complement,e.customer_address_complement),
    district=coalesce(district,e.customer_district),city=coalesce(city,e.customer_city),state=coalesce(state,e.customer_state),updated_by=v_member_id,updated_at=now()
  where id=v_client_id;
  select full_name,birth_date into v_client_name,v_client_birth from public.clients where id=v_client_id;

  insert into public.sales(client_id,service_id,work_id,responsible_member_id,sale_type,source,sales_channel,status,quantity,unit_price,discount_amount,notes)
  values(v_client_id,p_service_id,p_work_id,p_responsible_member_id,p_sale_type,'ASAAS','ASAAS','CONFIRMED',1,e.gross_amount,0,concat_ws(' | ',p_notes,e.description)) returning id into v_sale_id;
  v_fees:=greatest(e.gross_amount-coalesce(e.net_amount,e.gross_amount),0);
  select id into v_existing_payment_id from public.payments where source='ASAAS' and external_ref=e.asaas_payment_id limit 1;
  if v_existing_payment_id is null then
    insert into public.payments(client_id,source,external_ref,status,gross_amount,fees_amount,payment_method,due_at,paid_at,competence_date,notes)
    values(v_client_id,'ASAAS',e.asaas_payment_id,'PAID',e.gross_amount,v_fees,e.billing_type,e.due_date::timestamptz,coalesce(e.payment_date,e.received_at),coalesce(e.payment_date,e.received_at)::date,concat_ws(' | ','Importado automaticamente do Asaas',p_notes)) returning id into v_payment_id;
  else
    v_payment_id:=v_existing_payment_id;
    update public.payments set client_id=v_client_id,status='PAID',gross_amount=e.gross_amount,fees_amount=v_fees,payment_method=e.billing_type,paid_at=coalesce(e.payment_date,e.received_at),updated_at=now() where id=v_payment_id;
  end if;
  insert into public.payment_allocations(payment_id,sale_id,amount) values(v_payment_id,v_sale_id,e.gross_amount) on conflict do nothing;
  if p_work_id is not null then
    insert into public.work_registrations(work_id,client_id,sale_id,participant_name,participant_birth_date,loved_person_name,rival_name,status)
    values(p_work_id,v_client_id,v_sale_id,v_client_name,coalesce(p_client_birth_date,v_client_birth),p_loved_person_name,p_rival_name,'CONFIRMED') returning id into v_registration_id;
  end if;

  select count(*) into v_appointment_count
  from public.appointments a
  where a.client_id=v_client_id and a.status not in ('CANCELLED','NO_SHOW') and a.starts_at>=now()-interval '12 hours'
    and not exists(select 1 from public.sales sx where sx.appointment_id=a.id)
    and (p_service_id is null or a.service_id=p_service_id) and (p_work_id is null or a.work_id=p_work_id);
  if v_appointment_count=1 then
    select a.id into v_appointment_id
    from public.appointments a
    where a.client_id=v_client_id and a.status not in ('CANCELLED','NO_SHOW') and a.starts_at>=now()-interval '12 hours'
      and not exists(select 1 from public.sales sx where sx.appointment_id=a.id)
      and (p_service_id is null or a.service_id=p_service_id) and (p_work_id is null or a.work_id=p_work_id)
    order by a.starts_at limit 1;
    update public.sales set appointment_id=v_appointment_id,updated_at=now() where id=v_sale_id;
    update public.appointments set service_id=coalesce(p_service_id,service_id),work_id=coalesce(p_work_id,work_id),responsible_member_id=coalesce(p_responsible_member_id,responsible_member_id),event_type=case when p_sale_type='CONSULTA' then 'CONSULTA' when p_sale_type='PERGUNTA' then 'PERGUNTA' when p_sale_type='TRABALHO' then 'TRABALHO' else event_type end,updated_at=now() where id=v_appointment_id;
  end if;

  update public.asaas_incoming_payments set classification_status='RESOLVED',resolved_client_id=v_client_id,resolved_sale_id=v_sale_id,resolved_payment_id=v_payment_id,resolved_work_registration_id=v_registration_id,resolved_by=v_member_id,resolved_at=now() where id=e.id;
  return jsonb_build_object('client_id',v_client_id,'sale_id',v_sale_id,'payment_id',v_payment_id,'registration_id',v_registration_id,'appointment_id',v_appointment_id);
end;
$$;
