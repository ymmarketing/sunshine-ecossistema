# Sunshine V4 — Protocolo ajustado de execução

**Vigência:** 09/09/2026

## 1. Regra principal

O desenvolvimento **isolado** da V4 pode avançar antes do fechamento do backup técnico da V3, desde que não exista qualquer conexão de escrita com produção, uso de secrets produtivos, migração de dados reais ou integração externa real.

## 2. Gate F0 — novo alcance

O backup técnico restaurável da V3 continua obrigatório, porém passa a bloquear somente:

- migração de dados reais da V3 para V4;
- conexão da V4 ao banco produtivo;
- leitura/escrita da V4 usando credenciais produtivas;
- ativação do Asaas real;
- ativação de Reportei/Drive/SMTP ou outra integração externa produtiva;
- publicação da V4 em produção;
- qualquer operação financeira real;
- qualquer cutover V3 → V4.

O Gate F0 **não bloqueia**:

- fundação técnica isolada;
- modelo de domínio;
- migrations próprias ainda não aplicadas à produção;
- mocks/dados fictícios;
- testes automatizados;
- protótipos e mockups;
- P0-A e P0-B em memória ou banco de desenvolvimento isolado;
- CI sem secrets;
- documentação e decisões técnicas reversíveis.

## 3. Ambientes

### V3 produção

- permanece intocada;
- nenhuma migration V4;
- nenhum deploy V4;
- nenhum ajuste de schema motivado pela V4;
- apenas manutenção corretiva própria da V3 quando necessária.

### V4 isolada

Obrigatoriamente:

- branch própria;
- dados fictícios ou anonimizados;
- nenhuma chave de produção;
- nenhum endpoint de produção;
- nenhum webhook externo;
- nenhum efeito externo real;
- reset simples do ambiente;
- logs e testes suficientes para provar os invariantes.

## 4. Fundação V4 autorizada

Pode ser construída agora:

- arquitetura modular;
- modelo Pessoa → Contratação → Item → Obrigação → Pagamento → Alocação;
- contas a receber;
- histórico de promessa/cobrança;
- regras de comissão versionadas;
- auditoria append-only;
- permissões granulares;
- idempotência;
- concorrência/locks no desenho SQL;
- CI e testes de regressão.

## 5. P0-A — núcleo financeiro isolado

Critérios mínimos:

- pessoa;
- contratação;
- item;
- uma obrigação por item;
- pagamento independente da obrigação;
- pagador independente do beneficiário;
- alocação N:N;
- parcial;
- excesso não altera valor contratado;
- idempotência;
- proteção contra sobrealocação;
- permissão por ação;
- auditoria.

## 6. P0-B — operação financeira isolada

Critérios mínimos:

- contas a receber;
- vencimento original;
- data esperada de pagamento;
- próxima cobrança;
- histórico de promessas;
- tarefas de cobrança;
- liquidação, vencimento e cobrança em dimensões separadas;
- comissão versionada;
- comissão sobre valor efetivamente alocado/recebido no cenário demo;
- Home derivada dos fatos do núcleo.

## 7. Testes obrigatórios

Enquanto F0 estiver aberto, o CI deve provar pelo menos:

- ausência de referência ao project ref produtivo no runtime V4;
- ausência de domínio produtivo;
- ausência de service-role/API key real;
- terceiro pagador;
- 1 pagamento → N obrigações;
- N pagamentos → 1 obrigação;
- parcial;
- excesso;
- idempotência;
- autorização;
- proteção valor x identificador;
- promessa de pagamento;
- cobrança;
- comissão versionada;
- auditoria.

## 8. Backup continua em paralelo

O runbook de backup/restauração permanece válido.

Enquanto o desenvolvimento isolado avança, continuar tentando fechar F0 por:

1. backup/PITR oficial quando disponível; ou
2. dump lógico controlado e criptografado;
3. restauração em ambiente isolado;
4. reconciliação com baseline e Excel paralelo;
5. validação de schema, totais e amostra registro a registro.

## 9. Proibições enquanto F0 não estiver aprovado

- não usar secret de produção em V4;
- não apontar V4 para o Supabase da V3;
- não copiar banco real para ambiente sem restauração validada;
- não ativar Asaas;
- não publicar V4;
- não criar transações financeiras reais;
- não alterar a V3 para acomodar a V4;
- não executar migrations V4 em produção.

## 10. Estado atual

- baseline V3: aceita;
- backup restaurável: pendente;
- branch V4 isolada: criada;
- fundação: iniciada;
- P0-A isolado: iniciado/implementado no primeiro slice;
- P0-B isolado: iniciado/implementado no primeiro slice;
- produção V3: não alterada;
- V4 produtiva: bloqueada.
