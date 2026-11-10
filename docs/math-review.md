# Independent tax-policy review packet

Status: **not approved**. No qualified tax reviewer has signed off on this implementation. `POLICY_REVIEWED` is false in `lib/engine.ts`. Personal workspaces may organize and export records but cannot produce a numeric tax estimate or tax-summary report. User checkboxes do not change that release control. Fictional sample workspaces display illustrative calculations only.

Rule version: `2026-prototype-2.0.0`. Source parameters were checked against primary sources during the November10,2026 audit; a source check is not a professional review of a complete tax policy. No AI/model call participates in classification, calculation, review or export. Records are classified explicitly by the user rather than by a merchant-name heuristic.

## Review scope and decisions requested

Please review the supported profile, expense treatment, cent-rounding sequence, QBI treatment, payment attribution and exact test fixtures independently. Record the reviewer's name/qualification, date, sources used, reviewed commit, rule version, approved scope, exceptions and test evidence. A passing unit suite proves agreement with programmed expectations, not tax-law correctness.

The proposed limited profile is an adult U.S. single filer, sole proprietor, cash method, not a dependent, no other income and net profit no greater than$100,000. Federal only. The model excludes required installments, annualized-income installment calculations, safe harbors, penalties, state/local taxes, return filing and actual payments. The result is tax on recorded profit under that scenario, **not a full-year forecast, IRS bill, safe-to-spend number or sufficient-reserve guarantee**.

Expense categories accepted for the sample are simple consumed supplies, advertising, processing fees and short-period business-only software. These category names do not establish deductibility for a real person's records. Equipment/assets, inventory/COGS, vehicle/mileage, meals/travel, home office, mixed-use costs, prepaid/multi-year costs, refunds, cross-year adjustments and other categories need separately specified treatment. Current engine blocks unsupported categories, negative income adjustments and positive expense refunds; it does not silently remove them or infer a deduction from a merchant name.

Review questions:

1. Is this supported profile sufficiently specified? Which additional eligibility facts are necessary before any personal estimate can be enabled?
2. Is the SE calculation/rounding sequence acceptable for the described planning estimate, including values around the net-earnings threshold? Distinguish the$400 earnings threshold from business profit.
3. Does the 2026 QBI calculation need minimum-deduction handling or further restrictions? Current prototype uses20% of the smaller of nonnegative adjusted business profit and taxable income before QBI. It omits minimum-QBI rules, credits, other deductions and capital-gain interactions; do not characterize that as universally conservative.
4. What specific cost allowlist and questions can support real service-business data? A user's “Business” decision alone cannot settle tax deductibility.
5. Does the separation of gross estimate, recorded designated-year estimated payments, remaining amount and potential excess payments communicate the correct limits? No potential excess is labeled an IRS credit or guaranteed refund.
6. What should happen with losses, previous-year payments, current-year balance payments, payment refunds and incomplete records? Current behavior is documented below; reviewer approval is required before expansion.

## Data and calculation contract

`calculateWorkspace(workspace)` is the single calculation source. It returns recorded income/cost/profit/payment totals, blockers, rule version and an optional federal result. Any unresolved financial row, invalid date/amount/identity, unsupported profile/cost, missing coverage confirmation, unsupported year or over-scope profit makes the tax result, remaining amount and excess amount `null`—never a fabricated zero. Personal mode additionally remains blocked while policy review is pending. Ledger exports remain available with the blockers.

All monetary inputs are safe integer cents. Each row is nonzero and bounded at1,000,000,000,000 cents; maximum5,000 rows. Aggregation uses BigInt and checks safe output bounds. Percentage multiplication and division use BigInt basis points. Exact half-cent ties round away from zero; tax calculations use nonnegative bases. Converting cents to display strings also uses integer arithmetic. No binary floating-point dollar multiplication is used by the tax primitives.

Current illustrative sequence:

