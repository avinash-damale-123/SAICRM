# SAI-CRM v3.0 — Corporate and Non-IATA Operational CRM
**Consolidated business baseline and implementation contract | 18 November 2026 | Status: approved direction, implementation staged**

## 1. Purpose and scope
Build a single integrated B2B CRM for (a) Corporate / Organisation opportunities, including NCA and ERV classifications where applicable; and (b) Non-IATA agents and agencies (B2B). **Do not introduce Retail workflows, new Retail leads or Retail accounts** into the v3 operational modules. Earlier source workbooks include Retail, IATA, Airlines, Vendors and Others; these are reference material, not authorization to reintroduce excluded segments. Preserve existing historical records and legacy applications without inventing conversions.

**Operating path:** Target List -> verified Contacts and compliant Outreach / optional Email Sequence -> authorised qualification -> Lead -> Commercially Won -> linked CRF / Layer-3 Onboarding -> Finance approval and any configured additional approval -> create/reuse Local Account -> ongoing Account/Contact activities and Actual Sales reporting.

This supplements—not replaces—the existing Business Line, Country, Region, Branch, Department, Organizational Role, Reporting Hierarchy, Module Directory, Role Matrix and authentication infrastructure. All new modules must use the Business Lines shared workspace UI standard and canonical master IDs.

**Explicit distinction:** A commercial win is not a Finance approval, an Account, a FACTS ledger, or Actual Sales.

## 2. Terminology / precedence
- **Target:** a prospecting identity or organisation that has not met qualification criteria. Targets and Leads have separate stage systems.
- **Lead:** qualifying opportunity with recorded interest/requirements, authorized conversion from Target or authorized direct qualification. Mere outreach, email delivery, AI-generated details or scraped names never qualify by themselves.
- **Commercially Won:** the Layer-2 commercial outcome; record event and timestamp separately from CRF approval date.
- **CRF:** the client-registration/onboarding details and review request linked to a commercially won Lead. Preserve label `CRF` rather than inventing expansion. It may capture segment-dependent legal/KYC/credit/agency documentation.
- **Finance Approval:** decision on a completed CRF; it is not an implicit commitment to extend credit. The approved CRF creates or links **one local Account in the appropriate Business Line and Branch** when permitted.
- **Global Client:** central identity for the same company across countries/Business Lines; Admin-controlled verified creation, shared identity/presence; local commercial records remain permission-scoped.
- **Local Account:** existing operational client relationship and its local location, independent of FACTS ledger.
- **Contact:** reusable person record linked via a relationship table to one or more Targets, Leads, Local Accounts, Campaigns; privacy and branch access are evaluated per relationship.
- **Campaign / Email Sequence:** opt-in-approved multi-step outreach, with one-time recipient + campaign + sequence-step execution and central suppression.
- **Activities:** common Call, Email, Meeting/Visit, Minutes of Meeting (MoM), Task, Note and follow-up engine linked to business records.

**Supersession:** Latest explicitly approved v3 Corporate/Non-IATA-only operating scope supersedes historic workbook's Retail/IATA examples. Approved Layer-2 BD-02..06 and G-01..08 remain controlling, except the newly clarified CRF->Finance approval->Account activation flow makes the Finance gate explicit.

## 3. In scope / exclusions
Included: Targets; Leads; CRF and Finance queue; approved Corporate/Non-IATA Local Accounts; Contacts; activity timeline and meetings/MoMs/tasks; Campaigns and email sequencing preparation/approvals; global identity and duplicates; dashboards; audit, notifications and reporting; manual Actual Sales as independent module later.
Excluded: Retail intake and Retail CRM; auto-creating FACTS ledgers; automatic conversion from email opens; unauthorised global exposure of local contacts; Yiron write-back; automatic email sending from unverified mailboxes; assumptions that historical ERV or FACTS names uniquely identify a Global Client.

