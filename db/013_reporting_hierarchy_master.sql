BEGIN;
SET LOCAL search_path TO public, pg_catalog;

-- Hierarchy rules configure permitted role-to-role reporting, never user access.
CREATE SEQUENCE IF NOT EXISTS reporting_hierarchy_sequence_v13;
CREATE TABLE IF NOT EXISTS reporting_hierarchy_rules (
  id uuid PRIMARY KEY,
  sequence_no bigint NOT NULL UNIQUE,
  display_id text GENERATED ALWAYS AS ('HR-' || lpad(sequence_no::text,GREATEST(3,length(sequence_no::text)),'0')) STORED UNIQUE,
  hierarchy_type text NOT NULL CHECK(hierarchy_type IN ('Administrative','Functional')),
  applicability text NOT NULL CHECK(applicability IN ('Central','Branch')),
  scope_level text NOT NULL CHECK(scope_level IN ('Global','Business Line','Region','Branch','Department')),
  scope_id uuid,
  parent_role_id uuid NOT NULL REFERENCES organizational_roles(id),
  child_role_id uuid NOT NULL REFERENCES organizational_roles(id),
  description text NOT NULL DEFAULT '' CHECK(char_length(description)<=1000),
  sort_order integer NOT NULL DEFAULT 100 CHECK(sort_order BETWEEN 1 AND 999999),
  status text NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
  archived_at timestamptz,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(parent_role_id<>child_role_id),
  CHECK((scope_level='Global')=(scope_id IS NULL)),
  CHECK(deleted_at IS NULL OR archived_at IS NOT NULL),
  CHECK((scope_level NOT IN ('Region','Branch')) OR applicability='Branch')
);
CREATE UNIQUE INDEX IF NOT EXISTS reporting_hierarchy_exact_unique_v13
 ON reporting_hierarchy_rules(hierarchy_type,applicability,scope_level,
 COALESCE(scope_id,'00000000-0000-0000-0000-000000000000'::uuid),parent_role_id,child_role_id);
