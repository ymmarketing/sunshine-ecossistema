-- Exercise the real membership API and monthly reads; every test record rolls back.
begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team_members where active and lower(full_name)='yasmin' limit 1),true);
do $test$
declare p uuid;h uuid;r jsonb;n bigint;failed boolean;
begin
 perform public.v4_bind_authenticated_user();
 if has_function_privilege('anon','public.v4_api_inactivate_house_member(uuid,date,text)','execute') then raise exception 'Anonymous can inactivate';end if;
 p:=public.v4_api_save_person(null,'{"fullName":"TESTE INATIVACAO ROLLBACK","status":"ACTIVE"}');
 h:=public.v4_api_create_house_member(p,'2026-01-01',20000,10::smallint,false,null,'Teste reversível');
 select count(*) into n from sunshine_v4.payments;
 if not exists(select 1 from public.v4_house_monthly_status('2026-01-01')x where x.house_member_id=h and x.pending_cents=20000) then raise exception 'Missing initial pending month';end if;
 update sunshine_v4.house_members set regularized_through='2026-10-31',regularization_note='Conferência histórica',regularized_at=now() where id=h;
 if not exists(select 1 from public.v4_house_monthly_status('2026-01-01')x where x.house_member_id=h and x.pending_cents=0 and x.paid_cents=0 and x.payment_status='REGULARIZADO') then raise exception 'Historical balance not regularized';end if;
 if not exists(select 1 from public.v4_house_monthly_status('2026-11-01')x where x.house_member_id=h and x.pending_cents=20000) then raise exception 'Clearance incorrectly exempted future month';end if;
 if (select count(*) from sunshine_v4.payments)<>n then raise exception 'False receipt created';end if;
 failed:=false;
 begin perform public.v4_api_inactivate_house_member(h,'2099-01-01',null);exception when raise_exception then failed:=true;end;
 if not failed then raise exception 'Future departure accepted';end if;
 r:=public.v4_api_inactivate_house_member(h,'2026-10-31','Teste de saída');
 if r->>'status'<>'INACTIVE' or not exists(select 1 from public.v4_house_members()x where x.house_member_id=h and x.status='INACTIVE' and x.left_at='2026-10-31') then raise exception 'Inactive roster missing';end if;
 if exists(select 1 from public.v4_house_monthly_status('2026-11-01')x where x.house_member_id=h) then raise exception 'Inactive member still billed';end if;
 if not exists(select 1 from sunshine_v4.people where id=p and status='ACTIVE') then raise exception 'Person incorrectly deactivated';end if;
 r:=public.v4_api_inactivate_house_member(h,'2026-10-31','Teste repetido');
 if not (r->>'alreadyInactive')::boolean then raise exception 'Inactivation replay failed';end if;
 if not exists(select 1 from sunshine_v4.audit_events where entity_id=h and action='HOUSE_MEMBER_INACTIVATED') then raise exception 'Missing audit';end if;
end $test$;
rollback;
select 'PASS: permission, historical clearance without cash, future month remains due, future departure rejected, inactivation, roster, person history, idempotent retry, audit, rollback' result;
