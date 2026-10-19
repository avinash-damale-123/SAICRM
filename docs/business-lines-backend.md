# Business Lines backend

Business Lines is the first reusable master workspace. It is a relational master, not another generic JSON record. This release preserves the existing CRM modules and their branch/business-line restrictions; it does not convert legacy role labels or invent mappings between existing access codes and new Business Lines.

## Authority and deployment

Migration 003 adds `users.system_role` with default `user`. No existing administrator is automatically elevated. Business Line endpoints require a currently approved, email-verified `super_admin`, re-read and locked in the existing API transaction. Origin, JSON-body limits, CSRF validation, session checks and global rate limits apply to every mutation.

Run migrations with the operator database connection, then the one-time operator command:

```
BOOTSTRAP_SUPER_ADMIN_EMAIL=admin@satguruai.com node scripts/bootstrap-super-admin.mjs
```

The designated account must already be verified, approved and an administrator. Bootstrap refuses if any Super Admin already exists, audits the promotion, and revokes existing sessions. The user must sign in again. The ordinary access screen cannot assign system roles. An ordinary administrator cannot modify a Super Admin. The last approved Super Admin cannot be suspended through that screen.

The runtime database role needs SELECT/INSERT/UPDATE on `business_lines`, SELECT/INSERT on `business_line_events`, and USAGE/SELECT on their identity sequences. It does not need DELETE on either table or UPDATE on event history. Existing runtime SELECT on users and INSERT on audit remain necessary. Bootstrap and migrations use separate operator credentials. Do not grant migrations or bootstrap capability to the runtime role.

## Fields and invariants

- UUID `id`: immutable primary key for future foreign keys.
- Generated `displayId`: BL-001, BL-002, continuing beyond three digits without a 999-record cap. Sequence gaps are normal after rolled-back transactions.
- `name`: required, trimmed, single line, up to 120 characters; case-insensitive uniqueness includes archived rows.
- `status`: Active by default, hidden and rejected on Create; Active/Inactive on Edit.
- `ownerId` and `owner`: creator on Create. An explicit edit may transfer ownership to another approved, verified Super Admin.
- `remarks`: optional multiline text, maximum 255 characters.
- Created/modified user IDs, names and timestamps: server-managed.
- `version`: optimistic concurrency token required for edits/archive/restore.
- `archivedAt`: null for ordinary records. Archive preserves identity/history; restore preserves prior Active/Inactive status.

There is no separate business code, import endpoint, permanent delete endpoint, or manual resource-registration UI. Status changes and archive are separate operations. Archived rows cannot be edited until restored.

## Automatic resource registration

`server/resources.mjs` declares the implemented BUSINESS_LINES resource, capabilities, supported actions and navigation metadata. Future Module Master synchronization can reconcile this stable declaration without manually entering modules. Declaring a resource does not fabricate a page or API implementation.

## API

All routes below are under `/api/business-lines`.

| Method and suffix | Request | Response |
| --- | --- | --- |
| GET / | List options | records, total, page, pageSize, totalPages, counts, owners, permissions, resource |
| POST / | name, optional remarks | record |
| GET /:id | UUID path | record |
| PUT /:id | version plus name/status/remarks/ownerId changes | record |
| POST /:id/archive | version | record |
| POST /:id/restore | version | record |
| GET /:id/history | UUID path | history (latest 200 events) |
| POST /export | mode, optional ids/columns/query | csv, filename, count |

List options: q, page (default 1), pageSize (25/50/75/100, default 25), sort (default updatedAt), direction (asc/desc, default desc), status (all/Active/Inactive), archived (exclude/only/all), filters (JSON array). Missing query values use defaults. Out-of-range pages clamp to the last matching page; an empty result has page 1 and totalPages 1.

