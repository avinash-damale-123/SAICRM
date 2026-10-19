# Reusable master workspace
Business Lines is the first implementation of the shared workspace. Country references supplied by the user describe reusable behaviour; Country is not being implemented in this release. Module Master resources are declared by implementations and discovered automatically, not manually entered.

## Business Line decisions
The three uploaded filenames were located as matching Drive references; byte identity with uploads is not verified. The Business Line workbook is authoritative for its fields and excludes import. The DOCX and presentation contain copied Region details, so only common interaction guidance is reused. The later header redesign introduces a module Dashboard alongside Home. It contains real Business Line status counts, not cross-module reports or invented trends.

Only approved, email-verified Super Admin accounts manage this foundational master. Ordinary Admin, Manager and Standard User eligibility and business-line Role Matrix controls will be introduced through their own modules. A separate system role avoids upgrading all existing admins.

Names are entered directly because the workbook's self-referential name lookup cannot create an independent master. Names are unique ignoring case, including archived names. Display identifiers have minimum three digits without a 999-record cap; UUIDs remain the primary keys. Owner defaults to the creator. Status defaults to Active and is omitted from Create. System fields are server-owned.

## Module header and views
The active module owns a compact header in the existing top-bar position. Business Lines opens on Home, where the record table follows the header without a separate title area or summary cards. Dashboard is a separate tab for authorized module-only counts and their visual breakdown. Search, filtering and list selection retain their context when switching views.

The header provides module search, permitted Export/Import actions, Filters, Settings and the module-specific Add action. Filters are hidden until requested. Settings starts with Columns and includes Refresh; column preferences remain separate from authorization. The shared notification, fullscreen and profile controls keep their existing handlers. The profile menu exposes Sign out. The original global header is restored when leaving the module or ending a session. The module header wraps on narrower viewports and follows the existing sidebar collapse preference.

Server response capabilities determine which actions appear, and server endpoints independently enforce each operation. Missing capabilities fail closed. Business Lines remains restricted to approved, verified Super Admins, with Import unsupported. This contract prepares the header for later Role Matrix grants; it does not introduce a role-configuration screen.

## Shared controls
Search applies case-insensitive AND tokens alongside filters; recent terms are session/module-specific. Page sizes are 25, 50, 75, 100, with exact filtered counts, stable sorting, page navigation and valid-page clamping. Record-range and checkbox-selection counts are separate.

Column visibility/order and page size are user/module preferences, not permissions. Record values are not cached in local storage. Frozen ID/name columns are adapted to small screens. Create, Read, Edit and History preserve the list context; errors retain entered values and distinguish unavailable data from an empty dataset.

Cross-page selection uses explicit record IDs. Export modes are selected, default, my view, and all; all never expands authorization. Server allowlists, size limits and spreadsheet-formula escaping apply to every export. Import is a module capability and is false for Business Lines.

Archive and restore retain identity and audit history. There is no permanent-delete path. Known dependencies prevent inactivation/archive; textual legacy references prevent unsafe rename. Other CRM modules still have legacy business-line codes; they are not silently remapped or replaced in this release.

## Validation and rollout
Backend tests use a dedicated empty database or CI PostgreSQL. Browser fixtures test interaction and responsive behaviour separately from live API tests. Additive migration 003, restricted runtime grants and one-time Super Admin bootstrap precede deployment. The bootstrap is restricted to the previously designated verified administrator and revokes its old sessions.
