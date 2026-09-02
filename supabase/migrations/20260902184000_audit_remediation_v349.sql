-- Sunshine v3.49 — correções estruturais da auditoria de produção.
-- Princípios: não reescrever dados reais, separar estado operacional/financeiro e bloquear inconsistências no banco.

-- 1) Pergunta Objetiva: estado próprio, sem misturar agenda/financeiro.
alter table public.appointments add column if not exists question_text text;
alter table public.appointments add column if not exists question_status text;
alter table public.appointments add column if not exists answer_text text;
alter table public.appointments add column if not exists answered_by uuid references public.team_members(id) on delete set null;
alter table public.appointments add column if not exists answered_at timestamptz;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='appointments_question_status_check') then
    alter table public.appointments add constraint appointments_question_status_check
      check (question_status is null or question_status in ('AWAITING_RESPONSE','RESPONDED','CANCELLED'));
  end if;
end $$;

create index if not exists idx_appointments_question_queue
  on public.appointments(question_status,created_at)
  where question_status='AWAITING_RESPONSE';

create or replace function public.validate_question_workflow_v349()
returns trigger
language plpgsql
security invoker
set search_path=public,private,pg_temp
as $$
declare
  v_category text;
  v_is_question boolean:=false;
  v_member uuid;
begin
  if new.service_id is not null then
    select category into v_category from public.services where id=new.service_id;
  end if;
  v_is_question := new.event_type='PERGUNTA'
    or new.consultation_method='PERGUNTA_OBJETIVA'
    or v_category='PERGUNTA';

  if v_is_question then
    if nullif(trim(coalesce(new.question_text,'')),'') is null then
      raise exception 'Pergunta da cliente é obrigatória para Pergunta Objetiva.';
    end if;
    if new.status='CANCELLED' then
      new.question_status:='CANCELLED';
    elsif new.question_status is null then
      new.question_status:='AWAITING_RESPONSE';
    end if;
    if new.question_status='RESPONDED' then
      if nullif(trim(coalesce(new.answer_text,'')),'') is null then
        raise exception 'Não é possível marcar a pergunta como respondida sem preencher a resposta.';
      end if;
      if new.answered_at is null then new.answered_at:=now(); end if;
      if new.answered_by is null then
        select id into v_member from public.team_members where auth_user_id=auth.uid() and active=true limit 1;
        new.answered_by:=v_member;
      end if;
    end if;
  elsif new.question_status is not null then
    raise exception 'Status de pergunta só pode ser usado em Pergunta Objetiva.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_question_workflow_v349 on public.appointments;
create trigger trg_validate_question_workflow_v349
before insert or update of event_type,consultation_method,service_id,status,question_text,question_status,answer_text
on public.appointments for each row execute function public.validate_question_workflow_v349();

create or replace function public.log_question_timeline_v349()
returns trigger
language plpgsql
security invoker
set search_path=public,private,pg_temp
as $$
declare v_member uuid;
begin
  select id into v_member from public.team_members where auth_user_id=auth.uid() and active=true limit 1;
  if tg_op='INSERT' and new.question_status is not null then
    insert into public.client_timeline_events(client_id,event_type,title,summary,occurred_at,entity_type,entity_id,metadata,created_by)
    values(new.client_id,'QUESTION_CREATED','Pergunta objetiva recebida',new.question_text,new.created_at,'appointment',new.id,
      jsonb_build_object('question_status',new.question_status),v_member);
  elsif tg_op='UPDATE' and new.question_status='RESPONDED' and old.question_status is distinct from 'RESPONDED' then
    insert into public.client_timeline_events(client_id,event_type,title,summary,occurred_at,entity_type,entity_id,metadata,created_by)
    values(new.client_id,'QUESTION_ANSWERED','Pergunta objetiva respondida',new.answer_text,coalesce(new.answered_at,now()),'appointment',new.id,
      jsonb_build_object('question',new.question_text,'answered_by',new.answered_by),coalesce(new.answered_by,v_member));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_question_timeline_v349 on public.appointments;
