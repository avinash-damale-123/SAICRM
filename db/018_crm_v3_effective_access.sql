BEGIN;
SET LOCAL search_path TO public, pg_catalog;
-- SAI-CRM operational role assignments are explicit, branch-scoped grants.
-- A Role Matrix definition alone grants no effective user access.
-- Each assignment is performed by an approved Super Admin with an auditable
-- department, business line, branch, role and user. Historical changes remain.
CREATE TABLE IF NOT EXISTS crm_v3_user_role_assignments (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id),
 permission_role_id uuid NOT NULL REFERENCES crm_permission_roles(id),
 business_line_id uuid NOT NULL REFERENCES business_lines(id),
 branch_id uuid NOT NULL,
 assigned_by uuid NOT NULL REFERENCES users(id),
 assigned_at timestamptz NOT NULL DEFAULT now(),
 revoked_by uuid REFERENCES users(id),
 revoked_at timestamptz,
 note text NOT NULL DEFAULT '' CHECK(length(note)<=500),
 FOREIGN KEY(branch_id,business_line_id) REFERENCES branch_masters(id,business_line_id),
 CHECK((revoked_at IS NULL)=(revoked_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_v3_role_active_unique_v18
 ON crm_v3_user_role_assignments(user_id,permission_role_id,branch_id)
 WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_v3_role_user_lookup_v18
 ON crm_v3_user_role_assignments(user_id,branch_id,revoked_at);
CREATE TABLE IF NOT EXISTS crm_v3_access_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 assignment_id uuid NOT NULL REFERENCES crm_v3_user_role_assignments(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL CHECK(action IN ('Granted','Revoked')),
 reason text NOT NULL DEFAULT '' CHECK(length(reason)<=500),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_v3_access_history_v18 ON crm_v3_access_events(assignment_id,id);
CREATE OR REPLACE TRIGGER crm_v3_access_events_append_only_v18
 BEFORE UPDATE OR DELETE ON crm_v3_access_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
DO $grants$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='saicrm_runtime') THEN
  GRANT SELECT,INSERT,UPDATE ON crm_v3_user_role_assignments TO saicrm_runtime;
  GRANT SELECT,INSERT ON crm_v3_access_events TO saicrm_runtime;
  GRANT USAGE,SELECT ON SEQUENCE crm_v3_access_events_id_seq TO saicrm_runtime;
 END IF;
END $grants$;
INSERT INTO schema_migrations(version) VALUES(18) ON CONFLICT DO NOTHING;
COMMIT;
