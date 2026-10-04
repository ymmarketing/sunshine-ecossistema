# Sunshine — contrato de comprovantes de custos

Preparação aplicada em 04/10/2026. Não há integração WhatsApp, IA ou Google Drive nesta entrega.

## Schema e segurança

As seis RPCs do futuro agente estão em **public**, exposto pela API REST do Supabase:

`https://dhpsvwkytcqasmtaeayv.supabase.co/rest/v1/rpc/<nome_da_rpc>`

Usar POST com `Content-Type: application/json` e credencial de servidor `service_role` (ou secret key equivalente no servidor). Nunca incluir a credencial de servidor no frontend ou em prompts do modelo. `PUBLIC`, `anon` e `authenticated` não têm EXECUTE nestas seis funções. As funções de negócio internas ficam no schema `private`, não exposto pelo REST.

As telas usam RPCs separadas `v4_*`, autorizadas pela sessão do ERP e com as mesmas validações de negócio. ADMIN/EDITOR ativo pode editar; VIEWER pode ler. Tanto os lançamentos manuais como os futuros lançamentos por WhatsApp exigem telefone cadastrado. A identidade das telas é resolvida por `auth.uid()`, e não por um telefone fornecido pelo cliente.

O cadastro canônico atual de trabalhos e equipe é `sunshine_v4.works` e `sunshine_v4.team_members`. Os comprovantes, categorias gerais, linhas e log ficam em `public`. `public.work_expenses.work_id` referencia o cadastro canônico V4. Todos os trabalhos antigos usados pelo modelo anterior têm IDs correspondentes na V4; nenhum lançamento histórico foi removido.

## Assinaturas finais

```sql
public.list_active_expense_targets() returns jsonb
public.create_pending_receipt(from_phone text, payload jsonb) returns jsonb
public.update_pending_receipt(receipt_id uuid, from_phone text, payload jsonb) returns jsonb
public.confirm_receipt(receipt_id uuid, from_phone text) returns jsonb
public.cancel_receipt(receipt_id uuid, from_phone text) returns jsonb
public.attach_receipt_file(receipt_id uuid, drive_file_id text, drive_url text) returns jsonb
```

O telefone deve usar E.164: `+`, país, DDD e número, sem espaços. Todas as operações com `from_phone` resolvem um membro ativo ADMIN/EDITOR; um membro com somente VIEWER é recusado. O vínculo de arquivo é uma operação de servidor e não recebe telefone.

## Exemplos de chamada e resposta

Os exemplos abaixo usam `supabaseAdmin.rpc`, um cliente de servidor. IDs e telefone são ilustrativos: o cadastro real deve ser feito por uma pessoa no ERP. Escolher sempre os IDs retornados por `list_active_expense_targets()`. Valores de payload são **reais**, não centavos; números decimais usam ponto no JSON.

### 1. Listar as opções ativas

```js
const { data: opcoes } = await supabaseAdmin.rpc('list_active_expense_targets');
```

Exemplo de resposta:

```json
{
  "ok": true,
  "receipt_id": null,
  "resumo": "Opções ativas do ERP.",
  "works": [
    {
      "id": "6337b37e-ea2a-4b22-8362-a3a8ae2702c3",
      "title": "Magia Cigana",
      "work_type": "COLLECTIVE",
      "scheduled_at": "2026-10-13T23:00:00+00:00",
      "entity_detail": null,
      "status": "OPEN"
    }
  ],
  "cost_items": [
    {"id": "b1233780-076d-4817-bc43-a3f66962d1a8", "name": "Materiais e insumos"}
  ],
  "general_cost_categories": [
    {"id": "11111111-1111-4111-8111-111111111111", "name": "Estoque da casa", "kind": "RATEIO_GERAL", "description": null}
  ]
}
```

A lista real inclui todas as opções ativas. Categorias gerais começaram vazias e surgem imediatamente depois do cadastro humano.

### 2. Criar comprovante pendente

```js
const telefone = '+5531999999999';
const payload = {
  total_amount: 100,
  expense_date: '2026-10-04',
  competence_month: '2026-10-01',
  supplier_name: 'Fornecedor de materiais',
  payment_method: 'PIX',
  whatsapp_message_id: 'wamid.mensagem-original',
  raw_text: 'Nota 100 reais: 50 Magia Cigana e 50 estoque da casa',
  ai_extraction: {},
  notes: 'Compra de velas',
  lines: [
    {
      destination: 'TRABALHO',
      work_id: '6337b37e-ea2a-4b22-8362-a3a8ae2702c3',
      cost_item_id: 'b1233780-076d-4817-bc43-a3f66962d1a8',
      description: 'Velas para Magia Cigana',
      amount: 50
    },
    {
      destination: 'RATEIO_GERAL',
      general_category_id: '11111111-1111-4111-8111-111111111111',
      description: 'Velas para estoque geral',
      amount: 50
    }
  ]
};
const { data: criado } = await supabaseAdmin.rpc('create_pending_receipt', {
  from_phone: telefone, payload
});
const comprovanteId = criado.receipt_id; // continuar somente se criado.ok === true
```

