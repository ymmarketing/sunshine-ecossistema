# API do agente Sunshine

Implementada em `sunshine-ecossistema` (`dhpsvwkytcqasmtaeayv`), schema canônico `sunshine_v4`. As quatro RPCs abaixo ficam em `public` e aceitam somente `service_role`. A chave permanece no servidor do agente.

## Assinaturas finais

```sql
public.get_birthdays_for_agent(p_reference date) returns jsonb
public.get_relationship_alerts(p_reference date) returns jsonb
public.register_agent_follow_up(person_id uuid, alert_type text, from_phone text, note text) returns jsonb
public.get_finance_period(from_phone text, p_start date, p_end date) returns jsonb
```

Chamar por `POST /rest/v1/rpc/<nome>`, com os parâmetros como objeto JSON. Todas retornam `ok: true` ou `ok: false, code, message` em português. Entradas de tipo `date` precisam chegar como `YYYY-MM-DD`: datas impossíveis e UUIDs malformados são rejeitados pelo PostgREST antes de entrar na função e devem ser tratados também pelo servidor do agente.

## Aniversariantes

| Campo | Descrição |
| --- | --- |
| `date` | Data consultada. |
| `people` | Lista, vazia quando não há aniversários. Somente pessoas não inativas. |
| `person_id` | Identificador canônico da pessoa. |
| `full_name` | Nome completo cadastrado. |
| `first_name` | Nome preferido não vazio; na ausência, primeiro nome do nome completo. Capitalização Unicode: BRUNA → Bruna; ângela → Ângela. |
| `birth_date` | Data de nascimento cadastrada. |
| `age` | Idade completada no aniversário do ano consultado. |
| `phone` | Telefone normalizado; preserva o original quando inválido. Pode ser nulo. |
| `phone_valid` | Indica normalização sintática válida; não comprova que o número possui WhatsApp. |

A tela e a RPC usam `private.agent_birthdays`. Em anos comuns, 29/02 é comemorado em 28/02, inclusive no indicador “hoje” da tela. Brasileiros com DDD e 10/11 dígitos são normalizados para +55; números internacionais com + mantêm o país. Números ambíguos não recebem dígitos inventados.

## Relacionamento

| Campo | Descrição |
| --- | --- |
| `date`, `alerts` | Data de referência e lista de alertas. |
| `alert_type` | Tipo existente em `agent_alert_rules`. |
| `person_id`, `full_name`, `phone`, `phone_valid` | Identificação e contato, como acima. |
| `fact` | Fato do histórico em português, sem proposta de ação. |
| `last_purchase_at` | Data da última compra até a referência; nula para lead sem compra. |
| `last_service_name` | Nome do serviço/evento da última compra; pode ser nulo. |

Uma compra é um contrato confirmado, com item de valor positivo e não cancelado. Parcelas e pagamentos do mesmo contrato não multiplicam compras. O beneficiário do serviço identifica a pessoa, com o contratante como fallback quando falta beneficiário. Não são contadas compras futuras em relação à referência.

Prioridade: mensalidade atrasada → particular recente → consulta sem trabalho → primeira compra → somente agrado → esfriando → inativa → lead. A prioridade é aplicada após o cooldown; tratar um tipo não bloqueia os demais. Cada resposta contém no máximo um tipo por pessoa. Em caso de empate, a ordenação por dias e ID torna a seleção estável.

| Tipo | Prazo inicial | Critério |
| --- | --- | --- |
| `SO_AGRADO_COLETIVO` | ≥30 dias | Todas as compras são agrados coletivos. |
| `TRABALHO_PARTICULAR_RECENTE` | 7–15 dias, inclusivos | Compra ou conclusão de trabalho particular. |
| `CONSULTA_SEM_TRABALHO` | ≥10 dias | Consulta/pergunta sem compra de trabalho no mesmo dia ou depois. |
| `PRIMEIRA_COMPRA_SEM_RETORNO` | >14 dias | Um único contrato de compra. |
| `ESFRIANDO` | 31–90 dias, inclusivos | Ao menos duas compras. |
| `INATIVA` | >90 dias | Pessoa não inativa no cadastro, mas sem compras após o prazo. |
| `MEMBRO_CASA_ATRASADO` | ≥3 dias após vencimento | Mensalidade com saldo pendente, membro ativo e não isento. Usa a mesma apuração mensal da tela, desde a entrada na casa. |
| `LEAD_SEM_COMPRA` | >7 dias | Cadastro sem compra, independentemente da origem. |

`public.agent_alert_rules` contém `alert_type` único, `active`, `days_min`, `days_max` opcional, `max_per_day`, `cooldown_days`, `description`. Os valores são lidos em cada consulta. Inicialmente: cinco por tipo/dia e cooldown de 30 dias. O limite de retorno considera os atendimentos já concluídos naquele dia, sem gravar estado durante a leitura. Consultas repetidas não reservam vagas nem registram envio.

O cooldown considera `follow_ups` DONE, da mesma pessoa **e do mesmo motivo**, pela data local de `completed_at`. No 30º dia, a pessoa pode voltar; cooldown zero não bloqueia novos alertas. Registros futuros não afetam uma referência passada.

Configuração no ERP: Menu → Configurações → Alertas do agente. Somente administradores ativos leem/editam, com RLS e permissão por coluna; a interface não recebe service_role. O código do tipo não é editável.

## Registro do tratamento

Resolve `from_phone` pela mesma função das RPCs de comprovantes: número E.164 cadastrado, membro ativo ADMIN/EDITOR. Grava um follow-up DONE e um evento de auditoria; o histórico da pessoa exibe esse follow-up na linha do tempo. As duas gravações são atômicas.

