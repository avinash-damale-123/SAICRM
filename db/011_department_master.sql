BEGIN;
SET LOCAL search_path TO public, pg_catalog;

-- Separate Central/Branch catalogs; no legacy employee or Branch records are overwritten.
-- Independent per-level counters ensure DP-001, SD-001 and TM-001 each start at 001.
CREATE SEQUENCE IF NOT EXISTS department_sequence_department_v11;
CREATE SEQUENCE IF NOT EXISTS department_sequence_sub_v11;
CREATE SEQUENCE IF NOT EXISTS department_sequence_team_v11;
CREATE TABLE IF NOT EXISTS department_units (
  id uuid PRIMARY KEY,
  sequence_no bigint NOT NULL,
  scope text NOT NULL CHECK (scope IN ('Central','Branch')),
  level text NOT NULL CHECK (level IN ('Department','Sub-Department','Team')),
  display_id text GENERATED ALWAYS AS (
    (CASE level WHEN 'Department' THEN 'DP-' WHEN 'Sub-Department' THEN 'SD-' ELSE 'TM-' END)
     || lpad(sequence_no::text,GREATEST(3,length(sequence_no::text)),'0')) STORED UNIQUE,
  parent_id uuid REFERENCES department_units(id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 150 AND name=btrim(name)),
  code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{1,29}$'),
  description text NOT NULL DEFAULT '' CHECK (char_length(description)<=1000),
  sort_order integer NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 1 AND 999999),
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  archived_at timestamptz,
  deleted_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  CHECK ((level='Department')=(parent_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS dept_unit_code_uq_v11 ON department_units(scope,upper(code));
CREATE UNIQUE INDEX IF NOT EXISTS dept_unit_name_uq_v11 ON department_units(
 scope,level,COALESCE(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),
 lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g'))
);
CREATE INDEX IF NOT EXISTS dept_units_tree_v11 ON department_units(scope,parent_id,status,sort_order);

CREATE OR REPLACE FUNCTION assign_department_sequence_v11() RETURNS trigger LANGUAGE plpgsql AS $
BEGIN
 IF NEW.sequence_no IS NOT NULL THEN
  RAISE EXCEPTION 'Department sequence is system-generated' USING ERRCODE='23514';
 END IF;
 IF NEW.level='Department' THEN NEW.sequence_no:=nextval('department_sequence_department_v11');
 ELSIF NEW.level='Sub-Department' THEN NEW.sequence_no:=nextval('department_sequence_sub_v11');
 ELSIF NEW.level='Team' THEN NEW.sequence_no:=nextval('department_sequence_team_v11');
 ELSE RAISE EXCEPTION 'Invalid Department level' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $;
CREATE OR REPLACE TRIGGER assign_department_sequence_before_v11
 BEFORE INSERT ON department_units FOR EACH ROW EXECUTE FUNCTION assign_department_sequence_v11();


CREATE TABLE IF NOT EXISTS department_branch_assignments (
 id uuid PRIMARY KEY,
 unit_id uuid NOT NULL REFERENCES department_units(id),
 branch_id uuid NOT NULL REFERENCES branch_masters(id),
 status text NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
 created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 UNIQUE(unit_id,branch_id)
);
CREATE INDEX IF NOT EXISTS dept_assignment_branch_v11 ON department_branch_assignments(branch_id,status,unit_id);
CREATE INDEX IF NOT EXISTS dept_assignment_unit_v11 ON department_branch_assignments(unit_id,status);

CREATE TABLE IF NOT EXISTS department_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 unit_id uuid REFERENCES department_units(id),
 assignment_id uuid REFERENCES department_branch_assignments(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL,
 changes jsonb NOT NULL DEFAULT '{}'::jsonb,
 reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((unit_id IS NULL)<>(assignment_id IS NULL))
);
CREATE INDEX IF NOT EXISTS dept_event_unit_v11 ON department_events(unit_id,id);
CREATE INDEX IF NOT EXISTS dept_event_assignment_v11 ON department_events(assignment_id,id);
CREATE OR REPLACE TRIGGER department_events_append_only_v11
 BEFORE UPDATE OR DELETE ON department_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE OR REPLACE FUNCTION validate_department_unit_v11() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p record;
BEGIN
 IF NEW.level='Department' THEN
  IF NEW.parent_id IS NOT NULL THEN RAISE EXCEPTION 'Department must not have a parent' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.parent_id IS NULL THEN RAISE EXCEPTION 'Select a parent Department or Sub-Department' USING ERRCODE='23514'; END IF;
  SELECT scope,level,status,archived_at,deleted_at INTO p FROM department_units WHERE id=NEW.parent_id;
  IF NOT FOUND OR p.scope<>NEW.scope
   OR (NEW.level='Sub-Department' AND p.level<>'Department')
   OR (NEW.level='Team' AND p.level NOT IN ('Department','Sub-Department'))
   THEN RAISE EXCEPTION 'Choose a valid parent within the same Central/Branch catalog' USING ERRCODE='23514'; END IF;
  IF NEW.status='Active' AND NEW.archived_at IS NULL AND NEW.deleted_at IS NULL
    AND (p.status<>'Active' OR p.archived_at IS NOT NULL OR p.deleted_at IS NOT NULL)
   THEN RAISE EXCEPTION 'Activate the parent unit first' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.status='Inactive' OR NEW.archived_at IS NOT NULL OR NEW.deleted_at IS NOT NULL)
     AND OLD.status='Active' AND OLD.archived_at IS NULL AND OLD.deleted_at IS NULL THEN
   IF EXISTS(SELECT 1 FROM department_units c WHERE c.parent_id=OLD.id AND c.status='Active' AND c.archived_at IS NULL AND c.deleted_at IS NULL)
      THEN RAISE EXCEPTION 'Active child units must be inactivated first' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM department_branch_assignments a WHERE a.unit_id=OLD.id AND a.status='Active')
      THEN RAISE EXCEPTION 'Active Branch assignments must be inactivated first' USING ERRCODE='23514'; END IF;
  END IF;
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM department_units c WHERE c.parent_id=OLD.id)
      OR EXISTS(SELECT 1 FROM department_branch_assignments a WHERE a.unit_id=OLD.id)
      THEN RAISE EXCEPTION 'Historical child units or Branch assignments prevent deletion' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER validate_department_unit_before_v11 BEFORE INSERT OR UPDATE ON department_units
 FOR EACH ROW EXECUTE FUNCTION validate_department_unit_v11();

