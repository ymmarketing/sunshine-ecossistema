# Custos recorrentes e distribuição a partir de novembro

Decisão autorizada por Yasmin em 08/10/2026.

## Custos fixos

Dez recorrências desde outubro/2026: imposto R$ 1.500; contador R$ 350; fixo Yasmin R$ 1.620; fixo Lourdes R$ 1.620; Pronampe R$ 1.333,33 até março/2029 inclusive; certificado digital R$ 200/ano provisionado em R$ 16,67/mês, com ajuste para R$ 16,63 em dezembro; Instagram R$ 59; ManyChat R$ 149,90; telefone R$ 40; aluguel Sunshine R$ 1.980 após o rateio residencial.

Total mensal padrão R$ 8.668,90. Dezembro ajusta quatro centavos da provisão anual para fechar exatamente R$ 200 no ano. A provisão não é um boleto mensal; conciliar o desembolso anual sem duplicar o custo. O rateio de aluguel não reduz os fixos ou representa uma segunda entrada de receita da Sunshine.

Um job diário abre o mês à meia-noite de São Paulo, com repetição segura. A leitura dos módulos também recupera meses já iniciados. Identidade única por recorrência e competência, preservando as chaves dos dez lançamentos de outubro. Custos começam PENDING, sem presumir pagamento. Excluir um mês não recria sua previsão. Encerrar uma recorrência cancela apenas instâncias pendentes a partir do mês escolhido; pagamentos e meses anteriores ficam preservados. Edição de template afeta somente instâncias ainda não geradas. Pronampe não gera previsão a partir de abril/2029.

## Distribuição completa

| Recebimento a partir de | Caixa | Cada uma das duas comissões | Responsável | Total |
|---|---:|---:|---:|---:|
| 01/10/2026 | 30% | 10,5% | 49% | 100% |
| 01/11/2026 | 30% | 15% | 40% | 100% |

Todos os percentuais são sobre o recebimento bruto. Regra decidida pela data de cada recebimento em America/Sao_Paulo, incluindo regularizações de vendas antigas. Uma divisão individual explícita continua específica do lançamento. O responsável absorve resíduos de centavos para fechar exatamente o recebido. Comissões pagas e histórico importado continuam protegidos.

Consulta/pergunta: reserva vigente mantida, com status UNDER_REVIEW, até uma nova decisão da Yasmin. Não aplicar o cenário de reserva de 28% estudado anteriormente. Fixo Yasmin e fixo Lourdes permanecem R$ 1.620 cada.

## Margem de contribuição gerencial

Faturamento bruto recebido menos custos pela data da despesa, pagos ou pendentes. Comissões geradas/pagas não entram nesses custos. Reserva não é despesa. Taxas dos recebimentos e custos confirmados por comprovante entram nos custos. A baixa desloca o valor de pendente para pago, sem descontá-lo novamente da margem. Custos pagos + pendentes fecham o total de custos da margem. Vendas contratadas e disponibilidade financeira seguem separadas do faturamento recebido.

Os R$ 16 mil de dívidas bancárias estão identificados como LIABILITY, sem recorrência ou desconto integral na margem. As metas BB R$ 600, Itaú R$ 800 e Santander R$ 700 permanecem propostas de negociação, sem acordo ou pagamento registrado.

## Validação

Teste SQL em transação revertida: adoção sem duplicatas; abertura de novembro; ajuste anual do certificado; término do Pronampe; baixa, reabertura, exclusão de um mês e encerramento de recorrência; idempotência de cadastro; fechamento pagos/pendentes; corte da regra às 00h de São Paulo; todos os três responsáveis; consulta e pergunta; comissão paga fora da margem e proteção da base; acesso anônimo recusado.

Teste anterior de destinos de custos também passou. Advisor executado antes/depois; tabelas novas têm RLS e não concedem acesso direto, e RPCs expostas exigem membro ativo e permissões existentes. Avisos de funções SECURITY DEFINER executáveis por authenticated correspondem aos wrappers com essa guarda; chamadas anônimas e acesso direto foram verificados como negados.

Validação do DOM dos módulos com RPCs simuladas: baixa do custo no mês, criação e encerramento de recorrência, atualização dos controles pagos/pendentes, margem sem comissões e quadro completo de distribuição. Não foi usada uma sessão autenticada real para alterar dados durante esse teste.
