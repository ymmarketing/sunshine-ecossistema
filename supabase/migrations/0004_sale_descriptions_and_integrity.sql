-- Sunshine v3.1 — toda venda nova precisa estar ligada a serviço ou trabalho.
-- O histórico importado já atende a regra.

alter table public.sales
  add constraint sales_requires_service_or_work
  check (service_id is not null or work_id is not null) not valid;

alter table public.sales validate constraint sales_requires_service_or_work;

-- A timeline de novas vendas passa a gravar o descritivo do que foi contratado.
create or replace function private.trg_timeline_sale()
returns trigger
language plpgsql
security definer
set search_path to 'public','private'
as $function$
declare
  v_description text;
begin
  select coalesce(
    nullif(trim(w.title),''),
    nullif(trim(case when position('Trabalho:' in coalesce(new.notes,'')) > 0 then split_part(split_part(new.notes,'Trabalho:',2),'·',1) end),''),
    nullif(trim(sv.name),''),
    initcap(replace(coalesce(new.sale_type,'Venda'),'_',' '))
  ) into v_description
  from (select 1) x
  left join public.services sv on sv.id=new.service_id
  left join public.works w on w.id=new.work_id;

  perform private.add_client_timeline_event(
    new.client_id,
    'SALE',
    concat('Venda · ',coalesce(v_description,'Serviço não informado')),
    concat('Valor: R$ ',to_char(new.total_amount,'FM999G999G990D00')),
    'sale',
    new.id,
    new.sold_at
  );
  return new;
end;
$function$;
