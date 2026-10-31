# SAI-CRM Department Master — Reconciled Requirements v2.0
Date: 2026-10-31
Status: Business decisions D-01–D-04 approved by project owner on 2026-10-31. Controlled production release authorized conditionally after all safety and acceptance checks pass; not yet production deployed.
Implementation base: PR #52, feat/department-master-20261029.
Sources: TASKFORCE Final Consolidated Requirements v3.0 (2026-09-09); SAI-CRM Department Master Design Specification v1 (2026-10-28); Branch Master approved rules; current Department Master implementation.

## 1. Business purpose and boundaries
One auditable Department Master manages logically separate Central Department and Branch Department catalogs, each permitting Department > Sub-Department > Team. Root Department is mandatory; the subordinate levels are optional. This directory is NOT the Branch Reporting, Functional Reporting, Central Reporting, Organizational Role, Designation, Position, or SAI Platform Role system. Employee/role mapping and Central oversight rights are future work; no current Department operations may grant them.

## 2. Confirmed core requirements
DM-FR-001: Only approved verified Super Admin accounts may manage the initial Department Master; backend must independently enforce authorization for reads and writes. Future Role & Permission Matrix integration must not implicitly elevate existing users.
DM-FR-002: Central Department and Branch Department definitions must remain logically separate; a record cannot switch scope after creation.
DM-FR-003: Supported hierarchy levels are Department, Sub-Department, Team. Sub-Department must reference same-scope Department. A Team must reference a valid same-scope parent; direct Department-to-Team relationship is D-01.
DM-FR-004: Immutable UUID identity and generated display ID must survive rename, reparenting, status changes and restoration. Display ID prefixes DP-, SD-, TM- are proposed, not retrospectively approved.
DM-FR-005: Create/Edit must validate name, code, parent type/scope, duplicate identity, missing parent, cycles, and inactive parents on the server. Clear validation errors must retain form data.
DM-FR-006: Branch Department definition may be activated only for individually selected existing Branch IDs. Business Line must be derived from Branch Master, never independently reassigned through Department.
DM-FR-007: Separate Branches at the same address, city or building must retain distinct department activation, audit and future employee mappings. Reusable definitions must never grant cross-Branch user access.
DM-FR-008: A child assignment may be Active only if the catalog child and every relevant ancestor and their corresponding Branch assignments are Active.
DM-FR-009: Department creation, rename, reparenting or activation must not create/report/rewrite reporting managers, functional hierarchy, SAI Platform Roles or Central Support permissions.
DM-FR-010: New employee mapping will offer only Active, in-scope organizational units; historical associations must remain readable. No current endpoint may pretend employee mappings exist.
DM-FR-011: Scope/status/level/parent and Branch/Business Line filters must operate on authorized server-side records, using exact counts; pagination, sort and search must be stable.
DM-FR-012: Records, Overview, Hierarchy Tree, Read/Edit/Create, Related/Used In and History must use the reusable Business Lines standard; totals must reconcile with filters and access scope.
DM-FR-013: Shared table behavior includes compact density, coherent single visible horizontal scrollbar, column order/visibility/width, frozen actions when practical, default latest modified sort, responsive behavior and clear toast/error feedback.
DM-FR-014: Bulk operations, imports and exports must match single-record backend authorization and dependency rules. CSV/XLSX import requires dry-run, field mapping, duplicate handling, row validation, transaction mode, job history and safe retry; export must use the full authorized selected/filtered scope, not only the visible page.
DM-FR-015: State transitions must preserve history, actor, timestamps, reason and old/new values; direct SQL/database operations must obey dependency guards. Four visible lifecycle states are proposed for this master (D-02).
DM-FR-016: Deactivation/archive/delete must reject active child or assignment dependencies. Once employee mappings are implemented, all linked-user dependencies require enforcement on both API and database sides.
DM-FR-017: Branch assignment activation/deactivation must have explicit audit, unique unit+Branch combination, eligibility checks and conflict-safe transactions.
DM-FR-018: Every action and Overview count must respect future explicit module/scope policies without deriving authorization from Department name or hierarchy.
DM-FR-019: Release is blocked pending additive production migration 011 in the exact application database, independent test verification, CI/browser tests, real authenticated UAT, and correct Vercel production alias+commit verification.

