# Sunshine V4 — Regras de UX validadas

Data: 09/09/2026
Status: VALIDADO PARA IMPLEMENTAÇÃO

## Seleção de trabalho em lançamentos coletivos

Quando o tipo selecionado for coletivo (trabalho coletivo ou agrado coletivo), o campo **Qual trabalho / serviço?** deve listar por padrão somente trabalhos em aberto.

### Exceção obrigatória

Um trabalho já concluído pode continuar aparecendo na lista somente quando existir ao menos uma obrigação/pagamento pendente ligado a esse trabalho que ainda precise ser quitado ou associado.

### Regra operacional

Exibir quando:

- `status` do trabalho indicar aberto/ativo/planejado/em execução; OU
- `status` do trabalho indicar concluído **e** existir saldo pendente, pagamento ainda não associado ou obrigação financeira ainda não liquidada relacionada ao trabalho.

Ocultar quando:

- trabalho concluído;
- todas as obrigações liquidadas;
- nenhum pagamento pendente de associação;
- nenhum saldo a receber.

### UX

- trabalhos abertos aparecem primeiro;
- concluídos mantidos pela exceção devem aparecer identificados como **Concluído — pendência financeira**;
- a lista não deve exibir trabalhos concluídos sem pendência;
- essa regra vale tanto para lançamentos manuais quanto para associação de pagamento recebido.

## Homologação

O mockup de navegação e os campos operacionais foram validados pela proprietária como base para implementação.
