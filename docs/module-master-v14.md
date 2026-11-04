# SAI-CRM — Module Master
**Developer-ready requirements · Retail CRM reference · 4 November 2026**

## 1. Purpose and scope
Module Master is the top-level access-eligibility registry. It establishes the **maximum resource availability** for three ordinary user types: Admin, Manager and Standard User. Super Admin is excluded from eligibility restrictions and is the **only actor** who may administer Module Master. A separate Role & Permission Matrix will subsequently define action permissions, record scope and field security within this ceiling.

## 2. Existing baseline
- The SAI-CRM source registry contains Business Lines, Countries, Regions, Branches, Departments, Organizational Roles and Reporting Hierarchy.
- SAI-CRM also has a deployed operational CRM with Leads, Customers, Contacts, Opportunities, Activities, Quotes, Bookings, employee/access screens, and several workspace/account pages.
- Existing user role, status, scope assignments, and authorization logic remain authoritative. Module Master **cannot grant** permissions that those rules deny.
- The screenshots supplied from Retail CRM are a design reference; their resource totals (55/51/6/48/18/16) are not SAI-CRM counts.

## 3. Requirements
| ID | Requirement |
|---|---|
| MM-FR-01 | Only an approved, verified Super Admin may view, sync or edit Module Master resources. All unauthorized direct API requests must return 403. |
| MM-FR-02 | **Sync Resources** discovers only resources declared in the deployed source registry; no browser-supplied resource keys or arbitrary URLs may receive authorization. |
| MM-FR-03 | New resources receive source-defined, conservative default user-type eligibility; the defaults can be changed by Super Admin. |
| MM-FR-04 | Re-sync refreshes names, routes, sections and descriptions without overwriting Super Admin eligibility, status, Common Resource or system policy. |
| MM-FR-05 | Previously registered resources removed from the deployed registry must be marked Inactive on subsequent sync, retaining configuration/audit history. |
| MM-FR-06 | Super Admin is **outside** the Admin/Manager/Standard eligibility matrix. |
| MM-FR-07 | Admin Allowed, Manager Allowed and Standard User Allowed independently control whether the resource is eligible for the user type. |
| MM-FR-08 | **Common Resource** makes an active resource available across ordinary user types, subject to independent permissions and authenticated status. |
| MM-FR-09 | Essential system-locked Login, Sign out, My Profile, Home and Notifications remain available to active users; they cannot be disabled or made non-common. |
| MM-FR-10 | Module Master itself remains restricted to Super Admin and must not be granted via Common Resource or tier eligibility. |
| MM-FR-11 | A blocked resource must be removed from normal navigation and denied at the API. Searches and notifications must not reveal data from blocked modules. |
| MM-FR-12 | Eligibility is a **ceiling**, not an automatic grant. Even when Admin Allowed=true, a resource protected by an existing stricter backend permission remains protected until Role Matrix separately authorizes the action. |
| MM-FR-13 | The registry supports search by resource name, key, section and route, filters by status and type, and resource counters (Total, Active, Pending Config, System Locked, Admin/Manager/Standard Eligible). |
| MM-FR-14 | The Super Admin can export the displayed resource list to CSV. Values must be escaped against spreadsheet formula injection. |
| MM-FR-15 | Every resource has system ID RES-000001 onward, immutable resource key, type, section, category, route, description, eligibility fields, status and audit metadata. |
| MM-FR-16 | Resource edits must use optimistic concurrency/version checks. Unauthorized fields and stale updates must fail; successful eligibility changes must generate audit events. |
| MM-FR-17 | Module Master resource identity and audit records must not be physically deleted. |
| MM-FR-18 | Permission Sets, Role Matrix and User Management must never override resource ineligibility. |

## 4. Access evaluation
1. User must have an approved, verified account and a valid authenticated session.
2. Super Admin receives existing privileged access.
3. For an ordinary user, look up the active registered resource.
4. Essential resource is eligible regardless of tier checkboxes; other resources require Active status and either Common Resource or the matching Admin/Manager/Standard checkbox.
5. All existing permission checks (action grant, data scope, ownership, lifecycle and field security) remain **additional requirements**.
6. Deny requests when a required check fails.

## 5. Dependencies
- **Existing User Management**: user type currently maps from existing roles (admin -> Admin; manager -> Manager; member/viewer -> Standard User). This mapping may be refined when User Management is rebuilt.
- **Role Matrix**: consumes eligible modules and cannot display/grant blocked modules. Its own creation workflow is a separate next phase.
- **Registry**: developers register resources in code when deploying new functionality. Sync is deterministic and cannot infer unregistered endpoints safely.

## 6. Acceptance
- AC-01: verified Super Admin can sync newly deployed source resources; ordinary users receive 403.
- AC-02: sync twice reports created then refreshed and never resets decisions.
- AC-03: retired resources stop being eligible without losing audit history.
- AC-04: Manager blocked from Leads sees neither its normal navigation nor its records/API/search results.
- AC-05: essential My Profile always remains eligible; attempts to disable are rejected.
- AC-06: Module Master cannot be made Common or eligible for non-Super Admins.
- AC-07: every change is audited and concurrent edits require a fresh version.
- AC-08: old users, roles, user_scopes and operational records remain intact; migration 014 is additive.
- AC-09: changes are verified on Node 22/24, isolated PostgreSQL and real browser UI before release.

## 7. Explicit exclusions for this stage
- Role & Permission Matrix CRUD, role templates, actions, record scopes or Field-Level Security (next module).
- Changes to existing master-module server policies merely because Module Master marks the module eligible.
- Creation of arbitrary new backend functionality from a resource-name form. New code must first be deployed and declared in the registry.

## 8. Safe release
1. Confirm successful CI and baseline GitHub SHA; resolve concurrent changes before merge.
2. Capture a supported database recovery point and apply migration 014 before deploying the code.
3. Verify database version and resource tables; merge tested PR.
4. Verify Vercel Production READY, assigned live domain, no unexpected runtime errors, and authenticated Super Admin usability.
