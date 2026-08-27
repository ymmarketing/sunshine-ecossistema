-- Sunshine v2 — aceleração operacional
-- Aplicado em produção no projeto dhpsvwkytcqasmtaeayv.

alter table public.marketing_campaigns
  add column if not exists objective text,
  add column if not exists technical_analysis text,
  add column if not exists commercial_hypothesis text,
  add column if not exists campaign_priority text not null default 'MEDIUM' check (campaign_priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
  add column if not exists ym_content_status text not null default 'NOT_STARTED' check (ym_content_status in ('NOT_STARTED','IN_PRODUCTION','READY')),
  add column if not exists ym_validation_status text not null default 'PENDING' check (ym_validation_status in ('PENDING','VALIDATED','ADJUSTMENTS')),
  add column if not exists ym_central_url text,
  add column if not exists target_revenue numeric(12,2),
  add column if not exists planned_posts integer,
  add column if not exists managed_by text not null default 'YM',
  add column if not exists content_source text not null default 'CENTRAL_YM';

create table if not exists public.drive_links (
  id uuid primary key default gen_random_uuid(), title text not null, drive_url text not null,
  link_type text not null default 'WORK_PHOTOS' check (link_type in ('WORK_PHOTOS','DOCUMENT','CLIENT_FILE','CAMPAIGN','OTHER')),
  work_id uuid references public.works(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  campaign_id uuid references public.marketing_campaigns(id) on delete cascade,
  notes text, created_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (drive_url ~* '^https://(drive|docs)\.google\.com/')
);
create index if not exists idx_drive_links_work on public.drive_links(work_id);
create index if not exists idx_drive_links_client on public.drive_links(client_id);
create index if not exists idx_drive_links_campaign on public.drive_links(campaign_id);
alter table public.drive_links enable row level security;
create policy drive_links_select_internal on public.drive_links for select to authenticated using (private.is_internal_member());
create policy drive_links_insert_internal on public.drive_links for insert to authenticated with check (private.is_internal_member());
create policy drive_links_update_internal on public.drive_links for update to authenticated using (private.is_internal_member()) with check (private.is_internal_member());
create policy drive_links_delete_admin on public.drive_links for delete to authenticated using (private.is_admin_member());

create table if not exists public.spiritual_calendar_events (
  id uuid primary key default gen_random_uuid(), title text not null,
  category text not null default 'THEMATIC' check (category in ('ORIXA','ENTITY','THEMATIC','HOUSE','OTHER')),
  recurrence_type text not null default 'YEARLY' check (recurrence_type in ('ONE_TIME','YEARLY','WEEKLY')),
  event_date date, month smallint check (month is null or month between 1 and 12),
  day smallint check (day is null or day between 1 and 31), weekday smallint check (weekday is null or weekday between 0 and 6),
  notes text, active boolean not null default true, source text not null default 'SUNSHINE',
  created_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((recurrence_type='ONE_TIME' and event_date is not null) or (recurrence_type='YEARLY' and month is not null and day is not null) or (recurrence_type='WEEKLY' and weekday is not null))
);
create index if not exists idx_spiritual_calendar_active on public.spiritual_calendar_events(active, recurrence_type);
alter table public.spiritual_calendar_events enable row level security;
create policy spiritual_calendar_select_internal on public.spiritual_calendar_events for select to authenticated using (private.is_internal_member());
create policy spiritual_calendar_insert_internal on public.spiritual_calendar_events for insert to authenticated with check (private.is_internal_member());
create policy spiritual_calendar_update_internal on public.spiritual_calendar_events for update to authenticated using (private.is_internal_member()) with check (private.is_internal_member());
create policy spiritual_calendar_delete_admin on public.spiritual_calendar_events for delete to authenticated using (private.is_admin_member());

-- Datas iniciais de referência. Editáveis conforme a tradição da casa.
insert into public.spiritual_calendar_events(title,category,recurrence_type,month,day,notes,source)
select * from (values
  ('Oxóssi','ORIXA','YEARLY',1::smallint,20::smallint,'Referência comum; validar conforme a tradição da casa.','SUNSHINE'),
  ('Iemanjá','ORIXA','YEARLY',2::smallint,2::smallint,'Referência comum; validar conforme a tradição da casa.','SUNSHINE'),
  ('Ogum','ORIXA','YEARLY',4::smallint,23::smallint,'Referência comum; validar conforme a tradição da casa.','SUNSHINE'),
  ('Pretos-Velhos','ENTITY','YEARLY',5::smallint,13::smallint,'Data temática amplamente utilizada na Umbanda.','SUNSHINE'),
  ('Xangô','ORIXA','YEARLY',6::smallint,24::smallint,'Referência comum; validar conforme a tradição da casa.','SUNSHINE'),
  ('Ibeji / Crianças','ENTITY','YEARLY',9::smallint,27::smallint,'Data temática amplamente utilizada na Umbanda.','SUNSHINE'),
  ('Iansã','ORIXA','YEARLY',12::smallint,4::smallint,'Referência comum; validar conforme a tradição da casa.','SUNSHINE'),
  ('Oxum','ORIXA','YEARLY',12::smallint,8::smallint,'Referência comum; validar conforme a tradição da casa.','SUNSHINE')
) as v(title,category,recurrence_type,month,day,notes,source)
where not exists (select 1 from public.spiritual_calendar_events s where s.title=v.title and s.recurrence_type='YEARLY' and s.month=v.month and s.day=v.day);

create or replace function public.register_quick_entry(
  p_client_id uuid default null, p_client_name text default null, p_client_phone text default null,
  p_client_email text default null, p_client_birth_date date default null, p_service_id uuid default null,
  p_work_id uuid default null, p_responsible_member_id uuid default null, p_sale_type text default 'OUTRO',
  p_amount numeric default 0, p_payment_status text default 'PAID', p_payment_method text default null,
  p_source text default 'MANUAL', p_paid_at timestamptz default now(), p_notes text default null,
  p_loved_person_name text default null, p_rival_name text default null
) returns jsonb language plpgsql security definer set search_path=public,private as $$
declare
  v_member_id uuid; v_client_id uuid; v_client_name text; v_client_birth date;
  v_sale_id uuid; v_payment_id uuid; v_allocation_id uuid; v_registration_id uuid; v_sale_status text;
begin
  if not private.is_internal_member() then raise exception 'Usuário não autorizado para operar a Sunshine.'; end if;
  if coalesce(p_amount,0) < 0 then raise exception 'O valor não pode ser negativo.'; end if;
  if p_payment_status not in ('PAID','PENDING','OVERDUE','REFUNDED','CANCELLED') then raise exception 'Status de pagamento inválido.'; end if;
  if p_sale_type not in ('CONSULTA','PERGUNTA','MENSALIDADE','TRABALHO','OUTRO') then raise exception 'Tipo de venda inválido.'; end if;
  select id into v_member_id from public.team_members where auth_user_id=auth.uid() and active=true limit 1;
  if p_client_id is not null then
    select id,full_name,birth_date into v_client_id,v_client_name,v_client_birth from public.clients where id=p_client_id;
    if v_client_id is null then raise exception 'Cliente não encontrado.'; end if;
  else
    if nullif(trim(coalesce(p_client_name,'')),'') is null then raise exception 'Informe o cliente existente ou o nome do novo cliente.'; end if;
    insert into public.clients(full_name,phone,email,birth_date,source,created_by,updated_by)
    values(trim(p_client_name),nullif(trim(coalesce(p_client_phone,'')),''),nullif(trim(coalesce(p_client_email,'')),''),p_client_birth_date,'MANUAL',v_member_id,v_member_id)
    returning id,full_name,birth_date into v_client_id,v_client_name,v_client_birth;
  end if;
  v_sale_status:=case when p_payment_status='PAID' then 'CONFIRMED' when p_payment_status='REFUNDED' then 'REFUNDED' when p_payment_status='CANCELLED' then 'CANCELLED' else 'PENDING' end;
  insert into public.sales(client_id,service_id,work_id,responsible_member_id,sale_type,source,status,quantity,unit_price,discount_amount,notes)
  values(v_client_id,p_service_id,p_work_id,p_responsible_member_id,p_sale_type,'MANUAL',v_sale_status,1,coalesce(p_amount,0),0,p_notes) returning id into v_sale_id;
  insert into public.payments(client_id,source,status,gross_amount,fees_amount,payment_method,paid_at,competence_date,notes)
  values(v_client_id,p_source,p_payment_status,coalesce(p_amount,0),0,p_payment_method,case when p_payment_status='PAID' then coalesce(p_paid_at,now()) else null end,coalesce(p_paid_at,now())::date,p_notes)
  returning id into v_payment_id;
  if coalesce(p_amount,0)>0 then insert into public.payment_allocations(payment_id,sale_id,amount) values(v_payment_id,v_sale_id,p_amount) returning id into v_allocation_id; end if;
  if p_work_id is not null then
    insert into public.work_registrations(work_id,client_id,sale_id,participant_name,participant_birth_date,loved_person_name,rival_name,status)
    values(p_work_id,v_client_id,v_sale_id,v_client_name,coalesce(p_client_birth_date,v_client_birth),p_loved_person_name,p_rival_name,case when p_payment_status='PAID' then 'CONFIRMED' else 'REGISTERED' end)
    returning id into v_registration_id;
  end if;
  return jsonb_build_object('client_id',v_client_id,'sale_id',v_sale_id,'payment_id',v_payment_id,'allocation_id',v_allocation_id,'registration_id',v_registration_id);
end;$$;
revoke all on function public.register_quick_entry(uuid,text,text,text,date,uuid,uuid,uuid,text,numeric,text,text,text,timestamptz,text,text,text) from public,anon;
grant execute on function public.register_quick_entry(uuid,text,text,text,date,uuid,uuid,uuid,text,numeric,text,text,text,timestamptz,text,text,text) to authenticated;
