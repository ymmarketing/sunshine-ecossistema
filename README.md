# Ecossistema Sunshine Oráculos

Sistema operacional interno da Sunshine Oráculos, criado do zero a partir dos aprendizados técnicos da Central YM, mas com banco, regras, segurança e integrações próprios.

## Fonte oficial de dados

A base histórica oficial para a implantação é o arquivo `SUNSHINE ORÁCULOS_CONTROLE GERAL _ 2026.xlsx`, fornecido em 27/08/2026. O arquivo não é versionado neste repositório público porque contém dados operacionais e pessoais de clientes.

A importação será feita por staging no Supabase, preservando linha de origem e permitindo reconciliação antes da promoção dos registros para as tabelas oficiais.

## Princípios

- `clients` é a identidade central do ecossistema sempre que o registro possui cliente identificável.
- Registros históricos sem cliente identificado continuam válidos no financeiro e ficam disponíveis para reconciliação posterior.
- Agenda, consultas, trabalhos, inscrições, pagamentos, comissões, custos e performance usam relações explícitas, sem duplicar cadastros.
- Supabase será a fonte oficial da operação.
- Asaas será a fonte automática de pagamentos; lançamentos manuais e importações históricas permanecem suportados.
- Reportei será a fonte de performance de marketing.
- Excel/XLSX será mecanismo de importação, exportação e apoio contábil, não a fonte de verdade depois da implantação.
- Nenhuma credencial, dado de cliente ou chave privada pode ser publicada no GitHub Pages.

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
7. Consultas
8. Financeiro
9. Performance
10. Configurações

## Regras de comissão validadas

- Atendimento da Rosely: Rosely 80%, Yasmin 10%, Lourdes 10%.
- Atendimento da Yasmin: Yasmin 80%, Rosely 10%, Lourdes 10%.

As regras ficam parametrizadas no banco e geram lançamentos de comissão por pagamento confirmado.

## Status

**v0.2 — arquitetura e scaffold inicial.**

- Repositório oficial criado.
- Base 2026 mapeada.
- Modelo relacional inicial definido.
- Migração core preparada, ainda não aplicada.
- Aplicação navegável inicial preparada para conexão com o Supabase exclusivo da Sunshine.