1. Sum reviewed business income and supported costs in selected tax year2026 and on/before the through-date. Earlier/later-year income is not counted. Negative profit yields zero restricted gross tax; loss carryovers are not modeled.
2. Net SE earnings = nonnegative profit ×92.35%, rounded to cents. If below$400, SE tax is zero. Otherwise Social Security is12.4% on earnings up to$184,500 and Medicare is2.9% on all earnings, each rounded to cents.
3. Deduct half of SE tax, rounded to cents, from profit to derive the model's nonnegative adjusted income. Subtract the$16,100 single standard deduction, floored at zero.
4. Simplified QBI =20% of the smaller eligible nonnegative base described above, rounded to cents. Subtract it and apply2026 single ordinary brackets, rounding each bracket's tax to cents.
5. Gross illustrative federal tax = SE tax + income tax. This is not a statutory installment allocation. There are no fixed/missed quarter amounts in `WorkspaceResult`.
6. Recorded payments require explicit money-out amount, designated tax year and purpose. Only purpose`estimated`, designated year2026 and payment date on/before the through-date reduce the remaining model amount. Other-year or balance-purpose payments remain visible but do not reduce this value. Payment confirmation is user-recorded, not IRS-verified.
7. A through-date in2027 can include a January2027 payment designated for2026 while still excluding2027 business income. A future payment is not counted in an earlier snapshot. Current supported through-date window is2026-01-01 through2027-12-31; other dates block the model.
8. Remaining =max(0,gross−qualifying recorded payments); potential excess payments=max(0,payments−gross). Every display/export must use this same result/revision.

## Independent examples and expected cents

These were hand/Decimal checked during the audit and are encoded in `tests/engine.test.ts`. They are expectations for the prototype's stated rounding sequence. They require independent policy approval before use on personal records.

| Scenario | Expected |
|---|---|
| Profit$30,000 | SE$4,238.87; income$942.45; gross$5,181.32 |
| Profit$31,000 | Gross$5,396.95; increment over$30k=$215.63, not$172.71 |
| March income$30,000 then April cost$20,000 | Profit$10,000; gross$1,412.96, without obsolete fixed-period subtotal |
| Profit$5,000 | Gross$706.48; no assertion of a required or missed installment |
| $60 First Watch breakfast marked Personal | Recorded payments unchanged; no substring tax-payment inference |
| Profit$30,000, qualifying recorded payments$1,000 | Gross$5,181.32; remaining$4,181.32 |
| Profit$5,000, qualifying recorded payments$1,000 | Remaining$0; potential excess payments$293.52 |
| April2026 balance payment for2025 | No reduction of2026 amount |
| Jan15,2027 estimated payment designated2026 | Included only in snapshots on/after payment date, not2026 snapshots |
| Earlier-year income present in workspace | Excluded from2026 income sum |
| Profit$400 | SE net earnings$369.40; zero SE tax in current model |
| Profit$433.12 vs$433.13 | Rounded SE earnings straddle$400; reviewer must confirm rounding/threshold policy |

The sample workspace is deterministic: Avery's Detailing, fictional adult owner, throughNovember10,2026. Three income rows total$32,500; two simple-cost rows total$2,500; one$100 personal gift begins unresolved; a$500 transfer is excluded; a$1,000 fictional2026 estimated payment is recorded. Marking the gift Personal yields profit$30,000, gross$5,181.32 and remaining$4,181.32. Every sample export must visibly identify fictional data. Importing/restoring real records must use personal mode; mode is not a user switch to obtain an unreviewed personal tax number.

## Primary references

- [IRS2026 inflation adjustments](https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill): standard deduction and ordinary single brackets.
- [SSA contribution and benefit bases](https://www.ssa.gov/oact/cola/cbb.html):2026 Social Security wage base.
- [IRS self-employment tax](https://www.irs.gov/businesses/small-businesses-self-employed/self-employment-tax-social-security-and-medicare-taxes): SE rates, earnings threshold and deduction context.
- [IRS estimated taxes](https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes): installment eligibility and exceptions are distinct from the app's recorded-profit calculation; this model does not determine them.
- [IRS qualified business income deduction](https://www.irs.gov/newsroom/qualified-business-income-deduction): QBI review starting point; reviewer must verify current2026 details and minimum rules.
- [IRS Publication334](https://www.irs.gov/publications/p334): accounting-method, cost and record-treatment review; the currently served2025 publication must not be substituted for verification of2026 changes.

## Release approval record

Reviewer: **not appointed**. Qualification: **not recorded**. Reviewed commit/version: **not recorded**. Approved scope/exceptions: **not recorded**. Independent fixture results: **not recorded**. Approval date: **not recorded**.

Do not change`POLICY_REVIEWED` merely because tests pass or a user accepts a disclaimer. A future release must record the review above, implement its required policy changes, update the rule version and rerun independent fixtures plus end-to-end reconciliation. Keeping personal estimates unavailable is intentional until that work is done.
