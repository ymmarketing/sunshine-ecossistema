create function private.agent_cost_breakdown(p_start date,p_end date) returns jsonb
language sql stable security definer set search_path='' as $$
 with base as materialized(select c.*,e.scope,e.allocations,e.recurring_cost_id,
 w.destination,w.work_id receipt_work_id from private.sunshine_contribution_costs() c
 left join sunshine_v4.expenses e on c.origin='EXPENSE' and c.id=e.id::text
 left join public.work_expenses w on c.origin='RECEIPT' and c.id='receipt:'||w.id::text
 where c.occurred_on between p_start and p_end),
 fragments as (
 select b.id,'TRABALHO'::text destination,(a->>'amountCents')::bigint amount_cents,
 coalesce(nullif(a->>'workId','')::uuid,i.work_id) work_id,
 coalesce(w.title,i.service_name,s.name,'Destino cadastrado') work_name
 from base b cross join lateral jsonb_array_elements(b.allocations)a
 left join sunshine_v4.contract_items i on i.id=nullif(a->>'itemId','')::uuid
 left join sunshine_v4.works w on w.id=coalesce(nullif(a->>'workId','')::uuid,i.work_id)
 left join sunshine_v4.services s on s.id=nullif(a->>'serviceId','')::uuid
 where b.origin='EXPENSE' and b.scope<>'FIXED' and (a->>'amountCents')::bigint>0
 ), rows as (
 select destination,amount_cents,work_id,work_name from fragments
 union all
 select case when b.origin='RECEIPT' then coalesce(b.destination,'TRABALHO')
  when b.origin='EXPENSE' and (b.scope='FIXED' or b.recurring_cost_id is not null) then 'CUSTO_FIXO' else 'CASA' end,
 b.amount_cents-coalesce((select sum(f.amount_cents) from fragments f where f.id=b.id),0),b.receipt_work_id,w.title
 from base b left join sunshine_v4.works w on w.id=b.receipt_work_id
 where b.amount_cents<>coalesce((select sum(f.amount_cents) from fragments f where f.id=b.id),0)
 ), totals as(select destination,sum(amount_cents)::bigint amount_cents from rows group by 1),
 works as(select work_id,work_name,sum(amount_cents)::bigint amount_cents from rows where destination='TRABALHO' group by 1,2)
 select jsonb_build_object('groups',coalesce((select jsonb_object_agg(destination,amount_cents) from totals),'{}'),
 'works',coalesce((select jsonb_agg(to_jsonb(works) order by work_name nulls last,work_id) from works),'[]'));
$$;
do $costs$
declare d text;start_at int;end_at int;
begin
 d:=pg_get_functiondef('private.agent_finance_period(date,date)'::regprocedure);
 start_at:=strpos(d,'with costs as(');end_at:=strpos(d,'with names as(');
 if start_at=0 or end_at<start_at then raise exception 'Cost source changed; review extraction.';end if;
 d:=substr(d,1,start_at-1)||'v_result:=private.agent_cost_breakdown(p_start,p_end);v_cost_groups:=v_result->''groups'';v_works:=v_result->''works'';'||E'\n'||substr(d,end_at);
 execute d;
end $costs$;

-- Browser endpoint uses an invoker wrapper, like the other agent endpoints.
create function private.agent_ui_closing_text(p_start date,p_end date,p_basis text,p_responsible_member_id uuid,p_service_category text)
returns text language plpgsql security definer set search_path='' as $$
begin
 perform private.sunshine_finance_guard('commission.read');
 return private.agent_closing_text(public.v4_finance_commission_control_filtered(p_start,p_end,p_basis,p_responsible_member_id,p_service_category));
end $$;
create or replace function public.v4_agent_closing_text(p_start date,p_end date,p_basis text default 'RECEIPT',p_responsible_member_id uuid default null,p_service_category text default null)
returns text language sql security invoker set search_path='' as $$
 select private.agent_ui_closing_text(p_start,p_end,p_basis,p_responsible_member_id,p_service_category);
$$;
revoke all on function private.agent_cost_breakdown(date,date),private.agent_ui_closing_text(date,date,text,uuid,text) from public,anon,authenticated;
grant execute on function private.agent_cost_breakdown(date,date),private.agent_ui_closing_text(date,date,text,uuid,text) to service_role;
grant execute on function private.agent_ui_closing_text(date,date,text,uuid,text) to authenticated;
revoke update on public.agent_alert_rules from authenticated;
grant update(active,days_min,days_max,max_per_day,cooldown_days,description) on public.agent_alert_rules to authenticated;
notify pgrst,'reload schema';
