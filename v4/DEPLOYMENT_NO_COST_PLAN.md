# Sunshine V4 — plano sem custo

A V4 usa o mesmo projeto Supabase da V3, porém em schema isolado `sunshine_v4`.

- V3 permanece em `public` e não é apagada durante a virada.
- V4 usa `sunshine_v4` para domínio, histórico migrado e operações novas.
- O backup lógico externo da V3 permanece como recuperação adicional.
- Não há Render, Neon, branch paga ou novo projeto Supabase.
- O frontend V4 será publicado em projeto Vercel separado/preview antes da troca do domínio oficial.

Regra de corte: somente depois da validação da aplicação V4 e reconciliação; a V3 continua preservada para rollback.