## 4. Foundational constraints
FR-FOUND-001. Use canonical Business Line and Branch IDs; Branch belongs to one Business Line and both Region and Country; Business Line presence in Country restricts Branch selection.
FR-FOUND-002. Allow multiple Branch IDs in the same city, including across different Business Lines; never merge them based on city/name.
FR-FOUND-003. Existing administration masters remain authoritative; do not create parallel Business Line, Country, Region, Department, Role or User tables.
FR-FOUND-004. Separate platform User Type (Admin/Manager/Standard User), Organizational Role/position, Permission Role, and assigned-user identity. Do not infer active record access from hierarchy rules alone.
FR-FOUND-005. Role Matrix configurability does **not** currently imply operational grants are assigned to users; implement explicit assignment and server-side enforcement before regular user rollout.
FR-FOUND-006. All business records use immutable UUID internal keys, generated readable display IDs, created/updated metadata, row version, lifecycle state, append-only audit and history of owner/assignment transfers.
FR-FOUND-007. Every scoped query, count, export and detail endpoint must enforce the same server-side authorization as mutations; no field-level access based on hidden buttons.
FR-FOUND-008. Reject inactive/archived dependencies and cross-branch/Business Line transfers without eligible permissions; preserve the previous owning scope in audit and history.

## 5. Target List
**Stages (approved G-01):** New; Contact Attempted; Contacted; On Hold; Closed/Not Interested.
FR-TG-001. Authorized user creates a Corporate or Non-IATA Target with company/agency name, owning Business Line, Branch, country, source, owner and optional verified Contact linkage; deduplicate and flag possible Global Client/Account matches.
FR-TG-002. Allow separate assigned-user and owner fields; derived Region/Country from Branch, with explicit business geography if different.
FR-TG-003. Target remains Target through email sends, replies without qualifying need, and attempted calls.
FR-TG-004. Only authorized user may convert to Lead after documenting business interest/requirement/evidence and qualifying contact/requirements; retain Target ID, source and conversion timestamp.
FR-TG-005. Campaign recipients require verified/validated Contacts and purpose/channel eligibility; AI-generated contact data stays unverified until validated.
FR-TG-006. Closed targets retain histories; audit reassignment, close reason, suppression, duplicate resolution.

## 6. Leads / commercial pipeline
**Stages (approved G-01):** Qualified; Hot; Proposal Submitted; Negotiation; Commercially Won; Closed & Dead.
FR-LD-001. Lead may be created by authorized Target conversion or direct authorized intake with equivalent required qualification evidence; preserve origin identity and timestamps.
FR-LD-002. Corporate-specific fields: Corporate class (NCA/ERV), subcategory where applicable (NCA Corporate/SME/PNW/NC PNW, ERV Global/Top 20%/Rest 80%/Lost), industry, tender, product/service interest, annual potential, decision makers.
FR-LD-003. Non-IATA-specific fields: agency type, registration details, GDS, location, operating areas and service potential; no IATA intake path in this release.
FR-LD-004. Support assignment, notes, calls, emails, meetings, MoMs, tasks, reminders and follow-up SLAs with ownership/branch isolation.
FR-LD-005. Stage changes validate permissions, reason where relevant, mandatory fields and version; Closed & Dead requires reason; leave history and activity timeline intact.
FR-LD-006. Commercially Won is an auditable, date-stamped event, not an Account; atomically create or reuse a linked CRF request (G-07), without creating a FACTS ledger.
FR-LD-007. Preserve original historical STG Sales statuses and dates during imports; ambiguous statuses go to reconciliation queue rather than auto-converting.
FR-LD-008. Pipeline amount is separate from Actual Sales, and reports distinguish target counts, lead counts, wins, submitted CRFs, approved Accounts and financial turnover.

