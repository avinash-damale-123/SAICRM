BEGIN;
SET LOCAL search_path TO public, pg_catalog;
CREATE SEQUENCE IF NOT EXISTS module_master_display_seq_v14;
CREATE TABLE IF NOT EXISTS module_master_resources (
 id uuid PRIMARY KEY,
 sequence_no bigint NOT NULL UNIQUE,
 display_id text GENERATED ALWAYS AS ('RES-'||lpad(sequence_no::text,GREATEST(6,length(sequence_no::text)),'0')) STORED UNIQUE,
 resource_key text NOT NULL UNIQUE CHECK(resource_key ~ '^[A-Z][A-Z0-9_]{1,79}$'),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 150),
 resource_type text NOT NULL CHECK(resource_type IN ('MODULE','PAGE','FUNCTION')),
 section text NOT NULL CHECK(length(section) BETWEEN 1 AND 100),
 category text NOT NULL DEFAULT '',
 route text NOT NULL DEFAULT '',
 description text NOT NULL DEFAULT '',
 system_locked boolean NOT NULL DEFAULT false,
 essential boolean NOT NULL DEFAULT false,
 common_resource boolean NOT NULL DEFAULT false,
 admin_allowed boolean NOT NULL DEFAULT false,
 manager_allowed boolean NOT NULL DEFAULT false,
 standard_allowed boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
 registered_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES users(id),
 updated_by uuid REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK(NOT essential OR (system_locked AND common_resource AND status='Active'))
);
CREATE INDEX IF NOT EXISTS module_master_status_v14 ON module_master_resources(status,resource_type,section,updated_at DESC);
CREATE TABLE IF NOT EXISTS module_master_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 resource_id uuid NOT NULL REFERENCES module_master_resources(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL,
 changes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(changes)='object'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS module_master_events_resource_v14 ON module_master_events(resource_id,id);
CREATE OR REPLACE TRIGGER module_master_events_append_only_v14 BEFORE UPDATE OR DELETE ON module_master_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE OR REPLACE FUNCTION module_master_guard_v14() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.sequence_no IS NOT NULL THEN RAISE EXCEPTION 'Resource ID is system generated' USING ERRCODE='23514'; END IF;
  NEW.sequence_no:=nextval('module_master_display_seq_v14');
 ELSIF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.resource_key IS DISTINCT FROM OLD.resource_key OR NEW.sequence_no IS DISTINCT FROM OLD.sequence_no OR
    NEW.resource_type IS DISTINCT FROM OLD.resource_type OR NEW.essential IS DISTINCT FROM OLD.essential OR NEW.system_locked IS DISTINCT FROM OLD.system_locked THEN
   RAISE EXCEPTION 'Registered resource identity and system policy are immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.essential AND (NEW.status<>'Active' OR NOT NEW.common_resource) THEN
   RAISE EXCEPTION 'Essential resources cannot be disabled' USING ERRCODE='23514';
  END IF;
  NEW.version:=OLD.version+1;
  NEW.updated_at:=now();
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER module_master_guard_before_v14 BEFORE INSERT OR UPDATE ON module_master_resources FOR EACH ROW EXECUTE FUNCTION module_master_guard_v14();
CREATE OR REPLACE FUNCTION module_master_no_delete_v14() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Module Master retains audit history; physically deleting resources is prohibited' USING ERRCODE='23514'; END $$;
CREATE OR REPLACE TRIGGER module_master_no_delete_before_v14 BEFORE DELETE ON module_master_resources FOR EACH ROW EXECUTE FUNCTION module_master_no_delete_v14();
DO $grant$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='saicrm_runtime') THEN
  GRANT SELECT,INSERT,UPDATE ON module_master_resources TO saicrm_runtime;
  GRANT SELECT,INSERT ON module_master_events TO saicrm_runtime;
  GRANT USAGE,SELECT ON SEQUENCE module_master_display_seq_v14,module_master_events_id_seq TO saicrm_runtime;
 END IF;
END $grant$;
INSERT INTO schema_migrations(version) VALUES(14) ON CONFLICT DO NOTHING;
COMMIT;
