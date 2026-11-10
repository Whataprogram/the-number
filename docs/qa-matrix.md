# Workflow quality review

This is a test-evidence record, not a claim that every production flow is approved. The workflow suite uses fictional records. It calls the real parser, calculation engine, exporter, serializer, restore validator and server API handlers. Supabase responses in this particular suite are mocked; live authentication and database isolation require their own evidence.

On November 10, 2026, all **17 workflow tests passed** under Node 24, and the project TypeScript check passed after the UI fixes below.

## Automated lifecycle coverage

Run with Node 24:

```sh
npm test -- tests/workflow.test.ts
```

| Scenario | Expected behavior | Evidence |
|---|---|---|
| Import six mixed records | Every row starts unresolved; no inferred business treatment | Workflow test |
| Review income, supplies, gift, transfer and payment | Income $200.00, costs $30.25, profit $169.75, recorded payments $15.00 | Independent fixture |
| Correct gift previously marked as income | Profit decreases by exactly $100.00; source facts and correction survive JSON/CSV export | Workflow test |
| Invalid final CSV row | Entire batch rejected, existing workspace unchanged | Workflow test |
| Equal date/amount with different transaction IDs | Candidate warning; explicit keep retains both real identities | Workflow test |
| Same account and external transaction ID | Exact duplicate warning; another account remains a separate namespace | Workflow test |
| Unsupported refund | Negative cents and explanation survive export; unresolved state stays visible | Workflow test |
| Negative reviewed income | Backup rejected; engine reports direction mismatch | Workflow test |
| Unicode and multiline text | JSON preserves text; CSV neutralizes formula-looking descriptions/notes | Workflow test |
| Ledger CSV uploaded as an import | Rejected instead of discarding review metadata | Workflow test |
| Duplicate source IDs in a restored file | Both records retained for an explicit decision; removing the extra record resolves the duplicate blocker | Workflow test; UI action must be verified |
| Independent $20,000 fictional profit case | SE tax $2,825.91, income tax $198.96, total $3,024.87, remaining after $1,000 payments $2,024.87 | Independently documented cents worksheet |
| Cross-year activity and payments | 2025/2027 business income excluded from 2026 totals; January 2027 designated 2026 estimated payment included only through the selected date | Workflow test |
| Loss and excess recorded payment | No negative tax; excess remains distinct | Workflow test |
| Backup of sample | Records preserved; restored mode becomes personal and tax output stays unavailable | Workflow test |
| API create/reopen/correct | Exact reviewed cents, provenance and decisions survive server normalization; version increases | Mocked-provider lifecycle test |
| Invalid API update or stale version | Existing saved records remain intact; invalid input never reaches the mocked write API | Mocked-provider lifecycle test |
| Uploaded derived tax result | Rejected before storage | Workflow test |
| Local backup exceeds cloud limit | Valid local backup remains restorable; cloud save fails without writing | Workflow test |

The separate `database.test.ts` suite exercises real Postgres behavior under PGlite. The separate `cloud-api.test.ts` suite covers request authentication, origin and transport errors. Neither substitutes for a deployed two-account check.

## Findings sent to implementation owners

1. **Record recovery — fixed in code, browser check pending:** the initial UI lacked per-record removal. A backup with distinct internal IDs sharing one source transaction ID passes schema validation and is correctly blocked by the engine, but read-only source facts alone could not resolve it. The implementation owner added explicit removal with confirmation, revision increment, coverage reset and cloud dirty state. The lifecycle suite proves the expected domain result after removal; direct UI verification remains required.
2. **Payment-year edit bounds — fixed in code, browser check pending:** the initial editor used 2020–2030 while the validator accepts 1900–2100. A valid restored historical balance-payment record could not save a note edit. The editor now matches 1900–2100, confirmed by source inspection and TypeScript.
3. **Import guidance:** ledger-export reimport is safely rejected, but its current generic “too many columns” error could say to restore the JSON workspace instead. This is a wording improvement, not data loss.

## Hosted/browser checks still requiring direct evidence

Record the URL, deployment/commit and result for each check. Do not mark a row passed merely because the source appears to implement it.

| Check | Procedure and pass condition |
|---|---|
| Signup and verified email | Create an account, follow the real confirmation flow, then save. Before confirmation, the storage API must reject the account. Verify delivery/provider limits. |
| Sign in and recovery | Sign out, sign back in, request a reset and complete the recovery flow. Used/expired links must produce a recoverable error rather than leave the app in a half-signed-in state. |
| Save and reopen | Save reviewed personal records, close the tab, open a new tab, sign in and reopen. Compare exact counts, cents, notes, import provenance and version. |
| Two-account isolation | Account B must not list, read, update or delete account A's workspace, including a known UUID. Check both application API and direct database RPC boundaries. |
| Conflicting tabs | Open the same version in two tabs. Save tab A; saving tab B must show conflict and retain B's unsaved work. Reopen latest or save as a separate workspace by explicit choice. |
| Interrupted create | Interrupt the create response. Retrying must not silently create multiple copies; the user must have an unambiguous recovery route. |
| Logout/account switch | Switch users during a delayed save/list/open. Prior-account data must disappear and late responses must not replace the new account's workspace. |
| Expired/revoked session | Expire the session before save. No data should be cleared; sign-in recovery and local backup should remain available. |
| Network/server failure | Disconnect before saving and simulate an API failure. Do not show Saved until a successful server response. Preserve the current local draft. |
| Workspace deletion | Confirm deletion of one owned workspace, verify it disappears, and verify a stale deletion cannot remove a newer revision. Explain that downloaded files are separate. |
| Single-record removal | Remove an accidental entry or restored duplicate. Reconcile totals, count, dirty state and coverage. Canceling removal must change nothing. |
| Import/restore picker | Import valid and invalid CSVs through the browser, handle duplicate choices, download JSON, restore via file picker and compare records. Canceling a picker must not erase current work. |
| Download and print | Inspect the actual saved CSV/JSON and print preview; verify sample labels, accurate amounts and no clipped columns. A click alone is not proof of download. |
| Responsive/keyboard | Test 360px and desktop widths; complete the main flow with keyboard only. Check focus after errors, panel transitions and successful saves. |
| Security headers | Verify production CSP nonces are fresh, scripts hydrate successfully, no unexpected third-party requests occur and record responses use private no-store caching. |
| Browser compatibility | Repeat core import/review/save/open in current Chrome/Edge and a mobile browser; note any untested browser rather than claiming universal support. |

## Operational evidence outside these tests

Production readiness also requires configured email delivery and abuse controls, documented backup/restore and retention, account-deletion handling, monitoring without financial-record logging, and a qualified tax-policy review before enabling personal numeric tax estimates. Do not treat a successful deployment as proof of those procedures.
