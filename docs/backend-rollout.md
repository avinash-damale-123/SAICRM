# SCRM backend rollout

This PR replaces browser demo records with a PostgreSQL API, server-side sessions and Google SMTP email. It is not a verified production deployment.

## Infrastructure verification

Verified target: GitHub repository avinash-damale-123/SAICRM and the existing Vercel project saicrm, ID prj_sU4vnwodAUOGsyNQlVzfDwItk9Sl, owned by Avinash Damale's projects (team_ARpEeg4qFknC01gSsEcGlS23). Project metadata includes saicrm.vercel.app. Reads using the exact project ID without an explicit team selector succeeded; name/team-selector lookups returned 404. The excluded admin-satguruais-projects workspace was not changed.

Production variable names were verified without decrypting values: DATABASE_URL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM, APP_ORIGIN and TOKEN_SECRET. Presence does not prove credentials, database schema, TLS options, or delivery are valid. Database connection variables also target Preview; isolation of preview data must be checked before enabling backend previews.

The user selected their Google Workspace mailbox noreply@satguruai.com for codes, password resets and generic system emails, using a Google app password. Other communications can use a separate sender later. No Resend account or key is required. No new repository or Vercel project was created.

## Configure the existing project

1. Supply a PostgreSQL database connection with verified TLS using the provider's supported DATABASE_URL including sslmode=verify-full (required by the application). Use a distinct database for previews. Never disable certificate verification.
2. Configure SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=noreply@satguruai.com, SMTP_PASSWORD as the Google app password, and EMAIL_FROM=SCRM <noreply@satguruai.com>. The mailbox must be permitted to use app passwords under its Google Workspace policy. Ordinary Google account passwords are not supported. STARTTLS is required on 587; port 465 uses implicit TLS. Certificates are verified and SMTP debug logs are disabled. SMTP authentication/Google quotas and actual delivery remain to be verified.
3. Configure APP_ORIGIN as the exact HTTPS origin (production: https://saicrm.vercel.app), with no trailing slash. Preview requires its own explicit origin and isolated database. Do not share production secrets/data with arbitrary previews.
4. Generate TOKEN_SECRET with at least 32 random bytes, hex encoded (for example: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"). Store it server-side with the other values in the verified existing Vercel project. No secrets belong in chat, Git, screenshots or public PRs.
5. Run npm install, then npm run db:migrate from a trusted operator environment against the intended database. Migrations never run automatically on a request.
6. Register the initial administrator and verify the actual emailed OTP. Use the user-designated admin@satguruai.com via BOOTSTRAP_ADMIN_EMAIL, then run npm run admin:bootstrap. Bootstrap refuses unverified users and refuses to run after an approved administrator exists. Do not infer the administrator email from Git metadata.
7. Use a dedicated application database role with only SELECT/INSERT/UPDATE/DELETE on users, user_scopes, sessions, challenges, rate_limits and records; SELECT/INSERT on audit; and sequence usage for audit. The migration/operator role owns the schema. The append-only audit trigger also rejects updates/deletes, but database owners can bypass it; it is not tamper-proof against infrastructure administrators.
8. Run the database and UI checks, then test actual email delivery, resets and approval in the configured preview. Review before merging. Do not promote until the project identity and configuration are verified.

The project uses a Vercel Node API function, a static frontend, and vercel.json API rewrites. Missing database/email/origin/token configuration returns 503 and exposes no CRM records. Database backups/restore drills and operational alerts must be configured by the operator.

## Authentication and access

Passwords use scrypt with independent random salts. Opaque 12-hour sessions are stored as digests in PostgreSQL and sent in Secure HttpOnly SameSite=Lax host-only cookies. CSRF tokens and exact-origin checks protect mutations. Logout removes the current session; password reset, suspension and role/status changes revoke sessions. Password recovery never grants approval.

Registration requires a real six-digit email OTP and administrator approval independently. OTPs and reset tokens expire after 15 minutes, are stored as keyed digests, invalidate previous challenges on resend, and are consumed atomically. Five incorrect challenge attempts block that challenge. Reset links contain a random 256-bit token in the URL fragment; the frontend immediately removes it from the address bar. Neither API responses nor production logs expose OTPs/reset links. Provider errors return a generic service error; users can request resend.

The system has one internal CRM workspace with explicit branch/business-line access:
- Admin: all record scopes, employee and branch masters, account approval/role/status/scope management and audit reads.
- Manager: ordinary CRM CRUD, including deletion, inside assigned scope pairs.
- Member: ordinary CRM read/create/update inside assigned scope pairs.
- Viewer: ordinary CRM read only inside assigned scope pairs.

The user requires branch/business-line restrictions. Every ordinary CRM record has a required access branch code and business line. Administrators assign exact pairs (for example PUNE:STTS and DUBAI:CAR). Pairs are matched together; these assignments do not grant PUNE:CAR. Non-admin accounts cannot be approved without a pair. Reads, updates, deletions and CSV inputs enforce these assignments on the server. Only admins may transfer records between access scopes. Scope changes revoke existing sessions. New users have no scope assignments.

Access branch codes are explicit, stable uppercase codes (letters, digits, underscore or hyphen, at most 40 characters). They are separate from free-text branch display fields and are not inferred from employees or customer names. Administrators must define consistent codes when assigning access and entering records. Employee and branch master records remain administrator-only.

The last administrator cannot remove their own privileges; account changes require a different administrator. All approval requires verified email. Employee master role/status fields are informational and never grant login access.

Department, row-owner and multiple-tenant policies are not implemented. Administrators have access to all branches/business lines and must be limited to trusted operators.

## Data, audit and limitations

All nine existing editable modules use shared database records. Inputs have strict field allowlists, required fields, enum/number/date/email/length checks; queries are parameterized. Server-generated UUIDs, metadata and version checks prevent client identity injection and stale overwrites. No demo data is seeded or automatically imported from localStorage. Existing browser demo storage is left untouched but is never read by the new app.

UI navigation and responsive styles are preserved. The old fictional chart is replaced with an explicit reporting limitation. Analytics derive totals from saved records. Existing quotations/bookings are record management, not accounting, approval or booking-engine integrations. Module Directory distinguishes existing records from planned capabilities; notifications remain an explicit unconnected feature.

The frontend requests all records in 100-row API pages and caches them only in memory for its existing filters/exports. Large datasets need server-side search and UI pagination before scale. Account lists are also paginated. CSV export re-reads the authorized module from the API rather than trusting an older browser cache. Session/access state is checked on window focus and at one-minute intervals while the workspace is visible. Audit displays the latest 200 events. Record mutations and successful security/account events are audited; security auditing is not a full SIEM and denied requests are not all logged. Audit contains event metadata, not passwords, tokens or complete customer record snapshots.

Rate limits are atomic PostgreSQL counters across instances: general IP 600/10 minutes; auth IP 40/15 minutes; account/action 5/15 minutes (login and verify 10). Vercel's edge-owned x-real-ip is used; any alternative hosting must provide an equally trusted client address. Availability failures fail closed. Rate limiting does not replace WAF/DDoS controls or abuse monitoring.

Run node scripts/cleanup.mjs regularly through a trusted operator scheduler to remove expired sessions, challenges and rate-limit rows; it does not delete CRM records or audit history. Establish business retention, privacy, export, monitoring, recovery and incident policies before production use.

## Tests

npm test runs contract/crypto tests; TEST_DATABASE_URL enables real PostgreSQL integration tests against an isolated, empty test database. Never point it at production. Tests inject an email transport at the provider boundary to inspect actual randomly generated challenges; the deployed API always uses authenticated SMTP and has no mock OTP/reset fallback.

GitHub Actions provides PostgreSQL 17 and runs backend tests. Browser checks exercise auth forms and preserved modules at mobile/tablet/laptop widths using controlled API responses; they do not prove live email delivery or hosted production behavior.

Release remains blocked on database/TLS/schema checks, least-privilege application credentials, isolated preview configuration, actual SMTP authentication and delivered-email/reset checks, bootstrap of admin@satguruai.com, and initial branch/business-line access assignments.
