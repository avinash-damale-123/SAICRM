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
