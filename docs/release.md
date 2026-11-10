# Demo and release notes

## Two-minute demo

1. Open the sample business and identify its sample label.
2. Show that its number is unavailable while the birthday gift is unresolved.
3. Review the gift as Personal money, read its note and confirm.
4. Return to Overview: income $32,500, costs $2,500, profit $30,000. Illustrative gross federal tax is $5,181.32 and the sample amount remaining after $1,000 recorded payments is $4,181.32.
5. Open the calculation breakdown. Fixed, versioned code produces the amounts; policy still awaits qualified independent review.
6. Export the ledger and JSON workspace. In a verified test account, demonstrate a separate personal workspace saved to the database and reopened after reload. Do not upload the fictional sample as real records.

## Evidence before judging

Ask five small-business owners to import a prepared fictional CSV and classify a personal transfer without coaching. Record task completion, time, confusion and their own words. Ask three owners about their last actual bookkeeping/tax problem, what they did, what it cost and whether they would use a reviewed-records handoff. Separate observed behavior from compliments. Do not collect credentials or real statements for a public demo.

Recruit a qualified tax professional to complete `math-review.md`. Record credentials, supported scope, unresolved issues and dated signoff; fix findings before enabling personal numeric estimates. Confirm the event's current judging format and present evidence of customer validation, business viability and execution. A prior buildathon win is context, not evidence of demand.

## Hosted private-pilot release gates

Record evidence for each gate on the actual deployment; do not mark it complete merely because source code or unit tests exist.

| Gate | Required evidence |
| --- | --- |
| Correct destination | Deployment points to the tested commit in Whataprogram/the-number; original site/repository untouched |
| Build and configuration | Node24 tests/typecheck/build pass; public Supabase values match the intended project; APP_URL and Auth redirects match the live origin |
| Authentication | Existing verified pilot account signs in; public signup/recovery entry points remain unavailable; new public signup is disabled at Supabase; provider password policy matches the form |
| Isolation | Account A cannot read, modify or delete B's known workspace ID; anonymous requests rejected; direct database writes denied |
| Saving and recovery | Save/open/reload/delete, two-tab version conflict, lost-response retry and account switching verified with fictional records |
| Account deletion | Disposable account requires matching email and fresh password; its saved rows disappear; old token cannot access them; another account remains intact |
| Import and export | Invalid CSV leaves state unchanged; repeated file cannot duplicate records; duplicate decisions, manual edit/remove, CSV download and JSON restore verified |
| Presentation | Fresh-browser and phone walkthrough; keyboard navigation; long labels/errors; print/save-PDF sample check |
| Operations | Named operator/support contact, verified backup/restore approach and honest retention policy; capacity and error monitoring reviewed |
| Financial policy | Personal tax output remains disabled until the unsigned review packet receives qualified signoff |

The owner has deferred public email signup. This release uses private-pilot sign-in and the public local/sample workflow; custom SMTP is a later rollout prerequisite, not a blocker for that selected release. Keep email confirmation enabled. Before enabling public signup, configure custom SMTP and test confirmation, recovery, invalid/expired links and actual delivery to non-team addresses. See [operations](operations.md) and [the QA matrix](qa-matrix.md).

## Product limits

The implemented app supports local bookkeeping and explicit cloud saves to verified accounts. It does not autosave, retain a history of every edit or recover unsaved tab memory. Workspace deletion and password-confirmed account deletion are available in the app. Account deletion signs out and clears current tab records; downloaded files and provider retention remain separate. Backup/retention claims depend on configured operations, not simply on the existence of a database.

Bank connections, state taxes, dependent/minor situations, wages, inventory, equipment, refunds and mixed-use expenses require separate implementation and review. The ledger flags incomplete decisions. A reviewer must check receipts and deductibility; a transaction description cannot establish financial intent. The app does not file taxes or instruct a user to pay the sample amount.
