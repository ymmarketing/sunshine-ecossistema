# Associação de recebimentos a pendências

A fila de pagamentos oferece duas opções: **Pendência existente** e **Serviço novo**.
A primeira procura dívidas sem exigir igualdade de valor nem a mesma data do recebimento. Ordena por pessoa e valor coincidente, permite buscar pelo nome/serviço/data/referência e mantém a escolha explícita da operação. Pagamentos de terceiros também podem ser usados.

O valor inicial é o menor entre o saldo do pagamento e a dívida. A prévia informa abatimento, saldo devedor e sobra disponível. Um ou vários comprovantes podem abater uma mesma obrigação, inclusive misturando Asaas e manual, em uma transação. O vínculo usa a obrigação original e não cria outra venda, serviço ou inscrição. As comissões seguem a data de cada comprovante e o responsável informado.

A confirmação usa uma chave estável, registros de auditoria e bloqueios no banco. Reenvios devolvem a prova persistida, inclusive após quitação. Uma confirmação incerta fica preservada na sessão para conferência. A consulta de pendências exige integrante ativo e permissão; usuários anônimos não têm acesso.

## Ajuste autorizado da Natália

Yasmin confirmou expressamente o recebimento de R$ 248,22 de 17/10/2026 (e não o de R$ 180,00 de 14/10). Ele foi retirado da fila e da apuração financeira com justificativa de serviço externo à Sunshine. A evidência de origem Asaas foi preservada; não foi emitido estorno no banco/Asaas.

## Validação

Testes da interface: novo serviço continua acessível; prioridade por pessoa; parcial; pagamento por terceiro; prévia; repetição após falha de conexão.
Teste SQL em transação com ROLLBACK: associação parcial com dois comprovantes (Asaas + manual), quitação, sobra disponível, repetição depois da quitação, rejeição de chave reutilizada com dados diferentes, preservação da venda/inscrição e bloqueio de acesso anônimo. Nenhuma associação de cliente foi realizada para fins de teste.

Analytics não registra navegação administrativa deste ERP autenticado, conforme regra de exclusão de admin/login.

## Reconciliação dos oito saldos confirmados

Em 21/10, os oito casos informados foram verificados por obrigação, comprovante, beneficiário e serviço. Resultado conferido por `v4_person_financial_position`: Cecília R$0; Graziele Cristina R$0; Inajara R$0; Ivonete R$70; Marcos Geovane R$0; Maria de Lourdes R$0; Marli Edjane R$0; Nara R G Machado R$0.

Causas identificadas: cobranças repetidas da mesma contratação; associação de recebimentos como serviço novo em vez de abatimento da obrigação anterior; alocação incompleta; retirada indevida de um recebimento parcialmente associado; cadastros da mesma pessoa com nomes diferentes. Data e valor equivalentes não foram usados isoladamente: foram conferidos serviço, vínculos, nascimento e telefone quando havia dois cadastros.

Correções de dados foram registradas no log do ERP. Não foi criado recebimento para quitar saldos. As cobranças repetidas foram canceladas com justificativa, preservando os registros. Foram reaproveitados os comprovantes existentes. O vínculo de alocações com comissão já paga só é permitido quando recibo, valor, identidade conferida e distribuição financeira são equivalentes: os IDs e o livro de pagamentos das comissões permanecem iguais. Alterações de valor ou divisão seguem bloqueadas. Os cadastros de pessoas não foram fundidos.

O recebimento de Marli, antes retirado por suposta duplicidade, foi restaurado sem apagar a evidência dessa retirada. Seu comprovante original de R$70 tinha R$40 associados; os R$30 restantes foram vinculados à obrigação original. Nara tinha R$70 disponíveis no comprovante de R$140: esse saldo foi associado ao serviço dela, preservando o outro beneficiário.

Proteções adicionais: não retirar da fila um comprovante que já tem alocação; restauração reversível e auditada; sincronização automática da situação da obrigação e da inscrição ao associar parcelas ou quitar; reconhecimento de IDs relacionados por nascimento e telefone normalizado; aviso antes de criar outro serviço para alguém com pendência; histórico identifica cobranças e inscrições canceladas, inclusive dentro de um contrato com outros itens ativos.

Novos testes SQL em ROLLBACK verificam que associação parcial permanece aberta, quitação atualiza o status, retirada de parcial é recusada, correção de vínculo equivalente conserva as comissões pagas e alterações de valor/divisão continuam bloqueadas.

As mudanças de interface seguem no PR de revisão, sem publicação em produção nesta etapa.
