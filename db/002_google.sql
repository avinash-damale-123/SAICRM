BEGIN;
CREATE TABLE IF NOT EXISTS google_identities (
 google_sub text PRIMARY KEY, user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS oauth_states (
 state_hash text PRIMARY KEY, browser_hash text NOT NULL, nonce_hash text NOT NULL,
 verifier text NOT NULL, remember boolean NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_states_expiry ON oauth_states(expires_at);
INSERT INTO schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
COMMIT;
