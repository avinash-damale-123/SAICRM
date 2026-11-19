# SAI-CRM v3 — Coordinated Production Release Gate (19 Nov 2026)
Purpose: One reviewed release for Corporate + Non-IATA Target -> Lead -> Commercially Won -> CRF -> Finance -> Account. Reuse the existing Business Line, Country, Region, Branch, Department, Organizational Role, Reporting Hierarchy, Module Directory, Role Matrix and Sidebar. Retail is excluded from new operations; historical records are preserved.

## Verified repository/deployment facts (19 Nov 2026)
- Production `main` + Vercel READY: `a7a195a8610221d66ff1433be7666c60910adbd9` (6 Nov 2026).
- Development PR #74 is the database-backed implementation, draft, **not merged or Production deployed**.
- PR #75 is a separate policy-document/test draft; do not merge it as a substitute for PR #74. Reconcile approved business rules into the release implementation.
- Yiron PR #73 is also draft and reserves migration 017 in a different stream. Do not merge both incompatible migration-016 files into main. Assign a unique migration version as part of an intentional sequence.
- Branch `feat/crm-v3-corporate-noniata-core` has `db/017_crm_v3_corporate_noniata.sql`, `crm-v3-ui.js`, `server/crm-v3.mjs`, policy and PostgreSQL/browser tests.
- Its UI now follows the sidebar standard of independently collapsed groups, corrected in browser test commit `0e67f54`.
- Vercel Preview has a READY build for this code but its Preview environment has no unscoped DATABASE_URL for this branch, so a READY build is **not authenticated, database-backed UAT**.
- Verified connected Neon organization **Vercel: Avinash Damale's projects**, project `young-math-69929116` and default branch `br-silent-moon-b8tk6fsp`. Read-only production `schema_migrations` confirms versions **1–15** are already registered. No CRM v3 migration has been applied; local CI is green on Node 22/24 at commit `41a6a9d`.
- **Capacity blocker:** attempting to create an isolated v3-validation branch returned `HTTP 422 branches limit exceeded`, and trying to create a new pre-release snapshot returned `HTTP 422 snapshots limit exceeded` on the linked Free plan. Do not recycle/delete historical branches or replace the sole existing snapshot without an approved retention decision. The production database has not been altered.

## Gate 1 — Scope and security (OPEN)
- [ ] Integrate effective User Management / Role Matrix assignment, including action and field permission checks for each CRM v3 module.
- [ ] Implement server-side My/Team/Branch/Business Line scope on every list, detail, count, export, and mutation. The current backend intentionally allows approved Super Admin pilot use only; this is not ordinary user rollout.
- [ ] Establish explicit finance reviewer identity and branch scope, separate maker/checker, versioned decisions, secure document evidence and credit/cash rules. Two Super Admins are not a substitute for Finance assignment.
- [ ] Ensure PII and CRF KYC evidence never appear in unrestricted audit/export or cross-branch views.
- [ ] Complete suppression/consent/mailbox approvals before any customer sending. Current Campaign UI is draft-only, and real email sequencing is NOT operational.

## Gate 2 — Database and integrations (OPEN)
- [x] Identify the Neon project and default branch containing the legacy SAI-CRM migration history (versions 1–15).
- [ ] Independently verify Vercel Production DATABASE_URL's exact target using non-secret metadata; sensitive environment values are unavailable to this connector.
- [ ] Capture a verified recovery point or backup and test restore/rollback.
- [ ] Run migration 017 on an isolated Neon branch from the matching live database; run negative/authenticated tests and record schema diff.
- [ ] Resolve migration order when adding Analytics-Y1 PR #73.
- [ ] Apply approved additive migrations to Production via direct DB connection and verify `schema_migrations` and object permissions.
- [ ] Set up an isolated Preview database and test accounts; NEVER point Preview tests at Production DB.

## Gate 3 — Functional completeness (OPEN)
- [ ] End-to-end Corporate and Non-IATA Target -> qualified Lead -> commercial win -> CRF -> actual Finance approval -> exactly one Account.
- [ ] Duplicate/retry/concurrent validation, especially Target qualification and Finance approval.
- [ ] Complete linked Contacts and single activity timeline with Call, Email, Meetings, MoM, Notes, Tasks; check business scope and date/time-zone.
- [ ] Implement working sequence editor, suppression, schedule state, recipient dedup, mailbox connection and delivery/opt-out behavior (customer sends disabled until verified).
- [ ] Build source-backed dashboards and distinct Actual Sales/FACTS mapping; preserve one-way Yiron.
- [ ] Apply Business Line baseline controls to new operational UI where applicable, including filters, custom columns, import/export, audit and lifecycle.

## Gate 4 — CI, UAT, promotion (OPEN)
- [ ] GitHub tests Node 22 and 24 PASS, including real isolated PostgreSQL and full business browser test.
- [ ] Authenticated user+Finance+Admin UAT across multiple branches and Business Lines, including same-city branch isolation.
- [ ] Reconcile CRF Finance decisions with Account status and verify no unauthorized outbound emails.
- [ ] Stage Production with backup/rollback evidence, verify correct Vercel project and production domain before promotion.
- [ ] Verify Production READY commit and correct live alias; execute role-specific live smoke tests and error scan.

**Release decision:** HOLD until all gates are satisfied. A Preview build or passing mocked browser tests alone is not a complete Production-ready business CRM. Do not merge/deploy just to expose menus.

## Current focus
Fix the CRM v3 integration/browser tests, reconcile PR #75 decisions with PR #74, establish a proper Preview database and Finance role/security model, then run full release gates. No secret values belong in this document.
