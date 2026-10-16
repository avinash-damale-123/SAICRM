BEGIN;
SET LOCAL search_path TO public, pg_catalog;
CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY);
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL,
 password_hash text NOT NULL, email_verified boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
 role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','manager','member','viewer')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_scopes (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 branch text NOT NULL CHECK(branch ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'),
 line text NOT NULL CHECK(line IN ('STTS','CAR','T3','GSA')),
 PRIMARY KEY(user_id,branch,line)
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS challenges (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('verify','reset')), digest text NOT NULL,
 expires_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,kind)
);
CREATE TABLE IF NOT EXISTS rate_limits (
 key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS records (
 id uuid PRIMARY KEY,
 module text NOT NULL CHECK(module IN ('leads','customers','contacts','opportunities','activities','quotes','bookings','employees','branches')),
 scope_branch text NOT NULL, scope_line text NOT NULL,
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
 version integer NOT NULL DEFAULT 1, created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(module IN ('employees','branches') OR (scope_branch ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$' AND scope_line IN ('STTS','CAR','T3','GSA')))
);
CREATE INDEX IF NOT EXISTS records_module ON records(module,id);
CREATE INDEX IF NOT EXISTS records_scope ON records(module,scope_branch,scope_line,id);
CREATE TABLE IF NOT EXISTS audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor uuid REFERENCES users(id), action text NOT NULL, module text NOT NULL,
 record_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
-- Escaped semicolons keep this body intact in statement-splitting migration clients.
CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS E'BEGIN RAISE EXCEPTION ''Audit entries are append-only''\073 END\073';
DROP TRIGGER IF EXISTS audit_append_only ON audit;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
INSERT INTO schema_migrations(version) VALUES (1) ON CONFLICT DO NOTHING;
COMMIT;
