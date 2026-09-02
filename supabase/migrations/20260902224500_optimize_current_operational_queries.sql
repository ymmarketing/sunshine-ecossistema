-- Índices conservadores para relações operacionais atualmente usadas.
-- Não remove índices existentes e não altera dados ou permissões.
create index if not exists idx_appointments_answered_by
  on public.appointments(answered_by);

create index if not exists idx_house_member_change_log_house_member
  on public.house_member_change_log(house_member_id);

create index if not exists idx_house_member_change_log_client
  on public.house_member_change_log(client_id);

create index if not exists idx_house_member_change_log_changed_by
  on public.house_member_change_log(changed_by);

create index if not exists idx_payment_excess_payment
  on public.payment_excess_classifications(payment_id);

create index if not exists idx_payment_excess_sale
  on public.payment_excess_classifications(sale_id);

create index if not exists idx_payment_excess_created_by
  on public.payment_excess_classifications(created_by);

-- As políticas ALL abaixo já cobrem SELECT com a mesma condição.
-- Remover apenas as políticas SELECT duplicadas preserva a autorização.
drop policy if exists payment_excess_internal_select
  on public.payment_excess_classifications;

drop policy if exists performance_snapshots_internal_select
  on public.performance_metric_snapshots;
