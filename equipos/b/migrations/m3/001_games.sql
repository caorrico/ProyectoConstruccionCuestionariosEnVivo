CREATE TABLE games (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, quiz_id uuid NOT NULL, version_id uuid NOT NULL,
 snapshot jsonb NOT NULL, pin char(6), state text NOT NULL CHECK (state IN ('WAITING','QUESTION_OPEN','ROUND_RANKING','FINISHED','INTERRUPTED')),
 locked boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
 CHECK ((state IN ('FINISHED','INTERRUPTED') AND pin IS NULL) OR (state NOT IN ('FINISHED','INTERRUPTED') AND pin IS NOT NULL AND pin ~ '^[0-9]{6}$'))
);
CREATE UNIQUE INDEX games_active_pin ON games(pin) WHERE pin IS NOT NULL;
CREATE TABLE participants (id uuid PRIMARY KEY, game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE, nickname varchar(15) NOT NULL CHECK (length(nickname) BETWEEN 3 AND 15), joined_at timestamptz NOT NULL DEFAULT now(), expelled_at timestamptz, UNIQUE(id,game_id));
CREATE UNIQUE INDEX participants_nickname ON participants(game_id, lower(nickname)) WHERE expelled_at IS NULL;
CREATE TABLE rounds (id uuid PRIMARY KEY, game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE, question_id uuid NOT NULL, question_order integer NOT NULL CHECK(question_order > 0), opens_at timestamptz NOT NULL, closes_at timestamptz NOT NULL CHECK(closes_at > opens_at), UNIQUE(game_id, question_order), UNIQUE(id,game_id));
CREATE TABLE answers (id uuid PRIMARY KEY, game_id uuid NOT NULL, round_id uuid NOT NULL, participant_id uuid NOT NULL, answer jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), UNIQUE(round_id, participant_id), FOREIGN KEY(round_id,game_id) REFERENCES rounds(id,game_id) ON DELETE CASCADE, FOREIGN KEY(participant_id,game_id) REFERENCES participants(id,game_id) ON DELETE CASCADE);
