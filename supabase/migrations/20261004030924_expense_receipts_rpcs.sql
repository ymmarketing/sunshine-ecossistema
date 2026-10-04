create function private.expense_fail(p_code text,p_message text) returns void
language plpgsql set search_path='' as $$ begin
 raise exception using errcode='P0001',message=p_message,detail=p_code;
end $$;
create function private.expense_error(p_state text,p_message text,p_detail text) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('ok',false,'code',case when p_state='P0001' and p_detail ~ '^[A-Z_]+$' then p_detail
   when p_state='23505' then 'DUPLICADO' when p_state='42501' then 'NAO_AUTORIZADO'
   when p_state like '22%' or p_state in ('23502','23503','23514') then 'DADOS_INVALIDOS' else 'ERRO_INTERNO' end,
 'message',case when p_state='P0001' then p_message
   when p_state='23505' then 'Este registro já existe. Confira o lançamento antes de enviar novamente.'
   when p_state='42501' then 'Você não tem autorização para esta operação.'
   when p_state like '22%' or p_state in ('23502','23503','23514') then 'Dados inválidos. Confira valores, datas e identificadores do cadastro.'
   else 'Não foi possível concluir a operação. Tente novamente ou solicite suporte no ERP.' end);
$$;
create function private.expense_resolve_member(p_phone text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then
  perform private.expense_fail('NAO_AUTORIZADO','Telefone não autorizado. Use um número cadastrado no ERP, no formato +5531999999999.');
 end if;
 select t.id into v_id from sunshine_v4.team_members t where t.whatsapp_phone=p_phone and t.active for share;
 if v_id is null or not private.expense_member_can_write(v_id) then
  perform private.expense_fail('NAO_AUTORIZADO','Telefone não autorizado para lançar custos. Confira o cadastro e as permissões da equipe no ERP.');
 end if;
 return v_id;
end $$;

create function private.expense_validate_line(p_line jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_work sunshine_v4.works%rowtype; v_item public.cost_items%rowtype;
 v_category public.general_cost_categories%rowtype; v_destination text:=p_line->>'destination'; v_amount numeric;
begin
 if jsonb_typeof(p_line) is distinct from 'object' then perform private.expense_fail('DADOS_INVALIDOS','Cada linha de rateio deve conter destino, categoria e valor.'); end if;
 v_amount:=(p_line->>'amount')::numeric;
 if v_amount is null or v_amount<=0 or v_amount<>round(v_amount,2) or v_amount>=1000000000000 then
  perform private.expense_fail('VALOR_INVALIDO','Informe um valor positivo, com no máximo duas casas decimais, em cada linha.');
 end if;
 if v_destination='TRABALHO' then
  if nullif(p_line->>'general_category_id','') is not null then perform private.expense_fail('DESTINO_INVALIDO','Um custo de trabalho não pode ter categoria geral.'); end if;
  select * into v_work from sunshine_v4.works where id=nullif(p_line->>'work_id','')::uuid for share;
  if v_work.id is null then perform private.expense_fail('TRABALHO_NAO_ENCONTRADO','Trabalho '||coalesce(nullif(p_line->>'work_name',''),nullif(p_line->>'work_id',''),'informado')||' não cadastrado. Cadastre no ERP e envie de novo.'); end if;
  if v_work.status not in ('PLANNED','OPEN') or v_work.status is null then perform private.expense_fail('TRABALHO_INATIVO','Trabalho "'||v_work.title||'" não está aberto ou planejado. Confira a situação no ERP.'); end if;
  select * into v_item from public.cost_items where id=nullif(p_line->>'cost_item_id','')::uuid for share;
  if v_item.id is null then perform private.expense_fail('CATEGORIA_NAO_ENCONTRADA','Categoria "'||coalesce(nullif(p_line->>'category_name',''),nullif(p_line->>'cost_item_id',''),'informada')||'" não cadastrada. Cadastre no ERP e envie de novo.'); end if;
  if not v_item.active then perform private.expense_fail('CATEGORIA_INATIVA','Categoria "'||v_item.name||'" está inativa. Ative no ERP ou selecione outra categoria.'); end if;
 elsif v_destination in ('CUSTO_FIXO','RATEIO_GERAL') then
  if nullif(p_line->>'work_id','') is not null or nullif(p_line->>'cost_item_id','') is not null then
   perform private.expense_fail('DESTINO_INVALIDO','Custo fixo ou rateio geral não pode estar associado a um trabalho ou item de trabalho.');
  end if;
  select * into v_category from public.general_cost_categories where id=nullif(p_line->>'general_category_id','')::uuid for share;
  if v_category.id is null then perform private.expense_fail('CATEGORIA_NAO_ENCONTRADA','Categoria "'||coalesce(nullif(p_line->>'category_name',''),nullif(p_line->>'general_category_id',''),'informada')||'" não cadastrada. Cadastre no ERP e envie de novo.'); end if;
  if not v_category.active then perform private.expense_fail('CATEGORIA_INATIVA','Categoria "'||v_category.name||'" está inativa. Ative no ERP ou selecione outra categoria.'); end if;
  if v_category.kind<>v_destination then perform private.expense_fail('TIPO_CATEGORIA_INVALIDO','Categoria "'||v_category.name||'" não é do tipo selecionado para esta linha.'); end if;
 else perform private.expense_fail('DESTINO_INVALIDO','Selecione Trabalho, Custo fixo ou Rateio geral para cada linha.');
 end if;
end $$;

create function private.expense_validate_payload(p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_total numeric; v_sum numeric:=0; v_line jsonb; v_date date; v_month date;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' then perform private.expense_fail('DADOS_INVALIDOS','Informe os dados do comprovante.'); end if;
 v_total:=(p_payload->>'total_amount')::numeric;
 if v_total is null or v_total<=0 or v_total<>round(v_total,2) or v_total>=1000000000000 then perform private.expense_fail('VALOR_INVALIDO','O total do comprovante deve ser positivo, com no máximo duas casas decimais.'); end if;
 v_date:=(p_payload->>'expense_date')::date; v_month:=(p_payload->>'competence_month')::date;
 if v_date is null or v_month is null or extract(day from v_month)<>1 then perform private.expense_fail('DATA_INVALIDA','Informe a data da despesa e a competência como primeiro dia do mês.'); end if;
 if jsonb_typeof(p_payload->'lines') is distinct from 'array' or jsonb_array_length(p_payload->'lines')=0 then
  perform private.expense_fail('RATEIO_INVALIDO','Informe pelo menos uma linha de rateio.');
 end if;
 for v_line in select value from jsonb_array_elements(p_payload->'lines') loop
  perform private.expense_validate_line(v_line); v_sum:=v_sum+(v_line->>'amount')::numeric;
 end loop;
 if v_sum<>v_total then perform private.expense_fail('SOMA_DIFERENTE','A soma do rateio (R$ '||replace(to_char(v_sum,'FM999999999990.00'),'.',',')||') é diferente do total do comprovante (R$ '||replace(to_char(v_total,'FM999999999990.00'),'.',',')||'). Corrija os valores e envie de novo.'); end if;
end $$;

create function private.expense_line_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_receipt public.expense_receipts%rowtype;
begin
 if tg_op in ('UPDATE','DELETE') and old.receipt_id is not null then
  select * into v_receipt from public.expense_receipts where id=old.receipt_id for update;
  if v_receipt.status<>'PENDING_CONFIRMATION' then perform private.expense_fail('STATUS_INVALIDO','As linhas de um comprovante confirmado ou cancelado não podem ser alteradas.'); end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 if new.receipt_id is not null then
  select * into v_receipt from public.expense_receipts where id=new.receipt_id for update;
  if v_receipt.id is null or v_receipt.status<>'PENDING_CONFIRMATION' then perform private.expense_fail('STATUS_INVALIDO','O comprovante precisa estar pendente para receber linhas de rateio.'); end if;
  if new.source<>v_receipt.source or new.expense_date<>v_receipt.expense_date then perform private.expense_fail('DADOS_INVALIDOS','A origem e a data da linha devem corresponder ao comprovante.'); end if;
  perform private.expense_validate_line(to_jsonb(new));
 elsif new.destination in ('CUSTO_FIXO','RATEIO_GERAL') then
  perform private.expense_validate_line(to_jsonb(new));
 elsif new.source='WHATSAPP' then
  perform private.expense_fail('COMPROVANTE_OBRIGATORIO','Um custo recebido por WhatsApp precisa estar vinculado a um comprovante.');
 end if;
 return new;
end $$;
create trigger expense_line_guard before insert or update or delete on public.work_expenses for each row execute function private.expense_line_guard();

create function private.expense_receipt_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_sum numeric; v_line public.work_expenses%rowtype;
begin
 if tg_op='DELETE' then perform private.expense_fail('STATUS_INVALIDO','Comprovantes não podem ser excluídos. Use Cancelar para preservar o histórico.'); end if;
 if tg_op='INSERT' and new.status<>'PENDING_CONFIRMATION' then perform private.expense_fail('STATUS_INVALIDO','O comprovante deve ser criado pendente de confirmação.'); end if;
 if tg_op='UPDATE' then
  if new.sent_by_member_id<>old.sent_by_member_id or new.source<>old.source
    or new.whatsapp_message_id is distinct from old.whatsapp_message_id or new.idempotency_key is distinct from old.idempotency_key then
   perform private.expense_fail('DADOS_INVALIDOS','A origem, o remetente e a mensagem original do comprovante não podem ser alterados.');
  end if;
  if old.status in ('CONFIRMED','CANCELLED') and (to_jsonb(new)-array['status','updated_at','drive_file_id','drive_url']) is distinct from (to_jsonb(old)-array['status','updated_at','drive_file_id','drive_url']) then
   perform private.expense_fail('STATUS_INVALIDO','Os dados financeiros de um comprovante confirmado ou cancelado não podem ser alterados.');
  end if;
  if (old.status='CANCELLED' and new.status<>old.status) or (old.status='CONFIRMED' and new.status not in ('CONFIRMED','CANCELLED')) then
   perform private.expense_fail('STATUS_INVALIDO','Esta mudança de situação do comprovante não é permitida.');
  end if;
 end if;
 if new.status='CONFIRMED' and (tg_op='INSERT' or old.status<>'CONFIRMED') then
  select sum(amount) into v_sum from public.work_expenses where receipt_id=new.id;
  if v_sum is distinct from new.total_amount then perform private.expense_fail('SOMA_DIFERENTE','A soma das linhas é diferente do total do comprovante. Corrija o rateio antes de confirmar.'); end if;
  for v_line in select * from public.work_expenses where receipt_id=new.id loop perform private.expense_validate_line(to_jsonb(v_line)); end loop;
 end if;
 return new;
end $$;
create trigger expense_receipt_guard before insert or update or delete on public.expense_receipts for each row execute function private.expense_receipt_guard();

create function private.expense_targets() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('ok',true,'receipt_id',null,'resumo','Opções ativas do ERP.',
 'works',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'work_type',work_type,'scheduled_at',scheduled_at,'entity_detail',entity_detail,'status',status) order by scheduled_at desc nulls last,title) from sunshine_v4.works where status in ('PLANNED','OPEN')),'[]'),
 'cost_items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.cost_items where active),'[]'),
 'general_cost_categories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind,'description',description) order by kind,name) from public.general_cost_categories where active),'[]'));
