# Fluxo Oficial — Cliente, Inscrição e Pagamento

Status: FONTE DE VERDADE OPERACIONAL
Versão: 1.0
Data: 08/09/2026

## 1. Princípio central
O sistema não deve começar pelo formulário técnico. Deve começar pelas perguntas que a equipe realmente responde no dia a dia:

1. De quem é isso?
2. O que essa pessoa comprou / em que se inscreveu?
3. Para quantas pessoas?
4. Quanto deveria custar?
5. Quanto foi pago agora?
6. Ficou alguma coisa pendente?

A origem do dinheiro (Asaas, PIX de outra pessoa, remessa internacional, dinheiro, cartão, lançamento manual) não pode mudar a lógica do negócio. Muda apenas a origem do pagamento.

## 2. Entidades que não podem ser confundidas

### Cliente 360 / Contratante
Pessoa que é dona da compra no Sunshine. É quem deve aparecer no histórico do Cliente 360 e em quem a venda deve ficar vinculada.

### Pagador
Pessoa ou empresa de cuja conta o dinheiro veio. Pode ser igual ou diferente do Cliente 360. Dados do pagador não podem sobrescrever o cadastro do cliente escolhido.

### Participante / Inscrito
Pessoa que efetivamente participa de um trabalho. Uma compra pode ter 1, 2, 5 ou mais participantes. Participante não precisa virar automaticamente um Cliente 360 completo.

### Venda / Contratação
O que foi contratado e o valor devido. Existe mesmo que nenhum dinheiro tenha sido pago ainda.

### Pagamento
Dinheiro que entrou. Pode quitar uma venda inteira, apenas uma parte dela ou várias vendas/itens ao mesmo tempo.

### Alocação
Ligação entre um pagamento e uma venda. É o que permite pagamento parcial, parcelado e um pagamento cobrindo mais de um item.

## 3. Fluxo principal simples

### Passo 1 — De quem é?
- Buscar Cliente 360 por nome, nome preferido, telefone ou e-mail.
- Se existir: selecionar.
- Se não existir: criar cadastro mínimo sem sair do fluxo.
- Se o dinheiro veio de outra pessoa/empresa: manter o pagador apenas como informação financeira.

### Passo 2 — O que foi contratado?
Escolher uma opção:
- Consulta
- Pergunta Objetiva
- Trabalho coletivo / premium / particular
- Mensalidade
- Outro serviço

Se for trabalho, escolher o trabalho específico.

### Passo 3 — Para quantas pessoas?
Só aparece quando o item permite múltiplas pessoas, principalmente trabalhos.
- Campo explícito: Quantas pessoas? 1, 2, 3, 4, 5...
- Ao mudar a quantidade, o sistema cria exatamente essa quantidade de campos de inscrito.
- Campos mínimos por inscrito: nome.
- Campos opcionais quando aplicável: nascimento, pessoa amada, rival e demais dados específicos do trabalho.
- O primeiro nome pode vir pré-preenchido com o nome do Cliente 360, mas sempre editável.

### Passo 4 — Quanto custa?
- Valor unitário vem do cadastro do serviço/trabalho.
- Total contratado = quantidade x valor unitário - desconto, quando houver.
- A equipe pode ajustar o valor quando existir negociação real, mas o sistema deve mostrar a diferença e pedir confirmação.

### Passo 5 — Como está o pagamento?
Escolha simples:
- Não pagou ainda
- Pagou uma parte
- Pagou tudo

Se a origem for Asaas, o valor recebido já vem preenchido e não deve ser redigitado.
Se for manual, informar valor recebido, método e data somente quando houve pagamento.

### Passo 6 — Resultado automático
O sistema calcula:
- Total contratado
- Total já pago
- Saldo pendente
- Situação: Pendente / Parcial / Quitado / Excedente
- Quantidade de inscritos

A usuária não deve precisar decidir manualmente estados que o sistema consegue calcular.

## 4. Cenários obrigatórios

### A. Uma pessoa, pagamento integral
Ex.: R$ 70 para uma inscrição de R$ 70.
Resultado: 1 venda, 1 inscrição, pagamento quitado.