create trigger trg_question_timeline_v349
after insert or update of question_status on public.appointments
for each row execute function public.log_question_timeline_v349();

create or replace function public.answer_question_v349(p_appointment_id uuid,p_answer text)
returns jsonb
language plpgsql
security invoker
set search_path=public,private,pg_temp
as $$
declare v_member uuid; v_row public.appointments%rowtype;
begin
  if not private.is_internal_member() then raise exception 'Usuário não autorizado.'; end if;
  if nullif(trim(coalesce(p_answer,'')),'') is null then raise exception 'Preencha a resposta antes de concluir.'; end if;
  select id into v_member from public.team_members where auth_user_id=auth.uid() and active=true limit 1;
  update public.appointments
     set answer_text=trim(p_answer),question_status='RESPONDED',answered_by=v_member,answered_at=now(),updated_at=now()
   where id=p_appointment_id and question_status='AWAITING_RESPONSE'
   returning * into v_row;
  if v_row.id is null then raise exception 'Pergunta não encontrada ou já finalizada.'; end if;
  return jsonb_build_object('id',v_row.id,'question_status',v_row.question_status,'answered_at',v_row.answered_at,'answered_by',v_row.answered_by);
end;
$$;
revoke all on function public.answer_question_v349(uuid,text) from public,anon;
grant execute on function public.answer_question_v349(uuid,text) to authenticated;

create or replace function public.get_question_queue_v349(p_responsible uuid default null,p_status text default 'AWAITING_RESPONSE')
returns table(
  appointment_id uuid,client_id uuid,client_name text,question_text text,responsible_member_id uuid,responsible_name text,
  created_at timestamptz,starts_at timestamptz,question_status text,answer_text text,answered_at timestamptz,payment_status text
)
language plpgsql
security invoker
set search_path=public,private,pg_temp
as $$
begin
  if not private.is_internal_member() then raise exception 'Usuário não autorizado.'; end if;
  return query
  select a.id,a.client_id,c.full_name,a.question_text,a.responsible_member_id,tm.full_name,a.created_at,a.starts_at,a.question_status,a.answer_text,a.answered_at,
    case
      when coalesce(fin.received,0)<=0 then 'NOT_ASSOCIATED'
      when coalesce(fin.received,0)+0.009<coalesce(fin.contracted,0) then 'PENDING'
      else 'PAID'
    end
  from public.appointments a
  join public.clients c on c.id=a.client_id
  left join public.team_members tm on tm.id=a.responsible_member_id
  left join lateral (
    select coalesce(sum(distinct s.total_amount),0) contracted,coalesce(sum(pa.amount) filter(where p.status='PAID'),0) received
    from public.sales s
    left join public.payment_allocations pa on pa.sale_id=s.id
    left join public.payments p on p.id=pa.payment_id
    where s.appointment_id=a.id and s.status<>'CANCELLED'
  ) fin on true
  where (p_status is null or a.question_status=p_status)
    and (p_responsible is null or a.responsible_member_id=p_responsible)
  order by a.created_at asc;
end;
$$;
revoke all on function public.get_question_queue_v349(uuid,text) from public,anon;
grant execute on function public.get_question_queue_v349(uuid,text) to authenticated;

