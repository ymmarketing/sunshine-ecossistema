-- Read-only verification: category lists close every filtered total and include service identity.
begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team_members where active and lower(full_name)='yasmin' limit 1),true);
do $test$
declare v_result jsonb;v_cat text;v_member uuid;v_basis text;
begin
 for v_basis in select unnest(array['RECEIPT','SALE']) loop
  for v_member in select id from sunshine_v4.team_members where active union all select null::uuid loop
   v_result:=public.v4_finance_dashboard_filtered('2026-10-01','2026-10-08',v_basis,v_member,null);
   for v_cat in select jsonb_object_keys(v_result->'categories') loop
    if (select coalesce(sum((e->>'amountCents')::bigint),0)from jsonb_array_elements(v_result->'salesEvidence')e where e->>'category'=v_cat)<>(v_result->'categories'->>v_cat)::bigint then
     raise exception 'Category total does not close: %, %, %',v_basis,v_member,v_cat;
    end if;
   end loop;
   if exists(select 1 from jsonb_array_elements(v_result->'salesEvidence')e where not(e?'responsibleName' and e?'eventName' and e?'workTitle')) then raise exception 'Service identity missing';end if;
   if exists(select 1 from jsonb_array_elements(v_result->'salesEvidence')e join sunshine_v4.obligations o on o.id=(e->>'obligationId')::uuid join sunshine_v4.contract_items i on i.id=o.contract_item_id join sunshine_v4.team_members t on t.id=i.responsible_member_id where e->>'responsibleName' is distinct from t.full_name) then raise exception 'Responsible identity differs from registered service';end if;
  end loop;
 end loop;
end $test$;
rollback;