### B. Várias pessoas, pagamento integral
Ex.: R$ 140 para 2 inscrições de R$ 70.
Resultado: 1 venda com quantidade 2, 2 inscrições nominadas, pagamento de R$ 140 quitando a venda.

### C. Várias pessoas, uma única pessoa/empresa pagadora
Ex.: Navona paga R$ 140; cliente é Elsa; participantes são Elsa e outra pessoa.
Resultado: pagador permanece Navona no histórico financeiro; venda pertence à Elsa; 2 inscrições são criadas; dados da Navona não alteram o Cliente 360 da Elsa.

### D. Inscrição sem pagamento / fiado
Ex.: 1 inscrição de R$ 70 e R$ 0 recebido.
Resultado: venda de R$ 70 pendente + inscrição registrada. Nenhum pagamento fictício é criado.

### E. Pagamento parcial
Ex.: venda de R$ 70; recebeu R$ 35.
Resultado: venda de R$ 70 + pagamento/alocação de R$ 35 + saldo R$ 35. Inscrição continua válida e aparece como pagamento parcial.

### F. Pagamento parcelado em momentos diferentes
Ex.: R$ 35 hoje + R$ 35 depois.
Resultado: uma única venda de R$ 70, dois pagamentos alocados à mesma venda. Nunca criar duas vendas para representar parcelas.

### G. Pagamento por outra conta
Ex.: cliente é Jakeline, PIX veio de Maria.
Resultado: venda e histórico do atendimento ficam na Jakeline; Maria fica registrada como pagadora do recebimento; cadastro da Jakeline não recebe CPF/telefone/endereço de Maria.

### H. Remessa internacional / empresa intermediadora
Ex.: pagamento aparece em nome de empresa de remessa.
Resultado: mesma regra do pagador diferente. A origem financeira pode ser empresa, mas a venda continua no Cliente 360 correto.

### I. Um pagamento cobrindo mais de um item
Ex.: R$ 300 = R$ 140 de um trabalho + R$ 160 de outro serviço.
Resultado: um pagamento, duas vendas/itens e duas alocações cuja soma fecha exatamente o valor recebido.

### J. Uma pessoa compra dois trabalhos diferentes no mesmo pagamento
Resultado: um pagamento; uma venda por trabalho; inscrições criadas em cada trabalho conforme a quantidade informada.

### K. Valor recebido maior que o contratado
O sistema não pode chamar automaticamente de receita adicional.
Deve perguntar: crédito, taxa/ajuste, outro item ou devolução. Nenhum excesso pode ser absorvido silenciosamente.

### L. Desconto real
Ex.: 2 x R$ 70 = R$ 140, mas foi combinado R$ 120.
Resultado: venda de quantidade 2, valor bruto R$ 140, desconto R$ 20, contratado R$ 120. Não tratar os R$ 20 como inadimplência.

### M. Cancelamento / estorno
Venda, inscrição e pagamento precisam manter histórico. Cancelamento não deve apagar o fato financeiro; estorno deve ser explícito.

## 5. Regra para Asaas
A tela de associação do Asaas deve ser a mesma lógica do fluxo principal, com uma diferença: o pagamento já existe.

Tela ideal:
1. Este dinheiro é de quem? [busca única de Cliente 360]
2. Pagou o quê? [serviço/trabalho]
3. Quantas pessoas? [se aplicável]
4. Nomes dos inscritos [gerados pela quantidade]
5. Resumo: contratado / recebido / saldo
6. Associar

Informações do pagador ficam recolhidas em "Ver dados do pagador" e nunca competem com a escolha do Cliente 360.

## 6. Regra para lançamento manual
A tela manual deve usar o mesmo núcleo:
1. Cliente
2. Item
3. Quantidade/inscritos
4. Situação do pagamento: não pagou / parcial / completo
5. Valor e método apenas se houve recebimento
6. Salvar

Não devem existir formulários completamente diferentes para o mesmo fato de negócio.

## 7. Auditoria v3.62 versus fluxo oficial