-- 2) Busca global de clientes: server-side, sem carregar toda a base no DOM.
create or replace function public.search_clients_v349(
  p_query text default null,p_status text default null,p_limit integer default 15,p_offset integer default 0
)
returns table(id uuid,full_name text,preferred_name text,phone text,email text,status text,birth_date date,total_count bigint)
language plpgsql
security invoker
set search_path=public,private,extensions,pg_temp
as $$
declare v_q text:=trim(coalesce(p_query,'')); v_limit int:=least(greatest(coalesce(p_limit,15),1),50); v_offset int:=greatest(coalesce(p_offset,0),0);
begin
  if not private.is_internal_member() then raise exception 'Usuário não autorizado.'; end if;
  if v_q<>'' and length(v_q)<2 then return; end if;
  return query
  select c.id,c.full_name,c.preferred_name,c.phone,c.email,c.status,c.birth_date,count(*) over()
  from public.clients c
  where (p_status is null or p_status='' or c.status=p_status)
    and (v_q='' or unaccent(lower(coalesce(c.full_name,''))) like '%'||unaccent(lower(v_q))||'%'
      or unaccent(lower(coalesce(c.preferred_name,''))) like '%'||unaccent(lower(v_q))||'%'
      or regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') like '%'||regexp_replace(v_q,'[^0-9]','','g')||'%'
      or lower(coalesce(c.email,'')) like '%'||lower(v_q)||'%')
  order by c.full_name,c.created_at
  limit v_limit offset v_offset;
end;
$$;
revoke all on function public.search_clients_v349(text,text,integer,integer) from public,anon;
grant execute on function public.search_clients_v349(text,text,integer,integer) to authenticated;

create index if not exists idx_clients_full_name_lower_v349 on public.clients(lower(full_name));
create index if not exists idx_clients_email_lower_v349 on public.clients(lower(email));

-- 3) Receita canônica por trabalho: mesma origem para Trabalhos e Campanhas, sem multiplicação de joins.
create or replace function public.get_work_metrics_v349(p_work_ids uuid[] default null)
returns table(work_id uuid,registrations bigint,received numeric)
language plpgsql
security invoker
set search_path=public,private,pg_temp
as $$
begin
  if not private.is_internal_member() then raise exception 'Usuário não autorizado.'; end if;
  return query
  with regs as (
    select wr.work_id,count(*) filter(where wr.status<>'CANCELLED') registrations
    from public.work_registrations wr
    where p_work_ids is null or wr.work_id=any(p_work_ids)
    group by wr.work_id
  ), rev as (
    select s.work_id,coalesce(sum(pa.amount),0) received
    from public.sales s
    join public.payment_allocations pa on pa.sale_id=s.id
    join public.payments p on p.id=pa.payment_id and p.status='PAID'
    where s.work_id is not null and s.status<>'CANCELLED' and (p_work_ids is null or s.work_id=any(p_work_ids))
    group by s.work_id
  )
  select w.id,coalesce(regs.registrations,0),coalesce(rev.received,0)
  from public.works w left join regs on regs.work_id=w.id left join rev on rev.work_id=w.id
  where p_work_ids is null or w.id=any(p_work_ids);
end;
$$;
revoke all on function public.get_work_metrics_v349(uuid[]) from public,anon;
grant execute on function public.get_work_metrics_v349(uuid[]) to authenticated;

-- 4) Filhos da Casa: completar vínculo e manter trilha de alteração.
alter table public.house_members add column if not exists left_at date;