## 7. CRF / finance approval
**Approved onboarding statuses (G-02):** Pending; In Progress; Returned for Correction; Approved; Rejected; Cancelled.
FR-CRF-001. Every CRF links to a Commercially Won Lead and retains its source Business Line, Branch, owner, segment, Global Client candidate and intended Account.
FR-CRF-002. CRF must prepopulate verified Lead/Contact data without overwriting user-confirmed fields or converting empty legacy values into assertions.
FR-CRF-003. Corporate CRF records legal/company name, registration, address, ownership, service scope, KYC documents, contract/contact signatory, billing preferences, requested cash/credit arrangement and supporting approvals as required by the configured policy.
FR-CRF-004. Non-IATA CRF records agency name, branch, country/state/city, registration proof, ownership/contact persons, GDS usage, communication mode, service potential, bank/KYC evidence where legally applicable, and requested cash/credit terms. The historical Yiron CRF workbook is field reference; do not treat all its IATA-only or personally sensitive fields as universally mandatory.
FR-CRF-005. Sensitive IDs, bank numbers, personal birthdates and uploaded KYC files must be access-limited and stored securely; they cannot be written into generic logs, plain audit JSON, unrestricted exports or messages.
FR-CRF-006. Sales submits the CRF with completeness checks; Finance reviewer with explicit Finance scope may Approve, Reject or Return for Correction with reason and decision timestamp. The requester must not approve own CRF.
FR-CRF-007. Submitted CRF is immutable to the requester until Returned for Correction; record each version/decision and re-submit after changes. Finance cannot approve unsupported ledger/credit decisions silently.
FR-CRF-008. Approved CRF creates or reuses an appropriate Local Account with duplicate screening, active master validation and immutable CRF linkage; no auto FACTS ledger, transaction, or Actual Sales.
FR-CRF-009. Rejection/cancellation preserves Commercially Won history separately from onboarding outcome; report both dates/statuses.
FR-CRF-010. Send in-app notifications to requester, owner, approvers and authorized supervisors; no approval via untrusted email links alone.

## 8. Accounts / Global Client
FR-AC-001. Account is the approved existing local client and belongs to exactly one Business Line and Branch by default; independently managed subsidiaries may have separate accounts.
FR-AC-002. Duplicate screening uses legal name, aliases and verified business identifiers; same name may exist when justified; never merge automatically based on spelling.
FR-AC-003. Admin-controlled Global Client ID `GC-000001` is permanent; allow pending Global Client mapping while local Target/Lead work continues.
FR-AC-004. Global Client identity, aliases, parent/subsidiary relation and verified presence are shared as authorized; Local Account commercial terms, Contacts, Leads, activities, financials and ledger mappings stay permission-scoped.
FR-AC-005. One FACTS ledger belongs to at most one Local Account at a time; Local Account can have multiple ledgers; retain mapping history and prevent duplicate financial aggregation.
FR-AC-006. Account screen aggregates related Contacts, activity timeline, open tasks, prior Leads/CRFs, financial overview and audit; avoid exposing unimplemented Actual Sales as verified turnover.
FR-AC-007. Corporate subtype and B2B/non-IATA agency classification remain distinct; archived records retain references.
FR-AC-008. No automatic Account creation solely from commercial status, unsolicited CRF data, or imported legacy status.

## 9. Shared Contacts
FR-CT-001. Contact receives its own permanent ID and can be linked to Target, Lead, Account, Campaign and activity as role/branch permissions permit; do not duplicate the same person for every record.
FR-CT-002. Relationship carries role/context (Decision Maker, Finance, Operations, Other), verified contact status, primary indicator and effective dates.
FR-CT-003. Store sourced business email, phone with country code, designation, communication language and contact preferences; minimize personal sensitive fields by purpose.
FR-CT-004. Distinguish an exact verified match from a suggested match; do not cross-share contacts across branches without authorized verified mapping.
FR-CT-005. When Contact is merged, preserve IDs/links/audit and update future sends without rewriting sent-history recipient identity.

