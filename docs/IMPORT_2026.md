# Mapeamento da base oficial 2026

Fonte: `SUNSHINE ORÁCULOS_CONTROLE GERAL _ 2026.xlsx`.

> O arquivo contém dados de clientes e não deve ser enviado ao repositório público. A importação será realizada diretamente no Supabase exclusivo da Sunshine.

## Estrutura observada

A pasta de trabalho possui 9 abas:

- `FECHAMENTO MENSAL`
- `FINANCEIRO`
- `LANÇAMENTO DIÁRIO`
- `Planilha1`
- `Planilha2`
- `TABELA VALORES`
- `CALENDÁRIO TRABALHOS`
- `FÓRMULA ODU (2)`
- `FÓRMULA ODU`

### LANÇAMENTO DIÁRIO — fonte transacional principal

Existem 1.676 linhas efetivas de lançamentos entre janeiro e agosto de 2026. A planilha possui fórmulas pré-preenchidas até linhas posteriores, portanto a presença de `DATA`/`LANÇAMENTO` é o critério para considerar uma linha como transação histórica.

| Excel | Campo | Destino principal |
|---|---|---|
| A | DATA | `payments.paid_at` / data da transação |
| B | MÊS | derivado da data; preservado no staging |
| C | LANÇAMENTO | `services.name` |
| D | QUAL TRABALHO | `works.title` / tema do trabalho |
| E | DETALHE ENTIDADE | `works.entity_detail` / metadata |
| F | CLIENTE | `clients` + `client_aliases` |
| G | CATEGORIA | `services.category` |
| H | TIPO | classificação financeira |
| I | VALOR | `payments.gross_amount` |
| J | COMISSÃO | legado para reconciliação |
| K | RESPONSÁVEL PELO ATENDIMENTO | `payments.responsible_member_id` |
| L | COMISSÃO LUUH | legado para reconciliação |
| M | COMISSÃO YASMIN | legado para reconciliação |
| N | PARTE ROSELY | legado para reconciliação |
| O | NECESSÁRIO CONTATO? | `follow_ups.required` |
| P | TELEFONE | `clients.phone` quando disponível |
| Q | DATA REALIZAÇÃO | `appointments.starts_at` / `works.scheduled_at` |
| R | DATA CONTATO | `follow_ups.due_at` |

A base possui nomes de cliente em uma parcela das transações. Por isso `payments.client_id` é opcional para legado: faturamento sem identificação de cliente não pode ser descartado nem receber cliente fictício.

### FECHAMENTO MENSAL

É uma visão calculada sobre `LANÇAMENTO DIÁRIO`. No sistema novo ela será reconstruída por consultas/views, não importada como fonte primária.

### FINANCEIRO

Contém consolidações, repasses e pendências. Será usada para reconciliação do resultado da importação e para validar o motor de comissões.

### TABELA VALORES

Contém catálogo de serviços/preços e também estrutura de custos/insumos. Será transformada em `services`, `cost_items` e `service_cost_items`. Isso permite calcular ranking de trabalhos mais e menos rentáveis usando receita e custo, em vez de usar somente faturamento.

### Planilha1 / Planilha2

São consolidações/pivôs auxiliares. Servem para validação da importação, não como fonte de verdade.

### CALENDÁRIO TRABALHOS

Está estruturalmente disponível, mas sem dados relevantes na versão recebida. O calendário oficial passará a ser o módulo `works` + `appointments`.

### FÓRMULA ODU

A lógica será preservada como referência funcional, mas não será misturada ao financeiro. O campo `clients.odu` e uma futura função/calculadora de Odu ficam isolados do núcleo financeiro.

## Estratégia de importação

1. Registrar `import_batch` com hash/nome da fonte.
2. Carregar as 1.676 transações efetivas em `import_rows` como JSON bruto.
3. Normalizar catálogo de serviços.
4. Criar/conciliar clientes identificáveis e aliases.
5. Criar pagamentos históricos com `source = IMPORT`.
6. Vincular trabalhos e consultas quando houver informação suficiente.
7. Recalcular comissões pelo motor atual e comparar com colunas L/M/N do legado.
8. Comparar totais mensais com `FECHAMENTO MENSAL`.
9. Somente após a reconciliação marcar o lote como `RECONCILED`.
