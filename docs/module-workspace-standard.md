# Reusable master workspace
Business Lines is the first implementation of the shared workspace. Country references supplied by the user describe reusable behaviour; Country is not being implemented in this release. Module Master resources are declared by implementations and discovered automatically, not manually entered.

## Business Line decisions
The three uploaded filenames were located as matching Drive references; byte identity with uploads is not verified. The Business Line workbook is authoritative for its fields and excludes import. The DOCX and presentation contain copied Region details, so only common interaction guidance is reused. The current user direction defers dashboards.

Only approved, email-verified Super Admin accounts manage this foundational master. Ordinary Admin, Manager and Standard User eligibility and business-line Role Matrix controls will be introduced through their own modules. A separate system role avoids upgrading all existing admins.

Names are entered directly because the workbook's self-referential name lookup cannot create an independent master. Names are unique ignoring case, including archived names. Display identifiers have minimum three digits without a 999-record cap; UUIDs remain the primary keys. Owner defaults to the creator. Status defaults to Active and is omitted from Create. System fields are server-owned.

## Shared controls
Search applies case-insensitive AND tokens alongside filters; recent terms are session/module-specific. Page sizes are 25, 50, 75, 100, with exact filtered counts, stable sorting, page navigation and valid-page clamping. Record-range and checkbox-selection counts are separate.

Column visibility/order and page size are user/module preferences, not permissions. Record values are not cached in local storage. Frozen ID/name columns are adapted to small screens. Create, Read, Edit and History preserve the list context; errors retain entered values and distinguish unavailable data from an empty dataset.

Cross-page selection uses explicit record IDs. Export modes are selected, default, my view, and all; all never expands authorization. Server allowlists, size limits and spreadsheet-formula escaping apply to every export. Import is a module capability and is false for Business Lines.

Archive and restore retain identity and audit history. There is no permanent-delete path. Known dependencies prevent inactivation/archive; textual legacy references prevent unsafe rename. Other CRM modules still have legacy business-line codes; they are not silently remapped or replaced in this release.

## Validation and rollout
Backend tests use a dedicated empty database or CI PostgreSQL. Browser fixtures test interaction and responsive behaviour separately from live API tests. Additive migration 003, restricted runtime grants and one-time Super Admin bootstrap precede deployment. The bootstrap is restricted to the previously designated verified administrator and revokes its old sessions.