## 10. Communications / activities
FR-ACT-001. One activities engine supports Call, Email, Meeting (physical/virtual), MoM, Task, Note and Visit; link each entry to a single primary Target/Lead/Account plus optional Contact, and allow authorized related links.
FR-ACT-002. Calls: direction, outcome, duration, contact, optional recording reference, next action, timestamps and permission-scoped history.
FR-ACT-003. Emails: mailbox connection status, To/Cc/Bcc, subject, body/attachment metadata, delivery/reply/bounce state; retain thread link and opt-out enforcement.
FR-ACT-004. Meetings/visits: start, end, attendee, location/type and check-in/out evidence when required; MoM decisions and action items become independently owned Tasks.
FR-ACT-005. Tasks: owner, assignee, due date/time zone, priority, status, reminder/escalation and link; completed tasks retain history.
FR-ACT-006. Notes: access-controlled immutable author/time and editing history; prevent leaked private data in cross-branch summaries.
FR-ACT-007. Activity history persists through Target->Lead->Account transition and is not duplicated as separate artificial actions.
FR-ACT-008. Source Yiron meetings/users remain read-only and are not automatically written into operational SAI records.

## 11. Campaigns / email sequencing
FR-CM-001. Central Campaign approval remains mandatory (G-05); BL/Country/Branch can only make policy stricter. Routine campaigns may use approved auto-policy; high-volume/restricted/shared-mailbox campaigns require configured review (BD-05).
FR-CM-002. Sequence defines ordered email/call/task steps and delays, sender mailbox, permitted recipient scope, approved content, sending windows and unsubscribe treatment.
FR-CM-003. Every send requires authorized and connected mailbox, validated verified recipient, consent/purpose eligibility, suppression check, opt-out/bounce status, local sending constraints and campaign approval.
FR-CM-004. Enforce a server/database uniqueness guard by campaign + recipient/contact + step + execution version; retries/restarts/multiple workers never cause duplicate successful email sends.
FR-CM-005. Stop or pause an individual recipient on reply, opt-out, bounce, disqualification or conversion as configured. Do not send marketing messages via operational-notification channel.
FR-CM-006. Support All Accessible/My Campaigns/Branch Campaigns/Other Users views, with filters and counts reconciled to accessible records; participant selection spans pages with persistent explicit IDs.
FR-CM-007. Audit sequence schedule/edit/approval/sends/retries and deliberate separately approved manual resends. No outbound sending until recipient scope, compliance and provider authentication have been tested.
FR-CM-008. Respect G-06 centralized communication preferences/suppression by purpose, channel, geography and applicable law.

## 12. Dashboards, metrics and integrations
FR-REP-001. Provide Target-to-Lead conversion, pipeline by stage/owner/branch/segment, commercial wins, CRF queue/TAT, Finance rejection/return rates, approved Account growth, activities/overdue tasks and campaign performance.
FR-REP-002. Each tile uses the exact same access scope/date/status rules as drilldown; never inflate totals by joining multiple contacts or ledgers.
FR-REP-003. Yiron CRM Analytics-Y1 remains a separate read-only visibility lane. Verify source totals/keys before any persistent refresh or operational mapping.
FR-REP-004. Meeting reporting counts distinct `meeting_log_id`, reporting date `check_in_date` (else `created_on`), Held = `meeting_held=Yes` and completed check-in, Not Held = No, else Unclassified. Link actual Meeting `user_id` to User Master `user_id`; only Active Marketing users count; branch comes from the Meeting User's primary branch. Preserve unmapped records.
FR-REP-005. Actual Sales is separate from commercial wins and Account approvals; manual upload with validation first, FACTS integration later.
FR-REP-006. Import/export, bulk changes and KPIs must enforce user permissions, source lineage, duplicate-period rules and audit.

