ALTER TABLE participants ADD COLUMN session_token_hash char(64);
CREATE UNIQUE INDEX participants_session_token_hash ON participants(session_token_hash) WHERE session_token_hash IS NOT NULL;