### Aprovado / já suportado
- Cliente 360 separado do pagador no fluxo Asaas.
- Um pagamento pode ser dividido em vários itens por alocações.
- Estrutura `payment_allocations` permite vários pagamentos para uma venda e um pagamento para várias vendas.
- `work_registrations` aceita nomes de participantes sem exigir Cliente 360 individual.
- Lançamento manual completo já contém estrutura para vários participantes em trabalho.
- Busca do Cliente 360 foi corrigida para nome/telefone/e-mail.

### P0 — incompatível com a operação real
1. Asaas ainda cria somente 1 inscrição por item de trabalho, mesmo quando o valor corresponde a 2 ou mais vagas.
   Risco: R$ 140 em trabalho de R$ 70 pode virar quantidade 1 + R$ 70 tratado como diferença/excesso.
2. Tela Asaas não pergunta explicitamente "Quantas pessoas?" nem coleta os nomes de todos os inscritos.
3. Inscrição sem pagamento não cria uma venda/saldo devedor de forma integrada. É possível registrar inscrição separada, mas a dívida não nasce corretamente no mesmo fluxo.
4. Pagamento parcial vindo do Asaas não possui caminho simples para ser associado a uma venda pendente já existente; há risco de criar nova venda em vez de quitar parcela da anterior.

### P1 — funcional, mas UX inadequada
1. Fluxo manual e fluxo Asaas usam componentes diferentes para a mesma operação.
2. Quantidade em trabalho aparece de formas diferentes conforme a tela; no manual completo a quantidade real é derivada da quantidade de linhas de participantes, sem um campo simples "Quantas pessoas?".
3. Status financeiros ainda exigem conhecimento técnico da usuária em algumas telas, quando deveriam ser derivados de contratado x pago.
4. Excesso e desconto não estão apresentados como decisões de negócio no fluxo principal.
5. Ainda há formulários legados de venda, pagamento, inscrição e associação convivendo com formulários novos, aumentando chance de erro e duplicidade.

### P2 — consolidação técnica
1. O front-end acumulou camadas versionadas alterando componentes anteriores (`v27`, `v47`, `v49`, `v54`, `v58` etc.).
2. A manutenção por sobrescrita de funções/MutationObserver aumenta risco de regressão.
3. Deve existir um único componente de Cliente, um único componente de Item/Quantidade/Participantes e um único motor financeiro usados por Asaas e manual.

## 8. Regra de UX a partir desta versão
Para o caminho comum, a usuária deve conseguir concluir a operação respondendo no máximo:
- De quem é?
- O que é?
- Quantas pessoas?
- Pagou quanto?

Todo o resto deve ser automático, opcional ou aparecer apenas quando o cenário exigir.

## 9. Critérios de aceite obrigatórios
Antes de considerar o fluxo aprovado, testar em produção controlada:
1. Elsa / Navona: R$ 140 -> Sete Saias R$ 70 -> 2 nomes -> 2 inscrições -> saldo zero.
2. 1 inscrição R$ 70 -> nenhum pagamento -> saldo R$ 70.
3. 1 inscrição R$ 70 -> pagamento R$ 35 -> saldo R$ 35.
4. mesma venda acima -> segundo pagamento R$ 35 -> saldo zero sem nova venda.
5. PIX de Maria -> cliente Jakeline -> cadastro da Jakeline não é sobrescrito.
6. 5 inscrições no mesmo trabalho -> cinco nomes e quantidade 5.
7. um pagamento dividido entre dois itens -> soma das alocações igual ao recebido.
8. pagamento maior que contratado -> sistema exige classificação do excesso.
9. desconto explícito -> saldo calculado sobre valor negociado, não sobre valor de tabela.
10. mobile: concluir cada cenário sem rolagens/reaberturas desnecessárias, campos duplicados ou listas completas de clientes.

## 10. Decisão de arquitetura
Até que os P0 sejam resolvidos, não adicionar novas funcionalidades ao financeiro/inscrições. Prioridade: consolidar fluxo e remover duplicidades antes de evoluir o produto.
