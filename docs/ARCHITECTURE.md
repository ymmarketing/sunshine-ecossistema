# Arquitetura oficial — Ecossistema Sunshine

## 1. Objetivo

Construir do zero o sistema operacional da Sunshine Oráculos, usando a Central YM apenas como benchmark de engenharia, segurança, integração e experiência operacional.

O modelo de dados da Sunshine é definido pelos processos que o negócio precisa executar daqui para frente. Planilhas históricas não determinam tabelas, campos, relacionamentos ou regras do sistema.

## 2. Regra de desenho

A ordem oficial é:

1. definir a operação desejada;
2. definir entidades e regras canônicas;
3. construir banco e aplicação;
4. só então mapear dados históricos para o modelo pronto.

A planilha de 2026 é um legado de importação. Quando houver incompatibilidade entre legado e modelo novo, o legado fica em staging/reconciliação. O modelo canônico não é alterado apenas para reproduzir uma coluna antiga.

## 3. Entidade central — Cliente 360

`clients` é a identidade principal do ecossistema.

O cliente nasce por cadastro manual ou integração futura e recebe um ID estável. A partir dele, o sistema consolida:

- identificação e contatos;
- data de nascimento;
- informações de Odu/perfil espiritual quando aplicável;
- consultas e perguntas;
- trabalhos e participações;
- agenda e retornos;
- vendas e pagamentos;
- responsável pelo atendimento;
- follow-ups e registros de relacionamento;
- condição de Filho da Casa, quando aplicável;
- histórico cronológico da relação com a Sunshine.

Dados históricos incompletos não reduzem esse cadastro. Eles apenas geram registros históricos parciais ou pendentes de conciliação.

## 4. Fluxo operacional alvo

1. Conteúdo/campanha gera interesse.
2. ManyChat/WhatsApp recebe a demanda.
3. Cliente é localizado ou cadastrado uma única vez.
4. A necessidade é registrada: consulta, pergunta, trabalho coletivo, premium, particular ou outro serviço.
5. O sistema cria venda/inscrição/agendamento conforme o tipo de serviço.
6. Pagamento entra via Asaas ou lançamento manual.
7. Pagamento confirmado dispara a regra de comissão aplicável.
8. Agenda acompanha realização, cancelamento, reagendamento e retorno.
9. Toda interação relevante atualiza o histórico do cliente.
10. Reportei alimenta performance de marketing.
11. Dashboard cruza operação, venda, financeiro e marketing sem misturar as fontes brutas.

## 5. Domínios canônicos

### Clientes
Cadastro único e independente do financeiro. Deve sustentar crescimento do histórico ao longo do tempo, mesmo que o legado não contenha essas informações.

### Histórico do cliente
Linha do tempo própria com eventos de relacionamento. Não dependerá de uma única coluna de observações.

### Serviços
Catálogo oficial de serviços comercializados pela Sunshine, com categoria, status, preço vigente e regras operacionais.

### Trabalhos
Eventos/trabalhos coletivos, coletivos premium e particulares, com planejamento, abertura de inscrições, data de realização, responsável, inscritos, receita e custos.

### Agenda e Consultas
Compromissos vinculados ao cliente e ao serviço/trabalho quando aplicável. Status: agendado, realizado, cancelado, reagendado e no-show. Deve existir espaço para resumo pós-evento e próximo passo.

### Vendas
Representa o compromisso comercial com o cliente. A venda é separada do pagamento para permitir parcelamento, múltiplos itens, desconto, cobrança posterior e conciliação correta.

### Pagamentos
Movimentações financeiras recebidas. Podem vir de Asaas, lançamento manual ou importação. Um pagamento pode ser conciliado com uma venda e deve carregar o responsável necessário para cálculo de comissão.

### Comissões
Motor parametrizado por vigência. Não é calculado no front-end.

Regra validada atualmente:

- Rosely responsável: Rosely 80%, Yasmin 10%, Lourdes 10%.
- Yasmin responsável: Yasmin 80%, Rosely 10%, Lourdes 10%.

### Filhos da Casa
Perfil operacional ligado ao cadastro do cliente quando a mesma pessoa também é cliente. Controle de pagamentos, histórico, campanhas e situação ativa/inativa.

### Custos e Financeiro
Despesas, custos por trabalho, impostos, fechamento diário, competência, comissões, relatórios contábeis e rentabilidade. O catálogo de custos é criado para o sistema novo; dados antigos podem ser importados depois quando confiáveis.

### Campanhas e Performance
Campanha é uma entidade do sistema, relacionada a serviço/trabalho e ao período de divulgação. Reportei alimenta KPIs e medições; o cruzamento com receita ocorre por relações e período, não por cópia de dados financeiros.

### Importação / Legado
Domínio isolado de staging para qualquer XLSX/CSV antigo. Não faz parte do core operacional.

## 6. Dashboard

Indicadores planejados:

- faturamento e quantidade de entradas;
- ticket médio;
- comissões por pessoa;
- receita e margem por serviço/trabalho;
- rankings de rentabilidade;
- próximos trabalhos, inscritos e arrecadação;
- agenda e próximos atendimentos;
- clientes novos, recorrentes e inativos;
- alcance, engajamento e cliques;
- correlação descritiva entre conteúdo, campanha, demanda e faturamento.

## 7. Página inicial

A Home deve funcionar como painel operacional diário, contendo pelo menos:

- calendário/agenda;
- próximo trabalho;
- data prevista;
- inscritos;
- já arrecadado;
- alertas e pendências;
- indicadores do Reportei: engajamento, cliques e desempenho.

## 8. Camadas técnicas

### Front-end
Aplicação web responsiva. Durante desenvolvimento/homologação, hospedagem via GitHub Pages.

### Dados
Supabase Postgres exclusivo da Sunshine.

### Autenticação
Supabase Auth com perfis internos em `team_members`.

Perfis iniciais:

- Yasmin: ADMIN.
- Rosely: EDITOR.
- Lourdes: EDITOR.

### Integrações sensíveis
Asaas e Reportei executados em backend/Edge Functions. Chaves privadas nunca chegam ao front-end público.

### Importação histórica
`import_batches` e `import_rows` guardam o legado bruto. Processos de conciliação transformam apenas os registros confiáveis em entidades canônicas.

## 9. Segurança e governança

- RLS em tabelas operacionais.
- Service role nunca exposta no navegador.
- Credenciais fora do GitHub público.
- Auditoria de alterações financeiras e administrativas importantes.
- Dados pessoais não são versionados no repositório.
- Regras de negócio críticas ficam no banco/backend, não apenas na interface.

## 10. Regra permanente de evolução

Nenhuma nova planilha, integração ou fonte externa poderá virar automaticamente o modelo do sistema. Novas fontes devem se adaptar à arquitetura canônica da Sunshine por meio de mapeamento, staging e conciliação.
