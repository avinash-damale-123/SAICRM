BEGIN;
SET LOCAL search_path TO public, pg_catalog;
-- Yiron Analytics-Y1: isolated, read-only reporting mirror. Never link to operational CRM tables.
CREATE TABLE IF NOT EXISTS legacy_api_sources (
 id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{1,79}$'),
 display_name text NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 refresh_timezone text NOT NULL DEFAULT 'Asia/Kolkata',
 refresh_local_time time NOT NULL DEFAULT '03:00',
 retention_months integer NOT NULL DEFAULT 12 CHECK (retention_months BETWEEN 1 AND 120),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS legacy_refresh_jobs (
 id uuid PRIMARY KEY,
 source_id text NOT NULL REFERENCES legacy_api_sources(id),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','retry_wait','succeeded','failed','cancelled')),
 trigger_kind text NOT NULL CHECK(trigger_kind IN ('manual','scheduled','recovery')),
 requested_by uuid REFERENCES users(id),
 attempt integer NOT NULL DEFAULT 0 CHECK(attempt BETWEEN 0 AND 4),
 next_attempt_at timestamptz,
 lease_owner text,
 lease_until timestamptz,
 started_at timestamptz,
 finished_at timestamptz,
 fetched_count bigint NOT NULL DEFAULT 0 CHECK(fetched_count>=0),
 validated_count bigint NOT NULL DEFAULT 0 CHECK(validated_count>=0),
 error_code text,
 error_summary text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS legacy_refresh_one_active_job_v16 ON legacy_refresh_jobs(source_id) WHERE state IN ('queued','running','retry_wait');
CREATE INDEX IF NOT EXISTS legacy_refresh_jobs_monitor_v16 ON legacy_refresh_jobs(source_id,created_at DESC);
CREATE TABLE IF NOT EXISTS legacy_refresh_requests (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 job_id uuid NOT NULL REFERENCES legacy_refresh_jobs(id),
 trigger_kind text NOT NULL CHECK(trigger_kind IN ('manual','scheduled','recovery')),
 requested_by uuid REFERENCES users(id),
 requested_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS legacy_dataset_versions (
 id uuid PRIMARY KEY,
 source_id text NOT NULL REFERENCES legacy_api_sources(id),
 job_id uuid NOT NULL UNIQUE REFERENCES legacy_refresh_jobs(id),
 status text NOT NULL DEFAULT 'staging' CHECK(status IN ('staging','published','rejected','superseded')),
 record_count bigint NOT NULL DEFAULT 0 CHECK(record_count>=0),
 validated_at timestamptz,
 published_at timestamptz,
 rejection_reason text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS legacy_dataset_one_published_v16 ON legacy_dataset_versions(source_id) WHERE status='published';
CREATE TABLE IF NOT EXISTS legacy_source_records (
 dataset_version_id uuid NOT NULL REFERENCES legacy_dataset_versions(id),
 source_record_id text NOT NULL CHECK(length(source_record_id)>0),
 source_updated_at timestamptz,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 fetched_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(dataset_version_id,source_record_id)
);
CREATE INDEX IF NOT EXISTS legacy_source_records_source_updated_v16 ON legacy_source_records(dataset_version_id,source_updated_at DESC);
CREATE TABLE IF NOT EXISTS legacy_record_changes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source_id text NOT NULL REFERENCES legacy_api_sources(id),
 dataset_version_id uuid NOT NULL REFERENCES legacy_dataset_versions(id),
 source_record_id text NOT NULL,
 change_kind text NOT NULL CHECK(change_kind IN ('added','changed','removed')),
 old_hash text,
 new_hash text,
 observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS legacy_record_changes_lookup_v16 ON legacy_record_changes(source_id,source_record_id,observed_at DESC);
CREATE TABLE IF NOT EXISTS legacy_refresh_batches (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 job_id uuid NOT NULL REFERENCES legacy_refresh_jobs(id),
 page_from bigint NOT NULL CHECK(page_from>0),
 page_to bigint NOT NULL CHECK(page_to>=page_from),
 response_count bigint CHECK(response_count>=0),
 response_hash text,
 completed_at timestamptz,
 UNIQUE(job_id,page_from,page_to)
);
CREATE TABLE IF NOT EXISTS legacy_refresh_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 job_id uuid REFERENCES legacy_refresh_jobs(id),
 source_id text NOT NULL REFERENCES legacy_api_sources(id),
 actor_id uuid REFERENCES users(id),
 action text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(details)='object'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS legacy_refresh_audit_lookup_v16 ON legacy_refresh_audit(source_id,created_at DESC);
CREATE OR REPLACE TRIGGER legacy_refresh_audit_append_only_v16 BEFORE UPDATE OR DELETE ON legacy_refresh_audit FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
-- The migration deliberately does not grant browser-facing roles access.
-- Server-side application permission checks and controlled grants are required before enabling ingestion.
INSERT INTO legacy_api_sources(id,display_name,enabled) VALUES('branch_list_BI','Yiron Branches',false) ON CONFLICT(id) DO NOTHING;
-- Read/write access is limited to the existing service runtime role when present.
DO $grants$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='saicrm_runtime') THEN
  GRANT SELECT,INSERT,UPDATE ON legacy_api_sources,legacy_refresh_jobs,legacy_dataset_versions,legacy_source_records,legacy_record_changes,legacy_refresh_batches,legacy_refresh_requests,legacy_refresh_audit TO saicrm_runtime;
  GRANT USAGE,SELECT ON SEQUENCE legacy_refresh_requests_id_seq,legacy_record_changes_id_seq,legacy_refresh_batches_id_seq,legacy_refresh_audit_id_seq TO saicrm_runtime;
 END IF;
END $grants$;
INSERT INTO schema_migrations(version) VALUES(16) ON CONFLICT DO NOTHING;
COMMIT;
