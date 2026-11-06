-- 05/11/2026 (Yasmin): custos fixos conforme o quadro oficial (valores e vencimentos), retroativo a outubro;
-- aluguel e pró-labore Yasmin deixam de ser custo da Sunshine; imposto parcelado entra;
-- comissões da equipe (não responsáveis) viram custo para a margem após comissões.

alter table sunshine_v4.recurring_fixed_costs add column if not exists due_day smallint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='recurring_fixed_costs_due_day_check') then
    alter table sunshine_v4.recurring_fixed_costs add constraint recurring_fixed_costs_due_day_check check (due_day is null or due_day between 1 and 31);
  end if;
end $$;

-- Gerador: o lançamento do mês cai no dia do vencimento (limitado ao último dia do mês).
create or replace function private.sunshine_generate_recurring_costs(p_start date, p_end date)
 returns integer language plpgsql security definer set search_path to ''
as $function$
declare v_count integer;v_attached integer;v_previous_actor text;v_actor uuid;
begin
 if p_start is null or p_end is null or p_start>p_end then return 0;end if;
 if p_end>p_start+interval '100 years' then raise exception 'Intervalo de recorrência inválido.';end if;
 perform pg_advisory_xact_lock(hashtextextended('sunshine-recurring-costs',0));
 insert into sunshine_v4.expenses(description,category,scope,amount_cents,occurred_on,status,allocations,
   notes,idempotency_key,created_by,recurring_cost_id,competence_month)
 select r.description||' - '||to_char(m.month,'MM/YYYY'),r.category,'FIXED',
   case when r.annual_amount_cents is not null and extract(month from m.month)=12
     then r.annual_amount_cents-11*r.amount_cents else r.amount_cents end,
   least((m.month+(coalesce(r.due_day,1)-1))::date,(m.month+interval '1 month'-interval '1 day')::date),
   'PENDING','[]'::jsonb,r.notes,replace(r.key_format,'{month}',to_char(m.month,'YYYY-MM')),r.created_by,r.id,m.month
 from sunshine_v4.recurring_fixed_costs r
 cross join lateral (select d::date as month from generate_series(date_trunc('month',p_start),date_trunc('month',p_end),interval '1 month') d) m
 where r.active and m.month>=r.start_month and (r.end_month is null or m.month<=r.end_month)
 on conflict(idempotency_key) do nothing;
 get diagnostics v_count=row_count;
 update sunshine_v4.expenses e set recurring_cost_id=r.id,competence_month=date_trunc('month',e.occurred_on)::date
 from sunshine_v4.recurring_fixed_costs r
 where e.recurring_cost_id is null and e.idempotency_key=replace(r.key_format,'{month}',to_char(e.occurred_on,'YYYY-MM'))
   and e.occurred_on between date_trunc('month',p_start)::date and (date_trunc('month',p_end)+interval '1 month'-interval '1 day')::date;
 get diagnostics v_attached=row_count;
 if v_count>0 or v_attached>0 then
  v_previous_actor:=current_setting('app.user_id',true);
  if nullif(v_previous_actor,'') is null then
   select created_by into v_actor from sunshine_v4.recurring_fixed_costs order by created_at,id limit 1;
   perform set_config('app.user_id',v_actor::text,true);
  end if;
  perform sunshine_v4.v4_write_audit('RECURRING_COSTS_GENERATED','recurring_fixed_cost',null,
   jsonb_build_object('start',p_start,'end',p_end,'created',v_count,'adopted',v_attached,'automatic',auth.uid() is null));
  if nullif(v_previous_actor,'') is null then perform set_config('app.user_id',coalesce(v_previous_actor,''),true);end if;
 end if;
 return v_count;
end $function$;

-- Cadastro dos fixos conforme o quadro.
do $$
declare v_note text:=' | 05/11/2026: valor e vencimento conforme quadro de custos fixos da Yasmin.';
declare v_actor uuid;
begin
 select created_by into v_actor from sunshine_v4.recurring_fixed_costs order by created_at,id limit 1;
 perform set_config('app.user_id',v_actor::text,true);
 update sunshine_v4.recurring_fixed_costs r set amount_cents=x.cents,due_day=x.due,description=coalesce(x.descr,r.description),
   notes=r.notes||v_note,updated_at=now()
 from (values ('lourdes',162000,1,null),('certificado',1667,1,null),('contador',35000,5,null),('telefone',5000,15,'Plano de celular'),
   ('manychat',15000,15,null),('instagram',5600,15,null),('pronampe',133300,20,null),('imposto',120000,25,null)) x(code,cents,due,descr)
 where r.code=x.code;
 update sunshine_v4.recurring_fixed_costs set active=false,updated_at=now(),
   notes=notes||' | 05/11/2026: deixou de ser custo da Sunshine por decisão da Yasmin (fora do quadro de fixos), desde outubro/2026.'
 where code in ('aluguel','yasmin');
 insert into sunshine_v4.recurring_fixed_costs(code,description,category,amount_cents,start_month,active,key_format,notes,created_by,due_day)
 select 'imposto-parcelado','Imposto parcelado','OPERACIONAL',34000,date '2026-10-01',true,'fixed:{month}:imposto-parcelado',
   'Parcelamento de imposto: R$ 340,00/mês, vencimento dia 10. Cadastro conforme quadro de custos fixos da Yasmin em 05/11/2026.',v_actor,10
 where not exists (select 1 from sunshine_v4.recurring_fixed_costs where code='imposto-parcelado');

 -- Lançamentos de outubro e novembro já gerados: valor (só pendentes) e data de vencimento.
 update sunshine_v4.expenses e set
   amount_cents=case when e.status='PENDING' then r.amount_cents else e.amount_cents end,
   occurred_on=least((e.competence_month+(r.due_day-1))::date,(e.competence_month+interval '1 month'-interval '1 day')::date),
   description=case when r.code='telefone' then 'Plano de celular - '||to_char(e.competence_month,'MM/YYYY') else e.description end,
   notes=coalesce(e.notes,'')||v_note,updated_at=now()
 from sunshine_v4.recurring_fixed_costs r
 where e.recurring_cost_id=r.id and r.active and r.due_day is not null and e.status<>'CANCELLED'
   and e.competence_month in (date '2026-10-01',date '2026-11-01');

 -- Aluguel e pró-labore Yasmin saem de outubro em diante.
 update sunshine_v4.expenses e set status='CANCELLED',updated_at=now(),
   notes=coalesce(e.notes,'')||' | 05/11/2026: retirado dos custos da Sunshine por decisão da Yasmin (fora do quadro de fixos).'
 from sunshine_v4.recurring_fixed_costs r
 where e.recurring_cost_id=r.id and r.code in ('aluguel','yasmin') and e.competence_month>=date '2026-10-01' and e.status<>'CANCELLED';

 perform sunshine_v4.v4_write_audit('FIXED_COSTS_TABLE_APPLIED','recurring_fixed_cost',null,
   jsonb_build_object('source','quadro de custos fixos enviado pela Yasmin','date','2026-11-05','removed',jsonb_build_array('aluguel','yasmin'),'added','imposto-parcelado'));
