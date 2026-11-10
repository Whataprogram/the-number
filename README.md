# The Number

First the records. Then the number.

A separate Startup Weekend rebuild of [shaikmm-blip/the-number](https://github.com/shaikmm-blip/the-number), developed in [Whataprogram/the-number](https://github.com/Whataprogram/the-number). The original project is unchanged. This copy keeps the name and number-mark logo and introduces a focused dark workspace.

## The working product

- Import a supported CSV, inspect errors and duplicates before committing, or enter a record manually.
- Review business income, costs, personal money, transfers and recorded tax payments. Edit or remove records and confirm date coverage.
- Export a categorized ledger CSV, download a restorable JSON workspace, and print the reconciled fictional sample calculation.
- With Supabase configured: sign in to an existing private-pilot account and explicitly save, open or delete private workspaces across visits. Saves detect conflicting versions instead of silently overwriting another tab. Account deletion requires the account email and fresh password verification.
- Without an account: work locally and use file backups. Signing in alone does not upload records.
- Follow deterministic integer-cent calculations with BigInt intermediates, explicit rounding, versioned parameters and visible assumptions. AI does not calculate or classify transactions.

The fictional sample includes one unresolved birthday gift. Review it as personal money to see the sample calculation. Personal numeric tax estimates remain disabled until qualified independent policy review; a profile checkbox cannot approve the tax policy.

## Run locally

Use Node.js 24 LTS, as specified by `.nvmrc` and `package.json`.

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run dev
```

Open http://localhost:3000. Use `npm start` for the production build. The sample and local records work without environment variables. For accounts and cloud storage, copy `.env.example` to the ignored `.env.local` and configure the public Supabase project URL, publishable key and exact `APP_URL`. Do not place a database password, secret key or service-role key in the app. See [deployment and operations](docs/operations.md).

Next.js embeds `NEXT_PUBLIC_` values at build time; changing them requires a new build. This repository uses the ordinary Next.js hosting configuration; no custom `vercel.json` is needed.

## CSV, saving and recovery

Start with `public/transaction-template.csv`. Required columns: `date,description,amount`. Optional: `account,transaction_id`. Dates use YYYY-MM-DD. Positive amounts are money received; negative amounts are money paid. Use decimal dollars with at most two decimal places. Map bank exports into this format first; arbitrary bank formats are not supported.

Invalid rows reject the whole import. Matching source transaction IDs cannot be imported twice. Similar-looking payments require a keep/skip decision because separate transactions can look identical. Imported records start unreviewed. Recorded tax payments need a designated year and purpose and are not business costs.

Local files are limited to 5 MiB and 5,000 records. Cloud workspaces are limited to 4 MiB, 5,000 records and ten saved workspaces per account. Storage checks also include metadata, so a valid CSV may need smaller notes or fewer records before saving. Rejected imports/saves leave the prior saved data unchanged.

Saving is manual. Use **Save to account** or download a workspace JSON before closing/reloading the tab or replacing work. The last successful save does not include later unsaved edits. A started download is not proof that a file was saved. JSON files are unencrypted; store them privately. CSV alone is not a workspace backup. Restoring a sample JSON creates personal records and cannot enable unreviewed personal tax output.

Deleting a saved workspace removes its current cloud row; an open local copy and downloaded files remain separate. **Delete my account** requires the matching email and current password, deletes the account and its saved workspaces, and signs out. Download a backup first: sign-out clears current tab records. Files already downloaded and provider backup/log retention remain separate from application deletion.

## Scope and launch requirements

There are no live bank connections, SMS alerts, tax filing, payment execution or state/local tax calculations. Previous Plaid/QuickBooks endpoints return HTTP 410. The IRS autofill extension and replica payment page were removed. Historical prototype helpers retained for regression tests are not connected to the interface.

The sample is a limited adult, single, nondependent U.S. sole proprietor with no other income and simple operating costs. Its result is tax on recorded profit, not an annual projection, required installment, IRS bill or safe-to-spend amount. Read [the unsigned math review packet](docs/math-review.md) before enabling or expanding the model.

The owner has deferred public signup and email recovery. Keep `NEXT_PUBLIC_ENABLE_EMAIL_SIGNUP=false` for this private pilot, and disable new public signups in Supabase Auth as well. The sample and local workflow remain available without an account. Public onboarding can be activated later after custom SMTP and redirects pass non-team delivery tests. Supabase's default sender is restricted to project-team addresses and is intended for testing; keep email verification enabled. [Supabase email delivery requirements](https://supabase.com/docs/guides/auth/auth-smtp).

The application includes owner isolation, server-verified authentication, versioned writes, bounded validation and security headers. These controls and passing tests do not constitute a security certification or a guarantee of production readiness. Use the release checklist and record hosted verification results.

## Review documents

- [Math assumptions, sources and reviewer signoff](docs/math-review.md)
- [Design direction and 21st.dev references](docs/design.md)
- [Database access and migration contract](docs/database.md)
- [Cloud API contract](docs/cloud-api.md)
- [Deployment, backups and incident response](docs/operations.md)
- [Demo and release checklist](docs/release.md)
- [QA matrix](docs/qa-matrix.md)
- [Independent source security review](docs/security-review.md)

The Redhawk Builds prototype and history remain credited through the fork. The rebuild uses Next.js, React, Supabase, Lucide and local Geist fonts, with a dark interface informed by the documented 21st.dev references.
