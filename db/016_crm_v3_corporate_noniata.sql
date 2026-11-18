BEGIN;
SET LOCAL search_path TO public, pg_catalog;
-- SAI-CRM v3 core: isolated B2B operational tables. Never rewrite legacy records.
-- This migration requires a tested database recovery point before Production application.

-- Composite FK ensures that every operational Branch stays in its canonical Business Line.
CREATE UNIQUE INDEX IF NOT EXISTS branch_masters_id_line_v16
 ON branch_masters (id,business_line_id);

CREATE TABLE IF NOT EXISTS crm_v3_global_clients (
 id uuid PRIMARY KEY,
 sequence_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 display_id text GENERATED ALWAYS AS ('GC-'||lpad(sequence_no::text,GREATEST(6,length(sequence_no::text)),'0')) STORED UNIQUE,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 parent_id uuid REFERENCES crm_v3_global_clients(id),
 status text NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive','Archived','Deleted')),
 country_id uuid REFERENCES countries(id),
 aliases jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(aliases)='array'),
 verified_by uuid REFERENCES users(id),
 verified_at timestamptz,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 version int NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK(parent_id IS NULL OR parent_id<>id)
);
CREATE INDEX IF NOT EXISTS crm_v3_global_clients_name_v16 ON crm_v3_global_clients(lower(name));

CREATE TABLE IF NOT EXISTS crm_v3_targets (
 id uuid PRIMARY KEY,
 sequence_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 display_id text GENERATED ALWAYS AS ('TGT-'||lpad(sequence_no::text,GREATEST(6,length(sequence_no::text)),'0')) STORED UNIQUE,
 segment text NOT NULL CHECK(segment IN ('Corporate','Non-IATA')),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 business_line_id uuid NOT NULL REFERENCES business_lines(id),
 branch_id uuid NOT NULL,
 global_client_id uuid REFERENCES crm_v3_global_clients(id),
 source text NOT NULL DEFAULT '' CHECK(length(source)<=150),
 stage text NOT NULL DEFAULT 'New' CHECK(stage IN ('New','Contact Attempted','Contacted','On Hold','Closed/Not Interested')),
 qualification_note text NOT NULL DEFAULT '' CHECK(length(qualification_note)<=3000),
 owner_id uuid NOT NULL REFERENCES users(id),
 assigned_user_id uuid REFERENCES users(id),
 converted_at timestamptz,
 created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 version int NOT NULL DEFAULT 1 CHECK(version>0),
 archived_at timestamptz,
 FOREIGN KEY(branch_id,business_line_id) REFERENCES branch_masters(id,business_line_id)
);
CREATE INDEX IF NOT EXISTS crm_v3_targets_scope_v16 ON crm_v3_targets(business_line_id,branch_id,stage,updated_at DESC);
CREATE INDEX IF NOT EXISTS crm_v3_targets_name_v16 ON crm_v3_targets(lower(name));