end $$;

select private.sunshine_generate_recurring_costs(date '2026-10-01',date_trunc('month',now() at time zone 'America/Sao_Paulo')::date);

-- Comissões da equipe: comissões de quem NÃO é o responsável pelo atendimento/trabalho,
-- sobre os recebimentos do período. A comissão do responsável continua dentro da margem.
create or replace function private.sunshine_team_commissions(p_start date, p_end date)
 returns jsonb language sql stable security definer set search_path to ''
as $function$
 with rec as (select distinct payment_id from private.sunshine_receipts() where paid_on between p_start and p_end and payment_id is not null),
 t as (
  select c.recipient_name,c.amount_cents,c.paid_cents,c.pending_cents,c.last_paid_on,
    (p.paid_at at time zone 'America/Sao_Paulo')::date as received_on,
    coalesce(nullif(btrim(i.event_name),''),w.title,i.service_name) as service,
    coalesce(bp.preferred_name,bp.full_name,p.payer_snapshot->>'name') as person,
    resp.full_name as responsible
  from sunshine_v4.commission_effective_status c
  join sunshine_v4.payment_allocations a on a.id=c.allocation_id
  join sunshine_v4.payments p on p.id=a.payment_id
  join rec on rec.payment_id=p.id
  join sunshine_v4.obligations o on o.id=a.obligation_id
  join sunshine_v4.contract_items i on i.id=o.contract_item_id
  left join sunshine_v4.people bp on bp.id=coalesce(o.beneficiary_person_id,i.beneficiary_person_id)
  left join sunshine_v4.works w on w.id=i.work_id
  left join sunshine_v4.team_members resp on resp.id=coalesce(c.responsible_member_id,i.responsible_member_id)
  where c.effective_status in ('DUE','PAID','PARTIAL')
    and c.beneficiary_member_id is not null
    and c.beneficiary_member_id is distinct from coalesce(c.responsible_member_id,i.responsible_member_id)
 )
 select jsonb_build_object(
  'totalCents',coalesce((select sum(amount_cents) from t),0),
  'paidCents',coalesce((select sum(paid_cents) from t),0),
  'pendingCents',coalesce((select sum(pending_cents) from t),0),
  'byRecipient',coalesce((select jsonb_agg(x order by x.total_cents desc) from (
     select recipient_name,sum(amount_cents)::bigint total_cents,sum(paid_cents)::bigint paid_cents,sum(pending_cents)::bigint pending_cents,count(*) items
     from t group by recipient_name) x),'[]'::jsonb),
  'evidence',coalesce((select jsonb_agg(to_jsonb(t) order by received_on desc,recipient_name) from t),'[]'::jsonb));
$function$;
revoke all on function private.sunshine_team_commissions(date,date) from public, anon, authenticated;

-- Faturamento: expõe comissões da equipe e a margem depois delas.
do $$
declare v_def text;
begin
 v_def:=pg_get_functiondef('public.v4_finance_management(date,date,integer)'::regprocedure);
 if position('teamCommissions' in v_def)=0 then
  v_def:=replace(v_def,'v_categories jsonb;','v_categories jsonb;v_team jsonb;v_team_cents bigint;');
  v_def:=replace(v_def,'v_categories:=private.agent_income_categories(p_start,p_end);',
    'v_categories:=private.agent_income_categories(p_start,p_end);'||chr(10)||
    '  v_team:=private.sunshine_team_commissions(p_start,p_end);v_team_cents:=coalesce((v_team->>''totalCents'')::bigint,0);');
  v_def:=replace(v_def,'''marginDefinition'',''REVENUE_MINUS_COSTS_EXCLUDING_COMMISSIONS'',',
    '''marginDefinition'',''REVENUE_MINUS_COSTS_EXCLUDING_COMMISSIONS'','||chr(10)||
    '    ''teamCommissions'',v_team,''teamCommissionsCents'',v_team_cents,''profitAfterTeamCents'',v_revenue-v_costs-v_team_cents,'||chr(10)||
    '    ''marginAfterTeamBp'',case when v_revenue>0 then round((v_revenue-v_costs-v_team_cents)*10000.0/v_revenue) end,');
  if position('teamCommissions' in v_def)=0 or position('v_team:=' in v_def)=0 then raise exception 'Não consegui ajustar v4_finance_management.'; end if;
  execute v_def;
 end if;
end $$;
