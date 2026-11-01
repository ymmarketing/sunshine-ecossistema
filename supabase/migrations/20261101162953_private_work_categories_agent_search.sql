-- Additive metadata; legacy items are deliberately not classified by amount or name.
alter table sunshine_v4.contract_items
 add column private_work_category text,
 add column private_work_entities text,
 add column private_work_details text;
alter table sunshine_v4.contract_items add constraint private_work_metadata_valid check (
 (private_work_category is null or (service_category is not distinct from 'TRABALHO_PARTICULAR' and private_work_category in
 ('LIMPEZA_ESPIRITUAL','AGRADO','DIVORCIO_ENERGETICO','ADOCAMENTO','AFASTAMENTO_RIVAL','BICHO','OUTROS')))
 and (private_work_category is distinct from 'AGRADO' or length(btrim(coalesce(private_work_entities,'')))>0)
 and (private_work_category is distinct from 'OUTROS' or length(btrim(coalesce(private_work_details,'')))>0)
 and coalesce(length(private_work_entities),0)<=4000 and coalesce(length(private_work_details),0)<=10000
);
create index contract_items_private_work_category_idx on sunshine_v4.contract_items(private_work_category)
 where service_category='TRABALHO_PARTICULAR';

-- Extend the existing read-only agent surface. Preserve all existing column positions.
create or replace view agent_ro.itens_venda as
 select id,contract_id,beneficiary_person_id,service_id,service_code,service_name,service_category,
 amount_cents,work_id,responsible_member_id,reference_month,event_name,question_text,created_at,
 private_work_category,private_work_entities,private_work_details from sunshine_v4.contract_items;
-- This schema is private, not exposed to anon/authenticated. The view is an intentional
-- projection for the existing restricted agent_reader, with no base-table write privileges.
create view agent_ro.trabalhos_particulares as
 select i.id item_id,i.contract_id,coalesce(i.beneficiary_person_id,c.customer_person_id) person_id,
 p.full_name person_name,p.phone,i.service_name,i.private_work_category,i.private_work_entities,
 i.private_work_details,i.responsible_member_id,t.full_name responsible_name,i.amount_cents,
 coalesce(c.sold_at,c.created_at) sold_at,c.status,
 fp.first_paid_on,fp.payment_id,
 case when i.private_work_category='LIMPEZA_ESPIRITUAL' then fp.first_paid_on+21 end return_due_on
 from sunshine_v4.contract_items i join sunshine_v4.contracts c on c.id=i.contract_id
 left join sunshine_v4.people p on p.id=coalesce(i.beneficiary_person_id,c.customer_person_id)
 left join sunshine_v4.team_members t on t.id=i.responsible_member_id
 left join lateral (
  select (pay.paid_at at time zone 'America/Sao_Paulo')::date first_paid_on,pay.id payment_id
  from sunshine_v4.obligations o join sunshine_v4.payment_allocations a on a.obligation_id=o.id
  join sunshine_v4.payments pay on pay.id=a.payment_id
  where o.contract_item_id=i.id and coalesce(o.explicit_status,'')<>'CANCELLED'
   and pay.status='PAID' and pay.amount_cents>0 and a.amount_cents>0
   and not exists(select 1 from sunshine_v4.financial_voids v where v.restored_at is null
    and (v.allocation_id=a.id or (v.payment_id=pay.id and v.allocation_id is null)))
  order by pay.paid_at,pay.id limit 1
 ) fp on true
 where i.service_category='TRABALHO_PARTICULAR' and coalesce(c.status,'')<>'CANCELLED'
 and not exists(select 1 from sunshine_v4.obligations o where o.contract_item_id=i.id and o.explicit_status='CANCELLED');
revoke all on agent_ro.trabalhos_particulares from public,anon,authenticated;
grant select on agent_ro.trabalhos_particulares to agent_reader;

create function private.sunshine_private_work_json(p_item uuid) returns jsonb
language sql stable set search_path='' as $$
 select coalesce((select jsonb_build_object('privateWorkCategory',private_work_category,
 'privateWorkEntities',private_work_entities,'privateWorkDetails',private_work_details,
 'firstPaidOn',first_paid_on,'returnDueOn',return_due_on) from agent_ro.trabalhos_particulares where item_id=p_item),'{}'::jsonb);
$$;
revoke all on function private.sunshine_private_work_json(uuid) from public,anon,authenticated;