## 3. Initial field inventory
Catalog: UUID (system), System ID (system), Organizational Scope (mandatory/immutable), Level (mandatory), Unit Name (mandatory), Unit Code (mandatory), Parent Unit (level-dependent), Description (optional), Display Order (optional/default), Status (system default Active), Created By/At (system), Updated By/At (system), Archived/Deleted timestamps (system), Version (system).
Branch assignment: UUID, Unit reference, Branch reference, derived Business Line, Status, Created/Updated By and At, Version. Branch and Business Line are sourced from Branch Master; no free text branch identity.
No synthetic linked-user count should be displayed as actual unless backed by implemented employee mapping.

## 4. Proposed lifecycle for business review (D-02)
Active -> Inactive: block active descendants/assignments, require reason.
Inactive -> Active: require active parent and applicable eligible assignments, require reason.
Inactive -> Archived: block active dependencies; retain history; require reason.
Archived -> Active or Inactive: validate hierarchy and dependencies, require reason.
Archived -> Deleted: require no prohibited historical references; recoverable tombstone preferred; require reason.
Deleted -> Archived, Inactive or Active: validate identity, hierarchy and linkage; require reason.
No physical permanent delete without separate explicit business and retention approval.
These lifecycle rules are approved as business requirements. Deployment remains conditional on successful technical verification, non-destructive migration, authenticated UAT and rollback readiness.

## 5. Decisions — APPROVED 2026-10-31
D-01: Confirm a Team may report directly to Department when Sub-Department is skipped (APPROVED).
D-02: Approve four-state visible Department lifecycle and recoverable Deleted semantics (APPROVED; transition table above).
D-03: Approve DP-001, SD-001, TM-001 generated display IDs and immutable scope (APPROVED; code unique per scope, name uniqueness per parent/level/scope).
D-04: Confirm Branch Department shared definitions + independent per-Branch activation, and optional Hierarchy Tree tab (APPROVED: two catalogs, shared Branch definitions, independent per-Branch activation, Hierarchy Tree).

## 6. Current implementation reconciliation (PR #52)
Implemented: migration 011 tables department_units, department_branch_assignments, department_events; catalog APIs, lifecycle and assignment APIs; Super Admin gate; Central/Branch navigation, Records/Overview/Tree, basic CSV page export and unit tests.
Gaps: full reusable Records Framework adapter; CSV/XLSX transfer jobs and export of full filtered/selected authorized result; persistence of personal columns/advanced filters; production DB migration; live authenticated acceptance; employee linkage-dependent checks until User Mapping exists.
Safety: PR explicitly says do not merge until migration 011 applied to exact production database. No production migration or merge is authorized by this document.

## 7. Acceptance criteria
DM-AC-001 [001-005]: Super Admin creates all three levels in both scopes; unauthorized actor cannot read or mutate via direct API.
DM-AC-002 [003,005]: Invalid parent, cycle, duplicate code/name and cross-scope parent are rejected with no partial write.
DM-AC-003 [006-009]: Two Pune Branches under different Business Lines independently activate Operations; no cross-Branch user/permission linkage.
DM-AC-004 [008,016]: Cannot activate child without active ancestor activation; cannot inactivate parent while active child/assignments exist.
DM-AC-005 [011-014]: Shared filters, column preferences, pagination, full-scope export and import dry-run behave consistently after refresh, on desktop/mobile and across browser contexts.
DM-AC-006 [012,018]: Overview count equals exact in-scope drill-down and authorized export results.
DM-AC-007 [015-017]: Lifecycle and Branch assignment changes retain identities and auditable reasons; invalid state changes fail without partial updates.
DM-AC-008 [009-010,018]: Department operations never alter reporting-manager or permission relationships.
DM-AC-009 [019]: The tested commit and applied migration are verified on production; real signed-in account UAT and rollback checklist completed before marking accepted.

## 8. Suggested work order for PR #52
1. Record business decisions D-01–D-04; keep uncertain proposals labelled.
2. Refactor UI to shared Records Framework; add full transfer workflows.
3. Implement automated backend/browser tests for dependency, auth, bulk and data reconciliation.
4. Validate migration 011 on isolated test PostgreSQL and obtain production database access/backup/restore evidence.
5. Apply migration only after verification and operational approval; merge, deploy, test logged-in production behavior and sign off.

## 9. Production authorization (2026-10-31)
The business owner explicitly authorized completing development and deploying only once ALL checks pass. No unconditional merge, migration, or production release is authorized. Required gates: successful isolated PostgreSQL migration 011 and regression tests; validated backup and restore approach for exact production database; confirmation target database and least-privilege credentials; server-side access/dependency protections; complete Records Framework/import/export; successful build and browser acceptance; production deploy to intended alias; authenticated live UAT and rollback readiness. If any gate fails or cannot be verified, stop and report the blocker. Do not overwrite or seed production records.
