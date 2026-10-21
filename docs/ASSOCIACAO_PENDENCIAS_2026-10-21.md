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
