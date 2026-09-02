-- Sunshine v3.47 — associação segura quando o pagador do Asaas é diferente do cliente atendido.
-- A seleção manual do Cliente 360 sempre vence e não pode contaminar o cadastro escolhido com CPF/ID Asaas/endereço do pagador.

create or replace function public.safe_asaas_client_for_entry(
  p_entry_id uuid,
  p_requested_client_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  e public.asaas_incoming_payments%rowtype;
  v_candidate uuid;
  v_count integer;
  v_document text;
  v_email text;
  v_phone text;
begin
  if not private.is_internal_member() then raise exception 'Usuário não autorizado.'; end if;

  if p_requested_client_id is not null then
    if not exists(select 1 from public.clients where id=p_requested_client_id) then
      raise exception 'Cliente selecionado não encontrado.';
    end if;
    return p_requested_client_id;
  end if;

  select * into e from public.asaas_incoming_payments where id=p_entry_id;
  if e.id is null then raise exception 'Entrada Asaas não encontrada.'; end if;

  if nullif(trim(e.asaas_customer_id),'') is not null then
    select count(*),(array_agg(c.id order by c.created_at))[1] into v_count,v_candidate
    from public.clients c where c.asaas_customer_id=e.asaas_customer_id;
    if v_count=1 then return v_candidate; end if;
    if v_count>1 then raise exception 'Mais de um Cliente 360 está ligado a este cadastro do Asaas. Escolha o cliente manualmente.'; end if;
  end if;

  v_document:=regexp_replace(coalesce(e.customer_document,''),'[^0-9]','','g');
  if v_document<>'' then
    select count(*),(array_agg(c.id order by c.created_at))[1] into v_count,v_candidate
    from public.clients c where regexp_replace(coalesce(c.document_number,''),'[^0-9]','','g')=v_document;
    if v_count=1 then return v_candidate; end if;
    if v_count>1 then raise exception 'O documento do pagador aparece em mais de um Cliente 360. Escolha o cliente manualmente.'; end if;
  end if;

  v_email:=lower(trim(coalesce(e.customer_email,'')));
  if v_email<>'' then
    select count(*),(array_agg(c.id order by c.created_at))[1] into v_count,v_candidate
    from public.clients c where lower(trim(coalesce(c.email,'')))=v_email;
    if v_count=1 then return v_candidate; end if;
    if v_count>1 then raise exception 'O e-mail do pagador aparece em mais de um Cliente 360. Escolha o cliente manualmente.'; end if;
  end if;

  v_phone:=regexp_replace(coalesce(e.customer_mobile_phone,e.customer_phone,''),'[^0-9]','','g');
  if length(v_phone)>=8 then
    select count(*),(array_agg(c.id order by c.created_at))[1] into v_count,v_candidate
    from public.clients c
    where right(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),11)=right(v_phone,11);
    if v_count=1 then return v_candidate; end if;
    if v_count>1 then raise exception 'Este telefone é compartilhado por mais de um Cliente 360. Escolha manualmente quem recebeu o serviço.'; end if;
  end if;

  return null;
end;
$$;

revoke all on function public.safe_asaas_client_for_entry(uuid,uuid) from public;
grant execute on function public.safe_asaas_client_for_entry(uuid,uuid) to authenticated;

alter function public.resolve_asaas_entry(uuid,uuid,text,text,text,date,text,uuid,uuid,uuid,text,text,text,text)
  rename to resolve_asaas_entry_core_v347;

