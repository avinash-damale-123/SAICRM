BEGIN;
SET LOCAL search_path TO public, pg_catalog;

CREATE TABLE IF NOT EXISTS regions (
 id uuid PRIMARY KEY,
 sequence_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 display_id text GENERATED ALWAYS AS ('RN-' || lpad(sequence_no::text,GREATEST(3,length(sequence_no::text)),'0')) STORED UNIQUE,
 business_line_id uuid NOT NULL REFERENCES business_lines(id),
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 100 AND name=btrim(name)),
 code text NOT NULL CHECK(char_length(code) BETWEEN 1 AND 16 AND code ~ '^[A-Z0-9][A-Z0-9-]{0,15}$'),
 regional_manager text NOT NULL CHECK(char_length(regional_manager) BETWEEN 1 AND 100 AND regional_manager=btrim(regional_manager)),
 remarks text NOT NULL DEFAULT '' CHECK(char_length(remarks)<=1000),
 status text NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
 owner_id uuid NOT NULL REFERENCES users(id),
 created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 archived_at timestamptz,
 archived_by uuid REFERENCES users(id),
 deleted_at timestamptz,
 deleted_by uuid REFERENCES users(id),
 CHECK((archived_at IS NULL)=(archived_by IS NULL)),
 CHECK((deleted_at IS NULL)=(deleted_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS regions_business_line_name_unique_v9 ON regions(business_line_id,lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g')));
CREATE UNIQUE INDEX IF NOT EXISTS regions_code_unique_v9 ON regions(code);
CREATE INDEX IF NOT EXISTS regions_list_v9 ON regions(deleted_at,archived_at,status,business_line_id,lower(name),id);

CREATE TABLE IF NOT EXISTS region_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 region_id uuid NOT NULL REFERENCES regions(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL CHECK(action IN ('Created','Updated','Deactivated','Reactivated','Archived','Restored','Soft Deleted','Restored Deleted','Owner Reassigned','Business Line Changed')),
 changes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(changes)='object'),
 reason text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS region_events_record_v9 ON region_events(region_id,id);
DROP TRIGGER IF EXISTS region_events_append_only ON region_events;
CREATE TRIGGER region_events_append_only BEFORE UPDATE OR DELETE ON region_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

DO $runtime_access$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='saicrm_runtime') THEN
  GRANT SELECT, INSERT, UPDATE, DELETE ON regions TO saicrm_runtime;
  GRANT SELECT, INSERT ON region_events TO saicrm_runtime;
  GRANT USAGE, SELECT ON SEQUENCE regions_sequence_no_seq, region_events_id_seq TO saicrm_runtime;
 END IF;
END $runtime_access$;

INSERT INTO schema_migrations(version) VALUES(9) ON CONFLICT DO NOTHING;
COMMIT;
