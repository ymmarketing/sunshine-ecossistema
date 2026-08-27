# Ecossistema Sunshine Oráculos

Sistema operacional interno da Sunshine Oráculos, criado **do zero** a partir dos requisitos do negócio e dos aprendizados técnicos da Central YM. A arquitetura canônica da Sunshine não é derivada de nenhuma planilha histórica.

## Princípio de arquitetura

O sistema novo define primeiro o modelo ideal da operação Sunshine. Só depois as bases históricas são mapeadas para esse modelo.

A planilha `SUNSHINE ORÁCULOS_CONTROLE GERAL _ 2026.xlsx` é **fonte histórica de dados para importação e reconciliação**, não modelo de banco, não fonte de requisitos e não fonte de verdade estrutural.

Se um dado do legado não couber no modelo canônico, ele permanece em staging para revisão. O banco oficial nunca será deformado para reproduzir colunas, fórmulas ou limitações da planilha antiga.

## Core do ecossistema

`clients` é a identidade central do sistema. A partir do cadastro único do cliente, o ecossistema relaciona agenda, consultas, trabalhos, inscrições, **vendas**, pagamentos, comissões, follow-ups, histórico de relacionamento e demais módulos.

Cliente, venda e pagamento são entidades diferentes. Isso permite parcelamento, descontos, pendências, estornos, múltiplos serviços e conciliação sem transformar o cadastro de cliente em uma tabela financeira.

## Stack

- HTML/CSS/JavaScript estático.
- Supabase Auth + Postgres + RLS.
- Supabase JS v2 no frontend.
- GitHub para versionamento e homologação.
- Integrações previstas: Asaas e Reportei.

## Backend Sunshine

Projeto Supabase exclusivo criado em 27/08/2026:

- projeto: `sunshine-ecossistema`
- referência: `dhpsvwkytcqasmtaeayv`
- região: São Paulo (`sa-east-1`)
- organização: `ymmarketing's Org`
- RLS: habilitado em todas as tabelas operacionais
- security advisor: sem alertas após hardening

O frontend utiliza somente a chave **publishable**. Segredos de Asaas, Reportei e service role não podem ser publicados no GitHub.

## Módulos v1

1. Home operacional
2. Dashboard executivo
3. Agenda
4. Clientes / Cliente 360
5. Trabalhos e inscrições
6. Filhos da Casa
7. Consultas / Histórico
8. Financeiro
9. Performance
10. Configurações

## Funcionalidades implementadas na v1

- autenticação preparada com Supabase Auth;
- modo visual para homologação sem gravar dados;
- cadastro e edição de clientes;
- ficha Cliente 360 e linha do tempo;
- registro de Odu por cliente;
- agenda com criação e edição de compromissos;
- consultas com orientação e follow-up;
- trabalhos coletivos, premium e particulares;
- inscrições em trabalhos e exportação CSV;
- cadastro de Filhos da Casa vinculado ao cliente;
- registro separado de venda e pagamento;
- conciliação de pagamento com venda;
- geração automática de comissão em pagamento confirmado;
- Dashboard com faturamento, vendas, ticket, comissões e rentabilidade por trabalho;
- campanhas de marketing e estrutura Reportei;
- catálogo de serviços;
- layout responsivo para desktop e celular.

## Regras de comissão validadas

- Atendimento da Rosely: Rosely 80%, Yasmin 10%, Lourdes 10%.
- Atendimento da Yasmin: Yasmin 80%, Rosely 10%, Lourdes 10%.

As seis regras estão cadastradas no banco. O motor de comissão recalcula automaticamente os lançamentos quando um pagamento confirmado é alocado a uma venda com responsável definido.

## Serviços iniciais

O catálogo canônico foi iniciado com:

- Consulta de Baralho — R$ 250 / 60 min;
- Consulta de Búzios — R$ 300 / 40 min;
- Pergunta Objetiva — R$ 30;
- Mensalidade Filho da Casa;
- Trabalho Coletivo;
- Trabalho Coletivo Premium;
- Trabalho Particular.

Os valores de trabalhos permanecem configuráveis por trabalho.

## Fonte histórica 2026

O arquivo `SUNSHINE ORÁCULOS_CONTROLE GERAL _ 2026.xlsx` será utilizado posteriormente para recuperar o que for confiável: volumetria, faturamento, lançamentos, responsáveis, serviços/trabalhos e outros campos aproveitáveis.

A ausência de dados completos de clientes no legado **não limita o cadastro novo** e **não define o modelo do módulo Clientes**.

## UX/UI

A disciplina de UX segue a Central YM, com identidade visual Sunshine. Como o sistema será usado diariamente, grandes massas de vermelho, dourado ou marrom escuro são evitadas. A marca aparece em acentos, enquanto o ambiente operacional permanece claro, leve e confortável.

## Impedimento restante para uso autenticado

Os registros de equipe existem no banco, porém `auth_user_id` e e-mails ainda não foram vinculados a Yasmin, Rosely e Lourdes. Até essa vinculação, a aplicação pode ser homologada pelo **modo visual**, mas operações reais exigem login autenticado e membro de equipe vinculado.

## Status

**v1.0 — interface funcional + backend canônico ativo.**

- Menos Bucho pausado temporariamente para liberar a vaga gratuita.
- Supabase Sunshine criado e saudável.
- 26 tabelas operacionais com RLS.
- Security Advisor sem alertas.
- 3 membros iniciais cadastrados.
- 6 regras de comissão cadastradas.
- motor automático de comissão e eventos de linha do tempo implantados.
- 7 serviços canônicos iniciais cadastrados.
- frontend v1 conectado ao Supabase por chave publishable.
- pendência externa: criação/vinculação dos logins reais da equipe e integrações Asaas/Reportei.