```json
{
  "ok": true,
  "receipt_id": "22222222-2222-4222-8222-222222222222",
  "resumo": "Comprovante registrado. Confira o rateio e confirme para contabilizar o custo.",
  "idempotent": false,
  "status": "PENDING_CONFIRMATION",
  "total_amount": 100,
  "line_count": 2
}
```

A origem é fixada em WHATSAPP por esta RPC. A mensagem original é obrigatória e única. Repetir a mesma mensagem devolve o comprovante existente com `idempotent: true`, sem recriar linhas. O banco nunca cria trabalho, categoria ou membro.

### 3. Corrigir o comprovante pendente

```js
const corrigido = {
  ...payload,
  notes: 'Correção do rateio recebida em nova mensagem',
  lines: [
    {...payload.lines[0], amount: 60},
    {...payload.lines[1], amount: 40}
  ]
};
const { data: atualizado } = await supabaseAdmin.rpc('update_pending_receipt', {
  receipt_id: comprovanteId,
  from_phone: telefone,
  payload: corrigido
});
```

```json
{
  "ok": true,
  "receipt_id": "22222222-2222-4222-8222-222222222222",
  "resumo": "Comprovante corrigido. Confira o novo rateio e confirme.",
  "idempotent": false,
  "status": "PENDING_CONFIRMATION",
  "total_amount": 100,
  "line_count": 2
}
```

Substitui dados editáveis e todas as linhas na mesma transação. `whatsapp_message_id`, `source`, remetente e ID do comprovante original são preservados. Não atribuir o ID da nova mensagem ao campo único do comprovante; o log bruto poderá guardar a mensagem de correção separadamente quando a futura integração existir. Opcionais omitidos em uma correção são limpos; enviar novamente os opcionais que devem permanecer.

### 4. Confirmar

```js
const { data: confirmado } = await supabaseAdmin.rpc('confirm_receipt', {
  receipt_id: comprovanteId, from_phone: telefone
});
```

```json
{
  "ok": true,
  "receipt_id": "22222222-2222-4222-8222-222222222222",
  "resumo": "Comprovante confirmado. O custo foi registrado.",
  "idempotent": false,
  "status": "CONFIRMED",
  "total_amount": 100,
  "line_count": 2
}
```

Reconfere soma e elegibilidade dos destinos, registra membro e horário. Nova confirmação do mesmo comprovante é idempotente. Confirmar não dá baixa de pagamento nem altera reserva de caixa ou comissões.

### 5. Vincular arquivo já existente

```js
const { data: arquivo } = await supabaseAdmin.rpc('attach_receipt_file', {
  receipt_id: comprovanteId,
  drive_file_id: 'arquivo_exemplo_123',
  drive_url: 'https://drive.google.com/file/d/arquivo_exemplo_123/view'
});
```

```json
{
  "ok": true,
  "receipt_id": "22222222-2222-4222-8222-222222222222",
  "resumo": "Arquivo vinculado ao comprovante.",
  "idempotent": false,
  "status": "CONFIRMED",
  "total_amount": 100,
  "line_count": 2
}
```

Aceita somente CONFIRMED. A mesma combinação de ID e URL retorna `idempotent: true`. Recusa sobrescrever outro arquivo. Valida HTTPS, domínio Drive e correspondência do ID com o link. Esta função **apenas grava os metadados**: não cria, baixa, envia ou verifica permissões de arquivos no Drive.

### 6. Cancelar

```js
const { data: cancelado } = await supabaseAdmin.rpc('cancel_receipt', {
  receipt_id: comprovanteId, from_phone: telefone
});
```

```json
{
  "ok": true,
  "receipt_id": "22222222-2222-4222-8222-222222222222",
  "resumo": "Comprovante cancelado. O custo foi retirado dos totais.",
  "idempotent": false,
  "status": "CANCELLED",
  "total_amount": 100,
  "line_count": 2
}
```

Pode cancelar pendente ou confirmado. Preserva linhas, remetente, confirmação e arquivo. Cancelamento repetido é idempotente. Um cancelado não pode ser reaberto; uma correção posterior exige novo comprovante.

### Exemplo de erro

```js
const { data: erro } = await supabaseAdmin.rpc('update_pending_receipt', {
  receipt_id: comprovanteId,
  from_phone: telefone,
  payload: {...payload, total_amount: 120} // linhas continuam somando 100
});
```

Com comprovante ainda pendente:

