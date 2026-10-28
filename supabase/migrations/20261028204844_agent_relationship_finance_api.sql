-- Agent API: shared, private calculations; public wrappers enforce caller permissions.
create table public.agent_alert_rules (
 alert_type text primary key, active boolean not null default true,
 days_min integer not null check(days_min>=0), days_max integer check(days_max>=days_min),
 max_per_day integer not null default 5 check(max_per_day between 0 and 1000),
 cooldown_days integer not null default 30 check(cooldown_days>=0), description text not null
);
insert into public.agent_alert_rules(alert_type,days_min,days_max,description) values
 ('SO_AGRADO_COLETIVO',30,null,'Comprou somente agrado coletivo e não voltou a comprar.'),
 ('TRABALHO_PARTICULAR_RECENTE',7,15,'Comprou ou concluiu trabalho particular no intervalo informado.'),
 ('CONSULTA_SEM_TRABALHO',10,null,'Fez consulta ou pergunta e não comprou trabalho depois.'),
 ('PRIMEIRA_COMPRA_SEM_RETORNO',14,null,'Possui uma única compra e não voltou a comprar.'),
 ('ESFRIANDO',31,90,'Comprou ao menos duas vezes e está sem comprar no intervalo informado.'),
 ('INATIVA',90,null,'Está sem comprar há mais dias que o prazo informado.'),
 ('MEMBRO_CASA_ATRASADO',3,null,'Membro ativo da casa com mensalidade vencida e saldo pendente.'),
 ('LEAD_SEM_COMPRA',7,null,'Cadastro sem nenhuma compra após o prazo informado.');
alter table public.agent_alert_rules enable row level security;
revoke all on public.agent_alert_rules from public,anon,authenticated;
grant select,update on public.agent_alert_rules to authenticated;
grant all on public.agent_alert_rules to service_role;
create function private.agent_rules_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from sunshine_v4.team_members t where t.auth_user_id=auth.uid() and t.active
  and (exists(select 1 from sunshine_v4.user_roles u where u.user_id=t.auth_user_id and u.role_code='ADMIN')
   or (not exists(select 1 from sunshine_v4.user_roles u where u.user_id=t.auth_user_id) and t.legacy_role='ADMIN')));
$$;
revoke all on function private.agent_rules_admin() from public,anon;
grant execute on function private.agent_rules_admin() to authenticated,service_role;
create policy agent_rules_read on public.agent_alert_rules for select to authenticated using(private.agent_rules_admin());
create policy agent_rules_update on public.agent_alert_rules for update to authenticated
 using(private.agent_rules_admin()) with check(private.agent_rules_admin());

create function private.agent_phone(p_phone text) returns jsonb language plpgsql immutable set search_path='' as $$
declare d text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');v text;
begin
 if length(d) in (10,11) then d:='55'||d;end if;
 if d ~ '^55[1-9][0-9]([2-5][0-9]{7}|9[0-9]{8})$' then v:='+'||d;
 elsif btrim(coalesce(p_phone,'')) ~ '^\+[1-9][0-9]{7,14}$' and d not like '55%' then v:='+'||d;
 end if;
 return jsonb_build_object('phone',coalesce(v,p_phone),'phone_valid',v is not null);
end $$;