## 13. UI / user training baseline
- Reuse Business Lines compact workbar, sidebar, Records, Overview, table search/filter/sort, column visibility/width/order, persisted My View, import/export history, lifecycle and History/Audit patterns.
- New menu under operational CRM: Target Lists; Leads; CRF / Finance Approvals; Accounts; Contacts; Activities (Calls, Emails, Meetings/Visits, MoMs, Tasks, Notes); Campaigns / Email Sequencing; Sales Dashboard. Existing Core Masters remain in Administration.
- On Lead detail, show qualification evidence, status progression, linked CRF, Contacts and activity timeline. On Account detail, show verified Local Account context and linked records.
- A module may be visible only when its backend resource is registered/eligible and its API enforces relevant actions; user type restriction never overrides current stricter authorization.

## 14. Release strategy and non-negotiable gates
The business owner gave one-time direction to design/build the full solution and permits routine design/engineering decisions without repeated approval. This is not a waiver of database backups, source-data validation, access controls, regulatory suppression checks or authenticated acceptance.

1. **Foundation preservation:** inventory Production commit, existing migrations v001-v015 and live master functionality, and audit the unfinished draft PRs #68/#73; never blindly merge legacy experimental changes.
2. **First vertical slice:** Target+Lead+CRF Finance+Account+Contact+Activities on isolated additive schema, with server-side permissions and real end-to-end browser+Postgres tests.
3. **Communication slice:** campaigns/sequence, mailbox connections, suppression, duplicate-send idempotency, approval and audit. Keep sending disabled until authorized and tested.
4. **Dashboard slice:** source-backed operational KPIs + drilldown, historical data reconciliation and Yiron read-only integration; no fabricated data.
5. **Production release:** isolated database branch migration, verified backup/restore and rollback, CI Node 22/24, security/tenant cross-scope tests, authenticated UAT, validated Vercel team/project/alias/commit, then one coordinated rollout. Failure or missing evidence blocks promotion. Keep legacy data and audit intact.

**Definition of done:** code merged to main after tests; migration applied to the right database; Production READY and correct live alias/commit; authorized users can complete Target -> Lead -> Commercially Won -> CRF submitted -> Finance approved -> Local Account; negative/race/security cases pass; no unauthorized or duplicate emails; counts and drilldowns reconcile.

## 15. Source reconciliation
- Google Drive **0 New CRM Development** / **1. Module & Master** / **4. Core Modules**: Contacts.xlsx, Leads.xlsx, Contact+Leads.xlsx; **New With Yron team**: CRM Req_1.xlsx and Form Fields Module Wise - Satguru CRM.xlsx.
- Google Drive **New With Yron team / Details received**: CRF Module Documentation.xlsx, including agency registration, KYC/Cash/Credit, Contact Details and segment fields. Source contains older IATA and personal-data requirements; apply current approved segment and privacy limits.
- Google Drive **New CRM _ Next Level.xlsx** and **# Vercal CRM/CRM_Requirements_V1.md.txt**: early module/navigation and legacy planning.
- Google Drive **STGsales__Change_Requirements_For_Mail_Sequence_S3.docx** and **STGsales_Campaign_Email_Sequencing_Duplicate_Execution_Issue(1).docx**: reference for campaign filtering, participant selection and duplicate-send prevention. This is evidence from a separate STGsales tool, not proof that SAI-CRM already implements it.
- GitHub current `main`: `docs/organization-architecture-and-role-master-v1.md`, `docs/role-matrix-v15.md`, `docs/crm-analytics-y1.md`, and master-module implementations.
- SAI-CRM approved conversation baseline: BD-02/03/04/05/06, G-01..08, Global Client 24-point baseline, Country/Region/Branch/Department/Role Matrix UI parity.
- Conflict: historic Leads workbook proposes Retail/IATA statuses and direct conversion, but approved v3 excludes these segments and requires CRF/Finance gate. Treat those historic workflows as reference/migration inputs, not current-state truth.
- The Google Drive API Details document contains a plaintext legacy API credential; rotate any exposed key and do not import it into source control or browser code. 
