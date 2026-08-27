# Ecossistema Sunshine Oráculos

Sistema operacional interno da Sunshine Oráculos, criado **do zero** a partir dos requisitos do negócio e dos aprendizados técnicos da Central YM. A arquitetura canônica da Sunshine não é derivada de nenhuma planilha histórica.

## Princípio de arquitetura

O sistema novo define primeiro o modelo ideal da operação Sunshine. Só depois as bases históricas são mapeadas para esse modelo.

A planilha `SUNSHINE ORÁCULOS_CONTROLE GERAL _ 2026.xlsx` é **fonte histórica de dados para importação e reconciliação**, não modelo de banco, não fonte de requisitos e não fonte de verdade estrutural.

Se um dado do legado não couber no modelo canônico, ele permanece em staging para revisão. O banco oficial nunca será deformado para reproduzir colunas, fórmulas ou limitações da planilha antiga.

## Core do ecossistema

`clients` é a identidade central do sistema. A partir do cadastro único do cliente, o ecossistema relaciona agenda, consultas, trabalhos, inscrições, vendas, pagamentos, comissões, follow-ups, histórico de relacionamento e demais módulos.

O cadastro e o histórico de clientes passam a ser construídos prospectivamente no novo sistema, independentemente da incompletude da base histórica.

## Princípios

- Cliente é o core do ecossistema e possui identidade própria, não derivada do financeiro.
- Dados operacionais são normalizados e relacionados por IDs estáveis.
- Agenda, consultas, trabalhos, inscrições, vendas, pagamentos e comissões não duplicam o cadastro do cliente.
- Supabase será a fonte oficial da operação.
- Asaas será fonte automática de pagamentos; lançamentos manuais continuam suportados.
- Reportei será a fonte de performance de marketing.
- Excel/XLSX serve apenas para importação, exportação e apoio contábil.
- Importações históricas entram por staging e só são promovidas quando reconciliadas.
- Nenhuma credencial, dado pessoal ou base histórica é publicada no GitHub Pages.

## Stack inicial

- HTML/CSS/JavaScript estático.
- GitHub + GitHub Pages durante desenvolvimento/homologação.
- Supabase Auth + Postgres + RLS.
- Integrações previstas: Asaas e Reportei.

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

## Regras de comissão validadas

- Atendimento da Rosely: Rosely 80%, Yasmin 10%, Lourdes 10%.
- Atendimento da Yasmin: Yasmin 80%, Rosely 10%, Lourdes 10%.

As regras ficam parametrizadas no banco e geram lançamentos de comissão sobre pagamentos confirmados.

## Fonte histórica 2026

O arquivo `SUNSHINE ORÁCULOS_CONTROLE GERAL _ 2026.xlsx` será utilizado posteriormente para recuperar o que for confiável: volumetria, faturamento, lançamentos, responsáveis, serviços/trabalhos e outros campos aproveitáveis.

A ausência de dados completos de clientes no legado **não limita o cadastro novo** e **não define o modelo do módulo Clientes**.

## Status

**v0.3 — arquitetura greenfield corrigida.**

- Repositório oficial criado.
- Arquitetura separada do legado.
- Cliente confirmado como entidade central.
- Importação 2026 isolada como processo de staging/reconciliação.
- Migração core será mantida independente do formato das planilhas históricas.
- Aplicação navegável inicial preparada para conexão com o Supabase exclusivo da Sunshine.