-- Preserve person history and append agent follow-ups to the same sorted timeline.
do $timeline$
declare v text;
begin
 v:=pg_get_functiondef('public.v4_person_detail(uuid)'::regprocedure);
 if strpos(v,'select ''WORK''::text event_type')=0 then raise exception 'Person history structure changed; review extraction.';end if;
 v:=replace(v,'select ''WORK''::text event_type',
  'select ''AGENT_FOLLOW_UP''::text event_type,f.completed_at occurred_at,''Alerta tratado: ''||f.reason title,coalesce(f.notes,'''') detail,0::bigint amount_cents,null::text work_title,null::text event_name,f.status status from sunshine_v4.follow_ups f where f.person_id=p.id and f.agent_reference_day is not null union all select ''WORK''::text event_type');
 execute v;
end $timeline$;

create function private.agent_brl(p_cents bigint) returns text language sql immutable set search_path='' as $$
 select 'R$ '||replace(replace(replace(to_char(coalesce(p_cents,0)/100.0,'FM999,999,999,999,990.00'),',','#'),'.',','),'#','.');
$$;
create function private.agent_closing_text(p_commission jsonb) returns text language sql immutable set search_path='' as $$
 select case when coalesce((p_commission->>'pendingTotalCents')::bigint,0)=0 then '' else
 'Comissão pendente de '||to_char((p_commission->>'pendingStartDate')::date,'DD/MM/YYYY')||' a '||to_char((p_commission->>'pendingEndDate')::date,'DD/MM/YYYY')||E'\n\nYasmin: '||
 private.agent_brl((select coalesce(sum(value::bigint),0)::bigint from jsonb_each_text(p_commission->'pendingByPerson') where lower(key) like '%yasmin%'))||E'\nLourdes: '||
 private.agent_brl((select coalesce(sum(value::bigint),0)::bigint from jsonb_each_text(p_commission->'pendingByPerson') where lower(key) like '%lourdes%'))||E'\nRosely: '||
 private.agent_brl((select coalesce(sum(value::bigint),0)::bigint from jsonb_each_text(p_commission->'pendingByPerson') where lower(key) in ('rosely','roseli')))||E'\n\nTotal: '||
 private.agent_brl((p_commission->>'pendingTotalCents')::bigint) end;
$$;
-- Only accepts actual financial filters; clients cannot supply calculated amounts.
create function public.v4_agent_closing_text(p_start date,p_end date,p_basis text default 'RECEIPT',
 p_responsible_member_id uuid default null,p_service_category text default null) returns text
language plpgsql security definer set search_path='' as $$
begin
 perform private.sunshine_finance_guard('commission.read');
 return private.agent_closing_text(public.v4_finance_commission_control_filtered(p_start,p_end,p_basis,p_responsible_member_id,p_service_category));
end $$;

create function private.agent_finance_period(p_start date,p_end date) returns jsonb
language plpgsql stable security definer set search_path='' set timezone='America/Sao_Paulo' as $$
declare v_revenue bigint;v_costs bigint;v_categories jsonb;v_commissions jsonb;v_cc jsonb;v_reserve bigint;
 v_cost_groups jsonb;v_works jsonb;v_result jsonb;v_count bigint;
begin
 select coalesce(sum(gross_cents),0),count(*) into v_revenue,v_count from private.sunshine_receipts() where paid_on between p_start and p_end;
 select coalesce(sum(amount_cents),0) into v_costs from private.sunshine_contribution_costs() where occurred_on between p_start and p_end;
 v_cc:=private.agent_core_v4_finance_commission_control(p_start,p_end,'RECEIPT');
 with cat as(select coalesce(i.service_category,'OUTRO') category,sum(a.amount_cents)::bigint amount_cents
  from sunshine_v4.payment_allocations a join sunshine_v4.obligations o on o.id=a.obligation_id
  join sunshine_v4.contract_items i on i.id=o.contract_item_id join sunshine_v4.payments p on p.id=a.payment_id
  where (p.paid_at at time zone 'America/Sao_Paulo')::date between p_start and p_end and p.status='PAID'
  and coalesce(o.explicit_status,'')<>'CANCELLED' group by 1)
 select coalesce(jsonb_agg(to_jsonb(cat) order by category),'[]') into v_categories from cat;
 -- Costs originate in the same canonical contribution-cost function as Faturamento.
 with costs as(select c.*,case when c.origin='RECEIPT' then coalesce(w.destination,'TRABALHO')
  when c.origin='EXPENSE' and (e.recurring_cost_id is not null or e.scope='FIXED') then 'CUSTO_FIXO'
  when c.origin='EXPENSE' and e.scope='WORK' then 'TRABALHO' else 'CASA' end destination,
  coalesce(w.work_id,case when jsonb_array_length(coalesce(e.allocations,'[]'))=1 then nullif(e.allocations->0->>'workId','')::uuid end) work_id
  from private.sunshine_contribution_costs() c
  left join public.work_expenses w on c.origin='RECEIPT' and c.id='receipt:'||w.id::text
  left join sunshine_v4.expenses e on c.origin='EXPENSE' and c.id=e.id::text
  where c.occurred_on between p_start and p_end),
 grouped as(select destination,sum(amount_cents)::bigint amount_cents from costs group by destination),
 works as(select c.work_id,w.title work_name,sum(c.amount_cents)::bigint amount_cents from costs c
  left join sunshine_v4.works w on w.id=c.work_id where c.destination='TRABALHO' group by c.work_id,w.title)
 select coalesce((select jsonb_object_agg(destination,amount_cents) from grouped),'{}'),
 coalesce((select jsonb_agg(to_jsonb(works) order by work_name nulls last,work_id) from works),'[]') into v_cost_groups,v_works;
 with names as(select key name from jsonb_each(v_cc->'pendingByPerson') union select key from jsonb_each(v_cc->'paidByPerson'))
 select coalesce(jsonb_agg(jsonb_build_object('name',name,'due_cents',coalesce((v_cc->'pendingByPerson'->>name)::bigint,0),
 'paid_cents',coalesce((v_cc->'paidByPerson'->>name)::bigint,0)) order by name),'[]') into v_commissions from names;
 select coalesce(sum(round(a.amount_cents*(private.sunshine_item_split(i.id,(p.paid_at at time zone 'America/Sao_Paulo')::date)->>'costBp')::int/10000.0)),0)::bigint
 into v_reserve from sunshine_v4.payment_allocations a join sunshine_v4.payments p on p.id=a.payment_id
 join sunshine_v4.obligations o on o.id=a.obligation_id join sunshine_v4.contract_items i on i.id=o.contract_item_id
 where p.status='PAID' and (p.paid_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
 and coalesce(o.explicit_status,'')<>'CANCELLED' and private.sunshine_uses_october_rule(a.id);
 if v_count=0 and v_costs=0 and jsonb_array_length(v_commissions)=0 then
  return jsonb_build_object('ok',false,'code','SEM_DADOS','message','Não há movimentações financeiras no período informado.');end if;
 return jsonb_build_object('ok',true,'start_date',p_start,'end_date',p_end,
 'revenue_cents',v_revenue,'revenue_by_category',v_categories,
 'uncategorized_revenue_cents',v_revenue-coalesce((select sum((x->>'amount_cents')::bigint) from jsonb_array_elements(v_categories)x),0),
 'costs',jsonb_build_object('total_cents',v_costs,'house_cents',coalesce((v_cost_groups->>'CASA')::bigint,0),
  'work_cents',coalesce((v_cost_groups->>'TRABALHO')::bigint,0),'fixed_cents',coalesce((v_cost_groups->>'CUSTO_FIXO')::bigint,0),
  'general_allocation_cents',coalesce((v_cost_groups->>'RATEIO_GERAL')::bigint,0),'by_work',v_works),
 'commissions',v_commissions,'commissions_due_cents',(v_cc->>'pendingTotalCents')::bigint,
 'commissions_paid_cents',(v_cc->>'paidTotalCents')::bigint,'contribution_margin_cents',v_revenue-v_costs,
 'house_reserve_cents',v_reserve,'texto_fechamento',private.agent_closing_text(v_cc));
end $$;
create function public.get_finance_period(from_phone text,p_start date,p_end date) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_state text;v_message text;v_detail text;
begin
 perform private.expense_resolve_member(from_phone);
 if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) then
  return jsonb_build_object('ok',false,'code','DATA_INVALIDA','message','Informe datas válidas para início e fim.');end if;
 if p_end<p_start then return jsonb_build_object('ok',false,'code','PERIODO_INVALIDO','message','A data final deve ser igual ou posterior à inicial.');end if;
 return private.agent_finance_period(p_start,p_end);
exception when others then
 get stacked diagnostics v_state=returned_sqlstate,v_message=message_text,v_detail=pg_exception_detail;
 return private.expense_error(v_state,v_message,v_detail);
end $$;

create function private.agent_first_name(p_preferred text,p_full text) returns text language sql immutable set search_path='' as $$
 select initcap(lower(coalesce(nullif(btrim(p_preferred),''),split_part(btrim(p_full),' ',1))));
$$;
create function private.agent_birthdays(p_reference date,p_month integer) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(btrim(p.preferred_name),''),p.full_name),
  'fullName',p.full_name,'firstName',private.agent_first_name(p.preferred_name,p.full_name),'phone',p.phone,
  'birthDate',p.birth_date,'birthday',d.birthday,'age',extract(year from d.birthday)::int-extract(year from p.birth_date)::int,
  'isToday',d.birthday=p_reference) order by d.birthday,p.full_name,p.id),'[]')
 from sunshine_v4.people p cross join lateral (
  select (p.birth_date+make_interval(years=>extract(year from p_reference)::int-extract(year from p.birth_date)::int))::date birthday
 )d where p.birth_date is not null and extract(month from d.birthday)=p_month and coalesce(p.status,'ACTIVE')<>'INACTIVE';
$$;
create or replace function public.v4_birthdays(p_reference date,p_month integer) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.sunshine_finance_guard('person.read');
 if p_reference is null or not isfinite(p_reference) or p_month is null or p_month not between 1 and 12 then raise exception 'Data ou mês inválido.';end if;
 return private.agent_birthdays(p_reference,p_month);
end $$;
create function public.get_birthdays_for_agent(p_reference date) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v jsonb;
begin
 if p_reference is null or not isfinite(p_reference) then return jsonb_build_object('ok',false,'code','DATA_INVALIDA','message','Informe uma data válida.');end if;
 select coalesce(jsonb_agg(jsonb_build_object('person_id',x->'id','full_name',x->'fullName','first_name',x->'firstName',
  'birth_date',x->'birthDate','age',x->'age')||private.agent_phone(x->>'phone') order by x->>'fullName',x->>'id'),'[]') into v
 from jsonb_array_elements(private.agent_birthdays(p_reference,extract(month from p_reference)::int))x where (x->>'isToday')::boolean;
 return jsonb_build_object('ok',true,'date',p_reference,'people',v);
end $$;

-- Identity stays in canonical follow_ups; the extra key only marks agent-created entries.
alter table sunshine_v4.follow_ups add column agent_reference_day date;
create unique index agent_follow_up_daily_unique on sunshine_v4.follow_ups(person_id,reason,agent_reference_day)
 where agent_reference_day is not null;
create index agent_follow_up_cooldown on sunshine_v4.follow_ups(person_id,reason,completed_at desc) where status='DONE';
create function private.agent_register_follow_up(person_id uuid,alert_type text,from_phone text,note text) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare v_member uuid;v_id uuid;v_day date:=(now() at time zone 'America/Sao_Paulo')::date;v_new boolean:=false;
 v_state text;v_message text;v_detail text;
begin
 v_member:=private.expense_resolve_member(from_phone);
 if not exists(select 1 from sunshine_v4.people p where p.id=person_id) then
  return jsonb_build_object('ok',false,'code','PESSOA_NAO_ENCONTRADA','message','Pessoa não encontrada.');end if;
 if not exists(select 1 from public.agent_alert_rules r where r.alert_type=agent_register_follow_up.alert_type) then
  return jsonb_build_object('ok',false,'code','TIPO_ALERTA_INVALIDO','message','Tipo de alerta inválido.');end if;
 if exists(select 1 from sunshine_v4.people p where p.id=person_id and p.status='INACTIVE') then
  return jsonb_build_object('ok',false,'code','PESSOA_INATIVA','message','Esta pessoa está inativa.');end if;
 -- Unique index handles concurrent retries. Return the original record without replacing notes or assignee.
 insert into sunshine_v4.follow_ups(id,person_id,status,reason,notes,completed_at,assigned_to,agent_reference_day)
 values(gen_random_uuid(),person_id,'DONE',alert_type,note,now(),v_member,v_day)
 on conflict do nothing returning id into v_id;
 v_new:=v_id is not null;
 if not v_new then select f.id into v_id from sunshine_v4.follow_ups f
  where f.person_id=agent_register_follow_up.person_id and f.reason=alert_type and f.agent_reference_day=v_day;end if;
 if v_new then
  insert into sunshine_v4.audit_events(actor_id,actor_role,action,entity_type,entity_id,payload)
  values(v_member,'AGENT','AGENT_FOLLOW_UP_DONE','PERSON',person_id,
   jsonb_build_object('person_id',person_id,'follow_up_id',v_id,'alert_type',alert_type,'note',note));
 end if;
 return (select jsonb_build_object('ok',true,'follow_up_id',f.id,'person_id',f.person_id,'alert_type',f.reason,
  'date',f.agent_reference_day,'completed_at',f.completed_at,'assigned_to',f.assigned_to,'already_registered',not v_new)
  from sunshine_v4.follow_ups f where f.id=v_id);
exception when others then
 get stacked diagnostics v_state=returned_sqlstate,v_message=message_text,v_detail=pg_exception_detail;
 return private.expense_error(v_state,v_message,v_detail);
end $$;

-- Extract the existing read-only commission and monthly-house calculations once, without impersonating users.
do $extract$
declare v text;v_name text;v_args text;
begin
 foreach v_name in array array['v4_finance_commission_control','v4_house_monthly_status'] loop
  v_args:=case v_name when 'v4_house_monthly_status' then 'date' else 'date,date,text' end;
  v:=pg_get_functiondef(('public.'||v_name||'('||v_args||')')::regprocedure);
  v:=replace(v,'FUNCTION public.'||v_name||'(','FUNCTION private.agent_core_'||v_name||'(');
  v:=replace(v,'perform public.v4_bind_authenticated_user();','');
  v:=regexp_replace(v,'perform sunshine_v4.v4_assert_permission\(''[^'']+''\);','','g');
  -- Existing ::date expressions in the commission core now consistently follow São Paulo.
  v:=replace(v,'SET search_path TO', 'SET timezone TO ''America/Sao_Paulo'' SET search_path TO');
  execute v;
 end loop;
end $extract$;
create or replace function public.v4_finance_commission_control(p_start date,p_end date,p_basis text default 'RECEIPT') returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform private.sunshine_finance_guard('commission.read');
 return private.agent_core_v4_finance_commission_control(p_start,p_end,p_basis);
end $$;
-- Keep the table-returning house wrapper's signature and grants, replacing only its body.
do $house_wrapper$
declare v text;
begin
 v:=pg_get_functiondef('public.v4_house_monthly_status(date)'::regprocedure);
 v:=left(v,strpos(v,'AS $function$')-1)||$body$AS $function$
 begin
 perform private.sunshine_finance_guard('house.read');
 return query select * from private.agent_core_v4_house_monthly_status(p_reference_month);
 end $function$;$body$;
 execute v;
end $house_wrapper$;

-- Shared relationship evidence: one purchase is one contract, not one instalment or payment.
create function private.agent_purchase_items(p_reference date) returns table(person_id uuid,contract_id uuid,item_id uuid,
 purchased_on date,service_category text,service_name text) language sql stable security definer set search_path='' as $$
 select coalesce(i.beneficiary_person_id,c.customer_person_id),c.id,i.id,
 (coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo')::date,i.service_category,
 coalesce(nullif(w.title,''),nullif(i.event_name,''),i.service_name)
 from sunshine_v4.contract_items i join sunshine_v4.contracts c on c.id=i.contract_id left join sunshine_v4.works w on w.id=i.work_id
 where coalesce(c.status,'CONFIRMED')<>'CANCELLED' and i.amount_cents>0
 and not exists(select 1 from sunshine_v4.obligations o where o.contract_item_id=i.id and o.explicit_status='CANCELLED')
 and (coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo')::date<=p_reference;
$$;
create function private.agent_alert_candidates(p_reference date) returns table(alert_type text,person_id uuid,fact text,
 last_purchase_at date,last_service_name text,priority integer,elapsed_days integer)
language sql stable security definer set search_path='' as $$
 with purchases as materialized(select * from private.agent_purchase_items(p_reference)),
 stats as(select person_id,count(distinct contract_id) purchases,bool_and(service_category='AGRADO_COLETIVO') only_agrado,
 max(purchased_on) last_on from purchases group by person_id),
 latest as(select distinct on(person_id) person_id,service_name from purchases order by person_id,purchased_on desc,item_id),
 consultation_events as (
  select person_id,purchased_on occurred_on from purchases where service_category in ('CONSULTA','PERGUNTA')
  union all select a.person_id,(coalesce(a.answered_at,a.starts_at,a.created_at) at time zone 'America/Sao_Paulo')::date
  from sunshine_v4.appointments a where (a.event_type in ('CONSULTA','PERGUNTA','CONSULTATION','QUESTION'))
   and (a.status in ('DONE','COMPLETED','REALIZADO') or (a.event_type in ('PERGUNTA','QUESTION') and a.question_status='ANSWERED'))
 ), consultations as(select person_id,max(occurred_on) occurred_on from consultation_events where occurred_on<=p_reference group by 1),
 particular_events as (
  select person_id,purchased_on occurred_on,service_name from purchases where service_category='TRABALHO_PARTICULAR'
  union all select wr.beneficiary_person_id,(w.scheduled_at at time zone 'America/Sao_Paulo')::date,w.title
  from sunshine_v4.work_registrations wr join sunshine_v4.works w on w.id=wr.work_id
  left join sunshine_v4.contract_items i on i.id=wr.contract_item_id
  where w.status in ('DONE','COMPLETED') and wr.status<>'CANCELLED'
   and (w.work_type in ('PARTICULAR','TRABALHO_PARTICULAR') or i.service_category='TRABALHO_PARTICULAR')
 ), particulars as(select distinct on(person_id) person_id,occurred_on,service_name from particular_events
  where occurred_on<=p_reference order by person_id,occurred_on desc,service_name),
 house_months as(select distinct m::date as reference_month from sunshine_v4.house_members hm
  cross join lateral generate_series(date_trunc('month',coalesce(hm.joined_at,hm.created_at::date)),date_trunc('month',p_reference::timestamp),interval '1 month')m
  where hm.status in ('ACTIVE','ATIVO') and hm.left_at is null),
 house as(select h.person_id,min(h.billing_due_date) due_on from house_months m
  cross join lateral private.agent_core_v4_house_monthly_status(m.reference_month)h
  where h.pending_cents>0 and not h.billing_exempt and h.billing_due_date<p_reference group by h.person_id),
 candidates as (
  select 'MEMBRO_CASA_ATRASADO'::text typ,h.person_id,'Mensalidade com vencimento em '||to_char(h.due_on,'DD/MM/YYYY')||' permanece com saldo pendente.' fact,
   1 priority,p_reference-h.due_on days,false is_exclusive from house h
  union all select 'TRABALHO_PARTICULAR_RECENTE',p.person_id,'Fez trabalho particular ('||coalesce(p.service_name,'serviço cadastrado')||') em '||to_char(p.occurred_on,'DD/MM/YYYY')||'.',2,p_reference-p.occurred_on,false from particulars p
  union all select 'CONSULTA_SEM_TRABALHO',q.person_id,'Fez consulta ou pergunta em '||to_char(q.occurred_on,'DD/MM/YYYY')||' e não comprou trabalho depois.',3,p_reference-q.occurred_on,false from consultations q
   where not exists(select 1 from purchases p where p.person_id=q.person_id and p.purchased_on>=q.occurred_on and p.service_category in ('TRABALHO_PARTICULAR','TRABALHO_COLETIVO','TRABALHO_COLETIVO_PREMIUM','AGRADO_COLETIVO'))
  union all select 'PRIMEIRA_COMPRA_SEM_RETORNO',s.person_id,'Fez sua única compra em '||to_char(s.last_on,'DD/MM/YYYY')||' e não voltou a comprar.',4,p_reference-s.last_on,true from stats s where s.purchases=1
  union all select 'SO_AGRADO_COLETIVO',s.person_id,'Fez agrado coletivo em '||to_char(s.last_on,'DD/MM/YYYY')||' e não comprou mais.',5,p_reference-s.last_on,false from stats s where s.only_agrado
  union all select 'ESFRIANDO',s.person_id,'Fez '||s.purchases||' compras; a última foi em '||to_char(s.last_on,'DD/MM/YYYY')||'.',6,p_reference-s.last_on,false from stats s where s.purchases>=2
  union all select 'INATIVA',s.person_id,'Não compra desde '||to_char(s.last_on,'DD/MM/YYYY')||'.',7,p_reference-s.last_on,true from stats s
  union all select 'LEAD_SEM_COMPRA',p.id,'Cadastro em '||to_char(p.created_at at time zone 'America/Sao_Paulo','DD/MM/YYYY')||' sem nenhuma compra.',8,
   p_reference-(p.created_at at time zone 'America/Sao_Paulo')::date,true from sunshine_v4.people p where not exists(select 1 from purchases x where x.person_id=p.id)
 )
 select c.typ,c.person_id,c.fact,s.last_on,l.service_name,c.priority,c.days
 from candidates c join public.agent_alert_rules r on r.alert_type=c.typ and r.active
 join sunshine_v4.people p on p.id=c.person_id left join stats s on s.person_id=c.person_id left join latest l on l.person_id=c.person_id
 where coalesce(p.status,'ACTIVE')<>'INACTIVE'
 and case when c.is_exclusive then c.days>r.days_min else c.days>=r.days_min end and (r.days_max is null or c.days<=r.days_max)
 and not exists(select 1 from sunshine_v4.follow_ups f where f.person_id=c.person_id and f.reason=c.typ and f.status='DONE'
  and (f.completed_at at time zone 'America/Sao_Paulo')::date<=p_reference
  and (f.completed_at at time zone 'America/Sao_Paulo')::date>p_reference-r.cooldown_days);
$$;
create function private.agent_relationship_alerts(p_reference date) returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb;
begin
 if p_reference is null or not isfinite(p_reference) then return jsonb_build_object('ok',false,'code','DATA_INVALIDA','message','Informe uma data válida.');end if;
 with per_person as(select *,row_number() over(partition by person_id order by priority) person_rank from private.agent_alert_candidates(p_reference)),
 per_type as(select c.*,row_number() over(partition by c.alert_type order by c.elapsed_days desc,c.person_id) type_rank
  from per_person c where person_rank=1),
 treated as(select reason,count(distinct person_id) n from sunshine_v4.follow_ups where status='DONE'
  and (completed_at at time zone 'America/Sao_Paulo')::date=p_reference group by reason)
 select coalesce(jsonb_agg(jsonb_build_object('alert_type',a.alert_type,'person_id',a.person_id,'full_name',p.full_name,
  'fact',a.fact,'last_purchase_at',a.last_purchase_at,'last_service_name',a.last_service_name)||private.agent_phone(p.phone)
  order by a.priority,a.elapsed_days desc,a.person_id),'[]') into v
 from per_type a join sunshine_v4.people p on p.id=a.person_id join public.agent_alert_rules r on r.alert_type=a.alert_type
 left join treated t on t.reason=a.alert_type where a.type_rank<=greatest(r.max_per_day-coalesce(t.n,0),0);
 return jsonb_build_object('ok',true,'date',p_reference,'alerts',v);
end $$;

create function public.register_agent_follow_up(person_id uuid,alert_type text,from_phone text,note text) returns jsonb
language sql security invoker set search_path='' as $$ select private.agent_register_follow_up(person_id,alert_type,from_phone,note); $$;
create function public.get_relationship_alerts(p_reference date) returns jsonb
language sql security invoker set search_path='' as $$ select private.agent_relationship_alerts(p_reference); $$;

-- Explicit grants after every function has been created.
do $acl$
declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='private' and p.proname like 'agent_%') or (n.nspname='public' and p.proname in
  ('get_birthdays_for_agent','get_relationship_alerts','register_agent_follow_up','get_finance_period','v4_agent_closing_text')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $acl$;
grant execute on function private.agent_rules_admin() to authenticated;
grant execute on function public.v4_agent_closing_text(date,date,text,uuid,text) to authenticated;
notify pgrst,'reload schema';