Search is case-insensitive literal contains across the listed fields. Whitespace-separated words use AND, with up to 12 words and 200 characters. Each word may match a different column. Filters combine with AND and accept field, operator, value. Supported operators: contains, equals, startsWith, before, after, isEmpty, isNotEmpty. Date comparisons accept validated ISO dates/timestamps. At most ten filters are allowed. SQL sort expressions and filter fields use a server allowlist.

The list's `total` is the filtered matching count. `counts.total` counts all records including archived. Active/Inactive counts exclude archived records. Owner choices are limited to approved, verified Super Admins.

Responses use camelCase. A record contains id, displayId, name, status, ownerId, owner, remarks, createdById, createdBy, createdAt, updatedById, updatedBy, updatedAt, version and archivedAt.

## Export

CSV is the supported format. Selected exports validate explicit UUIDs and fail if any requested record is unavailable. Default exports use the canonical columns; My View uses the validated requested columns. Default/My View export all matching rows across pages. All exports include every authorized row, including archived records, and ignore the current search/filter/pagination. This meaning must be explicit in the UI.

Exports are limited to 10,000 rows. Selected export accepts up to 250 IDs, within the shared 16 KiB request-body cap. Export JSON responses are capped at 3 MiB to remain below the hosting platform response limit. CSV fields are quoted and escaped, and potentially executable spreadsheet formulas are prefixed with an apostrophe. Export attempts are audited. All modes use the same Super Admin authorization; no export mode bypasses it.

## Dependencies and history

Deactivation/archive are blocked when known legacy records reference the Business Line: data.businessLineId/data.business_line_id equal its UUID, scope_line or customer data.line equals its name, or branch data.lines contains its name/UUID. Name comparison is case-insensitive; branch text values support comma, semicolon or pipe-delimited exact tokens. Renaming is blocked only by known textual references, because UUID references survive a rename.

This does not infer that legacy codes such as STTS stand for a newly created name. Legacy access codes remain independent until a separately reviewed data migration. Business Line mutations and known legacy record writes share a transaction advisory lock; legacy writes reject matching inactive/archived Business Lines, preventing a race with deactivation/archive. Future dependent modules must store UUID foreign keys and validate active/nonarchived references in the same transaction. These guards cannot enforce relationships in unimplemented future tables.

Each create/edit/archive/restore writes a field-change event and a global audit record in the same transaction. Event history has an append-only database trigger. Read history currently returns the latest 200 events; deeper history pagination can be added before high-volume use.

## Server-derived workspace permissions

The list response's `permissions` object is the single capability contract for the reusable header and record actions:

```json
{
  "read": true, "create": true, "edit": true, "archive": true,
  "restore": true, "export": true, "history": true,
  "search": true, "filter": true, "settings": true, "dashboard": true,
  "import": false, "delete": false
}
```

These values are derived centrally by `businessLinePermissions` in `server/resources.mjs` from the current database account. An approved, email-verified Super Admin receives the implemented capabilities above. Other accounts receive no capabilities and the Business Lines API rejects access. Public browser fields, posted permission objects, ordinary administrator roles and cached UI state cannot supply grants.

Each implemented action endpoint checks the relevant capability in addition to the existing authenticated transaction, Origin and CSRF protections. Search and filter queries check their corresponding capabilities; Default/My View exports check the query capabilities they actually use. Unsupported import and permanent deletion remain unavailable with HTTP 405, even if request JSON claims permission.

`settings` allows personal workspace presentation preferences such as visible columns; it does not grant organization configuration access. `dashboard` allows the module's existing authorized record counts, not fabricated reporting or access to other modules.

The UI must hide unavailable controls, fail closed until server permissions are received, and check the same permissions before invoking handlers. Server enforcement remains authoritative for direct API requests. This release does not implement a configurable Role Matrix, Department/Hierarchy grants, or new user-type migrations. That future policy can narrow capabilities at the central derivation point without changing the response shape.

Pure capability/security tests run with `node --test test/business-line-permissions.test.mjs`; they cover account approval/verification, forged browser grants, direct endpoint denial before database reads, and unsupported import/delete.
