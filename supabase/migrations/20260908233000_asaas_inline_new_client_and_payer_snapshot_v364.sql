alter table public.payments add column if not exists payer_name text;
alter table public.payments add column if not exists payer_document_number text;
alter table public.payments add column if not exists payer_phone text;
alter table public.payments add column if not exists payer_email text;
alter table public.payments add column if not exists payer_asaas_customer_id text;
alter table public.payments add column if not exists payer_snapshot jsonb not null default '{}'::jsonb;

comment on column public.payments.payer_name is 'Nome de quem efetivamente realizou o pagamento; pode ser diferente do cliente atendido.';
comment on column public.payments.payer_snapshot is 'Snapshot estruturado dos dados do pagador recebidos do Asaas no momento da associação.';

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
) returns jsonb
language plpgsql
set search_path to 'public','private','pg_temp'
as $function$
declare
  e public.asaas_incoming_payments%rowtype;
  v_member_id uuid;
  v_effective_client uuid;
  v_before public.clients%rowtype;
  v_result jsonb;
  v_created boolean:=false;
  v_payment_id uuid;
begin
  if not private.is_internal_member() then
    raise exception 'Usuário não autorizado.';
  end if;

  select * into e from public.asaas_incoming_payments where id=p_entry_id;
  if e.id is null then raise exception 'Entrada Asaas não encontrada.'; end if;

  select id into v_member_id
  from public.team_members
  where auth_user_id=auth.uid() and active=true
  limit 1;

  if p_client_id is not null then
    v_effective_client:=public.safe_asaas_client_for_entry(p_entry_id,p_client_id);
  elsif nullif(trim(coalesce(p_client_name,'')),'') is not null then
    insert into public.clients(
      full_name,phone,email,birth_date,document_number,source,created_by,updated_by
    ) values (
      trim(p_client_name),
      nullif(trim(coalesce(p_client_phone,'')),''),
      nullif(trim(coalesce(p_client_email,'')),''),
      p_client_birth_date,
      nullif(trim(coalesce(p_document_number,'')),''),
      'ASAAS',v_member_id,v_member_id
    ) returning id into v_effective_client;
    v_created:=true;
  else
    v_effective_client:=public.safe_asaas_client_for_entry(p_entry_id,null);
  end if;

  if v_effective_client is not null then
    select * into v_before from public.clients where id=v_effective_client;
  end if;

  v_result:=public.resolve_asaas_entry_multi_core_v363(
    p_entry_id,v_effective_client,p_client_name,p_client_phone,p_client_email,
    p_client_birth_date,p_document_number,p_items,p_notes
  );

  if v_effective_client is not null then
    update public.clients set
      phone=v_before.phone,
      email=v_before.email,
      birth_date=v_before.birth_date,
      document_number=v_before.document_number,
      asaas_customer_id=v_before.asaas_customer_id,
      postal_code=v_before.postal_code,
      address_line=v_before.address_line,
      address_number=v_before.address_number,
      address_complement=v_before.address_complement,
      district=v_before.district,
      city=v_before.city,
      state=v_before.state,
      updated_by=v_before.updated_by,
      updated_at=v_before.updated_at
    where id=v_effective_client;
  end if;

  v_payment_id:=nullif(v_result->>'payment_id','')::uuid;
  if v_payment_id is not null then
    update public.payments set
      payer_name=nullif(trim(e.customer_name),''),
      payer_document_number=nullif(trim(e.customer_document),''),
      payer_phone=nullif(trim(coalesce(e.customer_mobile_phone,e.customer_phone,'')),''),
      payer_email=nullif(trim(e.customer_email),''),
      payer_asaas_customer_id=nullif(trim(e.asaas_customer_id),''),
      payer_snapshot=jsonb_strip_nulls(jsonb_build_object(
        'name',nullif(trim(e.customer_name),''),
        'document_number',nullif(trim(e.customer_document),''),
        'email',nullif(trim(e.customer_email),''),
        'phone',nullif(trim(coalesce(e.customer_mobile_phone,e.customer_phone,'')),''),
        'asaas_customer_id',nullif(trim(e.asaas_customer_id),''),
        'postal_code',e.customer_postal_code,
        'address',e.customer_address,
        'address_number',e.customer_address_number,
        'address_complement',e.customer_address_complement,
        'district',e.customer_district,
        'city',e.customer_city,
        'state',e.customer_state
      )),
      notes=case
        when nullif(trim(e.customer_name),'') is null then notes
        when coalesce(notes,'') ilike '%Pagador Asaas: '||e.customer_name||'%' then notes
        else concat_ws(' | ',notes,'Pagador Asaas: '||e.customer_name)
      end,
      updated_at=now()
    where id=v_payment_id;
  end if;

  return v_result || jsonb_build_object(
    'client_created',v_created,
    'payer_saved',v_payment_id is not null
  );
end;
$function$;
