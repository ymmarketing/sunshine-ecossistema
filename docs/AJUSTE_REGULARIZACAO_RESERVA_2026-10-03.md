# Regularização e reserva por recebimento — 03/10/2026

- Regularizar pagamento permite escolher Yasmin, Lourdes ou Rosely. Preenche o responsável existente e exige seleção se estiver vazio. Salva no item original com auditoria; não cria venda, serviço ou inscrição.
- Receita apresenta **Reserva para custos**, com detalhamento por beneficiário, serviço, data, percentual e base. Respeita os filtros de período, responsável e categoria e as divisões individuais.
- A regra padrão passa a usar cada recebimento em São Paulo desde 01/10/2026: reserva 30% e distribuição do saldo em 70% para a responsável e 15% para cada outra integrante. Equivale a 49%/10,5%/10,5% do bruto. Divisão individual continua disponível.
- Recalcular responsável em um serviço com parcelas de setembro e outubro preserva a regra de cada recebimento. Comissões já pagas seguem protegidas.
- Não houve alteração em pagamentos existentes. As 16 alocações atuais de outubro já estavam pela regra correta: R$ 5.265,00, reserva R$ 1.579,50 e comissões R$ 3.685,50.

Validação: sintaxe JavaScript; 11 testes de interface; testes do banco em transações revertidas nos modos manual, recebido existente e Asaas, com pendência original da Edna; pagamento parcial; limite à meia-noite de São Paulo; recálculo de parcelas mistas; filtros e detalhamento da reserva; acesso anônimo bloqueado. A pendência real da Edna permanece aguardando a escolha da responsável e a confirmação do recebimento pela operação.
