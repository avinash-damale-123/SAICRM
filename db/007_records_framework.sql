BEGIN;
SET LOCAL search_path TO public, pg_catalog;
CREATE TABLE IF NOT EXISTS crm_column_policy (
 module_key text PRIMARY KEY, version integer NOT NULL DEFAULT 0 CHECK(version>=0),
 published_version integer NOT NULL DEFAULT 0, config jsonb, draft jsonb, updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE crm_column_policy ADD COLUMN IF NOT EXISTS published_version integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS crm_user_preferences (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, module_key text NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), data jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,module_key)
);
CREATE TABLE IF NOT EXISTS crm_configuration_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, module_key text NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), action text NOT NULL, previous jsonb, current jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS crm_transfer_jobs (
 id uuid PRIMARY KEY, module_key text NOT NULL, user_id uuid NOT NULL REFERENCES users(id),
 kind text NOT NULL CHECK(kind IN ('import','export','bulk')),
 status text NOT NULL CHECK(status IN ('uploaded','validated','queued','running','completed','partial','failed','cancelled')),
 fingerprint text, filename text, request jsonb NOT NULL DEFAULT '{}', state jsonb NOT NULL DEFAULT '{}',
 total integer NOT NULL DEFAULT 0 CHECK(total>=0), succeeded integer NOT NULL DEFAULT 0 CHECK(succeeded>=0),
 failed integer NOT NULL DEFAULT 0 CHECK(failed>=0), skipped integer NOT NULL DEFAULT 0 CHECK(skipped>=0),
 error text, lease_until timestamptz, lease_token uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours'
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_transfer_fingerprint ON crm_transfer_jobs(user_id,module_key,kind,fingerprint) WHERE fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_transfer_owner_history ON crm_transfer_jobs(user_id,module_key,created_at DESC);
CREATE INDEX IF NOT EXISTS crm_transfer_pending ON crm_transfer_jobs(status,lease_until) WHERE status IN ('queued','running');
CREATE TABLE IF NOT EXISTS crm_transfer_items (
 job_id uuid NOT NULL REFERENCES crm_transfer_jobs(id) ON DELETE CASCADE, ordinal integer NOT NULL,
 record_id uuid, expected_version integer, payload jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','succeeded','failed','skipped')),
 error text, PRIMARY KEY(job_id,ordinal)
);
CREATE INDEX IF NOT EXISTS crm_transfer_item_queue ON crm_transfer_items(job_id,status,ordinal);
CREATE TABLE IF NOT EXISTS crm_transfer_files (
 job_id uuid NOT NULL REFERENCES crm_transfer_jobs(id) ON DELETE CASCADE, part integer NOT NULL,
 filename text NOT NULL, mime text NOT NULL, bytes bytea NOT NULL CHECK(octet_length(bytes)<=2500000),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(job_id,part)
);
INSERT INTO schema_migrations(version) VALUES(7) ON CONFLICT DO NOTHING;
COMMIT;