create table if not exists public.house_member_change_log(
  id uuid primary key default gen_random_uuid(),
  house_member_id uuid not null references public.house_members(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  changed_by uuid references public.team_members(id) on delete set null,
  changed_at timestamptz not null default now(),
  changes jsonb not null default '{}'::jsonb
);
alter table public.house_member_change_log enable row level security;
drop policy if exists house_member_change_log_internal_select on public.house_member_change_log;
create policy house_member_change_log_internal_select on public.house_member_change_log for select to authenticated using (private.is_internal_member());
drop policy if exists house_member_change_log_internal_insert on public.house_member_change_log;
create policy house_member_change_log_internal_insert on public.house_member_change_log for insert to authenticated with check (private.is_internal_member());

create or replace function public.log_house_member_changes_v349()
returns trigger language plpgsql security invoker set search_path=public,private,pg_temp as $$
declare v_changes jsonb:='{}'::jsonb; v_member uuid;
begin
  if old.monthly_fee is distinct from new.monthly_fee then v_changes:=v_changes||jsonb_build_object('monthly_fee',jsonb_build_object('from',old.monthly_fee,'to',new.monthly_fee)); end if;
  if old.billing_due_day is distinct from new.billing_due_day then v_changes:=v_changes||jsonb_build_object('billing_due_day',jsonb_build_object('from',old.billing_due_day,'to',new.billing_due_day)); end if;
  if old.billing_due_rule is distinct from new.billing_due_rule then v_changes:=v_changes||jsonb_build_object('billing_due_rule',jsonb_build_object('from',old.billing_due_rule,'to',new.billing_due_rule)); end if;
  if old.billing_exempt is distinct from new.billing_exempt then v_changes:=v_changes||jsonb_build_object('billing_exempt',jsonb_build_object('from',old.billing_exempt,'to',new.billing_exempt)); end if;
  if old.billing_exemption_reason is distinct from new.billing_exemption_reason then v_changes:=v_changes||jsonb_build_object('billing_exemption_reason',jsonb_build_object('from',old.billing_exemption_reason,'to',new.billing_exemption_reason)); end if;
  if old.status is distinct from new.status then v_changes:=v_changes||jsonb_build_object('status',jsonb_build_object('from',old.status,'to',new.status)); end if;
  if old.joined_at is distinct from new.joined_at then v_changes:=v_changes||jsonb_build_object('joined_at',jsonb_build_object('from',old.joined_at,'to',new.joined_at)); end if;
  if old.left_at is distinct from new.left_at then v_changes:=v_changes||jsonb_build_object('left_at',jsonb_build_object('from',old.left_at,'to',new.left_at)); end if;
  if v_changes<>'{}'::jsonb then
    select id into v_member from public.team_members where auth_user_id=auth.uid() and active=true limit 1;
    insert into public.house_member_change_log(house_member_id,client_id,changed_by,changes) values(new.id,new.client_id,v_member,v_changes);
  end if;
  return new;
end; $$;
drop trigger if exists trg_house_member_changes_v349 on public.house_members;
create trigger trg_house_member_changes_v349 after update on public.house_members for each row execute function public.log_house_member_changes_v349();

-- 5) Performance: snapshots por sincronização para formar série histórica sem inventar pontos passados.
create table if not exists public.performance_metric_snapshots(
  id uuid primary key default gen_random_uuid(),
  kpi_id uuid not null references public.performance_kpis(id) on delete cascade,
  snapshot_date date not null,
  period_start date not null,
  period_end date not null,
  value numeric not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(kpi_id,snapshot_date)
);
alter table public.performance_metric_snapshots enable row level security;
drop policy if exists performance_snapshots_internal_select on public.performance_metric_snapshots;
create policy performance_snapshots_internal_select on public.performance_metric_snapshots for select to authenticated using(private.is_internal_member());
drop policy if exists performance_snapshots_internal_write on public.performance_metric_snapshots;
create policy performance_snapshots_internal_write on public.performance_metric_snapshots for all to authenticated using(private.is_internal_member()) with check(private.is_internal_member());

create or replace function public.snapshot_performance_measurement_v349()
returns trigger language plpgsql security invoker set search_path=public,private,pg_temp as $$
begin
  insert into public.performance_metric_snapshots(kpi_id,snapshot_date,period_start,period_end,value,observed_at)
  values(new.kpi_id,(new.observed_at at time zone 'America/Sao_Paulo')::date,new.period_start,new.period_end,new.value,new.observed_at)
  on conflict(kpi_id,snapshot_date) do update set period_start=excluded.period_start,period_end=excluded.period_end,value=excluded.value,observed_at=excluded.observed_at;
  return new;
end; $$;
drop trigger if exists trg_snapshot_performance_v349 on public.performance_measurements;
create trigger trg_snapshot_performance_v349 after insert or update of value,period_start,period_end,observed_at on public.performance_measurements for each row execute function public.snapshot_performance_measurement_v349();

insert into public.performance_metric_snapshots(kpi_id,snapshot_date,period_start,period_end,value,observed_at)
select m.kpi_id,(m.observed_at at time zone 'America/Sao_Paulo')::date,m.period_start,m.period_end,m.value,m.observed_at
from public.performance_measurements m
on conflict(kpi_id,snapshot_date) do nothing;

