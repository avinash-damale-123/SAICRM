BEGIN;
SET LOCAL search_path TO public, pg_catalog;

CREATE TABLE IF NOT EXISTS countries (
 id uuid PRIMARY KEY,
 sequence_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 display_id text GENERATED ALWAYS AS ('CN-' || lpad(sequence_no::text,GREATEST(3,length(sequence_no::text)),'0')) STORED UNIQUE,
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 150 AND name=btrim(name)),
 code text NOT NULL CHECK(code ~ '^[A-Z]{2}$'),
 iso3 text NOT NULL CHECK(iso3 ~ '^[A-Z]{3}$'),
 iso_numeric text NOT NULL CHECK(iso_numeric ~ '^[0-9]{3}$'),
 dialing_code text NOT NULL CHECK(dialing_code ~ '^\+[0-9]{1,15}$'),
 default_currency text NOT NULL CHECK(char_length(default_currency) BETWEEN 1 AND 40),
 nationality text NOT NULL CHECK(char_length(nationality) BETWEEN 1 AND 150),
 continent text NOT NULL CHECK(continent IN ('Africa','Asia','Europe','North America','South America','Oceania','Antarctica')),
 alias text NOT NULL DEFAULT '' CHECK(char_length(alias)<=150),
 description text NOT NULL DEFAULT '' CHECK(char_length(description)<=500),
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
CREATE UNIQUE INDEX IF NOT EXISTS countries_name_unique_v8 ON countries(lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g')));
CREATE UNIQUE INDEX IF NOT EXISTS countries_code_unique_v8 ON countries(code);
CREATE UNIQUE INDEX IF NOT EXISTS countries_iso3_unique_v8 ON countries(iso3);
CREATE UNIQUE INDEX IF NOT EXISTS countries_iso_numeric_unique_v8 ON countries(iso_numeric);
CREATE INDEX IF NOT EXISTS countries_list_v8 ON countries(deleted_at,archived_at,status,lower(name),id);

CREATE TABLE IF NOT EXISTS country_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 country_id uuid NOT NULL REFERENCES countries(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL CHECK(action IN ('Created','Updated','Deactivated','Reactivated','Archived','Restored','Soft Deleted','Restored Deleted','Business Line Presence Added','Business Line Presence Removed')),
 changes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(changes)='object'),
 reason text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS country_events_record_v8 ON country_events(country_id,id);
DROP TRIGGER IF EXISTS country_events_append_only ON country_events;
CREATE TRIGGER country_events_append_only BEFORE UPDATE OR DELETE ON country_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE TABLE IF NOT EXISTS country_business_lines (
 country_id uuid NOT NULL REFERENCES countries(id),
 business_line_id uuid NOT NULL REFERENCES business_lines(id),
 added_by uuid NOT NULL REFERENCES users(id),
 added_at timestamptz NOT NULL DEFAULT now(),
 removed_by uuid REFERENCES users(id),
 removed_at timestamptz,
 PRIMARY KEY(country_id,business_line_id),
 CHECK((removed_at IS NULL)=(removed_by IS NULL))
);
CREATE INDEX IF NOT EXISTS country_business_lines_current_v8 ON country_business_lines(country_id,business_line_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS country_business_lines_line_v8 ON country_business_lines(business_line_id,country_id) WHERE removed_at IS NULL;

-- Immutable relationship event ledger: survives removal and subsequent re-addition.
CREATE TABLE IF NOT EXISTS country_business_line_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 country_id uuid NOT NULL REFERENCES countries(id),
 business_line_id uuid NOT NULL REFERENCES business_lines(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL CHECK(action IN ('Added','Removed')),
 previous jsonb NOT NULL DEFAULT '{}'::jsonb,
 current jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS country_business_line_events_record_v8 ON country_business_line_events(country_id,id);
DROP TRIGGER IF EXISTS country_business_line_events_append_only ON country_business_line_events;
CREATE TRIGGER country_business_line_events_append_only BEFORE UPDATE OR DELETE ON country_business_line_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();


-- Country Master intentionally starts empty. Records may be created or imported later.

DO $runtime_access$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='saicrm_runtime') THEN
  GRANT SELECT, INSERT, UPDATE, DELETE ON countries, country_business_lines TO saicrm_runtime;
  GRANT SELECT, INSERT ON country_events, country_business_line_events TO saicrm_runtime;
  GRANT USAGE, SELECT ON SEQUENCE countries_sequence_no_seq, country_events_id_seq, country_business_line_events_id_seq TO saicrm_runtime;
 END IF;
END $runtime_access$;

INSERT INTO schema_migrations(version) VALUES(8) ON CONFLICT DO NOTHING;
COMMIT;