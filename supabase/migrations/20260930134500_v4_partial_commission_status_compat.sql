create or replace function sunshine_v4.v4_refresh_commission_settlement_status(
  p_commission_table text,
  p_commission_id uuid
) returns void
language plpgsql
security definer
set search_path to 'sunshine_v4','pg_temp'
as $$
declare
  v_table text := upper(coalesce(nullif(btrim(p_commission_table),''),''));
  v_total bigint;
  v_paid bigint := 0;
  v_last date;
  v_source_status text;
begin
  if v_table='LEGACY' then
    select amount_cents into v_total
    from sunshine_v4.legacy_commission_entries
    where legacy_v3_id=p_commission_id
    for update;
  elsif v_table='V4' then
    select amount_cents into v_total
    from sunshine_v4.commission_entries
    where id=p_commission_id
    for update;
  else
    raise exception 'Origem de comissão inválida.';
  end if;

  if v_total is null then raise exception 'Comissão não encontrada.'; end if;

  select coalesce(sum(amount_cents),0)::bigint,max(paid_on)
    into v_paid,v_last
  from sunshine_v4.commission_payment_entries
  where commission_table=v_table and commission_id=p_commission_id;

  if v_paid > v_total then
    raise exception 'Baixas da comissão ultrapassam o valor gerado.';
  end if;

  -- As tabelas antigas aceitam DUE/PAID, mas não PARTIAL.
  -- O estado parcial é calculado pela view commission_effective_status a partir do ledger.
  v_source_status:=case when v_paid>=v_total then 'PAID' else 'DUE' end;

  if v_table='LEGACY' then
    update sunshine_v4.legacy_commission_entries
      set status=v_source_status,
          paid_at=case when v_source_status='PAID' then v_last::timestamp at time zone 'America/Sao_Paulo' else null end
    where legacy_v3_id=p_commission_id;
  else
    update sunshine_v4.commission_entries
      set status=v_source_status,
          paid_at=case when v_source_status='PAID' then v_last::timestamp at time zone 'America/Sao_Paulo' else null end
    where id=p_commission_id;
  end if;
end
$$;
