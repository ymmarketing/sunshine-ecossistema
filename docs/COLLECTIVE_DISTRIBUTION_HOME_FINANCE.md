# Collective distribution pilot and Home finance

This change applies a prospective 20% house reserve, 20% operating budget, 30% responsible member, and 15% to each other member to collective receipts only. The migration activation timestamp and the receipt's paid/created timestamps jointly protect historical receipts. Individual consultations, questions, private services and memberships retain their existing rules.

The Home keeps the association panel, headline figures and open works. Each open work gains a comparison of materials against the 20% cost budget, generated commissions by recipient, and the remaining balance against a 20% house reserve target. A cost within budget does not imply that the reserve target was met. Both statuses are displayed independently and use actual generated commissions, including older receipts under their original split.

A shared renderer supplies the commission control on Home and Receita, with “REPASSE PENDENTE” in member labels. Home uses current-month receipt dates independently of the Receita filters. Its payment, copy and evidence actions open the matching Receita period and use the established settlement and advance controls.

## Activation and validation

This is a draft change. The schema migration has not been applied and the source must not be promoted before database validation. Run tests/collective-distribution.sql after the migration in an isolated validation environment. The fixture rolls back synthetic rows. Compare historical commission and payout checksums before and after release.

The pilot implementation does not activate a fixed-remuneration model for a future calendar year. That transition needs a separately configured effective date and approved amounts. Forecasts must distinguish a seasonal revenue floor from the revenue required to cover operating costs, reserves and fixed remuneration. Incomplete months and missing historical costs must remain explicit.

Real bank transfers are a separate integration: verified receiving accounts, server-side bank authentication, a selected schedule, reconciliation, idempotency, uncertain-result recovery and confirmed settlement are prerequisites. Internal ledger entries must never be presented as bank transfers. This change contains no bank credentials, bank payment calls, payroll amounts, or customer financial data.
