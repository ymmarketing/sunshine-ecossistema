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
- GitHub + GitHub Pages durante desenvolvimento/homologação.
- Supabase Auth + Postgres + RLS.
- Integrações previstas: Asaas e Reportei.

## Backend Sunshine

Projeto Supabase exclusivo criado em 27/08/2026:

- projeto: `sunshine-ecossistema`
- referência: `dhpsvwkytcqasmtaeayv`
- região: São Paulo (`sa-east-1`)
- organização: `ymmarketing's Org`
- RLS: habilitado em todas as tabelas operacionais
- security advisor: sem alertas após hardening inicial

O frontend utiliza somente a chave **publishable**. Segredos de Asaas, Reportei e service role não podem ser publicados no GitHub.

## Módulos

1. Home
2. Dashboard
3. Agenda
4. Clientes
5. Trabalhos
6. Filhos da Casa
7. Consultas / Histórico
8. Financeiro
9. Performance
10. Configurações

## Modelo canônico v1

O banco inicial já contém domínios para:

- equipe e permissões;
- Cliente 360 e aliases;
- perfil/histórico de Odu;
- serviços;
- trabalhos;
- agenda/consultas;
- vendas;
- inscrições em trabalhos;
- pagamentos e alocação de pagamentos em vendas;
- regras e lançamentos de comissão;
- follow-ups;
- Filhos da Casa;
- linha do tempo do cliente;
- custos e despesas;
- campanhas e performance;
- staging de importação;
- auditoria.

## Regras de comissão validadas

- Atendimento da Rosely: Rosely 80%, Yasmin 10%, Lourdes 10%.
- Atendimento da Yasmin: Yasmin 80%, Rosely 10%, Lourdes 10%.

As seis regras foram cadastradas no banco e ficam parametrizadas por responsável e beneficiário.

## Fonte histórica 2026

O arquivo `SUNSHINE ORÁCULOS_CONTROLE GERAL _ 2026.xlsx` será utilizado posteriormente para recuperar o que for confiável: volumetria, faturamento, lançamentos, responsáveis, serviços/trabalhos e outros campos aproveitáveis.

A ausência de dados completos de clientes no legado **não limita o cadastro novo** e **não define o modelo do módulo Clientes**.

## UX/UI

A disciplina de UX segue a Central YM, com identidade visual Sunshine. Como o sistema será usado diariamente, grandes massas de vermelho, dourado ou marrom escuro são evitadas. A marca aparece em acentos, enquanto o ambiente operacional permanece claro, leve e confortável.

## Status

**v0.5 — backend exclusivo ativo + interface em homologação funcional.**

- Menos Bucho pausado temporariamente para liberar a vaga gratuita.
- Supabase Sunshine criado e saudável.
- 26 tabelas operacionais criadas com RLS.
- 3 membros iniciais cadastrados: Yasmin, Rosely e Lourdes.
- 6 regras de comissão cadastradas.
- fonte Reportei `Sunshine Oráculos` preparada no banco.
- frontend conectado ao endpoint do Supabase por chave publishable.
- próximos módulos funcionais: Cliente 360, Agenda e Trabalhos.
