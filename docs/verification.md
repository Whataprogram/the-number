# Release verification

This records checks performed against a specific build. It is evidence for the private pilot, not a security certification, a promise that no vulnerabilities exist, or approval of the tax policy.

## Release under test

- Site: [the-number-rebuild.vercel.app](https://the-number-rebuild.vercel.app)
- Repository: [Whataprogram/the-number](https://github.com/Whataprogram/the-number)
- Commit: `c03019d467ff128b92411924e317bbace2a0fd3c`
- Vercel deployment: `dpl_Gc7Md9s2Yv9deAknGWa6GGvEb7SL`
- Supabase project: `jowctzagkezkscvdzuxt`
- Production HTTP/API checks completed: November 10, 2026, 07:59 UTC.

The owner chose a private pilot and deferred public email signup and recovery. `NEXT_PUBLIC_ENABLE_EMAIL_SIGNUP=false` is the release configuration. Existing verified pilot accounts can sign in; the sample and local import/review/export workflow need no account. Public onboarding needs the separate SMTP and redirect tests in [operations](operations.md) before activation.

## Build and production HTTP checks

A fresh Node 24 production build of this commit passed Next.js compilation, TypeScript and route generation. The subsequent checks below ran against the actual Vercel HTTPS origin, with no deployment-protection bypass.

| Check | Observed result |
| --- | --- |
| Homepage | HTTP 200 without authentication |
| Nonce policy | Two responses carried different CSP nonces; the inspected HTML used its response's nonce |
| Production scripts | `strict-dynamic` present; no `unsafe-eval` or script `unsafe-inline` allowance |
| Other CSP boundaries | Objects blocked, framing blocked, connection policy limited to self and the configured Supabase origin |
| Response headers | `no-store`, `nosniff`, frame `DENY` and `no-referrer` present |
| Retired integrations | All ten Plaid/QuickBooks endpoints returned HTTP 410 for both GET and POST |
| Forged token | Workspace API returned HTTP 401 with no-store |
| Unknown route | HTTP 404 |
| Client exposure scan | Served HTML and ten referenced entry scripts contained no secret-key markers or JWTs with privileged service/admin roles |

The client scan covered the fetched assets and named patterns; it was not a proof that every possible secret or lazy-loaded asset was inspected. Inline styles remain allowed for the app's bounded progress styling; the stricter script policy is separate.

## Production account and database checks

Both synthetic control accounts authenticated through hosted Supabase Auth. Twelve checks then passed through the production application API and, where stated, the direct Data API:

1. Missing authentication was rejected.
2. A forged bearer token was rejected.
3. A verified account created a workspace with the expected stored records and version.
4. Reopening returned the exact saved records with no-store.
5. A different account could not read, change or delete the known workspace ID; all three operations returned 404.
6. The other account's list excluded the workspace.
7. A direct cross-account database read returned no rows under RLS.
8. A direct database write was denied with 403.
9. Two saves competing for version 1 returned exactly one 200 and one 409; the saved version became 2.
10. A different browser origin was rejected with 403.
11. A stale delete returned 409 and preserved the current workspace.
12. The owner deleted the current version; a subsequent read returned 404.

The run used fictional records and removed its workspace. The coordinator subsequently deleted both control accounts by their exact fixture IDs and verified zero remaining fixture accounts. Their temporary credential files were removed. No customer account or records were used.

A separate ten-check account-deletion run at 07:52 UTC used the development API with the real hosted database. It verified wrong-email rejection, preservation after rejection, fresh-password self-deletion, rejection of the deleted account's token and credentials, and survival of an independent control account and its records. Its disposable third account and both temporary workspaces were confirmed removed. This is useful live database evidence, but that run was not a production-origin browser test.

## Provider findings and remaining work

The final Supabase advisor review reported the following findings. The deployment does not have zero warnings.

| Finding | Interpretation and action |
| --- | --- |
| Auth leaked-password protection disabled — WARN | An unresolved protection gap on the current Free project. Supabase documents this feature as Pro and above. A minimum length or private signup does not detect reused, breached passwords. Use unique password-manager-generated pilot credentials; revisit the provider feature before broader release. No plan upgrade was performed. |
| Authenticated executable SECURITY DEFINER functions — three WARN findings | `save_workspace`, `delete_workspace` and `delete_own_account` deliberately use guarded elevated entry points while raw table writes are revoked. They have an empty search path and explicit authenticated-owner checks. Saves/deletes enforce versions; account deletion additionally requires matching email and recent signed password authentication. Keep reviewing these functions after any change. The isolation tests above exercise their access boundaries; the warnings are not certification of safety. |
| RLS enabled without policies on `number_private.workspace_write_limits` — INFO | Deliberate deny-all client access for an internal mutation counter. Direct privileges are revoked; only guarded functions maintain it. Do not add a permissive client policy to silence the advisor. |

The plan restriction for leaked-password protection is documented in [Supabase password security](https://supabase.com/docs/guides/auth/password-security). Public signup is disabled in Supabase, email confirmation is enabled, and anonymous sign-in is disabled. The Site URL matches the production origin, with only the exact confirmation and recovery callbacks allowed. The provider password minimum was not changed in this pass; verify it before public onboarding. Browser-only validation does not enforce provider policy. The owner chose to create their pilot account later and use sample/local mode now.

## Browser and CI evidence

The GitHub [Check rebuild workflow](https://github.com/Whataprogram/the-number/actions/runs/42778741749) passed for the tested commit. The suite contains 265 passing tests.

Browser checks confirmed the sample gift review produces $30,000.00 profit and $4,181.32 remaining illustrative tax; invalid CSV dates and precision errors import no rows; a valid two-row CSV previews before importing; an identical file cannot be imported twice; and a JSON workspace backup downloads with reviewed decisions. Editor focus now moves into the opened panel and returns to the page after a reviewed row disappears from its filter.

The deployed landing page and workspace fit 320px and 375px viewports without horizontal page overflow. The deployed browser reported no captured console errors during the walkthrough. These checks do not replace testing with assistive technology or real users.

This pass does not establish email deliverability, a backup restore drill, uptime/load capacity, independent penetration testing, complete browser accessibility or qualified tax-policy approval. Browser walkthroughs and operational gates remain separately recorded in [the release checklist](release.md), [QA matrix](qa-matrix.md), [security review](security-review.md) and [math review packet](math-review.md). Personal numeric tax output remains disabled pending that qualified policy review.

The sanitized machine results are retained in the task workspace as `production-http-qa-result.json`, `production-live-qa-result.json` and `live-account-deletion-result.json`. Credentials, access tokens and account identifiers are not included in this document.
