# Issue #22 - Business Lines delivery and acceptance

The feature baseline was delivered in PR #23 (`c50c4e70`). PR #24 is the acceptance follow-up: real HTTPS/PostgreSQL browser testing, fixes discovered through that testing, isolated scale verification, accurate import-limit documentation and secret-safe warning diagnostics. Read the PR/Actions state and Issue #22 for current deployment status; a commit alone is not acceptance.

| Workstream | Engineering status | Acceptance evidence |
| --- | --- | --- |
| Secure CSV/XLSX import | Implemented | Dry-run, duplicate, atomic/partial rollback, real XLSX tests; 10,000-row isolated import and retry checks |
| Advanced CSV/XLSX export | Implemented | Scope, owned download, ordered parts and policy checks; full 500,000-row synthetic CSV export |
| Filters and per-view contexts | Implemented | Typed parameterized queries, AND/OR, persistence and larger-table pagination/sort |
| Super Admin column policy | Implemented | Locked identity, nineteen-field All pool, draft/publish and audit tests |
| Personal column preferences | Implemented | Database revision control plus new-browser-context My View acceptance |
| Tables | Implemented | Resizing, sort priority, frozen Actions, Read More, bulk selection and responsive cards |
| Business Lines UI | Implemented with follow-up corrections | Visible Back, genuine backdrop dismissal and protected login initialization; all nineteen fields preserved |
| Final production-user acceptance | Still distinct from automated QA | Do not label the whole CRM or actual production-user sign-off complete based only on local/CI tests |

## Progress interpretation

The earlier 7/8 (87.5%) figure counts the original Business Lines workstream checklist, not development hours or the whole CRM. It must not be changed to 100% actual-user acceptance without the required production-account confirmation. Automated engineering checks and deployment can be complete while this remains open.

## Limits and evidence

Atomic import is **250 rows**; the earlier Issue #22 text and chat saying 1,000 were incorrect. Overall import remains 2 MiB / 10,000 rows. Export remains 500,000 records in ordered 1,000-row parts. `docs/records-acceptance.md` identifies the tested data, real-versus-mocked boundaries, benchmark timings, and remaining runtime-warning investigation.

## Scope separation

Business Lines is the first framework adapter. Other modules need their own field schema, permissions and business rules connected to the shared controls. The current backend still limits Business Lines to approved, verified Super Admins. Configuring Admin/Manager/Standard column pools does not grant module access and must not be presented as a new permission engine.
