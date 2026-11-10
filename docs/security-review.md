# Independent security review — rebuild

Review date: November 10, 2026. Scope: the uncommitted rebuild based on upstream commit `a3cc3ee454fba28e0491ccd1ded14df9c9b49c46`; the original repository was not modified. This is a focused source review of the new application, not penetration-test certification or a promise that all defects have been found.

## Result and evidence limits

No concrete cross-account database read/write bypass was identified in the reviewed API, migration and client helper. Two asynchronous UI correctness problems and one uncertain-save reliability problem were identified, fixed by the implementer and re-reviewed in source before release. They are marked resolved in source below; that is distinct from executing controlled browser race tests.

This reviewer inspected source and existing test cases; it did not execute application code, probe deployed services, access customer records or perform account mutations. The implementation agents reported 50 passing API tests and 52 passing Postgres tests. The coordinator separately reported that the migration and transactional synthetic two-user SQL checks passed on the new Supabase project, with fixture rollback. The coordinator also reported authenticated checks using two synthetic accounts against hosted Supabase and the local application API: cross-user access was denied, direct raw mutations returned 403, and an owner-isolated direct read returned no other-user rows. These checks do not establish public email delivery or every final hosted-browser flow.

## Source-grounded issues raised

### S1 — pending file context guard: resolved in source

At review time, `WorkspaceApp`'s `importFile` and `restoreFile` awaited `file.text()` and then applied the result without checking whether the account or workspace had changed. The account-clearing callback removed current records, but did not invalidate these pending local tasks. A delayed file read initiated in one context could therefore populate a later context; restore could directly replace the new workspace.

The final `WorkspaceApp` uses `fileGeneration`: each read captures a generation, and both success and error paths check it. Account identity changes, account clearing, cloud loading, local replacement, leaving the workspace and accepted record edits invalidate prior reads. A newer selection supersedes an older one. This fix was re-reviewed in source. A regression check should hold a file-read promise pending, switch context, resolve it, and assert that no old preview, records or error appears; that cross-context sequence was not executed by this reviewer.

### S2 — delayed Open replacement: resolved in source

`useCloudWorkspace.open` checked unsaved changes before the network request, then replaced the workspace after the response. The UI still allowed ordinary edits during that interval. An edit made after the initial confirmation could be replaced without another warning.

The final hook captures `latestWorkspace.current` before Open and compares it before applying the response. Changes made while loading trigger another explicit replacement decision; cancellation preserves the newer work. Save responses retain their captured saved revision, so newer edits remain dirty. This fix was re-reviewed in source. The safe regression check delays Open, edits a record, resolves Open, and verifies the edit survives until the user makes an explicit replacement decision.

### R1 — uncertain first-save retry identity: resolved in source

The first-save UI initially omitted the API's optional create UUID. If the database committed but the browser lost the response, retrying would create a second workspace. The final hook retains `pendingCreate` with a UUID and immutable submitted snapshot. An uncertain response is reconciled through an owner-scoped GET of the same ID; only a canonical match to the submitted snapshot is marked saved. Newer local edits remain dirty. Workspace/account replacement clears this pending context. This is a reliability correction, not a cross-account authorization finding; its source was re-reviewed.

## Controls inspected

- The server verifies Bearer tokens with Supabase `auth.getUser`, requires a confirmed nonanonymous account, and forwards the user's token rather than a service-role credential.
- Reads use both a verified owner filter and database row-level security. Raw table mutations are revoked from public, anonymous and authenticated API roles.
- Save/delete RPCs have an empty `search_path`, no caller-supplied owner, explicit authenticated-owner predicates and version comparisons. Caller-chosen UUID collisions cannot overwrite another account's row.
- Personal-only primitive JSON validation runs in both the server and database. Unknown/derived fields, malformed values and size limits are enforced; uploaded data cannot supply a trusted tax result.
- Save/delete account locks serialize quotas and updates. The write counter is a successful-mutation budget, not a complete denial-of-service defense: failed transactions roll it back.
- API responses prohibit shared caching. The browser sends tokens only to the fixed same-origin workspace endpoints, omits cookies and rejects redirects. Production origin checks use configured origins, not request Host headers. Requests without Origin still need verified Bearer authentication.
- CSV exports quote fields and neutralize formula-leading text. Numeric amounts are emitted from validated integer cents. UI text is rendered through React; no untrusted HTML injection sink was found in the reviewed new screens.
- Nonce-based script CSP and dynamic rendering are implemented. The permitted inline styles are used for bounded progress widths. Actual production headers, hydration and auth flows still need browser verification.
- Cloud requests capture the expected account and context before applying results. Account switches clear current financial state; pending local file tasks required the additional S1 guard.

## Provider checks and intentional advisories

The coordinator reported a Supabase advisor warning about the dashboard-generated `public.rls_auto_enable()` event-trigger function being executable by API roles. Follow-up migration `202611100002_rls_trigger_permissions.sql` revokes that unnecessary API execution privilege while retaining administrator-owned automatic-RLS behavior. The reviewer inspected the migration; the coordinator owns confirmation of its hosted application.

The private mutation-counter table intentionally has RLS with no client policies and no client grants. The two authenticated SECURITY DEFINER RPCs are intentional and must retain their explicit identity checks, empty search paths and narrow grants. An advisor warning about SECURITY DEFINER alone is not evidence of an exploitable bypass; the function body and grants determine the boundary.

## Checks required before a public launch

1. Run controlled asynchronous regression cases for the source-reviewed S1/S2/R1 fixes.
2. Enforce the 12-character password policy in Supabase Auth itself. The form's minimum alone cannot constrain direct Auth API clients. Verify email confirmation, exact redirect URLs, password recovery and actual email delivery.
3. Repeat the coordinator's two-account API/database checks on the final deployed application. Exercise signup, sign-in, save, reload, stale edits and deletion through the browser too. Public SMTP is not configured at this review point, so public signup/recovery email delivery remains a launch limitation rather than a tested feature.
4. Verify sign-out/account changes clear all displayed personal records, pending operations and account-specific metadata. Document that normal access-token expiry is distinct from immediate revocation of every already-issued token.
5. Verify production CSP, private response caching, HTTPS and the absence of database passwords/service-role keys in client bundles or version control.
6. Record the actual backup/retention, restore procedure, account-deletion support, Auth abuse controls and operating limits. A schema migration does not prove those operational properties.

The deterministic engine and personal-output review gate reduce calculation ambiguity; they do not certify tax policy. Qualified policy review remains separate from software security review.