create function private.sunshine_capture_private_works(p_payload jsonb,p_result jsonb) returns void
language plpgsql set search_path='' as $$
declare v_input jsonb;v_output jsonb;v_position integer;v_item uuid;v_before jsonb;v_after jsonb;
begin
 if coalesce((p_result->>'idempotent')::boolean,false) then return;end if;
 if jsonb_typeof(p_payload->'items')<>'array' or jsonb_typeof(p_result->'items')<>'array'
  or jsonb_array_length(p_payload->'items')<>jsonb_array_length(p_result->'items') then
  raise exception 'Não foi possível conferir os serviços do lançamento.';
 end if;
 for v_input,v_output,v_position in
  select s.value,t.value,s.n::integer from jsonb_array_elements(p_payload->'items') with ordinality s(value,n)
  join jsonb_array_elements(p_result->'items') with ordinality t(value,n) using(n)
 loop
  v_item:=(v_output->>'itemId')::uuid;
  if v_item is null or not exists(select 1 from sunshine_v4.contract_items where id=v_item and contract_id=(p_result->>'contractId')::uuid) then
   raise exception 'Serviço não vinculado ao lançamento confirmado.';end if;
  update sunshine_v4.contract_items set entry_position=v_position where id=v_item;
  if v_input->>'serviceCategory'<>'TRABALHO_PARTICULAR' or not(v_input?'privateWorkCategory') then continue;end if;
  if nullif(btrim(v_input->>'privateWorkCategory'),'') is null then raise exception 'Selecione a categoria do trabalho particular.';end if;
  select to_jsonb(i) into v_before from sunshine_v4.contract_items i where id=v_item;
  update sunshine_v4.contract_items set private_work_category=nullif(btrim(v_input->>'privateWorkCategory'),''),
   private_work_entities=case when v_input->>'privateWorkCategory'='AGRADO' then nullif(btrim(v_input->>'privateWorkEntities'),'') end,
   private_work_details=nullif(btrim(v_input->>'privateWorkDetails'),'') where id=v_item;
  select to_jsonb(i) into v_after from sunshine_v4.contract_items i where id=v_item;
  perform sunshine_v4.v4_write_audit('PRIVATE_WORK_CLASSIFIED','contract_item',v_item,jsonb_build_object('before',v_before,'after',v_after));
 end loop;
end $$;
revoke all on function private.sunshine_capture_private_works(jsonb,jsonb) from public,anon,authenticated;

create function public.v4_private_works(p_category text default null,p_query text default null,p_return_before date default null,p_limit integer default 200)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb;v_total bigint;
begin
 perform private.sunshine_finance_guard('person.read');
 if coalesce(length(p_query),0)>1000 then raise exception 'Busca muito longa.';end if;
 select count(*) into v_total from agent_ro.trabalhos_particulares w
 where (p_category is null or w.private_work_category=p_category)
 and (nullif(btrim(p_query),'') is null or public.agent_norm(concat_ws(' ',w.person_name,w.service_name,w.private_work_category,w.private_work_entities,w.private_work_details)) like '%'||public.agent_norm(btrim(p_query))||'%')
 and (p_return_before is null or w.return_due_on<=p_return_before);
 select coalesce(jsonb_agg(jsonb_build_object('itemId',w.item_id,'contractId',w.contract_id,'personId',w.person_id,
 'personName',w.person_name,'phone',w.phone,'serviceName',w.service_name,'privateWorkCategory',w.private_work_category,
 'privateWorkEntities',w.private_work_entities,'privateWorkDetails',w.private_work_details,'responsibleName',w.responsible_name,
 'amountCents',w.amount_cents,'firstPaidOn',w.first_paid_on,'returnDueOn',w.return_due_on,'paymentId',w.payment_id)
 order by w.sold_at desc,w.item_id),'[]') into v_rows from (
 select * from agent_ro.trabalhos_particulares w
 where (p_category is null or w.private_work_category=p_category)
 and (nullif(btrim(p_query),'') is null or public.agent_norm(concat_ws(' ',w.person_name,w.service_name,w.private_work_category,w.private_work_entities,w.private_work_details)) like '%'||public.agent_norm(btrim(p_query))||'%')
 and (p_return_before is null or w.return_due_on<=p_return_before)
 order by w.sold_at desc,w.item_id limit greatest(1,least(coalesce(p_limit,200),300))
 )w;
 return jsonb_build_object('items',v_rows,'total',v_total);
