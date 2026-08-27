# Ecossistema Sunshine Oráculos

Sistema operacional interno da Sunshine Oráculos, criado **do zero** a partir dos requisitos do negócio e dos aprendizados técnicos da Central YM. A arquitetura canônica da Sunshine não é derivada de nenhuma planilha histórica.

## Princípio de arquitetura

O sistema define primeiro o modelo ideal da operação Sunshine. Só depois as bases históricas são mapeadas para esse modelo. A planilha histórica de 2026 é fonte futura de importação e reconciliação, nunca modelo estrutural.

## Core do ecossistema

`clients` é a identidade central. A partir do cliente, o sistema relaciona agenda, consultas, trabalhos, inscrições, vendas, pagamentos, comissões, follow-ups, arquivos por link, campanhas e histórico.

Cliente, venda e pagamento continuam sendo entidades distintas no banco. Na operação humana, porém, o sistema reduz passos: o Lançamento Rápido cria cliente + venda + pagamento e, quando aplicável, também a inscrição no trabalho.

## Stack

- HTML/CSS/JavaScript estático.
- Supabase Auth + Postgres + RLS + Vault + Edge Functions.
- GitHub para versionamento.
- Vercel para produção.
- Reportei conectado.
- Asaas preparado via API + Webhooks.

## Backend Sunshine

- Supabase: `sunshine-ecossistema`
- referência: `dhpsvwkytcqasmtaeayv`
- região: São Paulo (`sa-east-1`)
- RLS nas tabelas operacionais
- logins: Yasmin, Rosely e Lourdes
- API Key do Asaas armazenada exclusivamente no Supabase Vault quando a conexão for concluída

## Módulos

1. Home operacional
2. Dashboard executivo
3. Agenda + Calendário espiritual
4. Clientes / Cliente 360
5. Trabalhos e inscrições
6. Campanhas
7. Arquivos por links do Drive
8. Filhos da Casa
9. Consultas / Histórico
10. Financeiro
11. Performance
12. Configurações

## Fluxo Asaas v3

O Asaas não define automaticamente o produto comprado. Ele informa que um pagamento ocorreu e fornece o identificador da cobrança e do cliente. O Ecossistema Sunshine usa esse evento como **entrada financeira a classificar**.

Fluxo:

`Pagamento no Asaas → Webhook → Entrada do Asaas a registrar → conferir/complementar cliente → informar serviço/trabalho → criar venda → vincular pagamento → gerar inscrição/comissão quando aplicável`

### Implementação

- Edge Function `asaas-connect`: valida a API Key, armazena-a no Vault, cria/atualiza o webhook no Asaas e grava o estado da conexão.
- Edge Function `asaas-webhook`: recebe eventos externos com token próprio de webhook, grava o evento de forma idempotente e enriquece o cliente consultando a API do Asaas.
- Eventos monitorados: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED` e `PAYMENT_REFUNDED`.
- Eventos duplicados são ignorados por `asaas_event_id` único.
- Pagamentos recebidos entram em `asaas_incoming_payments` como `PENDING`.
- A barra de notificações mostra a quantidade de entradas a registrar.
- Ao resolver uma pendência, o sistema pode vincular um cliente existente ou criar um novo, complementando CPF/CNPJ, telefone, e-mail e endereço com dados do Asaas.
- O pagamento final é gravado com `source = ASAAS` e `external_ref = asaas_payment_id`, impedindo duplicidade financeira.
- Se a classificação for um trabalho, a inscrição é criada automaticamente.
- A alocação do pagamento à venda aciona o motor de comissão existente.

### Conexão pelo próprio sistema

Yasmin, como administradora, pode ir em **Configurações → Integração Asaas → Conectar Asaas** e informar:

- ambiente Produção ou Sandbox;
- e-mail para alertas do webhook;
- API Key do Asaas.

A API Key é enviada por HTTPS ao backend, validada e armazenada criptografada no Vault. Ela não fica no HTML nem no GitHub.

## Regras de comissão

- Rosely responsável: Rosely 80%, Yasmin 10%, Lourdes 10%.
- Yasmin responsável: Yasmin 80%, Rosely 10%, Lourdes 10%.

## Relação Sunshine x YM

A Sunshine é cliente YM. O Ecossistema Sunshine organiza a operação, trabalhos, vendas e necessidade comercial. O conteúdo é produzido pela YM e validado na Central YM. O módulo Campanhas acompanha a execução sem duplicar a fonte oficial do conteúdo.

## Produção

Projeto Vercel: `sunshine-ecossistema`

URL atual:

`https://sunshine-ecossistema-ym-marketing-negocios.vercel.app`

Domínio desejado:

`https://sunshine.ymnegocios.com.br`

A associação do domínio customizado ainda depende da configuração de domínio/DNS no painel da Vercel ou no provedor DNS.

## UX/UI

A disciplina de UX segue a Central YM, com identidade Sunshine. O ambiente permanece claro e leve para uso diário, usando vermelho/dourado/marrom apenas como acentos.

## Status

**v3.0 — operação + Inbox Asaas preparada em produção.**

- produção Vercel respondendo HTTP 200;
- Lançamento Rápido ativo;
- status em português;
- Arquivos por link do Drive;
- Calendário espiritual;
- Campanhas 3 meses + fluxo YM/Central YM;
- barra de notificações Asaas;
- caixa “Entradas do Asaas a registrar”;
- conexão Asaas automatizada por Edge Function;
- webhook Asaas implantado;
- fluxo de resolução Asaas testado em transação com rollback;
- impedimentos externos restantes: informar a API Key dentro da tela Configurações e associar `sunshine.ymnegocios.com.br` ao projeto Vercel.
