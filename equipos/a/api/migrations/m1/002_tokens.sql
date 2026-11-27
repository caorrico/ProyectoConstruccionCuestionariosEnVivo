-- Enlaces de un solo uso para verificar el correo (RF-01) y recuperar la contraseña (RF-03).
-- Solo se guarda el hash SHA-256 del token: una copia de la base no permite usar los enlaces.
CREATE TABLE tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  proposito   text NOT NULL CHECK (proposito IN ('VERIFICACION', 'RECUPERACION')),
  hash_token  char(64) NOT NULL UNIQUE CHECK (hash_token ~ '^[0-9a-f]{64}$'),
  expira_en   timestamptz NOT NULL,
  usado_en    timestamptz,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  CHECK (expira_en > creado_en)
);
CREATE INDEX tokens_vigentes ON tokens (usuario_id, proposito) WHERE usado_en IS NULL;
