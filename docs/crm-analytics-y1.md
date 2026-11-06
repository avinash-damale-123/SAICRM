# CRM Analytics-Y1 — Yiron CRM one-way visibility and analytics

## Purpose
Provide a separate, read-only analytics workspace inside SAI-CRM while the replacement CRM modules are being developed. Existing Workspace analytics and Administration remain independent.

## Sidebar group
CRM Analytics-Y1: Overview, Users, Branches, Regions, Meetings, Minutes of Meetings (MoMs), Call Logs, Contacts, Accounts & Leads, API Sources.

## Release 1: Navigation shell
- New sidebar group and pages use the existing SAI-CRM navigation, breadcrumb, styling and authentication shell.
- Each domain is explicitly marked **Not connected**; no fabricated counts or data.
- No API calls, database migrations, record changes or scheduled synchronization.
- No unreviewed legacy data should appear under the new CRM's operational masters.

## Next release: legacy API connector (requires API specifications)
1. Inventory API base URL, endpoints, authentication/token rotation, pagination, response schema, date formats, incremental update mechanism, data volumes, limits and errors.
2. Create a server-only proxy/ingestion worker. Store secrets in the deployment secret manager/environment, never in repository files or browser scripts.
3. Fetch only authorized data and enforce role, department, business line and branch restrictions on the server, including row-level restrictions in analytics.
4. Store original source system ID, entity type, source status, timestamps, fetched-at timestamp and normalized external references. Maintain a separate, partitioned legacy reporting cache or dataset with retention rules.
5. Add health and sync status, last successful refresh, error alerts, retries and audit logging. Design idempotent upserts by source ID and entity type.
6. Build filters (date period, branch, region, employee, account type, status), dataset downloads where authorized, trend dashboards, meeting and MoM follow-up reporting, calls, account/lead movement and activity KPIs.
7. Define reconciliation against new SAI-CRM entities separately. Never infer equivalence solely from similar names. Distinguish historic CRM leads, existing accounts and verified linked new-CRM records; preserve original source timestamps and statuses.

## Security and governance
- Source permissions and data-processing authorization must be verified before connecting the API.
- Use least-privilege read-only API credentials where offered.
- Minimize contact/personally identifying fields in reports and exports; protect sensitive fields, record access and request logs.
- Document the legacy-system decommissioning process, dependency end date and data retention.
- No automatic mutation of source CRM or new CRM operational records without a separately approved migration policy.

## Inputs needed for integration
A sanitized API collection or endpoint documentation with 1–2 example responses per resource, supported authentication method (without actual secret), pagination/rate-limit details, and the user-to-branch-region/account relationship fields.

## Validation checklist
- Sidebar navigation and breadcrumbs available to authenticated users.
- Existing Workspace and Administration routes unaffected.
- Every legacy page shows correct not-connected copy.
- No client-side API credentials or hard-coded endpoints.
- Permission restrictions and real data tests to be added before enabling source access.

## Confirmed user direction (2026-11-06)
- Yiron CRM is the authoritative source system for this interim analytics workspace.
- Integration direction is strictly Yiron CRM -> SAI-CRM. Never invoke write, update, delete, or pushback operations against Yiron.
- Phase 1 is source data retrieval, isolated persistence/cache, and read-only visibility for each authorized dataset. Do not preemptively build analytics without reviewing each dataset.
- Phase 2 is explicit dataset relationships using stable source IDs and verified keys. Preserve unmatched records for reconciliation rather than silently linking them.
- Phase 3 is incremental analytics and KPIs, one dataset and use case at a time, as specified by the business owner.
- Refresh frequency, incremental/full sync behavior, data retention and access controls must be determined from actual API capabilities and business needs.

## API inventory and implementation (incremental Phase 1)
Fifteen source names supplied by the business owner are registered in `server/yiron-analytics.mjs`. Source paths are intentionally preserved as supplied; previous Postman `/crm_v12/api/...` paths conflict with some newer `/api/...` paths and therefore must be verified before enabling.

