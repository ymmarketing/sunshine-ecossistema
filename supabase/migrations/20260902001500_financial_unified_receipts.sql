-- Sunshine v3.36 — atomic manual receipt linked to an existing sale.
create or replace function public.record_sale_receipt(
  p_sale_id uuid,
  p_amount numeric,
  p_paid_at timestamptz,
  p_competence_date date,
  p_payment_method text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_payment_id uuid;
  v_paid_before numeric := 0;
  v_paid_after numeric := 0;
  v_remaining numeric := 0;
  v_total numeric := 0;
begin
  if p_sale_id is null then
    raise exception 'Venda obrigatória.';
  end if;
  if coalesce(p_amount,0) <= 0 then
    raise exception 'O valor recebido deve ser maior que zero.';
  end if;
  if p_paid_at is null or p_competence_date is null then
    raise exception 'Informe a data do pagamento.';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Venda não encontrada.';
  end if;
  if v_sale.status in ('CANCELLED','REFUNDED') then
    raise exception 'Não é possível receber em uma venda cancelada ou estornada.';
  end if;

  v_total := coalesce(v_sale.total_amount,0);
  if v_total <= 0 then
    raise exception 'A venda precisa ter um valor total maior que zero.';
  end if;

  select coalesce(sum(pa.amount),0)
    into v_paid_before
  from public.payment_allocations pa
  join public.payments p on p.id = pa.payment_id
  where pa.sale_id = p_sale_id
    and p.status = 'PAID';

  v_remaining := greatest(v_total - v_paid_before,0);
  if v_remaining <= 0.005 then
    raise exception 'Esta venda já está totalmente paga.';
  end if;
  if p_amount > v_remaining + 0.005 then
    raise exception 'O valor informado é maior que o saldo restante de %.', to_char(v_remaining,'FM999G999G990D00');
  end if;

  insert into public.payments(
    client_id, source, status, gross_amount, fees_amount, net_amount,
    payment_method, paid_at, competence_date, notes
  ) values (
    v_sale.client_id, 'MANUAL', 'PAID', p_amount, 0, p_amount,
    nullif(trim(p_payment_method),''), p_paid_at, p_competence_date, nullif(trim(p_notes),'')
  ) returning id into v_payment_id;

  insert into public.payment_allocations(payment_id,sale_id,amount)
  values (v_payment_id,p_sale_id,p_amount);

  select coalesce(sum(pa.amount),0)
    into v_paid_after
  from public.payment_allocations pa
  join public.payments p on p.id = pa.payment_id
  where pa.sale_id = p_sale_id
    and p.status = 'PAID';

  v_remaining := greatest(v_total - v_paid_after,0);

  return jsonb_build_object(
    'payment_id',v_payment_id,
    'sale_id',p_sale_id,
    'sale_total',v_total,
    'received_total',v_paid_after,
    'remaining',v_remaining,
    'financial_status',case when v_remaining <= 0.005 then 'PAID' else 'PARTIAL' end
  );
end;
$$;

revoke all on function public.record_sale_receipt(uuid,numeric,timestamptz,date,text,text) from public;
grant execute on function public.record_sale_receipt(uuid,numeric,timestamptz,date,text,text) to authenticated;
