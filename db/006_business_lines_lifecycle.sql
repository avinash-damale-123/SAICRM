BEGIN;
SET LOCAL search_path TO public, pg_catalog;
ALTER TABLE business_line_events ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE business_line_events DROP CONSTRAINT IF EXISTS business_line_events_action_check;
DO $migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='business_line_events_action_v6') THEN
 ALTER TABLE business_line_events ADD CONSTRAINT business_line_events_action_v6 CHECK(action IN ('Created','Updated','Archived','Restored','Deactivated','Reactivated','Soft Deleted','Restored Deleted'));
END IF; END $migration$;
INSERT INTO schema_migrations(version) VALUES(6) ON CONFLICT DO NOTHING;
COMMIT;
