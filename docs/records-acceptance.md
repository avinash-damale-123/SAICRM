# Business Lines acceptance and scale evidence

Follow-up: PR #24, Issue #22. This document records reproducible checks and their boundaries. It is not a claim of customer sign-off or of deployment completion; use the current PR, Actions and Vercel state for those gates.

## Actual defects corrected

1. The dedicated Read/Edit page's Back control lived inside a breadcrumb hidden by compact styling. Back to Records is now a visible button in the record actions area and retains unsaved-change protection.
2. Blur validation could move the Create form's Save button between pointer-down and click. A click retargeted to the dialog used to close the form. Dismissal now requires a genuine pointer gesture on the outside backdrop.
3. The initial session/options check redrew an interactive login form, sometimes clearing credentials typed before the check completed. Initial inputs/actions are now disabled and the auth surface is inert/aria-busy until session initialization has completed. Errors still show a usable sign-in form; backend authorization is unchanged.

## Real authenticated browser acceptance

`test/records-authenticated-browser.mjs` serves the actual compiled frontend over local HTTPS and uses the actual API handler and PostgreSQL. No browser API routes are mocked. The email provider boundary captures the test verification message rather than emailing a real recipient. Test accounts and approval fixtures are provisioned only after a loopback hostname and test-database-name guard; the harness refuses production or remote databases.

Coverage includes actual registration/verification/login, mandatory Create validation, Create/Read/Edit, all nineteen fields, editable Code, required status reasons, unsaved-change confirmation, visible Back, stored My View, logout revocation, a fresh browser context, the CSV import wizard and worker, a real XLSX export/download, Super Admin column restrictions, mobile rendering and a restricted user's 403 responses. The tests run on Node 22 and Node 24. Failed runs remain failed; no ignored assertions or automatic retry marks an unresolved workflow as accepted.

The earlier supplementary Neon-only browser script was not used as passing evidence. Its API checks were useful, but its broken navigation was replaced by this versioned real-database browser suite.

## Isolated scale results

`test/records-load.mjs` likewise refuses remote/production databases. It exercises the existing server functions against PostgreSQL with 500,000 synthetic Business Lines and a complete 10,000-row import. It verifies concurrent workers, interrupted/resumed processing, idempotent terminal retry, count and ordering, and the atomic import cap.

Recorded Node 24.22.0 / PostgreSQL 17 CI run: `39582046358`, job `119161742398`. The scale step passed, although that run's browser step exposed the login-initialization defect and the overall run correctly failed. The final release requires a later wholly green workflow on the final commit.

| Scale measurement | Observed isolated result |
| --- | --- |
| Seeded table population | 500,000 records |
| Filtered count + multi-sort + third page | 537 ms |
| Export preview | 278 ms |
| Ordered export membership snapshot | 5,432 ms |
| Concurrent initial export batches | 258 ms |
| Remaining CSV export batches | 43,132 ms |
| CSV output | 500 parts; 27,924,604 bytes |
| 10,000-row upload processing | 35 ms |
| 10,000-row validation | 398 ms |
| Remaining import processing after initial batches | 22,077 ms |
| Sampled peak Node RSS | 321 MiB |

These are measurements, not production SLAs. The large CSV export selected ID, Name and Code; it does not certify a 500,000-row, nineteen-column XLSX export, distributed serverless handoff latency, or the production Neon plan. Real XLSX behavior is covered separately by unit, API and authenticated-browser tests. Production does not contain these load fixtures.

## Canonical limits

- Upload: 2 MiB and 10,000 data rows, with ZIP/cell/column limits.
- Atomic all-or-nothing import: **250 rows**, not 1,000. Larger imports use explicit partial/batched processing. The test rejects 251 atomic rows before writing any CRM records.
- Export: at most 500,000 authorized records; ordered file parts of at most 1,000 rows and bounded file size.
- Transfer files/jobs expire after 24 hours. Resume does not repeat committed rows.

`server/records-files.mjs` is the executable source of these limits; an automated check verifies the documented atomic cap.

## Runtime warning

The earlier production `DEP0169` warning has not been conclusively traced to a specific application dependency. Runtime diagnostics capture only allowlisted module/line locations once per process, without URLs, request data, messages, passwords, tokens or connection strings. The warning is not suppressed, and Node is not downgraded to hide it. `test/records-acceptance.test.mjs` verifies the diagnostic redaction and idempotent installation. If the warning is outside application control, retain the verified stack and a maintenance issue rather than claiming it is fixed.

## Remaining distinct acceptance

A green automated real-database browser suite does not impersonate the user's production account or replace user sign-off. Actual signed-in production-account acceptance remains separately tracked. Cross-module adapters and a future Role Matrix are also distinct: this follow-up preserves current Business Lines access rules, all nineteen fields, and existing production data; it does not silently activate this framework or new permissions in unrelated modules.