```json
{
  "ok": false,
  "code": "SOMA_DIFERENTE",
  "message": "A soma do rateio (R$ 100,00) é diferente do total do comprovante (R$ 120,00). Corrija os valores e envie de novo."
}
```

Nada é parcialmente gravado quando `ok` é false. Erros de negócio retornam JSON; falhas na credencial REST, falta de EXECUTE ou um parâmetro UUID malformado são recusados pela camada REST antes da execução e devem ser tratados como erro HTTP pelo servidor.

## Exemplo REST

```bash
curl -X POST \
  'https://dhpsvwkytcqasmtaeayv.supabase.co/rest/v1/rpc/confirm_receipt' \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Content-Profile: public' \
  --data '{"receipt_id":"22222222-2222-4222-8222-222222222222","from_phone":"+5531999999999"}'
```

Não há código de integração nesta entrega; o exemplo documenta o contrato para o servidor futuro.

## Principais códigos de erro

| Código | Significado |
|---|---|
| NAO_AUTORIZADO | Telefone ausente, inválido, desconhecido, membro inativo ou sem permissão |
| TRABALHO_NAO_ENCONTRADO | ID não existe no cadastro canônico do ERP |
| TRABALHO_INATIVO | Trabalho fora de PLANNED/OPEN |
| CATEGORIA_NAO_ENCONTRADA | Categoria não cadastrada ou não selecionada |
| CATEGORIA_INATIVA | Categoria desativada |
| TIPO_CATEGORIA_INVALIDO | Tipo da categoria geral diferente do destino |
| SOMA_DIFERENTE | Soma das linhas diferente do total |
| STATUS_INVALIDO | Operação incompatível com o status atual |
| COMPROVANTE_NAO_ENCONTRADO | Comprovante inexistente |
| DESTINO_INVALIDO | Destino desconhecido ou associações incompatíveis |
| VALOR_INVALIDO | Valor zero/negativo, excessivo ou com mais de duas casas decimais |
| DATA_INVALIDA | Data ausente ou competência fora do primeiro dia do mês |
| MENSAGEM_OBRIGATORIA | ID da mensagem original ausente |
| ARQUIVO_INVALIDO | ID ou link inválido/inconsistente |
| ARQUIVO_JA_VINCULADO | Tentativa de sobrescrever outro arquivo |
| DADOS_INVALIDOS / DUPLICADO | Campo inválido ou violação de unicidade |
| ERRO_INTERNO | Falha inesperada, sem exposição de detalhes internos |

## Visão mensal e telas

`public.v_monthly_expenses` tem uma linha por rateio CONFIRMED. Somar **line_amount**, e não `receipt_total_amount`, pois o total da nota se repete nas linhas. RATEIO_GERAL permanece custo da casa, sem distribuição automática.

Colunas: `competence_month`, `expense_date`, `supplier_name`, `receipt_total_amount`, `line_amount`, `destination`, `target_name`, `cost_item_name`, `sent_by`, `drive_url`, `receipt_id`, `line_id`, `work_id`, `general_category_id`, `cost_item_id`, `source`.

Menu/Custos: Comprovantes, Categorias gerais e Equipe — WhatsApp. O botão de novo custo abre o lançamento de comprovante. Custos antigos continuam editáveis nas telas existentes. As listas mensais distinguem pendentes, confirmados e cancelados. Nos trabalhos, cada linha mostra situação, acesso ao comprovante e link do Drive, quando existir.

As categorias gerais começam vazias. Telefones não foram preenchidos automaticamente. Para começar, uma pessoa precisa cadastrar categorias e o telefone dos membros nas novas telas.

## Validação realizada

- SQL em transação com rollback: nota manual R$100 = R$50 trabalho + R$50 RATEIO_GERAL, confirmação e visão mensal.
- RPCs executadas com SET ROLE service_role sem sessão humana.
- Correção pendente preservando mensagem original, recusas sem gravação parcial e soma divergente na confirmação.
- Categorias novas imediatamente disponíveis; trabalho inexistente/concluído e categoria inativa recusados.
- Confirmação, cancelamento e vínculo de arquivo idempotentes; confirmado protegido contra edição direta das linhas.
- Compatibilidade de custo antigo sem comprovante/categoria e com trabalho concluído.
- VIEWER consulta e não escreve; agente RPCs não executáveis por anon/authenticated.
- REST real: chamada da chave pública encontra a função em public e é recusada com HTTP401/42501.
- Testes de interface: lançamento misto, correção, confirmação, cancelamento, total divergente, nova categoria, telefone E.164, VIEWER e links de comprovante/Drive.
- Regressão das operações de custo anteriores e dos testes de interface existentes.
- O ambiente não disponibilizou navegador para inspeção visual: o download do Chromium falhou. A validação de interface foi funcional, pelo DOM.

Os dados e telefones temporários dos testes foram revertidos; não ficaram notas, categorias ou telefones fictícios no ERP.
