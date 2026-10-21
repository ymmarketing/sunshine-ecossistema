-- Financial equivalence is required before relinking a settled allocation.
-- Cash amounts, receipt, commission IDs and paid ledger entries cannot change.
create or replace function private.sunshine_commission_context(p_item uuid,p_paid_on date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare i sunshine_v4.contract_items%rowtype;c sunshine_v4.contracts%rowtype;s jsonb; shares jsonb;mode text;
begin
 select * into strict i from sunshine_v4.contract_items where id=p_item;
 select * into strict c from sunshine_v4.contracts where id=i.contract_id;
 if c.source='IMPORT' then raise exception 'Histórico importado protegido.';end if;
 if p_paid_on>=date '2026-10-01' or i.commission_override is not null then
  s:=private.sunshine_item_split(i.id,p_paid_on);
  select jsonb_agg(x order by x->>'memberId') into shares from jsonb_array_elements(s->'shares')x;
  return jsonb_build_object('responsible',i.responsible_member_id,'costBp',s->'costBp','shares',shares,'mode','RECEIPT');
 end if;
 select metadata->>'commission_mode' into mode from sunshine_v4.services where id=i.service_id;
 if mode='LOURDES_100' then return jsonb_build_object('mode',mode);end if;
 select coalesce(jsonb_agg(jsonb_build_object('member',r.beneficiary_member_id,'percentage',r.percentage) order by r.beneficiary_member_id,r.percentage),'[]') into shares
 from sunshine_v4.legacy_commission_rules r
 where r.responsible_member_id=i.responsible_member_id and r.active
 and r.valid_from<=coalesce(c.sold_at,c.created_at)::date
 and (r.valid_until is null or r.valid_until>=coalesce(c.sold_at,c.created_at)::date)
 and (r.service_category is null or r.service_category=i.service_category);
 return jsonb_build_object('responsible',i.responsible_member_id,'mode','LEGACY','shares',shares);
end $$;
revoke all on function private.sunshine_commission_context(uuid,date) from public,anon,authenticated;

create or replace function sunshine_v4.trg_v4_refresh_commissions_allocation()
returns trigger language plpgsql security definer set search_path='' as $$
declare old_item uuid;new_item uuid;old_person uuid;new_person uuid;paid_on date;old_context jsonb;new_context jsonb;target sunshine_v4.obligations%rowtype;
begin
 if tg_op='UPDATE' and old.obligation_id is distinct from new.obligation_id
  and exists(select 1 from sunshine_v4.commission_effective_status where allocation_id=new.id and paid_cents>0) then
  perform public.v4_bind_authenticated_user();
  perform sunshine_v4.v4_assert_permission('record.update');
  if old.payment_id is distinct from new.payment_id or old.amount_cents is distinct from new.amount_cents then
   raise exception 'Há comissão paga; o valor e o comprovante estão protegidos.';end if;
  select contract_item_id,beneficiary_person_id into old_item,old_person from sunshine_v4.obligations where id=old.obligation_id;
  select * into strict target from sunshine_v4.obligations where id=new.obligation_id for update;
  new_item:=target.contract_item_id;new_person:=target.beneficiary_person_id;
  if coalesce(target.explicit_status,'')='CANCELLED' or exists(select 1 from sunshine_v4.contract_items ci join sunshine_v4.contracts c on c.id=ci.contract_id where ci.id=new_item and c.status='CANCELLED') then raise exception 'Destino cancelado.';end if;
  if old_person is distinct from new_person and not exists(
   select 1 from sunshine_v4.people a join sunshine_v4.people b on b.id=new_person where a.id=old_person
   and a.birth_date is not null and a.birth_date=b.birth_date
   and length(regexp_replace(coalesce(a.phone,''),'[^0-9]','','g'))>=10
   and regexp_replace(a.phone,'[^0-9]','','g')=regexp_replace(b.phone,'[^0-9]','','g')
  ) then raise exception 'O comprovante pertence a outra pessoa.';end if;
  if (select coalesce(sum(amount_cents),0) from sunshine_v4.payment_allocations where obligation_id=new.obligation_id)>target.total_cents then raise exception 'O vínculo excede a dívida original.';end if;
  select (paid_at at time zone 'America/Sao_Paulo')::date into paid_on from sunshine_v4.payments where id=new.payment_id and status='PAID';
  if paid_on is null then raise exception 'Comprovante ativo não encontrado.';end if;
  old_context:=private.sunshine_commission_context(old_item,paid_on);new_context:=private.sunshine_commission_context(new_item,paid_on);
  if old_context is distinct from new_context then raise exception 'Há comissão paga; a divisão financeira do destino é diferente.';end if;
  perform sunshine_v4.v4_write_audit('ALLOCATION_RELINKED_PRESERVING_SETTLEMENTS','allocation',new.id,
   jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new),'equivalentCommissionContext',new_context,'cashAndPaidLedgerPreserved',true));
  return new;
 end if;
 perform sunshine_v4.v4_rebuild_commissions_for_allocation(new.id);
 return new;
end $$;
revoke all on function sunshine_v4.trg_v4_refresh_commissions_allocation() from public,anon,authenticated;
