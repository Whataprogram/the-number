# Cloud API contract and security boundary

The workspace API uses Supabase Auth and Postgres. Every request sends an explicit Bearer access token; the server verifies it with `auth.getUser(token)` before accessing storage. A decoded client JWT is not authorization. The verified user must have a confirmed email and cannot be an anonymous account. [Supabase getUser documentation](https://supabase.com/docs/reference/javascript/auth-getuser).

The browser and server use the same public/publishable project key. Each server client forwards only the requesting user's access token. This API never uses a secret or service-role key. Database policies and RPC ownership checks are a second authorization boundary; direct database writes must stay revoked as specified in the migration. [Supabase API key documentation](https://supabase.com/docs/guides/api/api-keys).

## Configuration

- `NEXT_PUBLIC_SUPABASE_URL`: HTTPS project URL. HTTP is accepted only for a local Supabase instance.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the public project key. A legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a fallback only when its role is `anon`.
- `APP_URL`: the exact canonical application URL, such as `https://your-number-project.vercel.app`. Do not use wildcards. `NEXT_PUBLIC_APP_URL` and the trusted platform `VERCEL_URL` environment variable are fallbacks; request Host headers are never an allowlist.

Production browser requests fail closed without an allowed origin. Supabase Auth redirect URLs must be configured separately to match the real app. Do not put a database password, secret key or service-role key in any NEXT_PUBLIC variable. Rebuild the Next.js deployment after changing public environment variables because they are embedded at build time.

## Requests and responses

All endpoints require `Authorization: Bearer <access_token>`. Mutations require `Content-Type: application/json`. Financial response bodies use `Cache-Control: private, no-store` and `Vary: Authorization, Origin`; no permissive CORS headers are emitted. Browser fetches omit cookies.

| Method and path | Body | Response |
|---|---|---|
| GET `/api/workspaces` | none | `{ workspaces: [{ id, title, version, updated_at }] }` |
| POST `/api/workspaces` | `{ workspace, id?: UUID }` | status 201, `{ id, workspace, version, updated_at }` |
| GET `/api/workspaces/:id` | none | `{ id, workspace, version, updated_at }` |
| PATCH `/api/workspaces/:id` | `{ workspace, expectedVersion }` | `{ id, workspace, version, updated_at }` |
| DELETE `/api/workspaces/:id` | `{ expectedVersion }` | `{ deleted: true, id }` |
| DELETE `/api/account` | `{ confirmEmail }` | `{ deleted: true }` |

The cloud UUID identifies the database row and is separate from `workspace.id`. Only a validated personal Workspace is accepted. Sample saves are rejected; uploaded calculated totals, owner IDs, unsupported fields, invalid primitive types and invalid records are not trusted. Strict restore validation is shared with local import. The raw ledger is stored; tax readiness is derived from the current engine.

Create calls `save_workspace` with a null expected version. Updates and deletes require the latest database version. A conflict must not trigger an automatic overwrite: preserve the user's tab, offer a download, then let them reopen the latest saved copy. A retry of an uncertain create can use the same client-generated UUID; a duplicate returns a conflict instead of overwriting existing data.

Cloud JSON is limited to 4 MB with a small request-envelope allowance. This stays below the hosting request and response limit; local imports/backups still allow 5 MB. A stored cloud workspace must remain small enough to download through the same API. [Vercel function limits](https://vercel.com/docs/functions/limitations#request-body-size).

## Error behavior

Errors return `{ error, message }`. Common statuses: 400 invalid input, 401 sign-in required, 403 email verification or disallowed origin, 404 unavailable/not-owned workspace, 409 stale version or workspace quota, 413 too large, 415 wrong media type, 429 rate budget, and 503 configuration/provider failure. A 429 includes `Retry-After: 60`. Owner mismatch and missing records deliberately share the same 404 response. Raw SQL errors, tokens and financial records are not logged or included in error messages.

Expected save/delete version conflicts use the database code `PT409`, which explicitly becomes HTTP 409 through PostgREST. The API also recognizes legacy `40001` and unique-ID collisions. A conflict is a request to reconcile the saved version, not an instruction to retry and overwrite.

## Account deletion

The account endpoint accepts only the signed-in account's email confirmation, capped at 2 KB. It never accepts a target user ID, password or client-reported authentication timestamp. `delete_own_account` independently binds deletion to `auth.uid()`, verifies the email, and requires a signed password-authentication AMR entry from the preceding ten minutes. Refreshing a token does not count as entering a password. Missing or stale proof returns 403 with `reauthentication_required`. [Supabase JWT claims reference](https://supabase.com/docs/guides/auth/jwt-fields).

The UI reauthenticates with an isolated nonpersistent Supabase client and uses that fresh session for deletion. Account deletion cascades to saved workspaces. Downloaded files remain on the user's device; provider backups and security logs follow their retention schedules. No privileged project key is sent to the browser or used by this endpoint.

## Tests and remaining operational work

`tests/cloud-api.test.ts` exercises mocked provider boundaries: server token verification, owner filters, cross-origin rejection, verified email, invalid data, size limits, stale writes, deletion versions, private caching and errors. These are not a substitute for the database isolation tests or a live two-account deployment test. Run the SQL tests against a disposable database, then verify signup, email confirmation, save, reload, second-account isolation, conflicting edits and deletion on the deployed site.

Supabase's browser SDK persists the auth session in browser storage for sign-in continuity. This is not an HttpOnly-cookie architecture. Keep the application free of untrusted scripts, enforce a suitable Content Security Policy, configure Auth abuse controls and email delivery, and verify sign-out clears the active UI. Operator backups and recovery procedures require separate operational verification.
