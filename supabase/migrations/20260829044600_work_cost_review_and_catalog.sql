alter table public.works add column if not exists costs_reviewed boolean not null default false;
alter table public.works add column if not exists costs_reviewed_at timestamptz;
alter table public.works add column if not exists costs_reviewed_by uuid references public.team_members(id);
create index if not exists idx_works_costs_reviewed_by on public.works(costs_reviewed_by);

insert into public.cost_items(name,unit,active,notes)
select x.name,'lançamento',true,x.notes
from (values
 ('Materiais e insumos','Materiais, ervas, velas, bebidas, alimentos e demais itens utilizados no trabalho.'),
 ('Transporte','Deslocamento, combustível, aplicativo, frete ou entrega atribuível ao trabalho.'),
 ('Alimentação','Alimentação diretamente relacionada à execução do trabalho.'),
 ('Espaço / local','Locação, diária ou custo específico do espaço utilizado.'),
 ('Terceiros / apoio','Pagamento de pessoa ou fornecedor externo diretamente relacionado ao trabalho.'),
 ('Divulgação / mídia','Mídia paga ou despesa de divulgação atribuída especificamente ao trabalho.'),
 ('Taxas de pagamento','Taxas de cobrança ou recebimento atribuíveis ao trabalho quando não registradas automaticamente.'),
 ('Outros','Despesa direta do trabalho não contemplada nas categorias anteriores.')
) as x(name,notes)
where not exists (select 1 from public.cost_items c where lower(c.name)=lower(x.name));