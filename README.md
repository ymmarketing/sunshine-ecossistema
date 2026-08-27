# Ecossistema Sunshine Oráculos

Sistema operacional interno da Sunshine Oráculos, criado **do zero** a partir dos requisitos do negócio e dos aprendizados técnicos da Central YM. A arquitetura canônica da Sunshine não é derivada de nenhuma planilha histórica.

## Princípio de arquitetura

O sistema novo define primeiro o modelo ideal da operação Sunshine. Só depois as bases históricas são mapeadas para esse modelo.

A planilha `SUNSHINE ORÁCULOS_CONTROLE GERAL _ 2026.xlsx` é **fonte histórica de dados para importação e reconciliação**, não modelo de banco, não fonte de requisitos e não fonte de verdade estrutural.

## Core do ecossistema

`clients` é a identidade central do sistema. A partir do cadastro único do cliente, o ecossistema relaciona agenda, consultas, trabalhos, inscrições, vendas, pagamentos, comissões, follow-ups, arquivos por link, campanhas e histórico de relacionamento.

Cliente, venda e pagamento continuam sendo entidades distintas no banco, mas a rotina operacional foi simplificada: o **Lançamento Rápido** permite criar cliente + venda + pagamento em uma única ação e, quando existe trabalho selecionado, cria também a inscrição.

## Stack

- HTML/CSS/JavaScript estático.
- Supabase Auth + Postgres + RLS.
- Supabase JS v2 no frontend.
- GitHub para versionamento.
- Vercel para produção.
- Integrações: Reportei conectado; Asaas previsto via backend seguro.

## Backend Sunshine

Projeto Supabase exclusivo criado em 27/08/2026:

- projeto: `sunshine-ecossistema`
- referência: `dhpsvwkytcqasmtaeayv`
- região: São Paulo (`sa-east-1`)
- organização: `ymmarketing's Org`
- RLS: habilitado em todas as tabelas operacionais
- logins ativos: Yasmin, Rosely e Lourdes

## Módulos v2

1. Home operacional
2. Dashboard executivo
3. Agenda
4. Clientes / Cliente 360
5. Trabalhos e inscrições
6. Campanhas
7. Arquivos
8. Filhos da Casa
9. Consultas / Histórico
10. Financeiro
11. Performance
12. Configurações

## Funcionalidades v2

- autenticação por usuário simples: Yasmin, Rosely ou Lourdes;
- troca obrigatória da senha inicial;
- cadastro e edição de clientes;
- Cliente 360 e linha do tempo;
- Odu por cliente;
- agenda e histórico de consultas;
- calendário espiritual dentro da Agenda, com datas anuais, semanais ou únicas;
- trabalhos coletivos, premium e particulares;
- inscrições e exportação CSV;
- Lançamento Rápido: cliente + venda + pagamento + inscrição no trabalho em uma única operação atômica;
- vendas e pagamentos continuam separados tecnicamente, mas a equipe não precisa lançar os dois em telas diferentes na rotina comum;
- status exibidos em português, mantendo enums técnicos canônicos no banco;
- comissões 80/10/10 automáticas em pagamentos confirmados;
- ambiente Arquivos que salva apenas links do Google Drive/Docs, nunca imagens no banco;
- Campanhas com análise técnica dos trabalhos dos próximos 3 meses;
- acompanhamento de conteúdo YM e validação pela Central YM;
- link de referência para a Central YM sem duplicar o conteúdo no Sunshine;
- Reportei preparado/conectado como fonte de performance;
- UX mobile refinada para uso diário.

## Regras de comissão validadas

- Atendimento da Rosely: Rosely 80%, Yasmin 10%, Lourdes 10%.
- Atendimento da Yasmin: Yasmin 80%, Rosely 10%, Lourdes 10%.

## Relação Sunshine x YM

A Sunshine é cliente da YM. O Ecossistema Sunshine organiza a operação, trabalhos, vendas, calendário e necessidades comerciais. A produção de conteúdo é responsabilidade da YM e a validação oficial acontece na Central YM.

O módulo Campanhas do Sunshine acompanha:

- trabalho e data;
- janela comercial;
- inscritos e receita;
- hipótese comercial;
- análise técnica;
- prioridade;
- status do conteúdo YM;
- status de validação Central YM;
- link para a referência oficial na Central YM.

O conteúdo em si não é duplicado no Ecossistema Sunshine.

## Produção

Projeto Vercel: `sunshine-ecossistema`

URL de produção atual:

`https://sunshine-ecossistema-ym-marketing-negocios.vercel.app`

Domínio desejado:

`https://sunshine.ymnegocios.com.br`

A associação do domínio customizado depende da configuração de domínio/DNS no painel da Vercel ou no provedor DNS. O conector disponível não expõe a ação de adicionar domínio ao projeto.

## Fonte histórica 2026

O arquivo histórico será utilizado posteriormente para importação e reconciliação. A base histórica não define a arquitetura do sistema novo.

## UX/UI

A disciplina de UX segue a Central YM, com identidade visual Sunshine. Grandes massas de vermelho, dourado ou marrom escuro são evitadas. A marca aparece em acentos e o ambiente operacional permanece claro, leve e confortável para uso diário.

## Status

**v2.0 — backend ativo + produção Vercel + aceleração operacional.**

- Supabase exclusivo ativo.
- RLS ativo.
- logins de Yasmin, Rosely e Lourdes ativos.
- motor de comissão ativo.
- Lançamento Rápido implantado e testado em transação com rollback.
- Arquivos por links de Drive implantado.
- Calendário espiritual implantado.
- Campanhas 3 meses + fluxo YM/Central YM implantado.
- produção Vercel respondendo HTTP 200.
- impedimento externo restante: associar `sunshine.ymnegocios.com.br` ao projeto Vercel e ajustar DNS caso necessário.
