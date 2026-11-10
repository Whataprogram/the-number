# Deployment and operations

This runbook covers the separate Whataprogram copy. It records implemented controls and operational work that must be verified; it is not a compliance certification. Last reviewed: November 10, 2026.

## Deployment configuration

Deploy `Whataprogram/the-number` as a new Vercel project. Do not connect, replace or modify the original repository's deployment. Use Node 24, the Next.js framework preset, install command `npm ci` and build command `npm run build`. No custom Vercel routing file is necessary.

Check the hosting plan before a commercial launch. Vercel limits Hobby to non-commercial personal use. Its current Pro base is $20/month with one deploying seat and $20 usage credit, with additional usage billed separately; do not upgrade or enable paid add-ons without the owner's decision. [Hobby terms](https://vercel.com/docs/plans/hobby), [Pro pricing](https://vercel.com/docs/plans/pro-plan).

| Variable | Purpose | Handling |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | HTTPS API URL of this environment's Supabase project | Public configuration |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public application key from the same project | Public; owner authorization comes from verified sessions and database rules |
| `NEXT_PUBLIC_ENABLE_EMAIL_SIGNUP` | Public signup and email-recovery entry points | Keep `false` for the owner-selected private pilot |
| `APP_URL` | Exact canonical app origin, including port for local development | Required deliberate production configuration; no wildcard |

Keep database passwords and secret/service-role keys out of the application. Ordinary requests need only the publishable key and requesting user's verified access token. Rebuild after any `NEXT_PUBLIC_` change. Production variables must not be copied wholesale into previews: use a separate test database and set the preview's exact origin, or deliberately use the platform-provided `VERCEL_URL` fallback. Do not share production records with preview deployments.

Apply each versioned file in `supabase/migrations/` in order using the migration administrator. Record the target project and applied version. The migrations create owner-isolated storage, validated save/delete RPCs, guarded self-account deletion and explicit HTTP 409 conflict responses, and remove client execution of Supabase's optional automatic-RLS administrative function when present. Never edit an already-applied migration to represent a new change.

## Private pilot and later public signup

The owner has explicitly deferred public email signup. Ship the private pilot with `NEXT_PUBLIC_ENABLE_EMAIL_SIGNUP=false`; public account creation and email-recovery entry points must remain unavailable. Also turn off new public signups in Supabase Auth so direct API callers cannot bypass a hidden form. Existing verified pilot accounts can sign in. The sample and local records remain usable without signing in. Do not claim that public onboarding is live, and do not purchase a domain or email plan for this release.

The following email setup is for a later, deliberate public rollout. It is not a blocker for the selected private-pilot release. Before setting the flag to `true`, complete the provider configuration and non-team tests below, then rebuild and verify the hosted controls. Hiding a client form alone is not a provider access rule.

Configure Supabase Auth Site URL to the canonical app URL. Add the exact confirmation and recovery redirect URLs used by the app, including `/?auth=confirmed` and `/?auth=recovery`; include localhost only for the test environment. Email links use PKCE, so the current interface asks people to open them in the browser that initiated the flow.

Keep confirmation enabled and anonymous sign-ins disabled. Set the provider password minimum to at least 12 characters; a browser form rule alone is bypassable. Review provider rate limits and enable administrator MFA. If CAPTCHA is enabled at the provider, implement and test the matching client challenge before launch; flipping the provider switch alone would break this form.

