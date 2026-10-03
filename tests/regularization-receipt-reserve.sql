-- Exercise the reported obligation without persisting any payment or responsibility.
begin;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team_members where active and lower(full_name)='yasmin' limit 1),true);
do $test$
declare
 v_obligation uuid;v_item uuid;v_person uuid;v_responsible uuid;v_other uuid;v_result jsonb;v_dashboard jsonb;
 v_a_sep uuid;v_a_oct uuid;v_key text:='test-regularize-'||gen_random_uuid();v_before bigint[];v_after bigint[];v_failed boolean:=false;
begin
 select o.id,i.id,coalesce(o.beneficiary_person_id,i.beneficiary_person_id)
 into v_obligation,v_item,v_person
 from sunshine_v4.obligations o join sunshine_v4.contract_items i on i.id=o.contract_item_id
 join sunshine_v4.people bp on bp.id=coalesce(o.beneficiary_person_id,i.beneficiary_person_id)
 where lower(bp.full_name)='edna barboza' and o.total_cents=22000 and i.responsible_member_id is null
 and not exists(select 1 from sunshine_v4.payment_allocations a where a.obligation_id=o.id);
 if v_obligation is null then raise exception 'Reported open obligation not found';end if;
 select id into v_responsible from sunshine_v4.team_members where active and lower(full_name)='rosely';
 select id into v_other from sunshine_v4.team_members where active and lower(full_name)='yasmin';
 select array[(select count(*) from sunshine_v4.contracts),(select count(*) from sunshine_v4.contract_items),(select count(*) from sunshine_v4.work_registrations)] into v_before;

 begin
  perform public.v4_api_regularize_obligation(v_obligation,jsonb_build_object('mode','MANUAL','receivedCents',10000,'paidAt','2026-10-03T12:00:00-03:00','idempotencyKey',v_key||'-missing'));
 exception when raise_exception then
  if sqlerrm not like 'Selecione o responsável%' then raise;end if;v_failed:=true;
 end;
 if not v_failed or exists(select 1 from sunshine_v4.payments where idempotency_key like '%'||v_key||'-missing%') then raise exception 'Missing responsible did not roll back payment';end if;

 -- UTC October timestamp still belongs to September in Sao Paulo.
 v_result:=public.v4_api_regularize_obligation(v_obligation,jsonb_build_object('mode','MANUAL','responsibleMemberId',v_responsible,'receivedCents',10000,'paidAt','2026-10-01T02:59:59Z','idempotencyKey',v_key||'-sep'));
 v_a_sep:=(v_result->>'allocationId')::uuid;
 if private.sunshine_uses_october_rule(v_a_sep) or (select sum(amount_cents) from sunshine_v4.commission_entries where allocation_id=v_a_sep)<>10000 then raise exception 'September boundary/rule failed';end if;
 if (v_result->>'pendingAfterCents')::bigint<>12000 then raise exception 'Partial regularization failed';end if;

 -- Same original sale now receives the remainder under the October rule.
 v_result:=public.v4_api_regularize_obligation(v_obligation,jsonb_build_object('mode','MANUAL','responsibleMemberId',v_responsible,'receivedCents',12000,'paidAt','2026-10-01T03:00:00Z','idempotencyKey',v_key||'-oct'));
 v_a_oct:=(v_result->>'allocationId')::uuid;
 if not private.sunshine_uses_october_rule(v_a_oct) or (select sum(amount_cents) from sunshine_v4.commission_entries where allocation_id=v_a_oct)<>8400 then raise exception 'October receipt on old sale failed';end if;
 if (v_result->>'pendingAfterCents')::bigint<>0 then raise exception 'Settlement failed';end if;
 if (select responsible_member_id from sunshine_v4.contract_items where id=v_item)<>v_responsible then raise exception 'Original responsible not saved';end if;

 update sunshine_v4.contract_items set responsible_member_id=v_other where id=v_item;
 perform sunshine_v4.v4_recalculate_item_commissions(v_item,v_other);
 if (select sum(amount_cents) from sunshine_v4.commission_entries where allocation_id=v_a_sep)<>10000
 or (select sum(amount_cents) from sunshine_v4.commission_entries where allocation_id=v_a_oct)<>8400
 or (select sum(amount_cents) from sunshine_v4.commission_entries where allocation_id=v_a_oct and beneficiary_member_id=v_other)<>5880 then raise exception 'Mixed installment recalculation corrupted policy';end if;

 v_dashboard:=public.v4_finance_dashboard_filtered('2026-10-01','2026-10-31','RECEIPT',v_other,null);
 if not exists(select 1 from jsonb_array_elements(v_dashboard->'reserveEvidence') e where e->>'allocationId'=v_a_oct::text and (e->>'amountCents')::bigint=3600) then raise exception 'Filtered receipt reserve missing';end if;
 if exists(select 1 from jsonb_array_elements(v_dashboard->'reserveEvidence') e where e->>'allocationId'=v_a_sep::text) then raise exception 'September allocation included in October reserve';end if;
 if (v_dashboard->>'reserveCents')::bigint<>(select coalesce(sum((e->>'amountCents')::bigint),0) from jsonb_array_elements(v_dashboard->'reserveEvidence') e) then raise exception 'Reserve evidence does not reconcile';end if;
 if (public.v4_finance_dashboard_filtered('2026-10-01','2026-10-31','RECEIPT',v_other,'NONEXISTENT')->>'reserveCents')::bigint<>0 then raise exception 'Category filter ignored';end if;
 select array[(select count(*) from sunshine_v4.contracts),(select count(*) from sunshine_v4.contract_items),(select count(*) from sunshine_v4.work_registrations)] into v_after;
 if v_before<>v_after then raise exception 'Regularization created new sale/item/registration';end if;
 if has_function_privilege('anon','public.v4_api_regularize_obligation(uuid,jsonb)','EXECUTE') or has_function_privilege('anon','public.v4_finance_dashboard_filtered(date,date,text,uuid,text)','EXECUTE') then raise exception 'Anonymous access granted';end if;
 perform set_config('sunshine.test_result','PASS: missing responsible rollback; original item updated; partial settlement; Sao Paulo midnight; old sale paid in October; mixed installments; reserve evidence and filters; no duplicate sale/registration; anonymous blocked',true);
end $test$;
select current_setting('sunshine.test_result') test_result;
rollback;
