-- Audit supports service-role calls without impersonating an ERP session.
create or replace function private.expense_write_audit(p_action text,p_entity_type text,p_entity_id uuid,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_member uuid:=nullif(p_payload->>'member_id','')::uuid;v_actor uuid;
begin
 v_actor:=coalesce(auth.uid(),(select auth_user_id from sunshine_v4.team_members where id=v_member),v_member,p_entity_id);
 insert into sunshine_v4.audit_events(actor_id,actor_role,action,entity_type,entity_id,payload)
 values(v_actor,case when auth.uid() is null then 'SERVICE_ROLE' else sunshine_v4.v4_actor_role() end,
 p_action,p_entity_type,p_entity_id,p_payload||jsonb_build_object('actor_type',case when auth.uid() is null then 'SERVICE_ROLE' else 'ERP_USER' end));
end $$;

create or replace function private.expense_create(p_phone text,p_payload jsonb,p_source text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_member uuid;v_id uuid;v_existing public.expense_receipts%rowtype;v_key text;v_state text;v_msg text;v_detail text;
begin
 v_member:=private.expense_resolve_member(p_phone);
 if p_source not in ('MANUAL','WHATSAPP') then perform private.expense_fail('ORIGEM_INVALIDA','Origem do comprovante inválida.'); end if;
 v_key:=case when p_source='WHATSAPP' then nullif(btrim(p_payload->>'whatsapp_message_id'),'') else nullif(btrim(p_payload->>'idempotency_key'),'') end;
 if p_source='WHATSAPP' and v_key is null then perform private.expense_fail('MENSAGEM_OBRIGATORIA','Informe o identificador da mensagem original para evitar duplicidade.'); end if;
 if v_key is not null then
  perform pg_advisory_xact_lock(hashtextextended('receipt:'||p_source||':'||v_key,0));
  select * into v_existing from public.expense_receipts r where
   (p_source='WHATSAPP' and r.whatsapp_message_id=v_key) or (p_source='MANUAL' and r.idempotency_key=v_key) for update;
  if v_existing.id is not null then
   if v_existing.sent_by_member_id<>v_member then perform private.expense_fail('NAO_AUTORIZADO','Esta referência pertence a outro membro da equipe.'); end if;
   return private.expense_success(v_existing.id,'Este comprovante já foi registrado. Para corrigir, use a atualização do comprovante pendente.',true);
  end if;
 end if;
 perform private.expense_validate_payload(p_payload);
 insert into public.expense_receipts(total_amount,expense_date,competence_month,supplier_name,payment_method,sent_by_member_id,
  source,whatsapp_message_id,raw_text,ai_extraction,notes,idempotency_key)
 values((p_payload->>'total_amount')::numeric,(p_payload->>'expense_date')::date,(p_payload->>'competence_month')::date,
  nullif(btrim(p_payload->>'supplier_name'),''),nullif(btrim(p_payload->>'payment_method'),''),v_member,p_source,
  case when p_source='WHATSAPP' then v_key end,p_payload->>'raw_text',coalesce(p_payload->'ai_extraction','{}'),p_payload->>'notes',
  case when p_source='MANUAL' then v_key end) returning id into v_id;
 perform private.expense_insert_lines(v_id,p_payload);
 perform private.expense_write_audit('EXPENSE_RECEIPT_CREATED','expense_receipt',v_id,jsonb_build_object('source',p_source,'member_id',v_member));
 return private.expense_success(v_id,'Comprovante registrado. Confira o rateio e confirme para contabilizar o custo.');
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_msg=message_text,v_detail=pg_exception_detail;
 return private.expense_error(v_state,v_msg,v_detail);
end $$;

create or replace function private.expense_update(p_id uuid,p_phone text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_member uuid;v_old public.expense_receipts%rowtype;v_state text;v_msg text;v_detail text;
begin
 v_member:=private.expense_resolve_member(p_phone);
 select * into v_old from public.expense_receipts where id=p_id for update;
 if v_old.id is null then perform private.expense_fail('COMPROVANTE_NAO_ENCONTRADO','Comprovante não encontrado. Confira o identificador no ERP.'); end if;
 if v_old.status<>'PENDING_CONFIRMATION' then perform private.expense_fail('STATUS_INVALIDO','Somente comprovantes pendentes de confirmação podem ser corrigidos.'); end if;
 perform private.expense_validate_payload(p_payload);
 delete from public.work_expenses where receipt_id=p_id;
 update public.expense_receipts set total_amount=(p_payload->>'total_amount')::numeric,expense_date=(p_payload->>'expense_date')::date,
  competence_month=(p_payload->>'competence_month')::date,supplier_name=nullif(btrim(p_payload->>'supplier_name'),''),
  payment_method=nullif(btrim(p_payload->>'payment_method'),''),raw_text=p_payload->>'raw_text',ai_extraction=coalesce(p_payload->'ai_extraction','{}'),notes=p_payload->>'notes'
 where id=p_id;
 perform private.expense_insert_lines(p_id,p_payload);
 perform private.expense_write_audit('EXPENSE_RECEIPT_UPDATED','expense_receipt',p_id,jsonb_build_object('member_id',v_member,'before',to_jsonb(v_old)));
 return private.expense_success(p_id,'Comprovante corrigido. Confira o novo rateio e confirme.');
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_msg=message_text,v_detail=pg_exception_detail;
 return private.expense_error(v_state,v_msg,v_detail);
end $$;

create or replace function private.expense_change_status(p_id uuid,p_phone text,p_status text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_member uuid;v_old public.expense_receipts%rowtype;v_sum numeric;v_state text;v_msg text;v_detail text;
begin
 v_member:=private.expense_resolve_member(p_phone);
 select * into v_old from public.expense_receipts where id=p_id for update;
 if v_old.id is null then perform private.expense_fail('COMPROVANTE_NAO_ENCONTRADO','Comprovante não encontrado. Confira o identificador no ERP.'); end if;
 if v_old.status=p_status then return private.expense_success(p_id,case when p_status='CONFIRMED' then 'Este comprovante já está confirmado.' else 'Este comprovante já está cancelado.' end,true); end if;
 if v_old.status='CANCELLED' or (p_status='CONFIRMED' and v_old.status<>'PENDING_CONFIRMATION') or p_status not in ('CONFIRMED','CANCELLED') then
  perform private.expense_fail('STATUS_INVALIDO','Esta mudança de situação do comprovante não é permitida.');
 end if;
 if p_status='CONFIRMED' then
  select sum(amount) into v_sum from public.work_expenses where receipt_id=p_id;
  if v_sum is distinct from v_old.total_amount then perform private.expense_fail('SOMA_DIFERENTE','A soma das linhas é diferente do total do comprovante. Corrija o rateio antes de confirmar.'); end if;
  update public.expense_receipts set status='CONFIRMED',confirmed_at=now(),confirmed_by=v_member where id=p_id;
 else update public.expense_receipts set status='CANCELLED' where id=p_id;
 end if;
 perform private.expense_write_audit('EXPENSE_RECEIPT_'||p_status,'expense_receipt',p_id,jsonb_build_object('member_id',v_member,'previous_status',v_old.status));
 return private.expense_success(p_id,case when p_status='CONFIRMED' then 'Comprovante confirmado. O custo foi registrado.' else 'Comprovante cancelado. O custo foi retirado dos totais.' end);
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_msg=message_text,v_detail=pg_exception_detail;
 return private.expense_error(v_state,v_msg,v_detail);
end $$;

create or replace function public.attach_receipt_file(receipt_id uuid,drive_file_id text,drive_url text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_old public.expense_receipts%rowtype;v_file text:=btrim(drive_file_id);v_url text:=btrim(drive_url);v_state text;v_msg text;v_detail text;
begin
 select * into v_old from public.expense_receipts where id=receipt_id for update;
 if v_old.id is null then perform private.expense_fail('COMPROVANTE_NAO_ENCONTRADO','Comprovante não encontrado. Confira o identificador no ERP.'); end if;
 if v_old.status<>'CONFIRMED' then perform private.expense_fail('STATUS_INVALIDO','O arquivo só pode ser vinculado depois da confirmação do comprovante.'); end if;
 if v_file is null or v_file !~ '^[A-Za-z0-9_-]{5,200}$' or v_url is null
   or v_url !~ '^https://drive\.google\.com/(file/d/|open\?|uc\?)' or position(v_file in v_url)=0 then
  perform private.expense_fail('ARQUIVO_INVALIDO','Informe um identificador e um link HTTPS válido do mesmo arquivo no Google Drive.');
 end if;
 if v_old.drive_file_id=v_file and v_old.drive_url=v_url then return private.expense_success(receipt_id,'Este arquivo já está vinculado ao comprovante.',true); end if;
 if v_old.drive_file_id is not null or v_old.drive_url is not null then perform private.expense_fail('ARQUIVO_JA_VINCULADO','O comprovante já possui outro arquivo. Confira o vínculo no ERP antes de substituir.'); end if;
 update public.expense_receipts r set drive_file_id=v_file,drive_url=v_url where r.id=receipt_id;
 perform private.expense_write_audit('EXPENSE_RECEIPT_FILE_ATTACHED','expense_receipt',receipt_id,jsonb_build_object('drive_file_id',v_file));
 return private.expense_success(receipt_id,'Arquivo vinculado ao comprovante.');
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_msg=message_text,v_detail=pg_exception_detail;
 return private.expense_error(v_state,v_msg,v_detail);
end $$;

create or replace function public.v4_save_general_cost_category(p_id uuid,p_data jsonb) returns jsonb
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

create or replace function public.v4_save_expense_member_phone(p_member_id uuid,p_phone text) returns jsonb
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
revoke all on function private.expense_write_audit(text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.expense_write_audit(text,text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