Configure a verified sender and custom SMTP, then test actual signup confirmation and password-reset delivery with a non-team email address. The default Supabase sender permits only project-team addresses and currently has a two-email-per-hour limit. It does not support public onboarding. A Vercel subdomain is sufficient to host the site; a sending domain/provider is a separate email-delivery decision. Do not disable confirmation as a substitute for delivery setup. [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

### Later email setup

For a small weekend pilot, use an owned domain and Resend Free. Its current transactional allowance is 3,000 messages per month, limited to 100 per day; confirmation, resend and recovery messages all consume that budget. Resend Pro is currently $20/month for 50,000 messages without a daily cap, but is not required for a small pilot. Monitor remaining allowance and avoid repeated signup tests that exhaust it. These are November 10, 2026 prices, not a promise of future pricing. [Resend pricing](https://resend.com/pricing).

Read-only Vercel checks on November 10 found `thenumberhq.com` available at $12.03 for a one-year registration and $12.03 current renewal price; `thenumber.money` was $19.99 initially and $35 at current renewal. Availability and prices can change. Nothing was purchased or reserved. Domain charges may include tax/fees; registration is non-refundable. The owner must choose and buy a domain using their actual registrant details and payment method, and choose renewal settings deliberately. The Vercel project can remain on its existing subdomain while email is configured.

1. The owner obtains the selected domain and creates/signs in to a Resend account. Do not send API keys or passwords in chat.
2. Add `auth.<owned-domain>` to Resend. Add the exact DNS records Resend returns at the authoritative DNS provider, preserve unrelated records, and wait for verified status. Use a transactional subdomain and disable link/open tracking for authentication mail. [Domain verification guidance](https://resend.com/docs/dashboard/domains/introduction).
3. Create a Resend API key restricted to sending mail for that domain. Store it directly in the provider's SMTP password field; never in a `NEXT_PUBLIC_` variable, source file or screenshot. [API key permissions](https://resend.com/docs/dashboard/api-keys/introduction).
4. In Supabase Authentication → Email → SMTP Settings, enable custom SMTP. Set host `smtp.resend.com`, port `465`, username `resend`, and the Resend API key as password. Set sender name `The Number` and an address on the verified subdomain, such as `accounts@auth.<owned-domain>`. [Resend's Supabase setup](https://resend.com/docs/send-with-supabase-smtp).
5. Keep confirmation enabled. Set Auth Site URL and exact allowed redirects to the deployed app origin. Review Supabase's separate email rate limit alongside Resend's daily budget; adding SMTP does not mean unlimited sends. [Supabase rate limits](https://supabase.com/docs/guides/auth/rate-limits).
6. Use controlled non-team Gmail and Outlook addresses to test delivered confirmation, sign-in, password reset, an invalid/expired link and a repeated request. Check spam folders and provider delivery logs. Confirm that password-reset links open the app and complete in the initiating browser. Record outcomes before announcing public signup. Include a mailbox with link scanning: automated scanners can consume a single-use link before the person opens it. [Authentication email delivery checklist](https://resend.com/docs/knowledge-base/how-do-i-maximize-deliverability-for-supabase-auth-emails).

An email sender is not automatically a monitored customer-support channel. Publish a real support address with a named owner and test incoming messages separately.

## Data, deletion and retention

An unsigned-in workspace lives in tab memory. Signed-in work is uploaded only when the person chooses Save to account. The browser SDK persists its authentication session in browser storage; it is not an HttpOnly-cookie implementation. The app uses nonce-based script policy and locally hosted fonts, and financial API responses are private/no-store. Operators must preserve these controls and avoid adding session-replay scripts that capture records.

Cloud limits: 4 MiB of stored JSON, 5,000 records and ten workspaces per account. Local import/backup allows 5 MiB. The cloud limit leaves headroom under Vercel's function body limit. There is a budget of 30 successful saves/deletes per account per minute; it is not a complete denial-of-service defense. [Vercel function limits](https://vercel.com/docs/functions/limitations#request-body-size).

The app retains current cloud rows until a user deletes them or deletes the account. There is no revision history or automated retention purge. Deleting a saved workspace is permanent in the current application; it does not delete an open local copy or files already downloaded. **Delete my account** requires the matching email and current password. The database independently requires signed proof of password authentication within ten minutes, then deletes only that authenticated account; its workspaces and write counter cascade. The interface signs out and clears current tab records. Download needed backups first.

An authorized administrator can also fulfill an account-deletion request through Supabase Auth. Verify identity and record only minimal completion metadata. Neither route deletes files the user already downloaded or promises immediate erasure from provider backups/security logs. Test the self-service route with a disposable account and verify that another account's data remains intact.

Publish a truthful support/contact and retention policy before collecting public customer data. Name the actual backup retention after configuration; do not invent a retention period or promise end-to-end encryption. The application itself does not encrypt workspace JSON with a user-held key.

## Backups and recovery

Cloud saving is persistent storage, not an independently verified backup. On Supabase Free, do not assume downloadable automatic backups exist. Supabase recommends regular CLI exports and off-site copies for free projects; paid backup/PITR options have separate retention and cost. Free projects may also be paused after a period of low activity. Review current plan details before a promised service-level commitment. [Backup guidance](https://supabase.com/docs/guides/platform/backups), [availability checklist](https://supabase.com/docs/guides/deployment/going-into-prod#availability).

Before real customers, assign an operator, choose an encrypted off-site backup destination, define an acceptable recovery point/time and test restoration into an isolated project. A complete restore must preserve authentication identities and ownership relationships as well as workspace rows. A workspace-only export is insufficient for full service recovery. Keep backup credentials outside this repository and restrict operator access. Follow the provider's supported backup/restore procedure instead of pasting privileged connection strings into logs.

For a lost tab, reopen the last saved cloud workspace or restore a downloaded JSON file. Unsaved edits cannot be recovered by the service. For a conflict, download the current tab before loading the saved version; never change a server version by hand to force an overwrite. For accidental deletion, restore a user-held JSON as a new workspace, or use an operator-tested backup process if one is available. For an outage, preserve local work and retry later; do not repeatedly create replacement accounts or change access policies to bypass the error.

## Monitoring and incident response

Provider logs and security/performance advisors are available, but this repository does not yet configure an external error tracker, uptime monitor, alert delivery, service-level objective or on-call rotation. Review deployment failures, Auth failures, API 5xx/429 rates and database capacity during the event. Use a synthetic empty or fictional workspace for health checks. Never log access tokens, passwords, request bodies or transaction descriptions/amounts.

The workspace API deliberately redacts provider errors. If a failure needs investigation, correlate timestamps, endpoint and status with restricted provider logs. Add request IDs only if they do not encode identity or financial data. Confirm that new telemetry redacts headers and bodies before enabling it.

For suspected account exposure, contain affected access, preserve restricted diagnostic evidence and assess which users/records were affected. Rotate only credentials shown to be compromised, revoke affected sessions through the authorized provider path, fix the cause and repeat the isolation tests. Record decisions and communicate with affected users through the owner-approved process. A frontend rollback does not undo a database migration or recover deleted data.

## Release and rollback

Use reviewed changes in the separate repository. Before promotion, run `npm ci`, `npm test`, `npm run typecheck` and `npm run build`; then complete the hosted two-account and browser checks in `qa-matrix.md`. Test schema changes on an isolated database first and keep application/schema compatibility during rollout. Vercel code rollback and database recovery are separate operations. Prefer a forward corrective migration; do not drop a production table to make a deployment match an older commit.

A successful build or local RLS suite is not evidence of email delivery, production redirect configuration, actual browser behavior, provider backups or load capacity. Record the deployed commit, hostname, database migration versions, test date and remaining limits in the release evidence.