create function public.resolve_asaas_entry(
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
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
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

  v_result:=public.resolve_asaas_entry_core_v347(
    p_entry_id,v_effective_client,p_client_name,p_client_phone,p_client_email,p_client_birth_date,p_document_number,
    p_service_id,p_work_id,p_responsible_member_id,p_sale_type,p_loved_person_name,p_rival_name,p_notes
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
revoke all on function public.resolve_asaas_entry(uuid,uuid,text,text,text,date,text,uuid,uuid,uuid,text,text,text,text) from public;
grant execute on function public.resolve_asaas_entry(uuid,uuid,text,text,text,date,text,uuid,uuid,uuid,text,text,text,text) to authenticated;

alter function public.resolve_asaas_entry_multi(uuid,uuid,text,text,text,date,text,jsonb,text)
  rename to resolve_asaas_entry_multi_core_v347;

create function public.resolve_asaas_entry_multi(
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
  v_effective_client uuid;
  v_before public.clients%rowtype;
  v_manual boolean:=p_client_id is not null;
  v_result jsonb;
  v_payer text;
begin
  v_effective_client:=public.safe_asaas_client_for_entry(p_entry_id,p_client_id);
  if v_manual then select * into v_before from public.clients where id=p_client_id; end if;

  v_result:=public.resolve_asaas_entry_multi_core_v347(
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
revoke all on function public.resolve_asaas_entry_multi(uuid,uuid,text,text,text,date,text,jsonb,text) from public;
grant execute on function public.resolve_asaas_entry_multi(uuid,uuid,text,text,text,date,text,jsonb,text) to authenticated;

alter function public.resolve_asaas_entry_unified(uuid,uuid,text,text,text,date,text,jsonb,text)
  rename to resolve_asaas_entry_unified_core_v347;

create function public.resolve_asaas_entry_unified(
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
  v_effective_client uuid;
  v_before public.clients%rowtype;
  v_manual boolean:=p_client_id is not null;
  v_result jsonb;
  v_payer text;
begin
  v_effective_client:=public.safe_asaas_client_for_entry(p_entry_id,p_client_id);
  if v_manual then select * into v_before from public.clients where id=p_client_id; end if;

  v_result:=public.resolve_asaas_entry_unified_core_v347(
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
revoke all on function public.resolve_asaas_entry_unified(uuid,uuid,text,text,text,date,text,jsonb,text) from public;
grant execute on function public.resolve_asaas_entry_unified(uuid,uuid,text,text,text,date,text,jsonb,text) to authenticated;

alter function public.resolve_asaas_selected_entries(uuid[],uuid,text,text,text,date,text,uuid,uuid,uuid,numeric,text,text,text)
  rename to resolve_asaas_selected_entries_core_v347;

create function public.resolve_asaas_selected_entries(
  p_entry_ids uuid[],
  p_client_id uuid default null,
  p_client_name text default null,
  p_client_phone text default null,
  p_client_email text default null,
  p_client_birth_date date default null,
  p_document_number text default null,
  p_service_id uuid default null,
  p_work_id uuid default null,
  p_responsible_member_id uuid default null,
  p_sale_total numeric default null,
  p_loved_person_name text default null,
  p_rival_name text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_first_entry uuid;
  v_effective_client uuid;
  v_before public.clients%rowtype;
  v_manual boolean:=p_client_id is not null;
  v_result jsonb;
begin
  select x.id into v_first_entry
  from public.asaas_incoming_payments x
  where x.id=any(p_entry_ids)
  order by coalesce(x.payment_date,x.received_at),x.received_at
  limit 1;
  if v_first_entry is null then raise exception 'Pagamentos selecionados não encontrados.'; end if;

  v_effective_client:=public.safe_asaas_client_for_entry(v_first_entry,p_client_id);
  if v_manual then select * into v_before from public.clients where id=p_client_id; end if;

  v_result:=public.resolve_asaas_selected_entries_core_v347(
    p_entry_ids,v_effective_client,p_client_name,p_client_phone,p_client_email,p_client_birth_date,p_document_number,
    p_service_id,p_work_id,p_responsible_member_id,p_sale_total,p_loved_person_name,p_rival_name,p_notes
  );

  if v_manual then
    update public.clients set
      phone=v_before.phone,email=v_before.email,birth_date=v_before.birth_date,document_number=v_before.document_number,
      asaas_customer_id=v_before.asaas_customer_id,postal_code=v_before.postal_code,address_line=v_before.address_line,
      address_number=v_before.address_number,address_complement=v_before.address_complement,district=v_before.district,
      city=v_before.city,state=v_before.state,updated_by=v_before.updated_by,updated_at=v_before.updated_at
    where id=p_client_id;
  end if;

  update public.payments p
  set notes=case when coalesce(p.notes,'') ilike '%Pagador Asaas: '||x.customer_name||'%'
                 then p.notes else concat_ws(' | ',p.notes,'Pagador Asaas: '||x.customer_name) end,
      updated_at=now()
  from public.asaas_incoming_payments x
  where x.id=any(p_entry_ids) and x.resolved_payment_id=p.id and nullif(trim(x.customer_name),'') is not null;

  return v_result;
end;
$$;
revoke all on function public.resolve_asaas_selected_entries(uuid[],uuid,text,text,text,date,text,uuid,uuid,uuid,numeric,text,text,text) from public;
grant execute on function public.resolve_asaas_selected_entries(uuid[],uuid,text,text,text,date,text,uuid,uuid,uuid,numeric,text,text,text) to authenticated;

alter function public.resolve_asaas_installment_group(text,uuid,text,text,text,date,text,uuid,uuid,uuid,text)
  rename to resolve_asaas_installment_group_core_v347;

create function public.resolve_asaas_installment_group(
  p_installment_id text,
  p_client_id uuid default null,
  p_client_name text default null,
  p_client_phone text default null,
  p_client_email text default null,
  p_client_birth_date date default null,
  p_document_number text default null,
  p_service_id uuid default null,
  p_work_id uuid default null,
  p_responsible_member_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_first_entry uuid;
  v_effective_client uuid;
  v_before public.clients%rowtype;
  v_manual boolean:=p_client_id is not null;
  v_result jsonb;
begin
  select x.id into v_first_entry
  from public.asaas_incoming_payments x
  where x.payment_snapshot->>'installment'=p_installment_id and x.classification_status in ('PENDING','REVIEW')
  order by x.received_at limit 1;
  if v_first_entry is null then raise exception 'Parcelamento não encontrado ou já associado.'; end if;

  v_effective_client:=public.safe_asaas_client_for_entry(v_first_entry,p_client_id);
  if v_manual then select * into v_before from public.clients where id=p_client_id; end if;

  v_result:=public.resolve_asaas_installment_group_core_v347(
    p_installment_id,v_effective_client,p_client_name,p_client_phone,p_client_email,p_client_birth_date,p_document_number,
    p_service_id,p_work_id,p_responsible_member_id,p_notes
  );

  if v_manual then
    update public.clients set
      phone=v_before.phone,email=v_before.email,birth_date=v_before.birth_date,document_number=v_before.document_number,
      asaas_customer_id=v_before.asaas_customer_id,postal_code=v_before.postal_code,address_line=v_before.address_line,
      address_number=v_before.address_number,address_complement=v_before.address_complement,district=v_before.district,
      city=v_before.city,state=v_before.state,updated_by=v_before.updated_by,updated_at=v_before.updated_at
    where id=p_client_id;
  end if;

  update public.payments p
  set notes=case when coalesce(p.notes,'') ilike '%Pagador Asaas: '||x.customer_name||'%'
                 then p.notes else concat_ws(' | ',p.notes,'Pagador Asaas: '||x.customer_name) end,
      updated_at=now()
  from public.asaas_incoming_payments x
  where x.payment_snapshot->>'installment'=p_installment_id and x.resolved_payment_id=p.id and nullif(trim(x.customer_name),'') is not null;

  return v_result;
end;
$$;
revoke all on function public.resolve_asaas_installment_group(text,uuid,text,text,text,date,text,uuid,uuid,uuid,text) from public;
grant execute on function public.resolve_asaas_installment_group(text,uuid,text,text,text,date,text,uuid,uuid,uuid,text) to authenticated;
