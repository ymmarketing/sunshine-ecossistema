# Importação histórica 2026 — Ecossistema Sunshine

Fonte histórica: `SUNSHINE ORÁCULOS_CONTROLE GERAL _ 2026.xlsx`.

> Este arquivo é **somente uma fonte de dados legados**. Ele não define a arquitetura, o cadastro de clientes, o modelo financeiro nem os campos do sistema novo.

> O arquivo contém dados operacionais/pessoais e não deve ser enviado ao repositório público. A importação será realizada no Supabase exclusivo da Sunshine após o modelo canônico estar concluído.

## Princípio

Primeiro construímos o sistema ideal da Sunshine. Depois avaliamos quais informações da planilha podem preencher esse sistema com segurança.

Não haverá criação de tabelas ou campos apenas porque uma coluna existe no Excel. Também não haverá redução do modelo de Cliente 360 porque a planilha histórica possui poucos dados cadastrais.

## O que a planilha pode fornecer

A base pode ser aproveitada como evidência histórica para, entre outros:

- volumetria de lançamentos;
- faturamento e valores recebidos;
- nomes de serviços/trabalhos quando identificáveis;
- responsável pelo atendimento;
- datas de realização e contato quando confiáveis;
- alguns nomes e telefones de clientes;
- informações auxiliares para reconciliação de comissões;
- catálogo/preços/custos antigos quando úteis como referência histórica.

Isso não significa que todos esses dados serão promovidos para o core. Cada conjunto será validado antes da importação definitiva.

## Estrutura observada no legado

A pasta de trabalho possui 9 abas:

- `FECHAMENTO MENSAL`
- `FINANCEIRO`
- `LANÇAMENTO DIÁRIO`
- `Planilha1`
- `Planilha2`
- `TABELA VALORES`
- `CALENDÁRIO TRABALHOS`
- `FÓRMULA ODU (2)`
- `FÓRMULA ODU`

A aba `LANÇAMENTO DIÁRIO` possui 1.676 linhas efetivas de lançamentos entre janeiro e agosto de 2026. Isso representa principalmente histórico transacional/financeiro, não histórico completo de relacionamento com clientes.

## Estratégia de staging

1. Registrar o arquivo como `import_batch`.
2. Preservar cada linha bruta em `import_rows`/JSON, sem forçar relacionamento.
3. Classificar os dados por confiabilidade e destino possível.
4. Conciliar clientes somente quando houver identidade suficiente.
5. Promover transações financeiras confiáveis para o modelo canônico.
6. Mapear serviços/trabalhos para o catálogo novo; não criar automaticamente o catálogo a partir de textos do legado.
7. Reconciliar responsáveis e comissões sem alterar as regras atuais do sistema.
8. Manter registros sem correspondência no staging para revisão futura.
9. Comparar totais históricos com as visões consolidadas para validar a migração.

## Regra para clientes históricos

O módulo Clientes será construído do zero para o futuro da operação.

Para o legado:

- nome isolado não é garantia suficiente de identidade;
- telefone ajuda na conciliação, quando disponível;
- duplicidades e grafias diferentes devem ser tratadas antes da promoção;
- registros financeiros sem cliente identificável continuam válidos como histórico financeiro;
- nunca será criado cliente fictício apenas para preencher uma chave estrangeira.

## Relação com o sistema novo

A base 2026 é um **input de migração**, não uma dependência permanente. Depois da implantação, novos dados devem nascer no próprio ecossistema ou chegar por integrações oficiais como Asaas e Reportei.
