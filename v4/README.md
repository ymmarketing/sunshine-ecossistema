# Sunshine V4 — Fundação isolada (P0-A + P0-B)

**Status:** primeiro vertical slice funcional em ambiente isolado.  
**Branch:** `v4-isolated-foundation`  
**Regra:** nenhum acesso de escrita à V3, nenhum dado real, nenhum secret de produção, nenhum deploy.

## Protocolo ajustado

O backup restaurável da V3 continua obrigatório, mas não bloqueia o desenvolvimento isolado da V4.
Ele bloqueia apenas:

- migração de dados reais;
- conexão da V4 ao banco produtivo;
- ativação do Asaas;
- publicação da V4;
- qualquer operação financeira real.

## Modelo de domínio v0.1

```text
Pessoa
  ↓
Contratação
  ↓
Item ───────────────→ Beneficiário
  ↓
Obrigação
  ↑
Alocação
  ↑
Pagamento ──────────→ Pagador
```

Regras implementadas:

- pagador ≠ beneficiário é nativo;
- cada item gera uma obrigação própria;
- uma contratação pode ter vários itens;
- pagamento e obrigação são independentes;
- alocação é N:N;
- saldo é derivado, nunca digitado;
- valores são inteiros em centavos;
- tabela de preço não trava valor combinado;
- excesso permanece não alocado até decisão explícita;
- idempotência existe para contratos/pagamentos/alocações;
- auditoria é append-only no slice;
- permissões são por ação, não apenas ADMIN/EDITOR.

## P0-A implementado

- pessoa;
- contratação;
- item;
- obrigação;
- pagamento manual demo;
- alocação;
- pagamento parcial;
- vários pagamentos → uma obrigação;
- um pagamento → várias obrigações;
- terceiro pagador;
- proteção contra sobrealocação;
- idempotência;
- permissões;
- auditoria;
- migration PostgreSQL com `FOR UPDATE` no motor de alocação.

## P0-B implementado

- contas a receber;
- saldo pendente;
- vencimento original;
- data esperada de pagamento;
- próxima cobrança;
- histórico de promessas;
- tarefa de cobrança;
- dimensões separadas de status: liquidação, vencimento e cobrança;
- regras de comissão versionadas;
- comissão proporcional ao valor alocado;
- Home com indicadores derivados.

> Percentuais de comissão usados em testes/UI são exclusivamente DEMO e não constituem regra comercial da Sunshine.

## Primeiro vertical slice provado

1. cliente contrata serviço de R$600;
2. outra pessoa pode ser a pagadora;
3. entram R$300;
4. R$300 são alocados;
5. obrigação fica `PARTIAL` com saldo de R$300;
6. vencimento original é preservado;
7. nova promessa é registrada em histórico;
8. cobrança passa para `PROMISE`;
9. Home mostra R$300 a receber;
10. se houver regra demo ativa, comissão é calculada apenas sobre o valor efetivamente alocado.

## Testes automatizados

```bash
cd v4
npm test
```

A primeira suíte contém **14 testes** cobrindo isolamento, terceiro pagador, N:N de pagamentos/obrigações, excesso, sobrealocação, idempotência, autorização, proteção valor x identificador, parcial, promessa, cobrança, comissão versionada e auditoria.

## Demo local

```bash
cd v4
npm start
```

Abrir `http://127.0.0.1:4174`.

A demo usa somente memória do processo Node e pode ser zerada a qualquer momento.

## Migrations

`migrations/001_v4_foundation.sql` contém o schema V4 inicial para PostgreSQL/Supabase isolado.

**Não foi aplicada à V3 e não deve ser aplicada à produção.**

Antes de qualquer dado real ou integração externa, o Gate F0 de backup/restauração deve estar concluído.
