# Sunshine — alterações e teste final

Base: commit `2657d8a803a3fbc6d74132055ce5a0c02a5f5e3d`, repositório `ymmarketing/sunshine-ecossistema`.
Solicitação: PDF “MELHORIAS E CORREÇÕES SUNSHINE”.

## Entrega consolidada

| Item do anexo | Correção ou melhoria entregue | Resultado esperado |
|---|---|---|
| Associações não salvas | Confirmação dos itens e inscrições no banco após gravar; mesma referência nas tentativas seguintes; recuperação da tentativa na mesma aba | Uma associação persistida, mesmo se a resposta se perder por queda de conexão |
| Financeiro → Receita | Alteração dos nomes visíveis, preservando a navegação existente | Receita no menu, rodapé e título |
| Custos | Cadastro e edição de despesas; um trabalho aberto, vários trabalhos com rateio, operação fixa ou estoque; data da despesa e do pagamento separadas | Rateio fecha exatamente o total; custo pendente não vira despesa paga |
| Faturamento | Vendas, receita bruta, despesas pagas, resultado, margem, reserva, Asaas a repassar, detalhes, metas mensais e comparação anual | Valores e seus registros de origem conferíveis pelo período |
| Perfil e participação | Ranking de beneficiários, participações por tipo, faixas de idade e sexo informado opcionalmente no cadastro | Idade/sexo não informados continuam identificados como não informados |
| Contabilidade | Rascunho com período, rendimentos, despesas, lucro e link Drive; destinatário fixo `bksm00@gmail.com`; envio seguro pelo Resend e opção Abrir Gmail | Primeiro conferir o rascunho; enviar somente ao clicar na opção desejada |
| Logo / Sistema operacional | Clique e teclado retornam para Home | Navegação rápida pelo cabeçalho |
| Repasse Asaas | Confirmado aguardando repasse separado de recebimento liberado; histórico sem comprovação de disponibilidade identificado | `CONFIRMED` fica a repassar; `RECEIVED` fica liberado; importação não duplica receita |
| Comissões desde 01/10/2026 | Reserva de 30%; divisão de 70/15/15 sobre os 70% restantes; data original da venda em São Paulo; divisão individual editável | R$ 100 geram R$ 30 de reserva, R$ 49 para responsável e R$ 10,50 para cada outra integrante |
| Pró-labore | Botão cria previsões mensais de R$ 1.620 para Yasmin e Lourdes, a partir de outubro | Criar previsão não registra pagamento; repetir o botão não duplica a previsão |
| Editar / excluir lançamentos | Editar beneficiário, trabalho, serviço, total, referência e responsável; corrigir recebimento manual; remover associação; exclusão com justificativa, auditoria e restauração | Histórico e comprovantes preservados; comissão paga protegida de alterações na divisão |
| Aniversários | Lista por mês, destaque para hoje e cópia apenas de selecionados | Nenhum disparo automático de mensagens |
| Atualizar pelo celular | Integração GitHub–Vercel já conectada; testes de interface no GitHub; verificação dos arquivos publicados após implantação | Alteração revisada entra em `main`, Vercel publica automaticamente e a verificação confere a versão |

## O que já foi verificado

- Sintaxe do JavaScript da aplicação e do novo módulo.
- Cinco testes de interface: navegação/cabeçalho; campo demográfico opcional; queda de conexão; confirmação dos vínculos; erro definitivo permitindo corrigir; rateio de três trabalhos; aniversários sem envio automático.
- Testes reais das funções do banco, em transação revertida: custos, metas, aniversário em ano não bissexto, quatro modalidades de associação e repetição, mensalidades com referências distintas, comissão antiga e nova, divisão individual, exclusão/restauração, proteção de comissão paga, repasse e deduplicação Asaas, rascunho contábil sem enviar e-mail.
- Impressões digitais dos pagamentos, associações e comissões existentes mantidas após os testes. Nenhuma pessoa de teste ficou gravada.
- Funções financeiras novas bloqueadas para acesso anônimo; credencial Resend acessível somente pelo servidor; tabelas novas sem acesso direto pelo cliente.
- Função de envio contábil publicada no Supabase com autenticação obrigatória.

## Configuração externa pendente

O envio direto pelo Resend exige um domínio/remetente verificado e uma chave do provedor. A administradora configura isso dentro de **Faturamento → Configurar Resend**, sem enviar chave no chat. A opção **Abrir Gmail** já prepara o e-mail e exige concluir o envio no Gmail. A configuração do Resend não foi preenchida e nenhum e-mail foi enviado durante os testes.

## Checklist para uma rodada de teste

Use inicialmente a implantação de teste. Ela usa o mesmo banco da Sunshine: crie somente lançamentos identificados como teste e exclua-os ao terminar. Evite registrar pagamentos fictícios de comissão: o banco já testou esse cenário com reversão.

### Acesso e navegação

- [ ] Entrar com sua conta Sunshine no desktop.
- [ ] Confirmar **Receita**, **Custos** e **Faturamento** no menu.
- [ ] Abrir um módulo e clicar na logo ou no texto do cabeçalho: deve voltar para Home.
- [ ] Repetir o acesso no celular, conferindo campos, botões e rolagem da tabela anual.

