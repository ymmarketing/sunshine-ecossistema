-- All synthetic people, follow-ups, notes, audit events and rule edits roll back.
begin;
do $test$
declare p uuid;fid uuid;c uuid;r jsonb;r2 jsonb;v_phone text;v_member uuid;typ text;f text;denied boolean;
 today date:=(now() at time zone 'America/Sao_Paulo')::date;v_fin jsonb;v_dash jsonb;v_management jsonb;v_text text;v_day date;
begin
 select t.id,t.whatsapp_phone into v_member,v_phone from sunshine_v4.team_members t
 where t.active and t.whatsapp_phone is not null and private.expense_member_can_write(t.id) limit 1;
 if v_phone is null then raise exception 'No authorized real member phone';end if;
 perform set_config('request.jwt.claim.sub',(select auth_user_id::text from sunshine_v4.team_members where id=v_member),true);
 foreach f in array array['get_birthdays_for_agent(date)','get_relationship_alerts(date)','register_agent_follow_up(uuid,text,text,text)','get_finance_period(text,date,date)'] loop
  if has_function_privilege('anon','public.'||f,'EXECUTE') or has_function_privilege('authenticated','public.'||f,'EXECUTE')
   or not has_function_privilege('service_role','public.'||f,'EXECUTE') then raise exception 'Incorrect grants: %',f;end if;
 end loop;
 if private.agent_first_name(null,'BRUNA TESTE')<>'Bruna' or private.agent_first_name(null,'ângela teste')<>'Ângela'
  or private.agent_first_name('BIA','BRUNA TESTE')<>'Bia' then raise exception 'First name capitalization failed';end if;
 insert into sunshine_v4.people(full_name,birth_date,phone,status,created_at) values('__TEST_AGENT__','2000-02-29','(31) 99999-9999','ACTIVE',now()-interval '100 days') returning id into p;
 if not exists(select 1 from jsonb_array_elements(public.get_birthdays_for_agent('2027-02-28')->'people')x where x->>'person_id'=p::text and (x->>'age')::int=27)
  or exists(select 1 from jsonb_array_elements(public.get_birthdays_for_agent('2028-02-28')->'people')x where x->>'person_id'=p::text)
  or not exists(select 1 from jsonb_array_elements(public.get_birthdays_for_agent('2028-02-29')->'people')x where x->>'person_id'=p::text) then raise exception 'Leap day behavior failed';end if;
 if private.agent_phone('(31) 99999-9999')->>'phone'<>'+5531999999999' or (private.agent_phone('sem telefone')->>'phone_valid')::boolean then raise exception 'Phone normalization failed';end if;
 r:=public.register_agent_follow_up(gen_random_uuid(),'LEAD_SEM_COMPRA',v_phone,'temporary test');
 if r->>'code'<>'PESSOA_NAO_ENCONTRADA' then raise exception 'Missing person: %',r;end if;
 r:=public.register_agent_follow_up(p,'NOT_A_TYPE',v_phone,'temporary test');
 if r->>'code'<>'TIPO_ALERTA_INVALIDO' then raise exception 'Invalid type: %',r;end if;
 r:=public.register_agent_follow_up(p,'LEAD_SEM_COMPRA','+5500000000000','temporary test');
 if r->>'code'<>'NAO_AUTORIZADO' then raise exception 'Unknown member accepted: %',r;end if;
 -- The same person also qualifies for first-purchase and consultation alerts.
 insert into sunshine_v4.contracts(customer_person_id,sold_at) values(p,now()-interval '40 days') returning id into c;
 insert into sunshine_v4.contract_items(contract_id,beneficiary_person_id,service_code,service_name,service_category,amount_cents)
 values(c,p,'TEST','Consulta de teste','CONSULTA',100);
 if not exists(select 1 from private.agent_alert_candidates(today)x where x.person_id=p and x.alert_type='CONSULTA_SEM_TRABALHO') then raise exception 'Consultation fixture missing';end if;
 execute 'set local role service_role';
 r:=public.register_agent_follow_up(p,'CONSULTA_SEM_TRABALHO',v_phone,'temporary test');
 r2:=public.register_agent_follow_up(p,'CONSULTA_SEM_TRABALHO',v_phone,'must not overwrite');
 execute 'reset role';
 if r->>'ok'<>'true' or r2->>'ok'<>'true' or r->>'follow_up_id' is distinct from r2->>'follow_up_id'
  or r->>'already_registered'<>'false' or r2->>'already_registered'<>'true' then raise exception 'Idempotency failed: %, %',r,r2;end if;
 if (select count(*) from sunshine_v4.follow_ups where person_id=p)<>1
  or (select count(*) from sunshine_v4.audit_events where entity_id=p and action='AGENT_FOLLOW_UP_DONE')<>1 then raise exception 'Repeated side effects';end if;
 if exists(select 1 from private.agent_alert_candidates(today)x where x.person_id=p and x.alert_type='CONSULTA_SEM_TRABALHO')
  or not exists(select 1 from private.agent_alert_candidates(today)x where x.person_id=p and x.alert_type='PRIMEIRA_COMPRA_SEM_RETORNO') then raise exception 'Cooldown must be scoped to person AND type';end if;
 if not exists(select 1 from jsonb_array_elements(public.v4_person_detail(p)->'history')x where x->>'event_type'='AGENT_FOLLOW_UP') then raise exception 'Missing timeline event';end if;
 update public.agent_alert_rules set days_min=10000 where alert_type='PRIMEIRA_COMPRA_SEM_RETORNO';
 if exists(select 1 from private.agent_alert_candidates(today)x where x.person_id=p and x.alert_type='PRIMEIRA_COMPRA_SEM_RETORNO') then raise exception 'Rule edit not immediate';end if;
 update public.agent_alert_rules set days_min=14 where alert_type='PRIMEIRA_COMPRA_SEM_RETORNO';
 update sunshine_v4.people set status='INACTIVE' where id=p;
 if exists(select 1 from private.agent_alert_candidates(today)x where x.person_id=p) then raise exception 'Inactive person returned';end if;
 if public.register_agent_follow_up(p,'LEAD_SEM_COMPRA',v_phone,'test')->>'code'<>'PESSOA_INATIVA' then raise exception 'Inactive write accepted';end if;
 -- Real data: birthday screen and agent identities must match.
 if (select count(*) from jsonb_array_elements(public.v4_birthdays(today,extract(month from today)::int))x where (x->>'isToday')::boolean)
  <>jsonb_array_length(public.get_birthdays_for_agent(today)->'people') then raise exception 'Birthday screen mismatch';end if;
 foreach v_day in array array[date '2026-10-14',date '2026-10-01'] loop
  v_fin:=public.get_finance_period(v_phone,v_day,case when v_day='2026-10-01' then date '2026-10-28' else v_day end);
  if v_fin->>'ok'<>'true' then raise exception 'Finance error: %',v_fin;end if;
  v_dash:=public.v4_finance_dashboard_filtered(v_day,case when v_day='2026-10-01' then date '2026-10-28' else v_day end,'RECEIPT',null,null);
  v_text:=public.v4_agent_closing_text(v_day,case when v_day='2026-10-01' then date '2026-10-28' else v_day end,'RECEIPT',null,null);
  if (v_fin->>'house_reserve_cents')::bigint<>(v_dash->>'reserveCents')::bigint or v_fin->>'texto_fechamento' is distinct from v_text then raise exception 'Reserve or closing text differs from screen';end if;
  if (v_fin->>'revenue_cents')::bigint<>(select coalesce(sum(gross_cents),0) from private.sunshine_receipts() where paid_on between v_day and case when v_day='2026-10-01' then date '2026-10-28' else v_day end)
   or (v_fin->'costs'->>'total_cents')::bigint<>(select coalesce(sum(amount_cents),0) from private.sunshine_contribution_costs() where occurred_on between v_day and case when v_day='2026-10-01' then date '2026-10-28' else v_day end) then raise exception 'Canonical financial totals differ';end if;
 end loop;
 if public.get_finance_period(v_phone,null,today)->>'code'<>'DATA_INVALIDA'
  or public.get_finance_period(v_phone,today,today-1)->>'code'<>'PERIODO_INVALIDO'
  or public.get_finance_period(v_phone,'1900-01-01','1900-01-01')->>'code'<>'SEM_DADOS' then raise exception 'Finance validation failed';end if;
 -- Actual caller roles cannot execute agent endpoints, including with a valid human JWT.
 foreach typ in array array['anon','authenticated'] loop
  denied:=false;
  execute 'set local role '||typ;
  begin perform public.get_birthdays_for_agent(today);exception when insufficient_privilege then denied:=true;end;
  execute 'reset role';
  if not denied then raise exception 'Unauthorized role executed agent RPC: %',typ;end if;
 end loop;
 perform set_config('sunshine.agent_test_result','PASS: first_name, leap day, permissions, member validation, missing person/type, idempotency, timeline, scoped cooldown, live rules, inactive exclusion, birthday parity, day/period finance, reserve and closing parity',true);
end $test$;
select current_setting('sunshine.agent_test_result') result;
rollback;
