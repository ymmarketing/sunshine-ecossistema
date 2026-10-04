-- Restrict writes to the existing work-category catalog as well as the new catalog.
drop policy cost_items_insert_internal on public.cost_items;
drop policy cost_items_update_internal on public.cost_items;
drop policy cost_items_delete_admin on public.cost_items;
create policy cost_items_insert_expense_editor on public.cost_items for insert to authenticated with check(private.expense_can_write());
create policy cost_items_update_expense_editor on public.cost_items for update to authenticated using(private.expense_can_write()) with check(private.expense_can_write());
create policy cost_items_delete_expense_editor on public.cost_items for delete to authenticated using(private.expense_can_write());
notify pgrst,'reload schema';