-- 6) Integrações: fonte única de estado operacional.
create or replace function public.get_integration_status_v349()
returns table(provider text,state text,last_confirmation timestamptz,message text)
language plpgsql security invoker set search_path=public,private,pg_temp as $$
declare a public.asaas_integration_settings%rowtype; r public.performance_data_sources%rowtype;
begin
  if not private.is_internal_member() then raise exception 'Usuário não autorizado.'; end if;
  select * into a from public.asaas_integration_settings order by updated_at desc limit 1;
  provider:='ASAAS';
  if a.id is null then state:='NOT_CONFIGURED';last_confirmation:=null;message:='Configure a integração do Asaas.';
  elsif nullif(a.last_error,'') is not null then state:='ERROR';last_confirmation:=a.last_event_at;message:=a.last_error;
  elsif a.status='CONNECTED' and a.webhook_id is not null then state:='CONNECTED';last_confirmation:=coalesce(a.last_event_at,a.connected_at);message:='Webhook ativo.';
  else state:='DELAYED';last_confirmation:=coalesce(a.last_event_at,a.updated_at);message:='Revise a configuração do webhook.'; end if;
  return next;

  select * into r from public.performance_data_sources where provider='REPORTEI' order by updated_at desc limit 1;
  provider:='REPORTEI';
  if r.id is null then state:='NOT_CONFIGURED';last_confirmation:=null;message:='Configure a fonte do Reportei.';
  elsif nullif(r.last_error,'') is not null then state:='ERROR';last_confirmation:=r.last_synced_at;message:=r.last_error;
  elsif r.status='CONNECTED' and r.last_synced_at is not null and r.last_synced_at < now()-interval '7 days' then state:='DELAYED';last_confirmation:=r.last_synced_at;message:='A sincronização está atrasada.';
  elsif r.status='CONNECTED' then state:='CONNECTED';last_confirmation:=r.last_synced_at;message:='Fonte conectada.';
  else state:='NOT_CONFIGURED';last_confirmation:=r.last_synced_at;message:='Conexão não confirmada.'; end if;
  return next;
end; $$;
revoke all on function public.get_integration_status_v349() from public,anon;
grant execute on function public.get_integration_status_v349() to authenticated;