### Associações e persistência

- [ ] Criar uma entrada pequena identificada como teste, vinculada a pessoa, serviço, responsável e trabalho aberto.
- [ ] Conferir o beneficiário e o serviço em Receita, a inscrição no trabalho e o histórico da pessoa.
- [ ] Atualizar a página e confirmar que o lançamento continua nos três locais.
- [ ] Associar um pagamento existente e confirmar que o comprovante financeiro não foi duplicado.
- [ ] Conferir uma associação de dois comprovantes ao mesmo serviço, preservando ambas as datas e referências.
- [ ] Conferir mensalidades com duas referências diferentes para a mesma pessoa.
- [ ] Se houver queda de conexão, usar **Confirmar novamente** na tentativa anterior; conferir que existe somente uma associação.

### Custos

- [ ] Cadastrar um custo a pagar de um trabalho aberto.
- [ ] Cadastrar R$ 30 de velas divididos em três trabalhos: R$ 10 para cada um.
- [ ] Tentar salvar um rateio diferente de R$ 30: o sistema deve impedir.
- [ ] Cadastrar despesas fixas e de estoque sem trabalho associado.
- [ ] Editar descrição, valor, rateio e datas; atualizar a página e conferir a persistência.
- [ ] Alterar uma despesa para paga e informar a data: o resultado deve considerar essa data de pagamento.
- [ ] Excluir uma despesa de teste com justificativa e restaurá-la como pendente.

### Faturamento e metas

- [ ] Filtrar um período conhecido e conferir vendas, receita, despesas, resultado e margem.
- [ ] Abrir os detalhes de vendas, receita, despesas e reserva e comparar com os registros.
- [ ] Conferir **resultado = receita bruta − despesas pagas**, incluindo taxas e comissões pagas.
- [ ] Confirmar que reserva de custos e custos a pagar não são descontados novamente como despesa paga.
- [ ] Definir metas de um mês e atualizar a página: conferir metas mensais e soma anual das metas em reais.
- [ ] Conferir ranking, participações por tipo, faixa etária e sexo não informado.

### Asaas e comissões

- [ ] Comparar recebimentos Asaas confirmados com os liberados, conferindo líquido e previsão de crédito quando disponível.
- [ ] Conferir a venda de R$ 100 desde 01/10/2026: reserva R$ 30, responsável R$ 49, demais R$ 10,50 cada.
- [ ] Conferir uma venda anterior a outubro: sua regra anterior deve permanecer.
- [ ] Editar a divisão individual de um lançamento de teste; conferir soma de 100% com a reserva e que outros lançamentos não mudaram.
- [ ] Em um lançamento com comissão já paga, editar somente evento/descrição: o pagamento de comissão deve permanecer.
- [ ] Criar previsões de pró-labore de outubro; conferir R$ 1.620 para cada uma e situação **a pagar**, sem mudança no resultado. Repetir o botão e conferir ausência de duplicação.

### Correções e exclusões

- [ ] Editar beneficiário, trabalho, responsável e total de um lançamento de teste; conferir pessoa, inscrição e comissão.
- [ ] Tentar reduzir o total abaixo do valor já associado: deve impedir.
- [ ] Corrigir um recebimento manual; conferir valor/data/pagador e justificativa.
- [ ] Remover uma associação de teste: o recebimento deve ficar disponível para nova associação.
- [ ] Restaurar a associação em Faturamento e conferir os vínculos e valores anteriores.
- [ ] Excluir o recebimento manual de teste e conferir sua retirada dos valores ativos. Comprovantes Asaas são preservados; seus vínculos podem ser corrigidos.

### Contabilidade e aniversários

- [ ] Preparar fechamento com o período filtrado e o link real das notas no Drive.
- [ ] Conferir destinatário, período, rendimentos, despesas, lucro e assinatura no rascunho.
- [ ] Abrir o Gmail e conferir o preenchimento; enviar somente quando desejar entregar o fechamento real.
- [ ] Depois de configurar o Resend, enviar um fechamento real e conferir o identificador de aceitação. “Aceito pelo Resend” indica aceitação do provedor; a entrega à caixa postal é conferida no painel do Resend.
- [ ] Selecionar mês dos aniversários e conferir nomes e datas. Copiar somente os selecionados; nenhuma mensagem deve sair automaticamente.

## Publicação e manutenção pelo celular

1. Conferir este checklist na versão de teste.
2. Revisar a alteração no GitHub e concluir a integração da branch `improvements-20260930` em `main`.
3. A integração já conectada cria a implantação de produção no Vercel.
4. Conferir status **Pronto / Ready** e o commit correto no projeto `sunshine-ecossistema` da equipe `ym-marketing-negocios`.
5. Conferir `https://sunshine.ymnegocios.com.br` e o resultado da verificação automática no GitHub.

Nas próximas correções, o mesmo fluxo pode ser concluído pelo navegador do celular: alteração, revisão, teste e integração em `main`. A integração reduz a dependência de login em navegador remoto. Novas mudanças de banco ainda precisam das respectivas migrações; o GitHub–Vercel publica a interface, não executa migrações Supabase automaticamente.
