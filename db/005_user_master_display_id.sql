BEGIN;
SET LOCAL search_path TO public, pg_catalog;
CREATE SEQUENCE IF NOT EXISTS scrm_user_display_seq;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_id text;
DO $migration$
DECLARE person record;
BEGIN
 FOR person IN SELECT id FROM users WHERE display_id IS NULL ORDER BY created_at,id LOOP
  UPDATE users SET display_id='UID-' || lpad(nextval('scrm_user_display_seq')::text,6,'0') WHERE id=person.id;
 END LOOP;
END $migration$;
ALTER TABLE users ALTER COLUMN display_id SET DEFAULT ('UID-' || lpad(nextval('scrm_user_display_seq')::text,6,'0'));
CREATE UNIQUE INDEX IF NOT EXISTS users_display_id_unique ON users(display_id);
DO $migration$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_display_id_format_v5') THEN ALTER TABLE users ADD CONSTRAINT users_display_id_format_v5 CHECK(display_id IS NOT NULL AND display_id ~ '^UID-[0-9]{6,}$'); END IF; END $migration$;
CREATE OR REPLACE FUNCTION prevent_user_display_id_change() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN IF OLD.display_id IS DISTINCT FROM NEW.display_id THEN RAISE EXCEPTION 'User Master ID is immutable'; END IF; RETURN NEW; END $fn$;
DROP TRIGGER IF EXISTS users_display_id_immutable ON users;
CREATE TRIGGER users_display_id_immutable BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION prevent_user_display_id_change();
INSERT INTO schema_migrations(version) VALUES(5) ON CONFLICT DO NOTHING;
COMMIT;