CREATE UNIQUE INDEX IF NOT EXISTS reporting_hierarchy_admin_parent_active_v13
 ON reporting_hierarchy_rules(applicability,scope_level,
 COALESCE(scope_id,'00000000-0000-0000-0000-000000000000'::uuid),child_role_id)
 WHERE hierarchy_type='Administrative' AND status='Active' AND archived_at IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS reporting_hierarchy_list_v13
 ON reporting_hierarchy_rules(hierarchy_type,applicability,scope_level,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS reporting_hierarchy_parent_v13
 ON reporting_hierarchy_rules(parent_role_id,child_role_id,status);

CREATE TABLE IF NOT EXISTS reporting_hierarchy_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_id uuid NOT NULL REFERENCES reporting_hierarchy_rules(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(changes)='object'),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reporting_hierarchy_events_rule_v13 ON reporting_hierarchy_events(rule_id,id);
CREATE OR REPLACE TRIGGER reporting_hierarchy_events_append_only_v13
 BEFORE UPDATE OR DELETE ON reporting_hierarchy_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE OR REPLACE FUNCTION validate_reporting_hierarchy_v13() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 p organizational_roles%ROWTYPE;
 c organizational_roles%ROWTYPE;
 scope_status text;
 scope_archived timestamptz;
 scope_deleted timestamptz;
 scope_kind text;
 cycle_exists boolean;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.sequence_no IS NOT NULL THEN
   RAISE EXCEPTION 'Hierarchy display sequence is system-generated' USING ERRCODE='23514';
  END IF;
  NEW.sequence_no:=nextval('reporting_hierarchy_sequence_v13');
 ELSE
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.sequence_no IS DISTINCT FROM OLD.sequence_no OR
   NEW.hierarchy_type IS DISTINCT FROM OLD.hierarchy_type OR NEW.applicability IS DISTINCT FROM OLD.applicability OR
   NEW.scope_level IS DISTINCT FROM OLD.scope_level OR NEW.scope_id IS DISTINCT FROM OLD.scope_id OR
   NEW.parent_role_id IS DISTINCT FROM OLD.parent_role_id OR NEW.child_role_id IS DISTINCT FROM OLD.child_role_id THEN
   RAISE EXCEPTION 'Reporting structure identity is immutable; inactivate and create a new rule' USING ERRCODE='23514';
  END IF;
  NEW.version:=OLD.version+1;
  NEW.updated_at:=now();
 END IF;
 IF NEW.status='Active' AND NEW.archived_at IS NULL AND NEW.deleted_at IS NULL THEN
  SELECT * INTO p FROM organizational_roles WHERE id=NEW.parent_role_id;
  SELECT * INTO c FROM organizational_roles WHERE id=NEW.child_role_id;
  IF p.id IS NULL OR c.id IS NULL OR
   p.status<>'Active' OR p.archived_at IS NOT NULL OR p.deleted_at IS NOT NULL OR
   c.status<>'Active' OR c.archived_at IS NOT NULL OR c.deleted_at IS NOT NULL OR
   (p.applicability<>NEW.applicability AND p.applicability<>'Both') OR
   (c.applicability<>NEW.applicability AND c.applicability<>'Both') THEN
   RAISE EXCEPTION 'Both roles must be Active and compatible with this hierarchy context' USING ERRCODE='23514';
  END IF;
  IF NEW.scope_level='Business Line' THEN
   SELECT status,archived_at,NULL::timestamptz INTO scope_status,scope_archived,scope_deleted FROM business_lines WHERE id=NEW.scope_id;
  ELSIF NEW.scope_level='Region' THEN
   SELECT status,archived_at,deleted_at INTO scope_status,scope_archived,scope_deleted FROM regions WHERE id=NEW.scope_id;
  ELSIF NEW.scope_level='Branch' THEN
   SELECT status,archived_at,deleted_at INTO scope_status,scope_archived,scope_deleted FROM branch_masters WHERE id=NEW.scope_id;
  ELSIF NEW.scope_level='Department' THEN
   SELECT status,archived_at,deleted_at,scope INTO scope_status,scope_archived,scope_deleted,scope_kind FROM department_units WHERE id=NEW.scope_id;
   IF scope_kind<>NEW.applicability THEN
    RAISE EXCEPTION 'Department scope must match hierarchy applicability' USING ERRCODE='23514';
   END IF;
  END IF;
  IF NEW.scope_level<>'Global' AND
   (scope_status IS NULL OR scope_status<>'Active' OR scope_archived IS NOT NULL OR scope_deleted IS NOT NULL) THEN
   RAISE EXCEPTION 'Hierarchy scope record must exist and be Active' USING ERRCODE='23514';
  END IF;
  -- A rule cannot complete a directed reporting loop within its exact scope.
  WITH RECURSIVE descendants(role_id,visited) AS (
   SELECT NEW.child_role_id,ARRAY[NEW.child_role_id]
   UNION ALL
   SELECT h.child_role_id,d.visited||h.child_role_id
   FROM descendants d
   JOIN reporting_hierarchy_rules h ON h.parent_role_id=d.role_id
   WHERE h.id<>NEW.id AND h.hierarchy_type=NEW.hierarchy_type AND h.applicability=NEW.applicability
    AND h.scope_level=NEW.scope_level AND h.scope_id IS NOT DISTINCT FROM NEW.scope_id
    AND h.status='Active' AND h.archived_at IS NULL AND h.deleted_at IS NULL
    AND NOT (h.child_role_id=ANY(d.visited))
  )
  SELECT EXISTS(SELECT 1 FROM descendants WHERE role_id=NEW.parent_role_id) INTO cycle_exists;
  IF cycle_exists THEN RAISE EXCEPTION 'Circular reporting hierarchy is not allowed' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER validate_reporting_hierarchy_before_v13
 BEFORE INSERT OR UPDATE ON reporting_hierarchy_rules
 FOR EACH ROW EXECUTE FUNCTION validate_reporting_hierarchy_v13();

CREATE OR REPLACE FUNCTION protect_reporting_role_link_v13() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM reporting_hierarchy_rules r
 WHERE (r.parent_role_id=NEW.id OR r.child_role_id=NEW.id)
  AND r.status='Active' AND r.archived_at IS NULL AND r.deleted_at IS NULL)
 AND (NEW.status<>'Active' OR NEW.archived_at IS NOT NULL OR NEW.deleted_at IS NOT NULL
  OR NEW.applicability IS DISTINCT FROM OLD.applicability) THEN
  RAISE EXCEPTION 'Role is referenced by Active hierarchy rules; change those rules first'
  USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER protect_reporting_role_link_before_v13
 BEFORE UPDATE ON organizational_roles FOR EACH ROW EXECUTE FUNCTION protect_reporting_role_link_v13();

CREATE OR REPLACE FUNCTION block_reporting_hierarchy_removal_v13() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Use lifecycle states; do not physically delete reporting rules' USING ERRCODE='23514'; END $$;
CREATE OR REPLACE TRIGGER block_reporting_hierarchy_removal_before_v13
 BEFORE DELETE ON reporting_hierarchy_rules FOR EACH ROW EXECUTE FUNCTION block_reporting_hierarchy_removal_v13();

DO $grants$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='saicrm_runtime') THEN
  GRANT SELECT,INSERT,UPDATE ON reporting_hierarchy_rules TO saicrm_runtime;
  GRANT SELECT,INSERT ON reporting_hierarchy_events TO saicrm_runtime;
  GRANT USAGE,SELECT ON SEQUENCE reporting_hierarchy_sequence_v13,reporting_hierarchy_events_id_seq TO saicrm_runtime;
 END IF;
END $grants$;
INSERT INTO schema_migrations(version) VALUES(13) ON CONFLICT DO NOTHING;
COMMIT;
