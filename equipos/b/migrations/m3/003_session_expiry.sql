ALTER TABLE participants ADD COLUMN session_expires_at timestamptz;
-- Legacy tokens have no known expiry: invalidate them rather than silently extending them.
UPDATE participants SET session_token_hash=NULL WHERE session_token_hash IS NOT NULL;
ALTER TABLE participants ADD CONSTRAINT participants_session_expiry CHECK ((session_token_hash IS NULL) = (session_expires_at IS NULL));
