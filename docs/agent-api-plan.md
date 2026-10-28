# Integração do agente — decisões aprovadas

- Quatro RPCs em public, exclusivas de service_role.
- first_name usa preferred_name não vazio ou primeiro nome de full_name, em capitalização de título Unicode.
- Cooldown por pessoa e tipo. Uma pessoa aparece uma vez por consulta, pela prioridade g, b, c, d, a, e, f, h.
- Registro idempotente por pessoa, tipo e dia em America/Sao_Paulo, sem repetir a linha do tempo.
- Reutilizar recebimentos, custos de contribuição, comissões efetivas e regra de reserva atuais.
- O botão atual é “Copiar comissão pendente para WhatsApp”; texto_fechamento preserva esse texto, inclusive string vazia quando não há pendência.
- Configurações administrativas de alertas com efeito imediato, sem service_role no navegador.
- Testes com dados temporários em transações revertidas; exemplos reais mascarados na documentação final.
