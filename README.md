# SCRM — Satguru Enterprise CRM

An original Salesforce-inspired, Satguru-specific **UAT prototype** for multi-business-line CRM operations.

## Preview locally

Open `index.html` in a browser. The application uses vanilla HTML, CSS and JavaScript; no installation is required.

## Available in this prototype

- Executive overview and illustrative pipeline visual
- Leads and pipeline board
- Customers, people/contacts, opportunities, activities, quotations, bookings
- Employees, branches, module directory, settings and local audit log
- Search, status filters, create/edit forms, CSV export and responsive layout
- Browser-local demo persistence and reset

## Important limitations

**This is a front-end demonstration, not a production-ready CRM.** The sample data is fictional. There is no authentication, server-side RBAC, API, shared database, secure audit log, encryption-backed data governance, email integration, booking engine, or production-grade validation. Do not enter actual customer, employee, financial or sensitive data. Local browser storage is not a secure enterprise data store.

The customer/person/employee identity policy remains unresolved in SCRM-013 and SCRM-015; do not automatically merge identities. Customer categories are scoped per business line.

The architecture follows the confirmed SCRM-001–012 and SCRM-014 business principles as **design intent**. It does not claim to have implemented all of those rules.

## Roadmap

1. Secure authentication with administrator-approved employee access.
2. Backend database, master-data tables, tenant/business-line/branch/department scoped authorization.
3. Person, organisation, employee, contact, customer relationship and effective-dated category data model.
4. Real lead lifecycle, conversion, quotations, bookings and fulfilment workflows.
5. Service cases, marketing, SLA, approvals, audit, reports and integrations.
6. Security testing, UAT, migration and phased production rollout.

## Intellectual property

This is an original implementation inspired by common enterprise CRM capabilities. It does not copy Salesforce source code, UI assets or proprietary product implementations.
