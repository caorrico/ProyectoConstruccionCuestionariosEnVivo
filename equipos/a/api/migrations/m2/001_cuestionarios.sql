-- M2 Cuestionarios: borradores, preguntas de los cinco tipos v1 y versiones publicadas
-- inmutables que sirven de snapshot para las partidas (RF-04, RF-06, contrato v1).

CREATE TABLE cuestionarios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UUID del usuario de M1. Se valida en la aplicación porque cada servicio tiene su propia base.
  propietario_id  uuid NOT NULL,
  titulo          varchar(120) NOT NULL CHECK (length(trim(titulo)) > 0),
  estado          text NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR', 'PUBLICADO', 'ARCHIVADO')),
  copiado_de      uuid REFERENCES cuestionarios(id) ON DELETE SET NULL,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cuestionarios_propietario ON cuestionarios (propietario_id, estado);

-- Preguntas del borrador. El borrador puede estar incompleto; las reglas completas
-- (RN-05) se comprueban en el servidor al publicar.
CREATE TABLE preguntas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuestionario_id     uuid NOT NULL REFERENCES cuestionarios(id) ON DELETE CASCADE,
  orden               integer NOT NULL CHECK (orden BETWEEN 1 AND 50),
  tipo                text NOT NULL CHECK (tipo IN ('SINGLE_CHOICE', 'TRUE_FALSE', 'MULTIPLE_CHOICE', 'MATCHING', 'SHORT_ANSWER')),
  enunciado           text NOT NULL DEFAULT '',
  tiempo_segundos     integer NOT NULL DEFAULT 20 CHECK (tiempo_segundos BETWEEN 5 AND 120),
  datos               jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(datos) = 'object'),
  respuesta_correcta  jsonb CHECK (respuesta_correcta IS NULL OR jsonb_typeof(respuesta_correcta) = 'object'),
  UNIQUE (cuestionario_id, orden) DEFERRABLE INITIALLY DEFERRED
);

-- Cada publicación congela el contenido. Las partidas históricas conservan su versión
-- aunque el cuestionario se archive o se copie a un borrador nuevo.
CREATE TABLE versiones_publicadas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuestionario_id  uuid NOT NULL REFERENCES cuestionarios(id),
  numero           integer NOT NULL CHECK (numero > 0),
  propietario_id   uuid NOT NULL,
  titulo           varchar(120) NOT NULL,
  preguntas        jsonb NOT NULL CHECK (jsonb_typeof(preguntas) = 'array' AND jsonb_array_length(preguntas) BETWEEN 1 AND 50),
  publicado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cuestionario_id, numero)
);

CREATE FUNCTION impedir_cambio_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Las versiones publicadas son inmutables';
END $$;

CREATE TRIGGER versiones_publicadas_inmutables
  BEFORE UPDATE OR DELETE ON versiones_publicadas
  FOR EACH ROW EXECUTE FUNCTION impedir_cambio_version();
