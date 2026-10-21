# Issue #22 - Consolidated Business Lines release progress

The seven feature workstreams are implemented. Production release verification is the final gate. This tracker covers Issue #22 and Business Lines; it does not claim that unrelated CRM modules or the future permission engine are complete.

| Workstream | Implementation | Acceptance evidence |
| --- | --- | --- |
| Secure CSV/XLSX import | Complete | Templates, mapping, dry-run, partial success, atomic rollback, duplicate retry and XLSX integration tests |
| Advanced CSV/XLSX export | Complete | Current-page and other scopes, authenticated files, ordered multipart exports, permission and policy-revision tests |
| Typed filters and saved view contexts | Complete | Safe SQL parameters, typed operators, AND/OR groups, invalid-input handling, independent Records/Overview persistence |
| Super Admin column policy | Complete | Nineteen-field master, protected identity, four user-type display policies, role preview, versioned draft/publish and immutable audit |
| Personal column preferences | Complete | Database-backed Default/My/All state, sections, widths, compare-and-swap conflict protection and cross-session UI tests |
| Table interaction framework | Complete | Multi-sort, frozen Actions, left freeze policy, row text expansion, current-page/all-matching selection and mobile cards |
| Business Lines UI fine-tuning | Complete | All nineteen Read/Edit fields, compact title/controls, blur/submit validation, field errors and summary, responsiveness and existing behavior regression |
| Integrated release and production verification | Final release gate | Green official CI; isolated migration and runtime-role checks completed; production migration, merge and live alias verification follow |

## Verified before production

- Official GitHub security workflow 39572660431 passed at 3278357d56f8d800caf5474d25b939870842946b, including all 66 Node/API/database tests, authentication browser tests and the complete Business Lines/header/Records Framework browser command.
- Fixed the Overview export audit reference discovered by database testing; its successful export is tested rather than inferred from a build.
- Isolated Neon validation branch: migration 007 applied and repeated without deleting existing data. Real authenticated register/verify/login, import dry-run and processing, duplicate-upload protection, lifecycle-reason rejection and Overview XLSX export exercised against the clone. Verification email delivery was captured only in the test harness, never sent to a real recipient.
- Verified the existing restricted `saicrm_runtime` role needs explicit access to the new tables. Migration 007 now grants only the required new-table operations. Staging SELECT/INSERT checks passed; audit UPDATE and table TRUNCATE remain ungranted. Production runtime credentials and authorization rules are unchanged.
- The separate authenticated staging browser test did not finish: its navigation helper was incompatible with the existing application. Browser coverage above is the passing automated browser suite; do not describe it as manual production UAT.
- A recovery branch was created before modifying production. The production baseline before release is seven Business Lines and two user accounts.

## Operational boundaries

- Import accepts CSV/XLSX up to 2 MiB and 10,000 data rows, with ZIP expansion and cell limits. Atomic mode is limited to 1,000 rows.
- Export supports up to 500,000 authorized rows through resumable jobs, delivered as ordered files of up to 1,000 rows each. Actual multipart regression exercised 1,201 records; a 500,000-row load certification has not been performed.
- Jobs and downloads expire after 24 hours. If background continuation is interrupted, Transfer History provides Resume without reapplying committed import rows.
- User-type column configuration is presentation policy, not a new permission engine. Existing verified Super Admin-only Business Lines API authorization remains intact; other user types are not silently granted access.
- Common machinery is introduced with Business Lines as its first module adapter. It does not silently enable imports or change field contracts in other modules.

Final merge SHA, deployment, live checks and completion percentage are recorded in PR #23 and Issue #22 after verification. Detailed user workflow and limits: `docs/records-framework.md`.