CREATE OR REPLACE FUNCTION validate_department_branch_assignment_v11() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE unit record; branch record; parent_state text;
BEGIN
 SELECT scope,status,archived_at,deleted_at,parent_id INTO unit FROM department_units WHERE id=NEW.unit_id;
 IF NOT FOUND OR unit.scope<>'Branch' THEN RAISE EXCEPTION 'Branch assignment requires a Branch Department unit' USING ERRCODE='23514'; END IF;
 SELECT status,archived_at,deleted_at INTO branch FROM branch_masters WHERE id=NEW.branch_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown Branch' USING ERRCODE='23514'; END IF;
 IF NEW.status='Active' THEN
  IF unit.status<>'Active' OR unit.archived_at IS NOT NULL OR unit.deleted_at IS NOT NULL
   THEN RAISE EXCEPTION 'Activate the Department unit first' USING ERRCODE='23514'; END IF;
  IF branch.status<>'Active' OR branch.archived_at IS NOT NULL OR branch.deleted_at IS NOT NULL
   THEN RAISE EXCEPTION 'Choose an Active Branch' USING ERRCODE='23514'; END IF;
  IF unit.parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM department_branch_assignments pa
     WHERE pa.branch_id=NEW.branch_id AND pa.unit_id=unit.parent_id AND pa.status='Active')
   THEN RAISE EXCEPTION 'Activate the parent unit for this Branch first' USING ERRCODE='23514'; END IF;
 ELSE
  IF TG_OP='UPDATE' AND OLD.status='Active'
   AND EXISTS(SELECT 1 FROM department_branch_assignments ch
      JOIN department_units c ON c.id=ch.unit_id
      WHERE c.parent_id=NEW.unit_id AND ch.branch_id=NEW.branch_id AND ch.status='Active')
   THEN RAISE EXCEPTION 'Inactivate child Branch assignments first' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER validate_department_branch_assignment_before_v11
 BEFORE INSERT OR UPDATE ON department_branch_assignments
 FOR EACH ROW EXECUTE FUNCTION validate_department_branch_assignment_v11();

CREATE OR REPLACE FUNCTION protect_branch_department_assignments_v11() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.status IS DISTINCT FROM 'Active' OR NEW.archived_at IS NOT NULL OR NEW.deleted_at IS NOT NULL)
    AND EXISTS(SELECT 1 FROM department_branch_assignments a WHERE a.branch_id=OLD.id AND a.status='Active')
  THEN RAISE EXCEPTION 'Branch has Active Department assignments; inactivate them first' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER protect_branch_department_assignments_before_v11
 BEFORE UPDATE ON branch_masters FOR EACH ROW EXECUTE FUNCTION protect_branch_department_assignments_v11();

DO $grants$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='saicrm_runtime') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON department_units,department_branch_assignments TO saicrm_runtime;
  GRANT SELECT,INSERT ON department_events TO saicrm_runtime;
  GRANT USAGE,SELECT ON SEQUENCE department_sequence_department_v11,department_sequence_sub_v11,department_sequence_team_v11,department_events_id_seq TO saicrm_runtime;
 END IF;
END $grants$;
INSERT INTO schema_migrations(version) VALUES(11) ON CONFLICT DO NOTHING;
COMMIT;