$$;
create function private.expense_success(p_id uuid,p_resumo text,p_idempotent boolean default false) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('ok',true,'receipt_id',r.id,'resumo',p_resumo,'idempotent',p_idempotent,
 'status',r.status,'total_amount',r.total_amount,'line_count',(select count(*) from public.work_expenses where receipt_id=r.id))
 from public.expense_receipts r where r.id=p_id;
$$;
create function private.expense_insert_lines(p_id uuid,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_line jsonb; v_source text;
begin
 select source into v_source from public.expense_receipts where id=p_id;
 for v_line in select value from jsonb_array_elements(p_payload->'lines') loop
  insert into public.work_expenses(receipt_id,destination,work_id,cost_item_id,general_category_id,description,amount,expense_date,source,notes)
  values(p_id,v_line->>'destination',nullif(v_line->>'work_id','')::uuid,nullif(v_line->>'cost_item_id','')::uuid,
   nullif(v_line->>'general_category_id','')::uuid,coalesce(nullif(btrim(v_line->>'description'),''),'Linha do comprovante'),
   (v_line->>'amount')::numeric,(p_payload->>'expense_date')::date,v_source,v_line->>'notes');
 end loop;
end $$;

create function private.expense_write_audit(p_action text,p_entity_type text,p_entity_id uuid,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_member uuid:=nullif(p_payload->>'member_id','')::uuid;v_actor uuid;
begin
 v_actor:=coalesce(auth.uid(),(select auth_user_id from sunshine_v4.team_members where id=v_member),v_member,p_entity_id);
 insert into sunshine_v4.audit_events(actor_id,actor_role,action,entity_type,entity_id,payload)
 values(v_actor,case when auth.uid() is null then 'SERVICE_ROLE' else sunshine_v4.v4_actor_role() end,
 p_action,p_entity_type,p_entity_id,p_payload||jsonb_build_object('actor_type',case when auth.uid() is null then 'SERVICE_ROLE' else 'ERP_USER' end));
end $$;

create function private.expense_create(p_phone text,p_payload jsonb,p_source text) returns jsonb
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

create function private.expense_update(p_id uuid,p_phone text,p_payload jsonb) returns jsonb
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

create function private.expense_change_status(p_id uuid,p_phone text,p_status text) returns jsonb
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

-- Public REST entrypoints: privileges, not the JSON body, establish service authorization.
create function public.list_active_expense_targets() returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_state text;v_msg text;v_detail text;
begin return private.expense_targets();
exception when others then get stacked diagnostics v_state=returned_sqlstate,v_msg=message_text,v_detail=pg_exception_detail; return private.expense_error(v_state,v_msg,v_detail);
end $$;
create function public.create_pending_receipt(from_phone text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.expense_create(from_phone,payload,'WHATSAPP'); $$;
create function public.update_pending_receipt(receipt_id uuid,from_phone text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.expense_update(receipt_id,from_phone,payload); $$;
create function public.confirm_receipt(receipt_id uuid,from_phone text) returns jsonb language sql security invoker set search_path='' as $$ select private.expense_change_status(receipt_id,from_phone,'CONFIRMED'); $$;
create function public.cancel_receipt(receipt_id uuid,from_phone text) returns jsonb language sql security invoker set search_path='' as $$ select private.expense_change_status(receipt_id,from_phone,'CANCELLED'); $$;

create function public.attach_receipt_file(receipt_id uuid,drive_file_id text,drive_url text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_old public.expense_receipts%rowtype;v_file text:=btrim(drive_file_id);v_url text:=btrim(drive_url);v_state text;v_msg text;v_detail text;
begin
 select * into v_old from public.expense_receipts where id=receipt_id for update;
 if v_old.id is null then perform private.expense_fail('COMPROVANTE_NAO_ENCONTRADO','Comprovante não encontrado. Confira o identificador no ERP.'); end if;
 if v_old.status<>'CONFIRMED' then perform private.expense_fail('STATUS_INVALIDO','O arquivo só pode ser vinculado depois da confirmação do comprovante.'); end if;
 if v_file is null or v_file !~ '^[A-Za-z0-9_-]{5,200}$' or v_url is null
   or (v_url !~ ('^https://drive\.google\.com/file/d/'||v_file||'(/[^[:space:]]*)?(\?[^[:space:]]*)?$')
    and not (v_url ~ '^https://drive\.google\.com/(open|uc)\?' and v_url ~ ('[?&]id='||v_file||'(&|$)') and v_url !~ '[[:space:]]')) then
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

-- Revoke default PUBLIC execution on all internal helpers and agent RPCs.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='private' and p.proname like 'expense_%') or (n.nspname='public' and p.proname in
    ('list_active_expense_targets','create_pending_receipt','update_pending_receipt','confirm_receipt','cancel_receipt','attach_receipt_file')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant execute on function private.expense_can_read(),private.expense_can_write() to authenticated;
grant usage on schema private to service_role;
notify pgrst,'reload schema';
