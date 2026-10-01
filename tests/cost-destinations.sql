-- Test registered expense destinations in one rolled-back transaction.
begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team_members where active and lower(full_name)='yasmin' limit 1),true);
do $test$
declare v_dest jsonb;v_data jsonb;v_result jsonb;v_replay jsonb;v_work uuid;v_item uuid;v_service uuid;v_id uuid;v_failed boolean;v_case integer;
 v_key text:='test-cost-destinations-'||gen_random_uuid();
begin
 v_dest:=public.v4_cost_destinations();
 select id into v_work from sunshine_v4.works where status='DONE' limit 1;
 select id into v_item from sunshine_v4.contract_items where service_category='TRABALHO_PARTICULAR' limit 1;
 select id into v_service from sunshine_v4.services where name ilike 'Agrado Coletivo%' limit 1;
 if v_work is null or v_item is null or v_service is null then raise exception 'Test requires existing past work, private item and Agrado service';end if;
 if not exists(select 1 from jsonb_array_elements(v_dest)x where x->>'kind'='WORK' and x->>'id'=v_work::text)
  or not exists(select 1 from jsonb_array_elements(v_dest)x where x->>'kind'='ITEM' and x->>'id'=v_item::text and x->>'label' like 'Trabalho particular — %')
  or not exists(select 1 from jsonb_array_elements(v_dest)x where x->>'kind'='SERVICE' and x->>'id'=v_service::text) then raise exception 'Registered destination missing';end if;
 if has_function_privilege('anon','public.v4_cost_destinations()','EXECUTE') then raise exception 'Anonymous destination access allowed';end if;

 v_data:=jsonb_build_object('description','VALIDAÇÃO TEMPORÁRIA — não manter','category','ESTOQUE','scope','SHARED','amountCents',3000,'occurredOn','2099-02-01','status','PENDING','idempotencyKey',v_key,
  'allocations',jsonb_build_array(jsonb_build_object('workId',v_work,'amountCents',1000),jsonb_build_object('itemId',v_item,'amountCents',1000),jsonb_build_object('serviceId',v_service,'amountCents',1000)));
 v_result:=public.v4_api_save_expense(null,v_data);v_id:=(v_result->>'id')::uuid;
 if v_result->'allocations' is distinct from v_data->'allocations' then raise exception 'Typed allocation was not saved';end if;
 v_replay:=public.v4_api_save_expense(null,v_data);
 if (v_replay->>'id')::uuid<>v_id then raise exception 'Typed allocation retry duplicated';end if;
 v_data:=v_data||jsonb_build_object('scope','WORK','amountCents',3000,'allocations',jsonb_build_array(jsonb_build_object('itemId',v_item,'amountCents',3000)));
 v_result:=public.v4_api_save_expense(v_id,v_data);
 if v_result->'allocations'->0->>'itemId'<>v_item::text then raise exception 'Private person destination edit failed';end if;

 -- Reject unallocated stock, missing/fake/multiple destinations, duplicates and incorrect totals.
 for v_case in 1..6 loop
  v_failed:=false;
  begin
   perform public.v4_api_save_expense(null,v_data||jsonb_build_object('idempotencyKey',v_key||'-invalid-'||v_case)||case v_case
    when 1 then jsonb_build_object('scope','STOCK','allocations','[]'::jsonb)
    when 2 then jsonb_build_object('allocations',jsonb_build_array(jsonb_build_object('amountCents',3000)))
    when 3 then jsonb_build_object('allocations',jsonb_build_array(jsonb_build_object('workId',gen_random_uuid(),'amountCents',3000)))
    when 4 then jsonb_build_object('allocations',jsonb_build_array(jsonb_build_object('workId',v_work,'itemId',v_item,'amountCents',3000)))
    when 5 then jsonb_build_object('scope','SHARED','allocations',jsonb_build_array(jsonb_build_object('workId',v_work,'amountCents',1000),jsonb_build_object('workId',v_work,'amountCents',2000)))
    else jsonb_build_object('allocations',jsonb_build_array(jsonb_build_object('serviceId',v_service,'amountCents',2999))) end);
  exception when raise_exception then v_failed:=true;end;
  if not v_failed then raise exception 'Invalid destination accepted: %',v_case;end if;
 end loop;
 v_result:=public.v4_api_save_expense(v_id,v_data||jsonb_build_object('scope','FIXED','allocations','[]'::jsonb));
 if v_result->>'scope'<>'FIXED' or jsonb_array_length(v_result->'allocations')<>0 then raise exception 'Fixed expense failed';end if;
 perform set_config('sunshine.test_result','PASS: registered completed works, private work by person, Agrado service, mixed rateio, edit/retry, required and unique destinations, exact totals, fixed expense and anonymous protection',true);
end $test$;
select current_setting('sunshine.test_result') as test_result;
rollback;
