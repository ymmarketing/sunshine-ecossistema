-- Respect explicit international country codes before considering a Brazilian local number.
create or replace function private.agent_phone(p_phone text) returns jsonb language plpgsql immutable set search_path='' as $$
declare d text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');v text;
begin
 if btrim(coalesce(p_phone,'')) like '+%' and d not like '55%' and d ~ '^[1-9][0-9]{7,14}$' then v:='+'||d;
 else
  if length(d) in (10,11) then d:='55'||d;end if;
  if d ~ '^55[1-9][0-9]([2-5][0-9]{7}|9[0-9]{8})$' then v:='+'||d;end if;
 end if;
 return jsonb_build_object('phone',coalesce(v,p_phone),'phone_valid',v is not null);
end $$;

create function private.agent_income_categories(p_start date,p_end date) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.amount_cents desc,x.category),'[]') from (
 select coalesce(i.service_category,'OUTRO') category,sum(a.amount_cents)::bigint amount_cents
 from sunshine_v4.payment_allocations a join sunshine_v4.obligations o on o.id=a.obligation_id
 join sunshine_v4.contract_items i on i.id=o.contract_item_id join sunshine_v4.payments p on p.id=a.payment_id
 where (p.paid_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
 and p.status='PAID' and coalesce(o.explicit_status,'')<>'CANCELLED' group by 1)x;
$$;

-- Extract the exact reserve calculation currently used in the filtered financial screen.
do $shared$
declare d text;body text;start_at int;end_at int;f text;
begin
 d:=pg_get_functiondef('public.v4_finance_dashboard_filtered(date,date,text,uuid,text)'::regprocedure);
 start_at:=strpos(d,'with rows as (');end_at:=strpos(d,'-- Keep the filtered evidence');
 if start_at=0 or end_at<start_at then raise exception 'Reserve source changed; review extraction.';end if;
 body:=substr(d,start_at,end_at-start_at);
 body:=replace(body,'v_result->''salesEvidence''','p_sales');
 execute 'create function private.agent_reserve(p_sales jsonb,p_basis text) returns jsonb language plpgsql stable security definer set search_path='''''||
  ' as $fn$ declare v_reserve bigint;v_reserve_evidence jsonb;begin '||body||
  ' return jsonb_build_object(''reserveCents'',v_reserve,''reserveEvidence'',v_reserve_evidence);end $fn$';
 d:=substr(d,1,start_at-1)||'select (r->>''reserveCents'')::bigint,r->''reserveEvidence'' into v_reserve,v_reserve_evidence from (select private.agent_reserve(v_result->''salesEvidence'',p_basis) r)x;'||E'\n'||substr(d,end_at);
 execute d;
 -- The existing management screen now uses the shared category query.
 d:=pg_get_functiondef('public.v4_finance_management(date,date,integer)'::regprocedure);
 start_at:=strpos(d,'select coalesce(jsonb_agg(to_jsonb(x)),''[]'') into v_categories');
 end_at:=strpos(substr(d,start_at),'return jsonb_build_object(')+start_at-1;
 if start_at=0 or end_at<start_at then raise exception 'Income category source changed; review extraction.';end if;
 d:=substr(d,1,start_at-1)||'v_categories:=private.agent_income_categories(p_start,p_end);'||E'\n'||substr(d,end_at);
 execute d;
 -- Agent uses those same sources, without calling management's monthly-cost writer.
 d:=pg_get_functiondef('private.agent_finance_period(date,date)'::regprocedure);
 start_at:=strpos(d,'with cat as(');end_at:=strpos(d,'-- Costs originate');
 if start_at=0 or end_at<start_at then raise exception 'Agent category source changed';end if;
 d:=substr(d,1,start_at-1)||'v_categories:=private.agent_income_categories(p_start,p_end);'||E'\n'||substr(d,end_at);
 start_at:=strpos(d,'select coalesce(sum(round(a.amount_cents*');
 end_at:=strpos(substr(d,start_at),'if v_count=0')+start_at-1;
 if start_at=0 or end_at<start_at then raise exception 'Agent reserve source changed';end if;
 d:=substr(d,1,start_at-1)||$replacement$
 select (private.agent_reserve(coalesce(jsonb_agg(jsonb_build_object('evidenceId',a.id)),'[]'),'RECEIPT')->>'reserveCents')::bigint into v_reserve
 from sunshine_v4.payment_allocations a join sunshine_v4.payments p on p.id=a.payment_id
 join sunshine_v4.obligations o on o.id=a.obligation_id
 where p.status='PAID' and (p.paid_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
 and coalesce(o.explicit_status,'')<>'CANCELLED';
 $replacement$||substr(d,end_at);
 execute d;
end $shared$;
revoke all on function private.agent_income_categories(date,date),private.agent_reserve(jsonb,text) from public,anon,authenticated;
grant execute on function private.agent_income_categories(date,date),private.agent_reserve(jsonb,text) to service_role;
notify pgrst,'reload schema';