-- 7) Excesso financeiro: classificar sem alterar o pagamento original.
create table if not exists public.payment_excess_classifications(
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete cascade,
  classification text not null check(classification in ('CREDIT','FEE','ADJUSTMENT','REFUND')),
  amount numeric not null check(amount>0),
  notes text,
  created_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.payment_excess_classifications enable row level security;
drop policy if exists payment_excess_internal_select on public.payment_excess_classifications;
create policy payment_excess_internal_select on public.payment_excess_classifications for select to authenticated using(private.is_internal_member());
drop policy if exists payment_excess_internal_write on public.payment_excess_classifications;
create policy payment_excess_internal_write on public.payment_excess_classifications for all to authenticated using(private.is_internal_member()) with check(private.is_internal_member());

create or replace function public.classify_payment_excess_v349(p_payment_id uuid,p_sale_id uuid,p_classification text,p_amount numeric,p_notes text default null)
returns uuid language plpgsql security invoker set search_path=public,private,pg_temp as $$
declare v_available numeric;v_used numeric;v_member uuid;v_id uuid;
begin
  if not private.is_internal_member() then raise exception 'Usuário não autorizado.'; end if;
  if p_classification not in ('CREDIT','FEE','ADJUSTMENT','REFUND') then raise exception 'Classificação inválida.'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'Informe um valor maior que zero.'; end if;
  if p_sale_id is not null then
    select greatest(coalesce(sum(pa.amount) filter(where p.status='PAID'),0)-coalesce(max(s.total_amount),0),0)
      into v_available from public.sales s left join public.payment_allocations pa on pa.sale_id=s.id left join public.payments p on p.id=pa.payment_id
      where s.id=p_sale_id group by s.id;
  else
    select retained_excess_amount into v_available from public.payments where id=p_payment_id;
  end if;
  if v_available is null then raise exception 'Pagamento/venda não encontrado.'; end if;
  select coalesce(sum(amount),0) into v_used from public.payment_excess_classifications where payment_id=p_payment_id and sale_id is not distinct from p_sale_id;
  if v_used+p_amount>v_available+0.009 then raise exception 'A classificação ultrapassa o excesso disponível de R$ %.',to_char(greatest(v_available-v_used,0),'FM999999990D00'); end if;
  select id into v_member from public.team_members where auth_user_id=auth.uid() and active=true limit 1;
  insert into public.payment_excess_classifications(payment_id,sale_id,classification,amount,notes,created_by)
  values(p_payment_id,p_sale_id,p_classification,p_amount,nullif(trim(coalesce(p_notes,'')),''),v_member) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.classify_payment_excess_v349(uuid,uuid,text,numeric,text) from public,anon;
grant execute on function public.classify_payment_excess_v349(uuid,uuid,text,numeric,text) to authenticated;

-- 8) Financeiro paginado no servidor e com três eixos de data explícitos.
create or replace function public.finance_entries_v349(
  p_date_kind text,p_start date,p_end date,p_page integer default 1,p_page_size integer default 50
)
returns table(
  entry_kind text,sale_id uuid,payment_id uuid,client_id uuid,client_name text,label text,
  sale_date date,competence_date date,receipt_date date,contracted numeric,received numeric,fees numeric,
  excess numeric,credit numeric,refund numeric,adjustment numeric,balance numeric,financial_status text,total_count bigint
)
language plpgsql security invoker set search_path=public,private,pg_temp as $$
declare v_kind text:=upper(coalesce(p_date_kind,'SALE'));v_page int:=greatest(coalesce(p_page,1),1);v_size int:=least(greatest(coalesce(p_page_size,50),10),100);
begin
  if not private.is_internal_member() then raise exception 'Usuário não autorizado.'; end if;
  if v_kind not in ('SALE','COMPETENCE','RECEIPT') then raise exception 'Tipo de data inválido.'; end if;
  if p_start is null or p_end is null or p_start>p_end then raise exception 'Período inválido.'; end if;
  return query
  with pay_alloc as (
    select pa.sale_id,pa.payment_id,pa.amount,p.status,p.paid_at,p.competence_date,p.fees_amount,p.gross_amount,
      sum(pa.amount) over(partition by pa.payment_id) alloc_total
    from public.payment_allocations pa join public.payments p on p.id=pa.payment_id
  ), agg as (
    select s.id sale_id,s.client_id,max(c.full_name) client_name,
      coalesce(max(w.title),max(sv.name),max(replace(s.sale_type,'_',' '))) label,
      (s.sold_at at time zone 'America/Sao_Paulo')::date sale_date,
      max(pa.competence_date) competence_date,
      max((pa.paid_at at time zone 'America/Sao_Paulo')::date) receipt_date,
      max(s.total_amount)::numeric contracted,
      coalesce(sum(pa.amount) filter(where pa.status='PAID'),0)::numeric received,
      coalesce(sum(case when pa.status='PAID' and pa.alloc_total>0 then pa.fees_amount*(pa.amount/pa.alloc_total) else 0 end),0)::numeric fees
    from public.sales s join public.clients c on c.id=s.client_id
    left join public.services sv on sv.id=s.service_id left join public.works w on w.id=s.work_id
    left join pay_alloc pa on pa.sale_id=s.id
    where s.status<>'CANCELLED'
    group by s.id,s.client_id,s.sold_at
  ), filtered as (
    select a.* from agg a where case v_kind when 'SALE' then a.sale_date between p_start and p_end when 'COMPETENCE' then a.competence_date between p_start and p_end else a.receipt_date between p_start and p_end end
  ), classed as (
    select pec.sale_id,
      coalesce(sum(pec.amount) filter(where pec.classification='CREDIT'),0) credit,
      coalesce(sum(pec.amount) filter(where pec.classification='REFUND'),0) refund,
      coalesce(sum(pec.amount) filter(where pec.classification in ('ADJUSTMENT','FEE')),0) adjustment
    from public.payment_excess_classifications pec where pec.sale_id is not null group by pec.sale_id
  )
  select 'SALE'::text,f.sale_id,null::uuid,f.client_id,f.client_name,f.label,f.sale_date,f.competence_date,f.receipt_date,
    f.contracted,f.received,f.fees,greatest(f.received-f.contracted,0),coalesce(cl.credit,0),coalesce(cl.refund,0),coalesce(cl.adjustment,0),greatest(f.contracted-f.received,0),
    case when f.received<=0.009 then 'PENDING' when f.received+0.009<f.contracted then 'PARTIAL' when f.received>f.contracted+0.009 then 'OVERPAID' else 'PAID' end,
    count(*) over()
  from filtered f left join classed cl on cl.sale_id=f.sale_id
  order by case v_kind when 'SALE' then f.sale_date when 'COMPETENCE' then f.competence_date else f.receipt_date end desc nulls last,f.sale_id
  limit v_size offset ((v_page-1)*v_size);
