CREATE TABLE results (game_id uuid NOT NULL, round_id uuid NOT NULL, question_id uuid NOT NULL, participant_id uuid NOT NULL, correct boolean NOT NULL, points integer NOT NULL CHECK(points BETWEEN 0 AND 1000), recorded_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(round_id,participant_id));
CREATE INDEX results_game ON results(game_id);
