# Reserva para custos — envio ao caixa

Em Receita, o sexto cartão do controle de comissões mostra **Reserva para custos — pendente**. O controle inclui os recebimentos desde **27/10/2026**, conforme orientação de Yasmin em 30/10. Valores anteriores não são considerados enviados nem passam a ser cobrados nesse controle.

O valor segue a regra financeira já aplicada ao recebimento: reserva dos eventos de Yasmin e Lourdes, normalmente 30%, preservando divisões individuais. Consultas, perguntas e serviços sob responsabilidade de Roseli ficam fora desse saldo.

Ao tocar em **Ver reserva e dar baixa**, a usuária vê reservado, enviado, pendente, cliente, evento, responsável, data e base de cada recebimento. O botão **Registrar envio ao caixa** recebe valor, data efetiva e observação. A baixa pode ser parcial; utiliza primeiro os recebimentos mais antigos da seleção. Os filtros de Receita também se aplicam ao saldo e às evidências.

A baixa registra uma transferência interna: não movimenta banco, não cria receita ou despesa e não muda comissões. O histórico permite estorno com motivo, preservando a evidência. Bases financeiras já enviadas são protegidas contra alteração até o estorno. Um envio sem confirmação de rede é retomado com a mesma chave e o mesmo conteúdo, inclusive ao reabrir o formulário.

As tabelas têm RLS e nenhum acesso direto para `anon`/`authenticated`; apenas RPCs autenticadas, com permissões de leitura/baixa de comissões. As funções privadas não são expostas. Os avisos de advisor sobre ausência de políticas e execução por `authenticated` são intencionais nesse modelo de acesso por RPC com autorização explícita.

Validação: `node tests/check-syntax.cjs`, testes de interface `tests/finance-ui.cjs`, `tests/expense-receipts-ui.cjs` e `tests/agent-alerts-ui.cjs`; `tests/cost-reserve-transfers.sql` usa as APIs reais em transação com rollback. Cobre limite de 27/10 no fuso de São Paulo, isenções, centavos, baixa parcial, repetição de confirmação, excesso de valor, proteção da base e estorno. Nenhuma baixa real foi lançada durante a implantação.
