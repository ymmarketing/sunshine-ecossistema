-- Sunshine v3.47 — correção raiz das falhas de associação de pagamentos.
-- As rotinas Asaas gravam net_amount explicitamente. A coluna GENERATED ALWAYS fazia o PostgreSQL abortar a associação com:
-- cannot insert a non-DEFAULT value into column "net_amount".
-- Mantemos a integridade líquido = bruto - taxas por trigger, compatível com todos os fluxos existentes.

alter table public.payments
  alter column net_amount drop expression;

create or replace function private.sync_payment_net_amount()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
begin
  new.net_amount := greatest(coalesce(new.gross_amount,0)-coalesce(new.fees_amount,0),0);
  return new;
end;
$$;

drop trigger if exists trg_sync_payment_net_amount on public.payments;
create trigger trg_sync_payment_net_amount
before insert or update on public.payments
for each row execute function private.sync_payment_net_amount();

update public.payments
set net_amount = greatest(coalesce(gross_amount,0)-coalesce(fees_amount,0),0)
where net_amount is distinct from greatest(coalesce(gross_amount,0)-coalesce(fees_amount,0),0);