### Read-only endpoint foundation
- `GET /api/yiron-analytics/sources`: shows the allowlisted source inventory and disabled/enabled state.
- `GET /api/yiron-analytics/preview/:sourceId?from=1&to=50`: authenticated, Super-Admin-only on-demand preview; SAI-CRM translates this to the source system's documented POST-with-api-key request.
- Every API retrieval defaults to disabled (`YIRON_ANALYTICS_ENABLED` must be exactly `true` and both `YIRON_API_BASE_URL` and `YIRON_API_KEY` must be configured server-side). Allowlisted HTTPS origin is `https://crm.satgurutravel.com/` only; no user-supplied arbitrary host or endpoint is permitted.
- No Yiron modification, SAI-CRM operational record mutation, import, migration, scheduled refresh, relationship inference or export has been implemented.
- **Important:** no live Yiron API response has been validated yet. Returned data shapes, account overlap and authorization scope must be reviewed before opening visibility to non-Super-Admin roles.
- The first integration supports on-demand **preview** rather than durable data synchronization. Add isolated persistence only after mapping, retention and access requirements are agreed.

### Registered endpoints
`account_view`, `log_a_call_view`, `facts_details`, `meeting_visit_BI`, `call_log_BI`, `potential_amount`, `last_login`, `role_list_BI`, `contact_list_BI`, `branch_list_BI`, `region_master_data`, `erv_account_view_post_for_superadmin`, `meeting_view_post_for_superadmin`, `call_log_view_post_for_superadmin`, `nca_account_view_post_for_superadmin`.

## Branches persistence pilot — development PR #73 (not deployed)

This section describes developer-branch implementation only. It does not indicate that a database migration, live synchronization, or Production deployment has occurred.

### Implemented in the development branch
- Migration 016 creates isolated legacy tables for sources, refresh jobs and requests, batches, versioned datasets, original JSON records, change history, and audit. Branches is disabled by default.
- Source and status endpoints report the last published dataset and recent jobs. The Branches read endpoint uses PostgreSQL snapshots exclusively; browsing never contacts Yiron.
- The Branches viewer supports bounded pages, server-side search by Branch Name, Branch Code or source ID, and last-modified ordering.
- A Super Admin can request a refresh with CSRF protection; overlapping requests share one durable job and retain distinct trigger records.
- The worker supports batched ingestion, retries for temporary failures, validation, atomic publication, and recovery. Previous successful snapshots remain available after failures.
- The Vercel Cron declaration uses 21:30 UTC (03:00 Asia/Kolkata the following day). This remains inactive until deployed and the source is enabled.
- The viewer includes the Refresh Monitor plus audited Super Admin-only CSV/XLSX exports, bounded to 2,000 records.
- The other fourteen registered source endpoints are not yet enabled for ingestion.

### Branches source-contract evidence and validation
- A 2026-11-06 UI screenshot confirms the source identifier field branch_id and 145 rows returned for a 1–50 request. This shows pagination cannot be assumed to work.
- The provided Postman collection lists /crm_v12/api/branch_list_BI without a range body, while the Power BI-style connector uses /api/branch_list_BI with a JSON range. Actual endpoint behavior still requires authenticated confirmation.
- Paginated ingestion requires unique IDs, at most 50 records per page, and a terminal empty page after a short page. A potential unpaged response above 50 rows is accepted only if a second request with a disjoint range returns identical IDs and canonical payload hashes; the maximum is 1,000 rows.
- A snapshot must be non-empty and complete under the selected mode. A reduction exceeding 20% against the previous published count is quarantined. Failed or ambiguous requests do not remove published records.
- Source unavailability or configuration errors must not prevent browsing the last successfully published dataset.

### Release gate
- Pass JavaScript and real PostgreSQL CI checks with both supported Node.js matrix versions.
- Verify live Yiron authentication, route, total record count, and pagination/full-snapshot behavior in an authorized test. Keep API keys server-side.
- Review Neon capacity, retention cleanup, and service-role grants before enabling scheduled jobs.
- Draft PR #73 remains unmerged; Production Neon and Vercel must remain unchanged until a reviewed release explicitly authorizes the migration and rollout.
