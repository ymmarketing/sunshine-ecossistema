-- Read-only regression assertions against existing records; all session changes roll back.
begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team_members where active and lower(full_name)='yasmin' limit 1),true);
do $test$
declare v_person uuid;v_data jsonb;v_history jsonb;v_row jsonb;v_expected jsonb;v_failed boolean:=false;
begin
 select coalesce(o.beneficiary_person_id,i.beneficiary_person_id) into v_person
 from sunshine_v4.obligations o join sunshine_v4.contract_items i on i.id=o.contract_item_id
 join sunshine_v4.contracts c on c.id=i.contract_id
 where i.work_id is not null and coalesce(o.explicit_status,'')<>'CANCELLED' and coalesce(c.status,'CONFIRMED')<>'CANCELLED'
 and o.total_cents>coalesce((select sum(a.amount_cents) from sunshine_v4.payment_allocations a where a.obligation_id=o.id),0)
 limit 1;
 if v_person is null then raise exception 'Test requires an existing open balance linked to a work';end if;
 v_data:=public.v4_person_financial_position(v_person);
 for v_row in select value from jsonb_array_elements(v_data->'debtEvidence') loop
  select jsonb_build_object('title',w.title,'date',w.scheduled_at,'pending',o.total_cents-coalesce((select sum(a.amount_cents) from sunshine_v4.payment_allocations a where a.obligation_id=o.id),0),'itemId',i.id,'status',o.explicit_status)
  into v_expected from sunshine_v4.obligations o join sunshine_v4.contract_items i on i.id=o.contract_item_id
  left join sunshine_v4.works w on w.id=i.work_id where o.id=(v_row->>'obligationId')::uuid;
  if v_row->'pendingCents' is distinct from v_expected->'pending' or v_row->'itemId' is distinct from v_expected->'itemId'
    or v_row->'explicitStatus' is distinct from v_expected->'status' then raise exception 'Balance, identity or original status changed';end if;
  if v_expected->>'title' is not null and (v_row->'workTitle' is distinct from v_expected->'title' or v_row->'workDate' is distinct from v_expected->'date') then raise exception 'Work title/date missing';end if;
 end loop;
 v_history:=public.v4_person_detail(v_person)->'history';
 if exists(select 1 from jsonb_array_elements(v_history)x where not(x?'status') or not(x?'work_title') or not(x?'event_name')) then raise exception 'History identification metadata missing';end if;
 if has_function_privilege('anon','public.v4_person_financial_position(uuid)','EXECUTE') or has_function_privilege('anon','public.v4_person_detail(uuid)','EXECUTE') then raise exception 'Anonymous access granted';end if;
 begin
  perform set_config('request.jwt.claim.sub','',true);
  perform public.v4_person_financial_position(v_person);
 exception when insufficient_privilege then v_failed:=true;end;
 if not v_failed then raise exception 'Unauthenticated read allowed';end if;
 perform set_config('sunshine.test_result','PASS: exact work/date, unchanged balance and obligation, original status visibility, history metadata and authentication protection',true);
end $test$;
select current_setting('sunshine.test_result') as test_result;
rollback;
