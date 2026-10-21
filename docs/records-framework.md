# SCRM Business Lines Records Framework

Scope: GitHub Issue #22. The shared typed schema, dialogs, policy resolver, preferences, and transfer jobs are introduced for Business Lines first. Other modules keep their existing behavior until they declare their own schema, actions, and authorization. This release does not grant additional CRM access.

## User workflows

### Column Selection and Column Customization

**Customize > Column Selection** offers Default View, My View, All Columns, column search, four collapsible groups, group selection, Select All and Clear Optional. Business Line ID and Name cannot be deselected. Apply View persists the active preset and current selection; Save as My View replaces the personal preset. Preferences are stored by actual user ID and module in PostgreSQL, not just browser storage. Column widths, page size, filters, sorting, separate Records/Overview contexts and section collapse state are remembered.

**Customize > Column Customization** is Super Admin only. Drag rows or use accessible Up/Down buttons to establish the common sequence. Configure 0-5 frozen leading data columns, additional always-selected columns, and the All/default column pools for Super Admin, Admin, Manager and Standard User. All nineteen fields are permanently in Super Admin's All pool. Preview the configured role's defaults before saving. Save Draft never changes the effective policy; Publish validates and increments its published revision. Configuration changes are audited and cannot remove mandatory Create/Edit fields. Policies narrow presentation; they do not replace or expand backend security permissions.

### Search, filter, sort and selection

Live search and typed filters query the entire authorized dataset. Quick status/record-state controls coexist with the advanced AND/OR builder. Up to 20 conditions, three group levels, and five sort priorities are supported. Date-only filter values use UTC boundaries; date displays use the browser locale. Text wildcard characters are treated literally. Saved filters and per-view contexts can be restored.

Click a column header for a primary sort; Shift-click adds a secondary sort. The Sort Order dialog offers the same controls on mobile and supports priority changes. Sorting uses a stable record-ID tiebreaker. Table headers wrap, resize, and remain sticky. The Actions column stays at the right. Frozen leading columns are capped dynamically so narrow viewports retain scrollable content. Descriptions expand only for the requested record. Mobile uses responsive record cards and page selection.

Selection begins with the current page. Selecting all matching results is a separate explicit action displaying its count. Changing the query/sort clears selection. Bulk actions show a reviewed count and mandatory reason, snapshot record IDs/versions, then revalidate every record's permissions, dependencies and version. Partial failures are reported rather than silently overwritten. Permanent deletion is never offered.

### Import

1. Download the module's CSV or Excel template and read its Guidelines sheet.
2. Upload UTF-8 CSV or XLSX. Maximum **2 MB / 10,000 rows / 64 columns**. Macro-enabled files, formulas, unsafe archives and oversized cells are rejected.
3. Map Name and Code (required), optional Description and optional existing Business Line ID. System metadata, owner and lifecycle state are not importable.
4. Choose Create Only, Update Existing, or Upsert, subject to the existing backend permissions. New records default to Active with the current owner and audit metadata.
5. Choose all-or-nothing (**maximum 250 rows**) or explicitly choose partial processing for larger files. The conservative atomic limit protects the production serverless execution budget.
6. Validate first. Upload and validation do not change CRM records. Review preview, duplicate errors, missing fields and match results.
7. Confirm Run Import. Already committed rows never repeat on Resume; exact file uploads reuse an existing job for 24 hours.
8. Review succeeded/failed/skipped totals. Download failed-row reports, correct the failed records, and upload a corrected file. Unmapped Description is preserved on updates; mapped blank Description clears it. Archived/deleted matches require separate restoration. All-or-nothing execution rolls back all rows on any runtime conflict.

Name: normalized whitespace, case-insensitive uniqueness, 150 characters. Code: uppercase letters/digits/hyphens, 20 characters, globally unique across lifecycle states. Description: optional multiline, 500 characters. Code remains editable through authorized updates; system IDs are not renumbered.

### Export

Record scope and column scope are separate decisions. **Current Page is the safe initial record scope.** Alternatives: checked records, all matching results, all authorized records with explicit confirmation, or export-specific filters. Column presets: current displayed, role default, My View, all permitted, or custom selection. Default View never means every database record.

Review the exact count and columns before confirmation. CSV and XLSX are generated as resumable jobs. The maximum is **500,000 records**, split into ordered files of **1,000 rows** to avoid response, memory and spreadsheet-size limits. Each download is authenticated, expires after 24 hours and revalidates the published column policy. File content is at most 2.5 MB per part; choose fewer columns if a part exceeds the limit. CSV formula injection is neutralized; XLSX cells are written as strings, not formulas. Membership and order are snapshotted when the job is confirmed; field values are read when that part is generated. Records removed since confirmation are reported as skipped.

Overview uses a context-sensitive toolbar. Its export downloads the filtered summary metrics, not every underlying record. Import and column-only customization are not displayed in Overview. Add remains available in the title area when permitted.

### Transfer recovery

Open Import or Export > History to inspect your own jobs, Resume a paused job, download available file parts/reports or cancel remaining work. Closing the popup does not undo committed batches. Work continues through bounded authenticated background invocations. If the hosting service interrupts continuation, the job remains resumable; the UI reports the pause. Downloads are unavailable after expiration, and expired raw rows/files are cleaned up during subsequent transfer activity.

## Architecture and security

- `records-schema.mjs`: one nineteen-field typed manifest, safe filter compiler and stable multi-sort.
- `records-policy.mjs`: immutable identity rules, presentation role pools, draft/publish CAS, database-backed user preferences.
- `records-files.mjs`: bounded CSV/XLSX parsing, spreadsheet safety, template and output generation.
- `records-jobs.mjs`: owned jobs, exact-file/request idempotency, validation, snapshots, savepoint rollback, batched processing and reports.
- `records-worker.mjs`: signed, timestamp-bounded background continuation using Vercel `waitUntil`. Every batch reloads its actual owner and permissions.
- `records-framework.mjs`: authorized routes and field-projected table responses; existing Create/Read/Edit/lifecycle rules are preserved.
- `records-tools.js/css`: reusable dialogs and Records presentation activated only by capability metadata.

Existing verified/approved Super Admin module eligibility remains unchanged. Ordinary Admin/Manager/Standard profiles can be configured for future column presentation but gain no new CRUD or export access. The server, not hidden buttons, governs access. Session, CSRF, origin, rate limits, immutable UID/BL IDs and lifecycle reasons remain enforced. UI draft values survive failure; validation appears inline and in a focusable summary.

## Deployment and recovery

Apply migration `007_records_framework.sql` only after a fresh Neon recovery branch and an isolated repeat-migration check. Migration creates framework tables and audit triggers without changing Business Line records or user identity values. Deploy the tested commit to the existing SAICRM Vercel project. If application rollback is needed, return Vercel to the preceding deployment; additive framework tables can remain while investigating. Do not drop imported production records or audit history to roll back UI code.

Required verification: unit/security tests, real PostgreSQL integration tests, legacy browser regression, the new framework browser workflow, and production build/alias/runtime checks. The tests cover upload dry-runs, partial and atomic imports, exact-file/request retry, real XLSX files, ordered multipart export, published-policy invalidation, authenticated denial, preference conflicts, nested filters, bulk snapshots, nineteen-field preservation, mobile cards and layout geometry.