CREATE TABLE IF NOT EXISTS crm_v3_leads (
 id uuid PRIMARY KEY,
 sequence_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 display_id text GENERATED ALWAYS AS ('LD-'||lpad(sequence_no::text,GREATEST(6,length(sequence_no::text)),'0')) STORED UNIQUE,
 target_id uuid UNIQUE REFERENCES crm_v3_targets(id),
 segment text NOT NULL CHECK(segment IN ('Corporate','Non-IATA')),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 business_line_id uuid NOT NULL REFERENCES business_lines(id),
 branch_id uuid NOT NULL,
 global_client_id uuid REFERENCES crm_v3_global_clients(id),
 stage text NOT NULL DEFAULT 'Qualified' CHECK(stage IN ('Qualified','Hot','Proposal Submitted','Negotiation','Commercially Won','Closed & Dead')),
 qualification_evidence text NOT NULL CHECK(length(btrim(qualification_evidence)) BETWEEN 10 AND 3000),
 annual_potential_usd numeric(18,2) NOT NULL DEFAULT 0 CHECK(annual_potential_usd>=0),
 lead_source text NOT NULL DEFAULT '' CHECK(length(lead_source)<=150),
 close_reason text NOT NULL DEFAULT '' CHECK(length(close_reason)<=1000),
 commercial_won_at timestamptz,
 owner_id uuid NOT NULL REFERENCES users(id),
 assigned_user_id uuid REFERENCES users(id),
 created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 version int NOT NULL DEFAULT 1 CHECK(version>0),
 archived_at timestamptz,
 FOREIGN KEY(branch_id,business_line_id) REFERENCES branch_masters(id,business_line_id),
 CHECK((stage='Commercially Won')=(commercial_won_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS crm_v3_leads_scope_v16 ON crm_v3_leads(business_line_id,branch_id,stage,updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_v3_crfs (
 id uuid PRIMARY KEY,
 sequence_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 display_id text GENERATED ALWAYS AS ('CRF-'||lpad(sequence_no::text,GREATEST(6,length(sequence_no::text)),'0')) STORED UNIQUE,
 lead_id uuid NOT NULL UNIQUE REFERENCES crm_v3_leads(id),
 status text NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','In Progress','Returned for Correction','Approved','Rejected','Cancelled')),
 -- Only ordinary, approved business-profile fields; no bank account numbers, government IDs, birthdates or raw KYC documents.
 profile jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(profile)='object'),
 submitted_at timestamptz,
 submitted_by uuid REFERENCES users(id),
 finance_decided_at timestamptz,
 finance_decided_by uuid REFERENCES users(id),
 finance_reason text NOT NULL DEFAULT '' CHECK(length(finance_reason)<=2000),
 created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 version int NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK((status='Approved')=(finance_decided_at IS NOT NULL AND finance_decided_by IS NOT NULL)),
 CHECK(status<>'Approved' OR submitted_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS crm_v3_crf_review_v16 ON crm_v3_crfs(status,submitted_at);

CREATE TABLE IF NOT EXISTS crm_v3_accounts (
 id uuid PRIMARY KEY,
 sequence_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 display_id text GENERATED ALWAYS AS ('AC-'||lpad(sequence_no::text,GREATEST(6,length(sequence_no::text)),'0')) STORED UNIQUE,
 crf_id uuid NOT NULL UNIQUE REFERENCES crm_v3_crfs(id),
 lead_id uuid NOT NULL UNIQUE REFERENCES crm_v3_leads(id),
 segment text NOT NULL CHECK(segment IN ('Corporate','Non-IATA')),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 business_line_id uuid NOT NULL REFERENCES business_lines(id),
 branch_id uuid NOT NULL,
 global_client_id uuid REFERENCES crm_v3_global_clients(id),
 status text NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive','Archived','Deleted')),
 owner_id uuid NOT NULL REFERENCES users(id),
 created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 version int NOT NULL DEFAULT 1 CHECK(version>0),
 FOREIGN KEY(branch_id,business_line_id) REFERENCES branch_masters(id,business_line_id)
);
CREATE INDEX IF NOT EXISTS crm_v3_accounts_scope_v16 ON crm_v3_accounts(business_line_id,branch_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_v3_contacts (
 id uuid PRIMARY KEY,
 sequence_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 display_id text GENERATED ALWAYS AS ('CT-'||lpad(sequence_no::text,GREATEST(6,length(sequence_no::text)),'0')) STORED UNIQUE,
 full_name text NOT NULL CHECK(length(btrim(full_name)) BETWEEN 1 AND 200),
 email text NOT NULL DEFAULT '' CHECK(length(email)<=254),
 phone text NOT NULL DEFAULT '' CHECK(length(phone)<=40),
 designation text NOT NULL DEFAULT '' CHECK(length(designation)<=160),
 preferred_language text NOT NULL DEFAULT '' CHECK(length(preferred_language)<=80),
 verification text NOT NULL DEFAULT 'Unverified' CHECK(verification IN ('Unverified','Validated','Verified')),
 status text NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive','Archived')),
 business_line_id uuid NOT NULL REFERENCES business_lines(id),
 branch_id uuid NOT NULL,
 owner_id uuid NOT NULL REFERENCES users(id),
 created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 version int NOT NULL DEFAULT 1 CHECK(version>0),
 FOREIGN KEY(branch_id,business_line_id) REFERENCES branch_masters(id,business_line_id)
);
CREATE INDEX IF NOT EXISTS crm_v3_contacts_scope_v16 ON crm_v3_contacts(business_line_id,branch_id,lower(email));

CREATE TABLE IF NOT EXISTS crm_v3_contact_links (
 id uuid PRIMARY KEY,
 contact_id uuid NOT NULL REFERENCES crm_v3_contacts(id),
 target_id uuid REFERENCES crm_v3_targets(id),
 lead_id uuid REFERENCES crm_v3_leads(id),
 account_id uuid REFERENCES crm_v3_accounts(id),
 relation text NOT NULL DEFAULT 'Other' CHECK(length(relation)<=80),
 is_primary boolean NOT NULL DEFAULT false,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(target_id,lead_id,account_id)=1)
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_v3_contact_target_v16 ON crm_v3_contact_links(contact_id,target_id) WHERE target_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_v3_contact_lead_v16 ON crm_v3_contact_links(contact_id,lead_id) WHERE lead_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_v3_contact_account_v16 ON crm_v3_contact_links(contact_id,account_id) WHERE account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS crm_v3_activities (
 id uuid PRIMARY KEY,
 sequence_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 display_id text GENERATED ALWAYS AS ('ACT-'||lpad(sequence_no::text,GREATEST(6,length(sequence_no::text)),'0')) STORED UNIQUE,
 kind text NOT NULL CHECK(kind IN ('Call','Email','Meeting','Visit','MoM','Task','Note')),
 subject text NOT NULL CHECK(length(btrim(subject)) BETWEEN 1 AND 250),
 details text NOT NULL DEFAULT '' CHECK(length(details)<=5000),
 target_id uuid REFERENCES crm_v3_targets(id),
 lead_id uuid REFERENCES crm_v3_leads(id),
 account_id uuid REFERENCES crm_v3_accounts(id),
 contact_id uuid REFERENCES crm_v3_contacts(id),
 status text NOT NULL DEFAULT 'Planned' CHECK(status IN ('Planned','In Progress','Completed','Cancelled')),
 due_at timestamptz,
 completed_at timestamptz,
 assigned_user_id uuid REFERENCES users(id),
 owner_id uuid NOT NULL REFERENCES users(id),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 version int NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK(num_nonnulls(target_id,lead_id,account_id)=1)
);
CREATE INDEX IF NOT EXISTS crm_v3_activity_due_v16 ON crm_v3_activities(owner_id,status,due_at);

CREATE TABLE IF NOT EXISTS crm_v3_campaigns (
 id uuid PRIMARY KEY,
 sequence_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 display_id text GENERATED ALWAYS AS ('CMP-'||lpad(sequence_no::text,GREATEST(6,length(sequence_no::text)),'0')) STORED UNIQUE,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 business_line_id uuid NOT NULL REFERENCES business_lines(id),
 branch_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Pending Approval','Approved','Active','Paused','Completed','Cancelled')),
 purpose text NOT NULL DEFAULT 'Marketing' CHECK(purpose IN ('Marketing','Operational')),
 approved_by uuid REFERENCES users(id),
 approved_at timestamptz,
 owner_id uuid NOT NULL REFERENCES users(id),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 version int NOT NULL DEFAULT 1 CHECK(version>0),
 FOREIGN KEY(branch_id,business_line_id) REFERENCES branch_masters(id,business_line_id)
);
CREATE TABLE IF NOT EXISTS crm_v3_campaign_steps (
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES crm_v3_campaigns(id),
 step_number int NOT NULL CHECK(step_number>0 AND step_number<=100),
 kind text NOT NULL CHECK(kind IN ('Email','Call','Task')),
 wait_minutes int NOT NULL DEFAULT 0 CHECK(wait_minutes>=0),
 subject text NOT NULL DEFAULT '' CHECK(length(subject)<=250),
 content text NOT NULL DEFAULT '' CHECK(length(content)<=10000),
 UNIQUE(campaign_id,step_number)
);
CREATE TABLE IF NOT EXISTS crm_v3_campaign_recipients (
 campaign_id uuid NOT NULL REFERENCES crm_v3_campaigns(id),
 contact_id uuid NOT NULL REFERENCES crm_v3_contacts(id),
 status text NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Active','Paused','Completed','Unsubscribed','Bounced','Stopped')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(campaign_id,contact_id)
);
CREATE TABLE IF NOT EXISTS crm_v3_campaign_step_execution (
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL,
 contact_id uuid NOT NULL,
 step_id uuid NOT NULL REFERENCES crm_v3_campaign_steps(id),
 status text NOT NULL CHECK(status IN ('Claimed','Sent','Failed','Cancelled')),
 provider_message_id text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(campaign_id,contact_id) REFERENCES crm_v3_campaign_recipients(campaign_id,contact_id),
 UNIQUE(campaign_id,contact_id,step_id)
);
CREATE TABLE IF NOT EXISTS crm_v3_contact_suppression (
 id uuid PRIMARY KEY,
 contact_id uuid NOT NULL REFERENCES crm_v3_contacts(id),
 channel text NOT NULL CHECK(channel IN ('Email','WhatsApp','Phone')),
 purpose text NOT NULL CHECK(purpose IN ('Marketing','Operational')),
 blocked boolean NOT NULL DEFAULT true,
 reason text NOT NULL DEFAULT '',
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(contact_id,channel,purpose)
);
CREATE TABLE IF NOT EXISTS crm_v3_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 entity_kind text NOT NULL,
 entity_id uuid NOT NULL,
 action text NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),
 changes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(changes)='object'),
 reason text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_v3_events_lookup_v16 ON crm_v3_events(entity_kind,entity_id,id DESC);
CREATE OR REPLACE TRIGGER crm_v3_events_append_only_v16 BEFORE UPDATE OR DELETE ON crm_v3_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE OR REPLACE FUNCTION crm_v3_forbid_delete_v16() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'CRM operational history cannot be physically deleted' USING ERRCODE='23514'; END $$;
DO $tables$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['crm_v3_global_clients','crm_v3_targets','crm_v3_leads','crm_v3_crfs','crm_v3_accounts','crm_v3_contacts','crm_v3_activities','crm_v3_campaigns'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS forbid_delete_v16 ON %I',t);
  EXECUTE format('CREATE TRIGGER forbid_delete_v16 BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION crm_v3_forbid_delete_v16()',t);
 END LOOP;
END $tables$;

DO $grants$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='saicrm_runtime') THEN
  GRANT SELECT,INSERT,UPDATE ON crm_v3_global_clients,crm_v3_targets,crm_v3_leads,crm_v3_crfs,crm_v3_accounts,crm_v3_contacts,crm_v3_activities,crm_v3_campaigns,crm_v3_campaign_recipients,crm_v3_campaign_step_execution,crm_v3_contact_suppression TO saicrm_runtime;
  GRANT SELECT,INSERT ON crm_v3_contact_links,crm_v3_campaign_steps,crm_v3_events TO saicrm_runtime;
  GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO saicrm_runtime;
 END IF;
END $grants$;
INSERT INTO schema_migrations(version) VALUES(16) ON CONFLICT DO NOTHING;
COMMIT;
