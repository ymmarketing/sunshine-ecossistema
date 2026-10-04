-- Remove only the redundant indexes created in this change; retain the original indexes.
drop index public.work_expenses_work_idx;
drop index public.work_expenses_cost_item_idx;
drop policy cost_items_select_internal on public.cost_items;
create policy cost_items_select_expense_reader on public.cost_items for select to authenticated using(private.expense_can_read());

create or replace function public.attach_receipt_file(receipt_id uuid,drive_file_id text,drive_url text) returns jsonb
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
notify pgrst,'reload schema';
