-- Category correction authorized by Yasmin: only the prior entries of October 2026.
-- Receipts, amounts, responsible members, obligations and commission settlements remain untouched.
create function private.sunshine_is_collective_premium(p_service uuid,p_work uuid,p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from sunshine_v4.services s where s.id=p_service and s.category='TRABALHO_COLETIVO_PREMIUM')
  or exists(select 1 from sunshine_v4.works w where w.id=p_work and w.work_type in('COLLECTIVE_PREMIUM','COLETIVO_PREMIUM'))
  or lower(regexp_replace(btrim(coalesce(p_name,'')),'\s+',' ','g'))='trabalho coletivo premium';
$$;
revoke all on function private.sunshine_is_collective_premium(uuid,uuid,text) from public,anon,authenticated;

create function private.sunshine_classify_collective_premium() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if private.sunshine_is_collective_premium(new.service_id,new.work_id,new.service_name) then
  new.service_category:='TRABALHO_COLETIVO_PREMIUM';
 end if;
 return new;
end $$;
revoke all on function private.sunshine_classify_collective_premium() from public,anon,authenticated;
create trigger classify_collective_premium
 before insert or update of service_id,work_id,service_name,service_category on sunshine_v4.contract_items
 for each row execute function private.sunshine_classify_collective_premium();

select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.team_members where active and lower(full_name)='yasmin' limit 1),true);
do $$
declare v_item record;
begin
 perform private.sunshine_finance_guard('record.update');
 for v_item in
  select i.id,i.service_category old_category from sunshine_v4.contract_items i
  join sunshine_v4.contracts c on c.id=i.contract_id
  where (coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo')::date>=date '2026-10-01'
   and (coalesce(c.sold_at,c.created_at) at time zone 'America/Sao_Paulo')::date<date '2026-11-01'
   and i.service_category is distinct from 'TRABALHO_COLETIVO_PREMIUM'
   and private.sunshine_is_collective_premium(i.service_id,i.work_id,i.service_name)
  for update of i
 loop
  update sunshine_v4.contract_items set service_category='TRABALHO_COLETIVO_PREMIUM' where id=v_item.id;
  perform sunshine_v4.v4_write_audit('CONTRACT_ITEM_CATEGORY_CORRECTED','contract_item',v_item.id,
   jsonb_build_object('beforeCategory',v_item.old_category,'afterCategory','TRABALHO_COLETIVO_PREMIUM',
    'reason','Correção autorizada pela Yasmin: Trabalho Coletivo Premium não é trabalho particular. Aplicar aos lançamentos anteriores de outubro/2026.'));
 end loop;
end $$;