| Campo | Descrição |
| --- | --- |
| `follow_up_id` | ID persistido do acompanhamento. |
| `person_id`, `alert_type` | Pessoa e motivo registrados. |
| `date` | Dia de São Paulo utilizado na idempotência. |
| `completed_at` | Instante de conclusão (ISO 8601 com fuso). |
| `assigned_to` | ID do membro resolvido por telefone. |
| `already_registered` | `true` em repetição do mesmo dia/pessoa/tipo; devolve o registro original, sem substituir nota ou responsável. |

Índice único protege também contra chamadas concorrentes. Tipos desativados continuam válidos para registrar um tratamento já realizado. Erros: `NAO_AUTORIZADO`, `PESSOA_NAO_ENCONTRADA`, `TIPO_ALERTA_INVALIDO`, `PESSOA_INATIVA`. Erros internos usam o padrão seguro de comprovantes, sem devolver detalhes do banco.

## Fechamento financeiro

Período inclusivo pela data de recebimento em `America/Sao_Paulo`. O telefone exige o mesmo membro ativo ADMIN/EDITOR dos comprovantes. A RPC é somente leitura: não gera custos recorrentes durante a consulta.

| Campo | Descrição |
| --- | --- |
| `start_date`, `end_date` | Limites inclusivos. |
| `revenue_cents` | Recebimento bruto confirmado, incluindo Asaas confirmado ainda aguardando repasse e entradas ainda sem associação, conforme Faturamento. |
| `revenue_by_category[]` | `category` (código do serviço), `amount_cents` (recebimentos alocados à categoria). |
| `uncategorized_revenue_cents` | Diferença entre receita bruta e categorias alocadas; preserva valores ainda sem associação. |
| `costs.total_cents` | Custos de contribuição do período, pagos ou pendentes, excluindo comissões. |
| `costs.house_cents` | Custos da casa sem destino específico, incluindo taxas Asaas. |
| `costs.work_cents` | Custos de trabalhos e serviços com destino específico. |
| `costs.fixed_cents` | Custos fixos, inclusive recorrentes já gerados. |
| `costs.general_allocation_cents` | Linhas confirmadas de rateio geral. |
| `costs.by_work[]` | `work_id`, `work_name`, `amount_cents`. Pode ter ID nulo para destino por serviço ou item particular sem trabalho vinculado. Rateios manuais são distribuídos conforme suas linhas. |
| `commissions[]` | Por destinatário: `name`, `due_cents` (saldo ainda devido), `paid_cents` (parte já paga). Considera pagamentos parciais efetivos. |
| `commissions_due_cents`, `commissions_paid_cents` | Totais das comissões originadas nos recebimentos do período, pela mesma base do controle de comissões da tela. |
| `contribution_margin_cents` | Receita menos custos de contribuição. Não subtrai comissões nem reserva. |
| `house_reserve_cents` | Reserva destinada à casa conforme a regra vigente de cada recebimento; não é despesa nem saldo bancário. |
| `texto_fechamento` | Texto exato do botão “Copiar comissão pendente para WhatsApp”, sem filtros adicionais de categoria/responsável e na base de recebimento. String vazia quando não há comissão pendente, como no botão. |

Todos os campos `_cents` são inteiros em centavos (201361 = R$ 2.013,61). Os quatro componentes de custo somam `total_cents`. Comprovantes entram somente CONFIRMED; custos manuais existentes e taxas continuam incluídos. Não é devolvido saldo bancário porque ele não faz parte desse fechamento.

Fontes compartilhadas: `sunshine_receipts`, `sunshine_contribution_costs`, `agent_income_categories` (também usado por Faturamento), `agent_reserve` (também usado pelo painel filtrado), core do controle de comissões (também usado pela RPC da tela). O `v4_finance_summary` antigo permanece como compatibilidade; as telas atuais usam o painel filtrado e a gestão financeira, com correções posteriores de pagamentos cancelados, filas e comissões parciais. O agente usa essas fontes atuais.

O botão passa a consultar `public.v4_agent_closing_text`, wrapper autenticado que mantém a permissão `commission.read`. O formatador é único para botão e agente.

Erros esperados: `NAO_AUTORIZADO`, `DATA_INVALIDA`, `PERIODO_INVALIDO`, `SEM_DADOS`.

## Validação de 28/10/2026

- 25 testes de interface passaram: 23 regressões e dois novos testes de configuração.
- Testes SQL com rollback passaram: capitalização, ano bissexto, paridade dos aniversariantes, validação de membro/pessoa/tipo, idempotência, auditoria, histórico, cooldown por tipo, regra alterada, exclusão de inativas e permissões.
- Conferidos 14/10/2026 e 01–28/10/2026: receita/custos canônicos, reserva do painel e texto compartilhado.
- Os dados de teste e o registro usado no exemplo foram revertidos; nenhum alerta real foi consumido.
- Foram encontrados casos reais nos oito tipos. Conferência do histórico: particular em 13/10 (15 dias); consulta em 27/08 sem trabalho posterior; compra única em 14/01; somente agrado em 02/09; duas compras com última em 01/08 (88 dias); última compra em 14/01 (>90 dias); membro ativo com vencimento em 10/01 e saldo pendente; cadastro em 28/08 sem compra. A prioridade pode ocultar um caso que também se enquadre em outro tipo.

Os exemplos completos mascarados estão em [agent-api-examples.json](agent-api-examples.json). O exemplo `register` foi realmente executado com pessoa e membro existentes, em transação revertida; seu ID não permanece no banco.
