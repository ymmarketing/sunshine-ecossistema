# Serviços diferentes na mesma associação

O formulário de registro e associação de recebimentos aceita serviços diferentes no mesmo lançamento. A opção **Serviços novos (um ou mais)** leva ao formulário; **Adicionar outro serviço** ou **Associar saldo a outro serviço** permite escolher o tipo, serviço, trabalho e responsável de cada item. **Repetir último serviço** copia o serviço e o beneficiário, deixando a pergunta ou referência mensal em branco para preenchimento.

A operação simples continua permitindo o mesmo serviço para várias pessoas. Ao acrescentar outro serviço, os itens existentes conservam os dados. O catálogo legado de agrados, classificado como trabalho coletivo, é apresentado no tipo Agrado coletivo pelo nome do serviço, sem mudar o catálogo ou o histórico no banco.

Exemplo: um único pagamento de R$ 360 pode ter dois agrados de R$ 150 e duas perguntas de R$ 30. Após os agrados, o resumo mostra R$ 60 disponíveis; após uma pergunta, R$ 30; ao fechar os quatro itens, R$ 0. Cada pergunta pode pertencer à mesma pessoa e continua sendo um atendimento separado. Apenas os agrados recebem o vínculo e a inscrição no trabalho. Cada item calcula suas comissões e reserva segundo sua própria regra.

As associações automáticas distribuem o recebimento pelos itens em ordem. Um valor de associação editado manualmente é respeitado, e o restante se distribui entre os itens automáticos. Nenhum item pode receber mais que seu valor, nem a soma superar o pagamento disponível. Tipos diferentes preservam perguntas, referências de mensalidade e descrição de trabalhos particulares por item.

A confirmação verifica os itens uma única vez cada, incluindo serviço, categoria, responsável e vínculo da pergunta à fila. Duas perguntas da mesma pessoa e valor não podem reutilizar uma única evidência. A tentativa de gravação é mantida com o mesmo conteúdo e chave em caso de incerteza de rede.

Validação: sintaxe e testes de interface, incluindo o fluxo Asaas 150 + 150 + 30 + 30, bloqueio de pergunta sem texto, remoção do item selecionado, preservação dos demais itens e confirmação por serviço. `tests/mixed-service-associations.sql` testa Manual, Existente, Asaas e Grupo com as APIs reais, em transação com rollback: quatro itens, dois inscritos, duas perguntas da mesma pessoa, idempotência, rollback de pergunta inválida e reserva de R$ 90 apenas nos agrados. Nenhum pagamento real é associado pela implantação.
