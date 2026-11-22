CREATE TABLE moderation_audit (id uuid PRIMARY KEY, game_id uuid NOT NULL, actor_id uuid NOT NULL, action text NOT NULL, reason text, created_at timestamptz NOT NULL DEFAULT now(), CHECK (action <> 'INTERRUPT' OR length(trim(coalesce(reason,''))) > 0));
CREATE INDEX moderation_audit_game ON moderation_audit(game_id,created_at);