end; $$;
revoke all on function public.finance_entries_v349(text,date,date,integer,integer) from public,anon;
grant execute on function public.finance_entries_v349(text,date,date,integer,integer) to authenticated;

-- 9) Endurecimento: remover execução anônima de rotinas operacionais/financeiras.
revoke execute on function public.reclassify_sale(uuid,uuid,uuid) from public,anon;
revoke execute on function public.resolve_asaas_entry(uuid,uuid,text,text,text,date,text,uuid,uuid,uuid,text,text,text,text) from public,anon;
revoke execute on function public.resolve_asaas_entry_multi(uuid,uuid,text,text,text,date,text,jsonb,text) from public,anon;
revoke execute on function public.resolve_asaas_entry_unified(uuid,uuid,text,text,text,date,text,jsonb,text) from public,anon;
revoke execute on function public.resolve_asaas_selected_entries(uuid[],uuid,text,text,text,date,text,uuid,uuid,uuid,numeric,text,text,text) from public,anon;
revoke execute on function public.resolve_asaas_installment_group(text,uuid,text,text,text,date,text,uuid,uuid,uuid,text) from public,anon;
revoke execute on function public.safe_asaas_client_for_entry(uuid,uuid) from public,anon;
revoke execute on function public.resolve_asaas_entry_unified_core_v347(uuid,uuid,text,text,text,date,text,jsonb,text) from public,anon;
revoke execute on function public.resolve_asaas_installment_group_core_v347(text,uuid,text,text,text,date,text,uuid,uuid,uuid,text) from public,anon;
revoke execute on function public.resolve_asaas_selected_entries_core_v347(uuid[],uuid,text,text,text,date,text,uuid,uuid,uuid,numeric,text,text,text) from public,anon;
revoke execute on function public.admin_pay_all_due_commissions() from public,anon;
revoke execute on function public.admin_pay_due_commissions_between(timestamptz,timestamptz) from public,anon;
revoke execute on function public.get_house_monthly_payment_status(date) from public,anon;
revoke execute on function public.payment_operational_available(uuid) from public,anon;
revoke execute on function public.record_sale_receipt(uuid,numeric,timestamptz,date,text,text) from public,anon;

-- Reafirmar acesso somente à equipe autenticada para os RPCs usados pela interface.
grant execute on function public.reclassify_sale(uuid,uuid,uuid) to authenticated;
grant execute on function public.admin_pay_due_commissions_between(timestamptz,timestamptz) to authenticated;
grant execute on function public.get_house_monthly_payment_status(date) to authenticated;
grant execute on function public.payment_operational_available(uuid) to authenticated;
grant execute on function public.record_sale_receipt(uuid,numeric,timestamptz,date,text,text) to authenticated;
