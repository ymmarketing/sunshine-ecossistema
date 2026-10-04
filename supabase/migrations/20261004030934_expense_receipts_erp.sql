create function private.expense_erp_phone() returns text
language plpgsql security definer set search_path='' as $$
declare v_phone text;
begin
 if not private.expense_can_write() then perform private.expense_fail('NAO_AUTORIZADO','Somente ADMIN ou EDITOR ativo pode alterar custos.'); end if;
 select whatsapp_phone into v_phone from sunshine_v4.team_members where auth_user_id=auth.uid() and active;
 if v_phone is null then perform private.expense_fail('NAO_AUTORIZADO','Cadastre o telefone WhatsApp do seu membro da equipe antes de lançar ou confirmar custos.'); end if;
 return v_phone;
end $$;

create function public.v4_expense_receipt_context() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_state text;v_msg text;v_detail text;
begin
 if not private.expense_can_read() then perform private.expense_fail('NAO_AUTORIZADO','Você não tem acesso aos custos.'); end if;
 v_result:=private.expense_targets();
 return v_result||jsonb_build_object('can_write',private.expense_can_write(),
  'member', (select jsonb_build_object('id',id,'name',full_name,'whatsapp_phone',whatsapp_phone) from sunshine_v4.team_members where auth_user_id=auth.uid() and active),
  'categories',coalesce((select jsonb_agg(to_jsonb(c) order by kind,name) from public.general_cost_categories c),'[]'),
  'team',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name,'active',active,'whatsapp_phone',whatsapp_phone) order by full_name) from sunshine_v4.team_members),'[]'));
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_msg=message_text,v_detail=pg_exception_detail; return private.expense_error(v_state,v_msg,v_detail);
end $$;

