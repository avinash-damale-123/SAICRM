BEGIN;
SET LOCAL search_path TO public, pg_catalog;
ALTER TABLE users ADD COLUMN IF NOT EXISTS system_role text NOT NULL DEFAULT 'user' CHECK(system_role IN ('user','super_admin'));
CREATE TABLE IF NOT EXISTS business_lines (
 id uuid PRIMARY KEY,
 sequence_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 display_id text GENERATED ALWAYS AS ('BL-' || lpad(sequence_no::text,GREATEST(3,length(sequence_no::text)),'0')) STORED UNIQUE,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120 AND name=btrim(name)),
 status text NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
 owner_id uuid NOT NULL REFERENCES users(id),
 remarks text NOT NULL DEFAULT '' CHECK(length(remarks)<=255),
 created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 archived_at timestamptz,
 archived_by uuid REFERENCES users(id),
 CHECK((archived_at IS NULL)=(archived_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS business_lines_name_unique ON business_lines(lower(name));
CREATE INDEX IF NOT EXISTS business_lines_list ON business_lines(archived_at,status,lower(name),id);
CREATE TABLE IF NOT EXISTS business_line_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 business_line_id uuid NOT NULL REFERENCES business_lines(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL CHECK(action IN ('Created','Updated','Archived','Restored')),
 changes jsonb NOT NULL CHECK(jsonb_typeof(changes)='object'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_line_events_record ON business_line_events(business_line_id,id);
CREATE OR REPLACE TRIGGER business_line_events_append_only BEFORE UPDATE OR DELETE ON business_line_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
INSERT INTO schema_migrations(version) VALUES(3) ON CONFLICT DO NOTHING;
COMMIT;
