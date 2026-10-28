BEGIN;
SET LOCAL search_path TO public, pg_catalog;

-- Branch Master is separate from the legacy generic records(module='branches').
-- Never migrate or overwrite those records implicitly.
CREATE TABLE IF NOT EXISTS branch_masters (
 id uuid PRIMARY KEY,
 sequence_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 display_id text GENERATED ALWAYS AS ('BR-' || lpad(sequence_no::text,GREATEST(3,length(sequence_no::text)),'0')) STORED UNIQUE,
 business_line_id uuid NOT NULL REFERENCES business_lines(id),
 region_id uuid NOT NULL REFERENCES regions(id),
 country_id uuid NOT NULL REFERENCES countries(id),
 code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{0,19}$'),
 name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 150 AND name=btrim(name)),
 full_name text NOT NULL DEFAULT '' CHECK(char_length(full_name)<=200),
 branch_type text NOT NULL DEFAULT '' CHECK(branch_type IN ('','Head Office','Regional Office','Branch Office','Support Office','Virtual Office')),
 city text NOT NULL CHECK(char_length(city) BETWEEN 1 AND 120 AND city=btrim(city)),
 state_province text NOT NULL DEFAULT '' CHECK(char_length(state_province)<=120),
 time_zone text NOT NULL CHECK(char_length(time_zone) BETWEEN 1 AND 80),
 address_line1 text NOT NULL DEFAULT '' CHECK(char_length(address_line1)<=250),
 address_line2 text NOT NULL DEFAULT '' CHECK(char_length(address_line2)<=250),
 landmark text NOT NULL DEFAULT '' CHECK(char_length(landmark)<=150),
 postal_code text NOT NULL DEFAULT '' CHECK(char_length(postal_code)<=30),
 phone_dial_code text NOT NULL DEFAULT '' CHECK(char_length(phone_dial_code)<=10),
 primary_contact text NOT NULL DEFAULT '' CHECK(char_length(primary_contact)<=40),
 alternate_contact text NOT NULL DEFAULT '' CHECK(char_length(alternate_contact)<=40),
 official_email text NOT NULL DEFAULT '' CHECK(char_length(official_email)<=254),
 website text NOT NULL DEFAULT '' CHECK(char_length(website)<=300),
 operational_start_date date,
 legacy_branch_code text NOT NULL DEFAULT '' CHECK(char_length(legacy_branch_code)<=80),
 branch_manager_id uuid REFERENCES users(id),
 remarks text NOT NULL DEFAULT '' CHECK(char_length(remarks)<=1000),
 owner_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 deactivated_at timestamptz,
 deactivated_by uuid REFERENCES users(id),
 archived_at timestamptz,
 archived_by uuid REFERENCES users(id),
 deleted_at timestamptz,
 deleted_by uuid REFERENCES users(id),
 CHECK((deactivated_at IS NULL)=(deactivated_by IS NULL)),
 CHECK((archived_at IS NULL)=(archived_by IS NULL)),
 CHECK((deleted_at IS NULL)=(deleted_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS branch_masters_code_unique_v10 ON branch_masters (upper(code));
CREATE UNIQUE INDEX IF NOT EXISTS branch_masters_name_unique_v10 ON branch_masters (
 business_line_id,country_id,lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g'))
);
CREATE INDEX IF NOT EXISTS branch_masters_list_v10 ON branch_masters(deleted_at,archived_at,status,business_line_id,lower(name),id);
CREATE INDEX IF NOT EXISTS branch_masters_region_v10 ON branch_masters(region_id,status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS branch_masters_country_v10 ON branch_masters(country_id,status) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS branch_master_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 branch_id uuid NOT NULL REFERENCES branch_masters(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL,
 changes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(changes)='object'),
 reason text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS branch_master_events_record_v10 ON branch_master_events(branch_id,id);
CREATE OR REPLACE TRIGGER branch_master_events_append_only BEFORE UPDATE OR DELETE ON branch_master_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

-- Validate actual Business Line / Region / Country presence at the database boundary.
-- Editing contact text on an older historical Branch must not require reactivating its parents.
CREATE OR REPLACE FUNCTION branch_masters_validate_mapping_v10() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.business_line_id IS DISTINCT FROM OLD.business_line_id
 OR NEW.region_id IS DISTINCT FROM OLD.region_id OR NEW.country_id IS DISTINCT FROM OLD.country_id
 OR (NEW.status='Active' AND (OLD.status IS DISTINCT FROM 'Active'
      OR OLD.deleted_at IS NOT NULL OR OLD.archived_at IS NOT NULL)) THEN
  IF NOT EXISTS(
   SELECT 1 FROM business_lines bl WHERE bl.id=NEW.business_line_id
    AND bl.status='Active' AND bl.archived_at IS NULL AND bl.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Selected Business Line is not Active' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(
   SELECT 1 FROM regions r WHERE r.id=NEW.region_id AND r.business_line_id=NEW.business_line_id
    AND r.status='Active' AND r.archived_at IS NULL AND r.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Region must be Active and belong to the selected Business Line' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(
   SELECT 1 FROM countries c JOIN country_business_lines cbl ON cbl.country_id=c.id
    WHERE c.id=NEW.country_id AND c.status='Active' AND c.archived_at IS NULL AND c.deleted_at IS NULL
    AND cbl.business_line_id=NEW.business_line_id AND cbl.removed_at IS NULL
  ) THEN RAISE EXCEPTION 'Country must be Active and present for the selected Business Line' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER branch_masters_validate_mapping BEFORE INSERT OR UPDATE ON branch_masters
FOR EACH ROW EXECUTE FUNCTION branch_masters_validate_mapping_v10();

CREATE OR REPLACE FUNCTION prevent_active_branch_dependency_v10() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='country_business_lines' THEN
  IF NEW.removed_at IS NOT NULL AND OLD.removed_at IS NULL AND EXISTS(
   SELECT 1 FROM branch_masters b
    WHERE b.country_id=NEW.country_id AND b.business_line_id=NEW.business_line_id
    AND b.status='Active' AND b.archived_at IS NULL AND b.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Country presence is used by Active Branches' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='regions' THEN
  IF (NEW.business_line_id IS DISTINCT FROM OLD.business_line_id OR NEW.status IS DISTINCT FROM 'Active'
   OR NEW.archived_at IS NOT NULL OR NEW.deleted_at IS NOT NULL)
   AND EXISTS(SELECT 1 FROM branch_masters b WHERE b.region_id=OLD.id AND b.status='Active' AND b.archived_at IS NULL AND b.deleted_at IS NULL)
  THEN RAISE EXCEPTION 'Region is used by Active Branches' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='countries' THEN
  IF (NEW.status IS DISTINCT FROM 'Active' OR NEW.archived_at IS NOT NULL OR NEW.deleted_at IS NOT NULL)
   AND EXISTS(SELECT 1 FROM branch_masters b WHERE b.country_id=OLD.id AND b.status='Active' AND b.archived_at IS NULL AND b.deleted_at IS NULL)
  THEN RAISE EXCEPTION 'Country is used by Active Branches' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='business_lines' THEN
  IF (NEW.status IS DISTINCT FROM 'Active' OR NEW.archived_at IS NOT NULL OR NEW.deleted_at IS NOT NULL)
   AND EXISTS(SELECT 1 FROM branch_masters b WHERE b.business_line_id=OLD.id AND b.status='Active' AND b.archived_at IS NULL AND b.deleted_at IS NULL)
  THEN RAISE EXCEPTION 'Business Line is used by Active Branches' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER active_branch_presence_guard BEFORE UPDATE ON country_business_lines
 FOR EACH ROW EXECUTE FUNCTION prevent_active_branch_dependency_v10();
CREATE OR REPLACE TRIGGER active_branch_region_guard BEFORE UPDATE ON regions
 FOR EACH ROW EXECUTE FUNCTION prevent_active_branch_dependency_v10();
CREATE OR REPLACE TRIGGER active_branch_country_guard BEFORE UPDATE ON countries
 FOR EACH ROW EXECUTE FUNCTION prevent_active_branch_dependency_v10();
CREATE OR REPLACE TRIGGER active_branch_business_line_guard BEFORE UPDATE ON business_lines
 FOR EACH ROW EXECUTE FUNCTION prevent_active_branch_dependency_v10();

DO $runtime_access$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='saicrm_runtime') THEN
  GRANT SELECT, INSERT, UPDATE, DELETE ON branch_masters TO saicrm_runtime;
  GRANT SELECT, INSERT ON branch_master_events TO saicrm_runtime;
  GRANT USAGE, SELECT ON SEQUENCE branch_masters_sequence_no_seq, branch_master_events_id_seq TO saicrm_runtime;
 END IF;
END $runtime_access$;
INSERT INTO schema_migrations(version) VALUES(10) ON CONFLICT DO NOTHING;
COMMIT;