create function public.v4_save_general_cost_category(p_id uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_state text;v_msg text;v_detail text;
begin
 if not private.expense_can_write() then perform private.expense_fail('NAO_AUTORIZADO','Somente ADMIN ou EDITOR ativo pode cadastrar categorias.'); end if;
 if nullif(btrim(p_data->>'name'),'') is null or p_data->>'kind' not in ('CUSTO_FIXO','RATEIO_GERAL') or p_data->>'kind' is null then
  perform private.expense_fail('DADOS_INVALIDOS','Informe o nome da categoria e selecione Custo fixo ou Rateio geral.');
 end if;
 if p_id is null then
  insert into public.general_cost_categories(name,kind,description,active) values(btrim(p_data->>'name'),p_data->>'kind',p_data->>'description',coalesce((p_data->>'active')::boolean,true)) returning id into v_id;
 else
  update public.general_cost_categories set name=btrim(p_data->>'name'),kind=p_data->>'kind',description=p_data->>'description',active=coalesce((p_data->>'active')::boolean,true) where id=p_id returning id into v_id;
  if v_id is null then perform private.expense_fail('CATEGORIA_NAO_ENCONTRADA','Categoria não encontrada. Atualize a lista no ERP.'); end if;
 end if;
 perform private.expense_write_audit('GENERAL_COST_CATEGORY_SAVED','general_cost_category',v_id,p_data);
 return jsonb_build_object('ok',true,'receipt_id',null,'category_id',v_id,'resumo','Categoria salva. As opções de lançamento já foram atualizadas.');
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_msg=message_text,v_detail=pg_exception_detail; return private.expense_error(v_state,v_msg,v_detail);
end $$;
create function public.v4_save_expense_member_phone(p_member_id uuid,p_phone text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_phone text:=nullif(btrim(p_phone),'');v_state text;v_msg text;v_detail text;
begin
 if not private.expense_can_write() then perform private.expense_fail('NAO_AUTORIZADO','Somente ADMIN ou EDITOR ativo pode editar os telefones da equipe.'); end if;
 if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then perform private.expense_fail('TELEFONE_INVALIDO','Use o formato internacional, sem espaços: +5531999999999.'); end if;
 update sunshine_v4.team_members set whatsapp_phone=v_phone where id=p_member_id returning id into v_id;
 if v_id is null then perform private.expense_fail('MEMBRO_NAO_ENCONTRADO','Membro da equipe não encontrado.'); end if;
 perform private.expense_write_audit('EXPENSE_MEMBER_PHONE_SAVED','team_member',v_id,jsonb_build_object('phone_configured',v_phone is not null));
 return jsonb_build_object('ok',true,'receipt_id',null,'resumo','Telefone da equipe atualizado.');
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_msg=message_text,v_detail=pg_exception_detail; return private.expense_error(v_state,v_msg,v_detail);
end $$;

create function public.v4_manual_create_receipt(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_state text;v_msg text;v_detail text;
begin return private.expense_create(private.expense_erp_phone(),payload,'MANUAL');
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_msg=message_text,v_detail=pg_exception_detail; return private.expense_error(v_state,v_msg,v_detail);
end $$;
create function public.v4_manual_update_receipt(receipt_id uuid,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_state text;v_msg text;v_detail text;
begin return private.expense_update(receipt_id,private.expense_erp_phone(),payload);
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_msg=message_text,v_detail=pg_exception_detail; return private.expense_error(v_state,v_msg,v_detail);
end $$;
create function public.v4_manual_confirm_receipt(receipt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_state text;v_msg text;v_detail text;
begin return private.expense_change_status(receipt_id,private.expense_erp_phone(),'CONFIRMED');
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_msg=message_text,v_detail=pg_exception_detail; return private.expense_error(v_state,v_msg,v_detail);
end $$;
create function public.v4_manual_cancel_receipt(receipt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_state text;v_msg text;v_detail text;
begin return private.expense_change_status(receipt_id,private.expense_erp_phone(),'CANCELLED');
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_msg=message_text,v_detail=pg_exception_detail; return private.expense_error(v_state,v_msg,v_detail);
end $$;

create function private.expense_work_title(p_work_id uuid) returns text
language sql stable security definer set search_path='' as $$ select title from sunshine_v4.works where id=p_work_id and (private.expense_can_read() or current_setting('role',true)='service_role'); $$;
create function private.expense_member_name(p_member_id uuid) returns text
language sql stable security definer set search_path='' as $$ select full_name from sunshine_v4.team_members where id=p_member_id and (private.expense_can_read() or current_setting('role',true)='service_role'); $$;

create view public.v_monthly_expenses with (security_invoker=true) as
select r.competence_month,r.expense_date,r.supplier_name,r.total_amount as receipt_total_amount,
 e.amount as line_amount,e.destination,
 case when e.destination='TRABALHO' then private.expense_work_title(e.work_id) else c.name end as target_name,
 i.name as cost_item_name,private.expense_member_name(r.sent_by_member_id) as sent_by,
 r.drive_url,r.id as receipt_id,e.id as line_id,e.work_id,e.general_category_id,e.cost_item_id,r.source
from public.expense_receipts r join public.work_expenses e on e.receipt_id=r.id
left join public.general_cost_categories c on c.id=e.general_category_id
left join public.cost_items i on i.id=e.cost_item_id
where r.status='CONFIRMED';
revoke all on public.v_monthly_expenses from public,anon;
grant select on public.v_monthly_expenses to authenticated,service_role;

create function public.v4_list_expense_receipts(p_month date default null,p_receipt_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_state text;v_msg text;v_detail text;
begin
 if not private.expense_can_read() then perform private.expense_fail('NAO_AUTORIZADO','Você não tem acesso aos comprovantes.'); end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.expense_date desc,x.created_at desc),'[]') into v_result from (
  select r.*,t.full_name as sent_by,ct.full_name as confirmed_by_name,
   coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('work_title',w.title,'entity_detail',w.entity_detail,
     'general_category_name',g.name,'cost_item_name',i.name) order by e.created_at,e.id)
    from public.work_expenses e left join sunshine_v4.works w on w.id=e.work_id
    left join public.general_cost_categories g on g.id=e.general_category_id left join public.cost_items i on i.id=e.cost_item_id
    where e.receipt_id=r.id),'[]') as lines
  from public.expense_receipts r join sunshine_v4.team_members t on t.id=r.sent_by_member_id
  left join sunshine_v4.team_members ct on ct.id=r.confirmed_by
  where (p_month is null or r.competence_month=date_trunc('month',p_month)::date) and (p_receipt_id is null or r.id=p_receipt_id)
 )x;
 return jsonb_build_object('ok',true,'receipt_id',p_receipt_id,'resumo','Comprovantes do período.','receipts',v_result);
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_msg=message_text,v_detail=pg_exception_detail; return private.expense_error(v_state,v_msg,v_detail);
end $$;

create function public.v4_work_receipt_costs(p_work_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_state text;v_msg text;v_detail text;
begin
 if not private.expense_can_read() then perform private.expense_fail('NAO_AUTORIZADO','Você não tem acesso aos custos do trabalho.'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'receipt_id',e.receipt_id,'description',e.description,'amount',e.amount,
 'expense_date',e.expense_date,'cost_item_name',i.name,'status',r.status,'supplier_name',r.supplier_name,'drive_url',r.drive_url) order by e.expense_date desc,e.created_at desc),'[]') into v_result
 from public.work_expenses e left join public.expense_receipts r on r.id=e.receipt_id left join public.cost_items i on i.id=e.cost_item_id where e.work_id=p_work_id;
 return jsonb_build_object('ok',true,'receipt_id',null,'resumo','Custos do trabalho.','lines',v_result);
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_msg=message_text,v_detail=pg_exception_detail; return private.expense_error(v_state,v_msg,v_detail);
end $$;

-- Aggregate receipt costs once by competence. Confirmation never means payment settlement.
create function public.v4_receipt_cost_totals(p_start date,p_end date) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not private.expense_can_read() then return jsonb_build_object('ok',false,'code','NAO_AUTORIZADO','message','Você não tem acesso aos custos.'); end if;
 return jsonb_build_object('ok',true,'confirmed_amount',coalesce((select sum(total_amount) from public.expense_receipts where status='CONFIRMED' and expense_date between p_start and p_end),0),
 'pending_amount',coalesce((select sum(total_amount) from public.expense_receipts where status='PENDING_CONFIRMATION' and expense_date between p_start and p_end),0));
end $$;

do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('v4_expense_receipt_context','v4_save_general_cost_category','v4_save_expense_member_phone','v4_manual_create_receipt','v4_manual_update_receipt',
 'v4_manual_confirm_receipt','v4_manual_cancel_receipt','v4_list_expense_receipts','v4_work_receipt_costs','v4_receipt_cost_totals') loop
  execute format('revoke all on function %s from public,anon',f.signature);
  execute format('grant execute on function %s to authenticated,service_role',f.signature);
 end loop;
end $$;
revoke all on function private.expense_erp_phone(),private.expense_work_title(uuid),private.expense_member_name(uuid) from public,anon,authenticated;
grant execute on function private.expense_work_title(uuid),private.expense_member_name(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