end $$;
revoke all on function public.v4_private_works(text,text,date,integer) from public,anon;
grant execute on function public.v4_private_works(text,text,date,integer) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.v4_api_register_manual_entry_operational(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  perform public.v4_bind_authenticated_user();
  v_result:=public.v4_api_register_manual_entry_with_credit(p_payload);
  perform sunshine_v4.v4_capture_questions_from_association(p_payload,v_result);
  perform private.sunshine_capture_private_works(p_payload,v_result);
  return v_result;
end
$function$;

CREATE OR REPLACE FUNCTION public.v4_api_associate_existing_payment_operational(p_payment_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  perform public.v4_bind_authenticated_user();
  v_result:=public.v4_api_associate_existing_payment_with_credit(p_payment_id,p_payload);
  perform sunshine_v4.v4_capture_questions_from_association(p_payload,v_result);
  perform private.sunshine_capture_private_works(p_payload,v_result);
  return v_result;
end
$function$;

CREATE OR REPLACE FUNCTION public.v4_api_register_asaas_entry_operational(p_entry_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  perform public.v4_bind_authenticated_user();
  v_result:=public.v4_api_register_asaas_entry_with_credit(p_entry_id,p_payload);
  perform sunshine_v4.v4_capture_questions_from_association(p_payload,v_result);
  perform private.sunshine_capture_private_works(p_payload,v_result);
  return v_result;
end
$function$;

CREATE OR REPLACE FUNCTION public.v4_api_associate_payment_group_operational(p_payment_ids uuid[] DEFAULT '{}'::uuid[], p_asaas_entry_ids uuid[] DEFAULT '{}'::uuid[], p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  perform public.v4_bind_authenticated_user();
  v_result:=public.v4_api_associate_payment_group_with_credit(
    p_payment_ids,p_asaas_entry_ids,p_payload
  );
  perform sunshine_v4.v4_capture_questions_from_association(p_payload,v_result);
  perform private.sunshine_capture_private_works(p_payload,v_result);
  return v_result;
end
$function$;

CREATE OR REPLACE FUNCTION private.sunshine_entry_receipt(p_contract uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select jsonb_build_object('contractId',c.id,'items',coalesce((select jsonb_agg(jsonb_build_object(
 'itemId',i.id,'obligationId',o.id,'beneficiaryPersonId',i.beneficiary_person_id,'amountCents',i.amount_cents,
 'allocatedCents',coalesce((select sum(a.amount_cents) from sunshine_v4.payment_allocations a where a.obligation_id=o.id),0),
 'serviceId',i.service_id,'serviceCategory',i.service_category,'responsibleMemberId',i.responsible_member_id,
 'questionText',i.question_text,'questionId',(select q.id from sunshine_v4.appointments q where q.source_contract_item_id=i.id limit 1),
 'referenceMonth',i.reference_month,'workId',i.work_id,
 'registrationId',(select r.id from sunshine_v4.work_registrations r where r.contract_item_id=i.id limit 1)
)||private.sunshine_private_work_json(i.id) order by i.entry_position nulls last,i.created_at,i.id) from sunshine_v4.contract_items i
join sunshine_v4.obligations o on o.contract_item_id=i.id where i.contract_id=c.id),'[]'))
from sunshine_v4.contracts c where c.id=p_contract;
$function$;

CREATE OR REPLACE FUNCTION public.v4_payment_detail(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sunshine_v4', 'auth', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('payment.read');
  select jsonb_build_object(
    'payment',jsonb_build_object('paymentId',pay.id,'payerName',coalesce(pp.preferred_name,pp.full_name,pay.payer_snapshot->>'name','Pagador não identificado'),
      'status',pay.status,'payerPersonId',pay.payer_person_id,'amountCents',pay.amount_cents,'paidAt',pay.paid_at,'source',pay.source,'paymentMethod',pay.payment_method,'externalRef',pay.external_ref),
    'allocations',coalesce((select jsonb_agg(jsonb_build_object('allocationId',pa.id,'itemId',ci.id,'amountCents',pa.amount_cents,
      'totalCents',ci.amount_cents,'beneficiaryPersonId',ci.beneficiary_person_id,'workId',ci.work_id,'commissionOverride',ci.commission_override,'beneficiaryName',coalesce(bp.preferred_name,bp.full_name,'Pessoa não identificada'),'serviceName',ci.service_name,
      'eventName',ci.event_name,'workTitle',w.title,'serviceCategory',ci.service_category,'responsibleMemberId',ci.responsible_member_id,
      'responsibleName',tm.full_name,'referenceMonth',ci.reference_month,'questionText',ci.question_text)||private.sunshine_private_work_json(ci.id) order by pa.allocated_at)
      from sunshine_v4.payment_allocations pa join sunshine_v4.obligations o on o.id=pa.obligation_id
      join sunshine_v4.contract_items ci on ci.id=o.contract_item_id left join sunshine_v4.people bp on bp.id=ci.beneficiary_person_id
      left join sunshine_v4.works w on w.id=ci.work_id left join sunshine_v4.team_members tm on tm.id=ci.responsible_member_id
      where pa.payment_id=pay.id),'[]'::jsonb))
  into v_result from sunshine_v4.payments pay left join sunshine_v4.people pp on pp.id=pay.payer_person_id where pay.id=p_payment_id;
  if v_result is null then raise exception 'Pagamento não encontrado.'; end if;
  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.v4_api_edit_financial_item(p_item_id uuid, p_data jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_old sunshine_v4.contract_items%rowtype;v_new sunshine_v4.contract_items%rowtype;v_obligation uuid;v_alloc bigint;v_financial boolean;
begin
 perform private.sunshine_finance_guard('record.update');
 if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Informe a justificativa da correção.';end if;
 select * into v_old from sunshine_v4.contract_items where id=p_item_id for update;
 if not found then raise exception 'Lançamento não encontrado.';end if;
 select id into v_obligation from sunshine_v4.obligations where contract_item_id=p_item_id for update;
 perform 1 from sunshine_v4.payments p where exists(select 1 from sunshine_v4.payment_allocations a where a.payment_id=p.id and a.obligation_id=v_obligation) order by p.id for update;
 select coalesce(sum(amount_cents),0) into v_alloc from sunshine_v4.payment_allocations where obligation_id=v_obligation;
 if (p_data->>'amountCents')::bigint<=0 or (p_data->>'amountCents')::bigint<v_alloc then raise exception 'O total não pode ser menor que o valor já associado.';end if;
 if not exists(select 1 from sunshine_v4.people where id=(p_data->>'beneficiaryPersonId')::uuid)
 or not exists(select 1 from sunshine_v4.team_members where id=(p_data->>'responsibleMemberId')::uuid and active) then raise exception 'Selecione beneficiário e responsável válidos.';end if;
 if nullif(p_data->>'workId','') is not null and not exists(select 1 from sunshine_v4.works where id=(p_data->>'workId')::uuid) then raise exception 'Trabalho não encontrado.';end if;
 v_financial:=v_old.responsible_member_id is distinct from (p_data->>'responsibleMemberId')::uuid
  or v_old.commission_override is distinct from nullif(p_data->'commissionOverride','null');
 update sunshine_v4.contract_items set beneficiary_person_id=(p_data->>'beneficiaryPersonId')::uuid,
  amount_cents=(p_data->>'amountCents')::bigint,work_id=nullif(p_data->>'workId','')::uuid,
  service_name=coalesce(nullif(btrim(p_data->>'serviceName'),''),service_name),event_name=nullif(btrim(p_data->>'eventName'),''),
  service_category=p_data->>'serviceCategory',responsible_member_id=(p_data->>'responsibleMemberId')::uuid,
  reference_month=nullif(p_data->>'referenceMonth','')::date,question_text=nullif(btrim(p_data->>'questionText'),''),
  commission_override=nullif(p_data->'commissionOverride','null'),
  private_work_category=case when p_data->>'serviceCategory'<>'TRABALHO_PARTICULAR' then null when p_data?'privateWorkCategory' then nullif(btrim(p_data->>'privateWorkCategory'),'') else private_work_category end,
  private_work_entities=case when p_data->>'serviceCategory'<>'TRABALHO_PARTICULAR' or p_data->>'privateWorkCategory' is distinct from 'AGRADO' and p_data?'privateWorkCategory' then null when p_data?'privateWorkEntities' then nullif(btrim(p_data->>'privateWorkEntities'),'') else private_work_entities end,
  private_work_details=case when p_data->>'serviceCategory'<>'TRABALHO_PARTICULAR' then null when p_data?'privateWorkDetails' then nullif(btrim(p_data->>'privateWorkDetails'),'') else private_work_details end
  where id=p_item_id returning * into v_new;
 if v_new.commission_override is not null then perform private.sunshine_item_split(p_item_id);end if;
 update sunshine_v4.obligations set beneficiary_person_id=v_new.beneficiary_person_id,total_cents=v_new.amount_cents where id=v_obligation;
 if v_new.work_id is null then update sunshine_v4.work_registrations set status='CANCELLED',updated_at=now() where contract_item_id=p_item_id;
 elsif exists(select 1 from sunshine_v4.work_registrations where contract_item_id=p_item_id) then
  update sunshine_v4.work_registrations set work_id=v_new.work_id,beneficiary_person_id=v_new.beneficiary_person_id,
   participant_name=(select full_name from sunshine_v4.people where id=v_new.beneficiary_person_id),status='ACTIVE',updated_at=now() where contract_item_id=p_item_id;
 else
  perform sunshine_v4.v4_assert_permission('work.registration.create');
  insert into sunshine_v4.work_registrations(work_id,beneficiary_person_id,contract_item_id,participant_name,participant_birth_date,status)
   select v_new.work_id,v_new.beneficiary_person_id,p_item_id,full_name,birth_date,'ACTIVE' from sunshine_v4.people where id=v_new.beneficiary_person_id;
 end if;
 if v_financial then perform sunshine_v4.v4_recalculate_item_commissions(p_item_id,v_new.responsible_member_id);end if;
 perform sunshine_v4.v4_write_audit('FINANCIAL_ITEM_CORRECTED','contract_item',p_item_id,jsonb_build_object('before',to_jsonb(v_old),'after',to_jsonb(v_new),'reason',p_reason));
 return to_jsonb(v_new);
end $function$;

CREATE OR REPLACE FUNCTION public.agent_person_history(p_query text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with q as (select array_remove(regexp_split_to_array(public.agent_norm(p_query), '\s+'), '') as words),
  found as (
    select p.* from sunshine_v4.people p, q
    where (select bool_and(public.agent_norm(p.full_name) like '%' || word || '%') from unnest(q.words) word where length(word) >= 2)
    order by p.full_name limit 3
  )
  select jsonb_build_object('ok', true, 'people', coalesce(jsonb_agg(jsonb_build_object(
    'full_name', f.full_name, 'phone', f.phone, 'birth_date', f.birth_date, 'cliente_desde', f.created_at::date,
    'membro_da_casa', exists (select 1 from sunshine_v4.house_members hm where hm.person_id = f.id and hm.status = 'ACTIVE'),
    'compras', (select count(*) from sunshine_v4.contract_items ci join sunshine_v4.contracts c on c.id = ci.contract_id
                 where coalesce(ci.beneficiary_person_id, c.customer_person_id) = f.id and c.status <> 'CANCELLED'),
    'total_cents', (select coalesce(sum(ci.amount_cents), 0) from sunshine_v4.contract_items ci join sunshine_v4.contracts c on c.id = ci.contract_id
                 where coalesce(ci.beneficiary_person_id, c.customer_person_id) = f.id and c.status <> 'CANCELLED'),
    'em_aberto_cents', (select coalesce(sum(greatest(r.signed_balance_cents, 0)), 0) from sunshine_v4.receivables r
                 join sunshine_v4.obligations o on o.id = r.obligation_id join sunshine_v4.contract_items ci on ci.id = o.contract_item_id
                 join sunshine_v4.contracts c on c.id = ci.contract_id
                 where coalesce(r.beneficiary_person_id, c.customer_person_id) = f.id and r.liquidation_status in ('OPEN','PARTIAL')),
    'ultimas', coalesce((select jsonb_agg(h order by h.data desc nulls last) from (
                 select coalesce(w.title, ci.service_name) as servico, ci.service_category as categoria,ci.private_work_category as categoria_particular,ci.private_work_entities as entidades,ci.private_work_details as detalhes,
                        (private.sunshine_private_work_json(ci.id)->>'returnDueOn')::date as retorno_em,
                        coalesce(w.scheduled_at, c.sold_at, c.created_at)::date as data, ci.amount_cents as valor_cents
                 from sunshine_v4.contract_items ci join sunshine_v4.contracts c on c.id = ci.contract_id
                 left join sunshine_v4.works w on w.id = ci.work_id
                 where coalesce(ci.beneficiary_person_id, c.customer_person_id) = f.id and c.status <> 'CANCELLED'
                 order by coalesce(w.scheduled_at, c.sold_at, c.created_at) desc nulls last limit 10) h), '[]'::jsonb)
  ) order by f.full_name), '[]'::jsonb))
  from found f
$function$;

notify pgrst,'reload schema';
