# Arquitetura oficial — Ecossistema Sunshine

## 1. Objetivo

Centralizar a operação da Sunshine Oráculos em uma aplicação única, mantendo a lógica operacional atual até o pagamento e os retornos, mas eliminando múltiplas fontes de verdade para clientes, agenda, financeiro, trabalhos, comissões e performance.

## 2. Entidade central

`clients` é a identidade principal. Sempre que um lançamento possuir cliente identificável, o mesmo `client_id` acompanha relacionamento, agenda, consulta, trabalho, inscrição, pagamento e follow-up.

O histórico 2026 possui lançamentos sem nome de cliente. Esses lançamentos são preservados com `client_id` nulo e podem ser reconciliados posteriormente. Não serão criados clientes fictícios apenas para satisfazer relacionamento técnico.

## 3. Fluxo operacional alvo

1. Campanha/conteúdo divulga consulta ou trabalho.
2. ManyChat direciona para WhatsApp.
3. Demanda entra no atendimento.
4. Cliente é localizado ou cadastrado uma única vez.
5. Serviço/trabalho é selecionado.
6. Pagamento entra via Asaas ou registro manual.
7. Motor de comissão identifica o responsável e gera os três repasses.
8. Consulta, trabalho ou inscrição é associada ao pagamento.
9. Agenda registra realização e eventual retorno.
10. Histórico do cliente é atualizado.
11. Reportei fornece performance da campanha/conteúdo.
12. Dashboard cruza volume, receita, custo, margem, inscritos, alcance, engajamento e cliques.

## 4. Regra de comissão

- Rosely responsável: Rosely 80%, Yasmin 10%, Lourdes 10%.
- Yasmin responsável: Yasmin 80%, Rosely 10%, Lourdes 10%.

A regra é configurável por vigência no banco. A interface nunca calcula percentuais por conta própria.

## 5. Domínios funcionais

### Clientes
Cadastro único, telefone, e-mail, nascimento, Odu, observações, aliases do legado e histórico consolidado.

### Agenda
Consultas, perguntas, trabalhos, retornos, status realizado/agendado/cancelado/reagendado/no-show e resumo pós-evento.

### Trabalhos
Coletivos, premium e particulares; tema/entidade; datas; inscritos; valor arrecadado; responsável; custos; margem; exportação da lista de participantes.

### Filhos da Casa
O filho é vinculado a um `client_id` quando a pessoa também participa como cliente. Mensalidades, histórico, campanhas e situação financeira ficam no mesmo ecossistema.

### Financeiro
Entradas manuais/importadas/Asaas, fechamento diário, competência, reconciliação, comissões, custos, impostos e relatórios contábeis.

### Performance
Fonte Reportei `Sunshine Oráculos`, KPIs, medições e sincronizações. Métricas de marketing não são misturadas diretamente às tabelas financeiras; o cruzamento ocorre por campanha/período/trabalho.

## 6. Dashboard

Indicadores planejados:

- faturamento e quantidade de entradas;
- ticket médio;
- comissões por pessoa;
- receita e margem por serviço/trabalho;
- ranking de trabalhos por rentabilidade;
- próximos trabalhos, inscritos e já arrecadado;
- alcance, engajamento e cliques;
- relação entre atividade de conteúdo, performance e faturamento.

## 7. Custos e rentabilidade

A aba `TABELA VALORES` da base 2026 já contém estrutura de insumos e custos. O sistema terá catálogo de `cost_items` e composição de custo por serviço/trabalho. A rentabilidade será calculada por receita menos custos atribuíveis e não pela simples divisão de receita por volume de posts.

## 8. Camadas técnicas

### Front-end
HTML/CSS/JavaScript estático, responsivo, hospedado inicialmente no GitHub Pages.

### Dados
Supabase Postgres exclusivo da Sunshine.

### Autenticação
Supabase Auth. Perfis em `team_members`: ADMIN, EDITOR e VIEWER.

### Integrações sensíveis
Asaas e Reportei executados no backend/Edge Functions. Chaves privadas nunca chegam ao GitHub Pages.

### Legado
`import_batches` + `import_rows` preservam a fonte e permitem auditoria e reconciliação antes da promoção.

## 9. Perfis iniciais

- Yasmin: ADMIN.
- Rosely: EDITOR.
- Lourdes: EDITOR.

## 10. Segurança

- RLS em todas as tabelas operacionais.
- Funções `security definer` com `search_path` controlado e execução revogada de `PUBLIC`.
- Service role nunca exposta no front-end.
- Auditoria para alterações financeiras relevantes.
- Dados pessoais e planilhas históricas fora do repositório público.
