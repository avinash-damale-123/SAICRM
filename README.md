# SCRM — Satguru Enterprise CRM

A responsive CRM with a PostgreSQL API and email-verified, administrator-approved accounts. This branch is an implementation pending infrastructure configuration and live verification; it is not certified production-ready.

- Login, registration, email OTP verification/resend, expiring single-use password resets, sessions and logout.
- Server-enforced admin/manager/member/viewer permissions, protected CRUD, input validation, rate limits and audit events.
- Existing leads, customers, contacts, opportunities, activities, quotations, bookings, employees and branches.
- No fictional records or browser-local CRM persistence. Existing browser demo records are not automatically imported.

Read [the rollout guide](docs/backend-rollout.md) for environment configuration, migration, administrator bootstrap, permissions, tests and limitations. Configure only the existing avinash-damale-123/SAICRM repository and saicrm.vercel.app Vercel project. Missing services fail closed.

## Commands

Use Node.js 22 or later.

```sh
npm install
npm test
npm run db:migrate
npm run admin:bootstrap
```

Set environment variables using [.env.example](.env.example) as a reference. Scripts read the process environment; they do not automatically load an .env file. Database integration tests require TEST_DATABASE_URL pointing at an isolated test database. Serve the app through Vercel/its development server for /api routing; opening index.html directly no longer provides a working CRM.

## Scope

One shared internal workspace. Branch/department/business-line isolation, financial workflows, external booking systems, notifications and planned directory capabilities need further work. Employee master fields never grant account access. Do not enable real customer use until configuration, delivered email, database security/backup and access policy have been verified.

Original implementation inspired by common enterprise CRM patterns; no Salesforce source code or assets.
