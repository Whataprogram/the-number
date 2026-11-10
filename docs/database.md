# Database contract and security

Apply the numbered migrations in `supabase/migrations/` in order, beginning with `202611100001_workspaces.sql`, to a dedicated Supabase project for this copy. Migration `202611100004_conflict_status.sql` updates the transport status for application version conflicts. These files create/configure Postgres storage; they do not create a hosting account.

## Stored data

`public.workspaces` contains a UUID cloud ID, `owner_id`, primitive personal-workspace JSON, a generated title, server version, and creation/update timestamps. The cloud UUID is separate from `data.id`, which is a portable local workspace identifier. The owner references Supabase Auth with `ON DELETE CASCADE`.

Only `mode: personal` is stored. Sample math stays in the application. Calculated tax totals, readiness flags and other unknown fields are rejected. Both the server and database validate primitive data. Database constraints also reject invalid dates, wrong scalar types, inconsistent reviewed directions, missing payment metadata, duplicate internal record IDs, unsafe integers, oversized strings and excessive rows. Ambiguous financial treatment remains data for human review; the database does not invent classifications.

The cloud limit is 4 MiB of the database's JSON text representation and 5,000 records, with at most ten saved workspaces per account. Local file import/backup has a separate 5 MiB limit. The smaller cloud limit leaves room below the hosting platform's request/response limit; a locally valid workspace may need shorter notes before cloud saving. A rejected save leaves the previous version unchanged.

## Access and concurrency

Authenticated accounts can SELECT only rows whose `owner_id` equals the authenticated Supabase user ID. RLS is enabled and forced; no anonymous table access is granted. Owner-specific INSERT/UPDATE/DELETE policies also exist, but raw writes are revoked from `authenticated`, `anon` and `PUBLIC`.

Writes go through two narrowly granted functions. They use `SECURITY DEFINER` so the application does not need raw table mutation privileges. Every affected row has an explicit owner predicate based on `auth.uid()`; there is no caller-supplied owner argument. Both functions pin `search_path` to an empty value, and execution is revoked from PUBLIC and anon. Account creation/email verification remain Supabase Auth's responsibility; saves also check the trusted auth record is verified and nonanonymous.

| RPC | Input | Success |
| --- | --- | --- |
| `save_workspace` | `p_id: uuid or null`, `p_data: jsonb`, `p_expected_version: integer or null` | One row with `id,data,version,created_at,updated_at` |
| `delete_workspace` | `p_id: uuid`, `p_expected_version: positive integer` | One row with `id` |

A null expected version creates a new workspace at version 1. A null cloud ID generates a UUID. A positive expected version updates the matching owner and exact current version. A stale tab gets a conflict rather than overwriting newer records. Delete also checks the expected version. Per-account transaction locks serialize writes, including the quota check; row locks protect the version comparison. A create ID collision never overwrites the existing row.

Expected version conflicts use SQLSTATE `PT409`, which [PostgREST maps explicitly to HTTP 409](https://docs.postgrest.org/en/stable/references/errors.html#raise-errors-with-http-status-codes). They must not be reported as database serialization failures or temporary service failures. A conflicting client must preserve its local work and obtain the newer version or save a separate copy.

| SQLSTATE | Meaning | Suggested API response |
| --- | --- | --- |
| `42501` | Missing authentication, unverified save account, or unavailable/not-owned workspace | Authenticate first; use 404 for inaccessible workspace IDs |
| `PT409` | Stale version or unavailable create ID | 409; offer reload or save a separate copy, never silent retry |
| `22023` | Invalid primitive workspace or mutation arguments | 400; keep local changes |
| `54000` | Ten-workspace quota or version ceiling | 409; explain capacity |
| `P0429` | Write budget reached | 429 with `Retry-After: 60` |

The write budget allows 30 successful save/delete mutations per account per fixed 60-second window. A private table holds one counter per account, not a financial event log. Failed transactions roll back their counter changes, so this is a successful-write budget, not a complete denial-of-service defense. Hosting/auth request limits are still required. A user cannot read or mutate the private counters through the Data API.

## Deletion and operations

Deleting an authenticated account through the authorized Supabase admin path cascades its workspaces and budget counter. Deleting a workspace through its RPC removes that current cloud row. This is not a promise of immediate erasure from provider backups; configure and disclose the actual backup retention. Downloaded local exports remain under the user's control.

Use the publishable/anon application key with the user's access token for ordinary operations. Never expose service-role credentials in the browser: privileged database roles can bypass RLS. Keep the service key out of client bundles, logs, screenshots and version control. Data at rest, transport protection, backups, restoration drills, SMTP, environment isolation and production monitoring require verified provider configuration; this migration alone does not prove those operational controls.

## Executed and hosted verification

`tests/database.test.ts` runs the actual migration and functions in PGlite, a Postgres runtime. It supplies a minimal `auth.users`/`auth.uid()` fixture because Supabase manages those in production. Tests exercise real role grants and RLS, owner reads, cross-account access denial, direct write denial, unverified/anonymous rejection, stale updates/deletes, quotas, the write budget, strict JSON constraints, and account cascades. They do not validate hosted JWT verification, email delivery, the public network configuration or a deployment.

Run locally with Node 24:

```sh
npx vitest run tests/database.test.ts
```

After applying the migration to a disposable local/staging Supabase project, run `supabase/tests/workspace-security.sql` as its migration administrator. It creates synthetic users in a transaction and rolls back. Do not use a production project for these fixtures. Then perform a separate end-to-end test with two real test accounts through the app: create, sign out, sign in as the other account, attempt known cloud IDs, exercise stale tabs, export and delete. A passing local suite is not a substitute for that hosted check.

Primary implementation references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase function privileges and definer guidance](https://supabase.com/docs/guides/database/functions), and [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

