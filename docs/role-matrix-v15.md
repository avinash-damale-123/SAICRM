# SAI-CRM — Roles & Permissions (Role Matrix)
**Implementation requirements | 4 November 2026 | Retail CRM functional reference**

## Core business rule
Module Directory (Module Master) defines the upper permission boundary. The Role Matrix may only configure actions and fields for an eligible resource. Organizational Roles are job titles, not CRM permission roles. Role Matrix configurations do not grant access until a later User Management step explicitly assigns an eligible role to a user.

## Four-step Retail CRM workflow
1. **Role Details:** Role Name, Role Code, mandatory Department (active Department Master) and mandatory User Type (Admin, Manager, Standard User), plus Description. Department/User Type are immutable after creation; create a separate role to change either.
2. **Permission Set:** Show all deployed Module Directory resources. Ineligible and system-locked modules are greyed out. Available modules support View, Create, Edit, Delete, Archive, Restore, Import, Export, Approve, Assign, Bulk Update; user can choose None/My Records/Team/Branch Record Scope. View is required for every other action.
3. **Field-Level Security:** For modules with View and a registered field catalogue, choose Editable, Read Only or Hidden for individual fields; system access fields are locked. Editable is the default for ordinary fields; access-scope fields default Read Only.
4. **Review & Submit:** Review Role Name, Department, User Type, granted actions/scopes and field rules before saving.

## Actors
Super Admin and approved/verified Admin may configure Role Matrix, subject to Module Directory eligibility. Other user types are denied server-side. Module Directory itself remains Super Admin-only.

## Validations and safeguards
- Backend re-evaluates Module Directory eligibility when saving or editing, never trusts disabled browser checkboxes.
- Ineligible or system-locked resources cannot be granted permissions through the Role Matrix.
- Duplicate Role Code (global) and duplicate Role Name within Department/User Type are rejected.
- Never infer or assign a named user's permissions just because their Organizational Role is associated with a Department.
- Every creation/edit is audited; version conflicts cause an explicit reload-required response.
- No hard delete, no updates to existing User Master, sessions, `user_scopes`, current role-based authorization or existing CRM records.
- Permission Set scopes are configuration values only at this stage. Actual enforcement of My Records/Team/Branch and user assignment belongs to User Management + permission activation, where record ownership and reporting hierarchy will be resolved.

## Technical implementation v15
- Additive PostgreSQL migration `015_permission_role_matrix.sql`: `crm_permission_roles`, `crm_permission_role_events`, generated `PR-001` display ID.
- `server/role-matrix.mjs` handles list, setup, create, read, update and audit.
- `role-matrix-ui.js` implements the four-step wizard.
- Source `server/module-master.mjs` registers `ROLE_MATRIX`; Super Admin may Sync Resources to discover the new entry.
- Tests: unit/security, isolated PostgreSQL and Playwright browser.

## Known scope limitations to address in next phases
- Field schemas are currently registered only for legacy operational modules. Additional master modules need their own field catalogues.
- Team and My Records authorization requires employee/user/manager mappings and must not be advertised as active enforcement until implemented.
- User role assignment and effective permission resolution remain a **User Management** development stage.
- Existing operating-module backend grants remain authoritative; a Role Matrix role is not connected to any user in v15.
- Action-to-endpoint capabilities are not yet universally exposed for every operational module. A configured action cannot override the existing API authorization rules.

## Acceptance tests
- Admin/Super Admin may create department-scoped, user-type-specific roles; Manager/Standard blocked.
- Module Directory blocked modules are disabled in UI and rejected through direct API.
- View+Scope requirements, locked fields and duplicate action grants validated server-side.
- Audit history is append-only; optimistic version checks prevent lost updates.
- Migration 015 does not alter existing users, scopes or CRM data.
- Node 22/24, PostgreSQL and browser tests must pass before production migration and deployment.
