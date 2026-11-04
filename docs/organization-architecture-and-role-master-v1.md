# SAI-CRM — Organizational Structure and Access Architecture
**Approved implementation sequence · 4 November 2026**

## Confirmed business direction
- Use established masters: Business Line, Country, Region, Branch and Department.
- Create **Organizational Role Master** before Functional & Administrative Hierarchy, Employee Master and User-to-organization mapping.
- Keep **Organizational Role** (an employee's position or designation) independent of **CRM Permission Role** (authorized actions and data scope).
- Reuse the current `users`, `user_scopes`, `records`, authentication, session and resource-authorization systems; do not introduce a second login identity.
- Keep Country/Region as independent masters, with Branch referencing both according to existing rules.
- Branch remains owned by one Business Line; Department definitions are Central or reusable across Branches.
- Maintain effective dates, historical relationships, audit trails and explicit permission checks in future employee/reporting mappings.
- Release one module at a time after CI, isolated migration tests, recovery readiness and production verification.

## Sequence and dependencies
1. **Organizational Role Master — ORG-001.** Reusable positions/designations, classification, Central/Branch applicability, code/ID, lifecycle, audit and module access guard.
2. **Functional & Administrative Hierarchy — HIER-001.** Administrative manager and optional functional manager relationships. These are person-to-person or role-based *assignments*, not inferred from role titles or CRM grants. Effective-dated, conflict/cycle checks.
3. **Employee Master & Organizational Mapping — EMP-001.** Employee identity separate from CRM user; effective-dated Business Line, Branch, Department, Organizational Role and management relationships; historical moves retained. Central employees can be mapped without a Branch.
4. **User Management & Role & Permission Matrix — ACL-001.** Link existing users to employees where applicable; independently assign module/action grants and data-scope restrictions. Access = action permission AND organizational/data-scope checks. Existing super-admin policy remains unchanged until equivalent controls are tested.
5. **Operational CRM Integration — OPS-001.** Leads, accounts, activities, bookings, reporting and approvals resolve employee, branch, reporting and permission context from normalized active mappings; historical records retain their original assignment context.

## Organizational Role Master v1 — Proposed developer requirements
- **OR-001:** Super Admin may create a role, including mandatory Role Name and Role Code, plus applicability (Central, Branch, Both), optional Role Family, Description and Display Order.
- **OR-002:** Every role receives immutable `OR-001` format display ID from a database-generated sequence. Role Code is globally unique, case-insensitive; no implicit role rank.
- **OR-003:** Role records support Active / Inactive / Archived / Deleted state transitions. Lifecycle reasons and audit are mandatory for every transition. Archived/Deleted are logical states, not physical deletion.
- **OR-004:** Status change or deletion that would invalidate future active assignments must be blocked with explanatory dependency counts. Add this guard when Employee Mapping is implemented; database relationships must prevent physical deletion meanwhile.
- **OR-005:** Read/List support server-side search, status, applicability, family and page-size filtering, consistent counts and default Last Modified descending.
- **OR-006:** Create/Edit/View/History/Related/Used In follow Business Lines visual patterns (central workbar, shared search, compact records and readable dialogs). No auto-grant to anyone because of role title.
- **OR-007:** Existing roles can be reused across Business Lines and Branches; employee placement is the future mapping's responsibility, not duplicate role records.
- **OR-008:** Super Admin access must be enforced server-side for every method. Browser UI is never an authorization source.
- **OR-009:** CSV/XLSX transfer and bulk changes, if implemented, must use the same mapping validation, permission enforcement, duplicate handling and audit as single-record operations.
- **OR-010:** Migration 012 must be additive; no changes to users, employees, user_scopes or current permission calculations are permitted in this release.

## Decisions deliberately deferred to the correct module
- Whether role grades/levels, job bands and approval limits are managed as separate HR masters.
- Whether an employee may hold multiple concurrent organizational positions.
- Administrative and functional manager fallback behavior, matrix reporting and manager-of-manager visibility.
- Employee HRMS synchronization source and employment-effective-date semantics.
- Permission role templates; deny-overrides-allow; employee/manager data-scope escalation rules.

These are **not silently implemented** by Organizational Role Master. They will be specified and tested at stages 2–4.

## Stage-1 acceptance criteria
1. Migration 012 applies atomically on an isolated Postgres branch and leaves version 011 and existing data intact.
2. Role ID sequence is immutable, and duplicate names/codes are rejected consistently.
3. An ordinary user cannot create/read/edit/export roles using direct HTTP requests.
4. Central/Branch/Both applicability is independent of permission role.
5. Lifecycle and audit preserve deleted and archived history; no hard delete.
6. Browser design aligns with Business Lines and works across desktop/mobile.
7. Verified tests, backup/rollback, migration, production URL and authenticated UAT are required before live release.
