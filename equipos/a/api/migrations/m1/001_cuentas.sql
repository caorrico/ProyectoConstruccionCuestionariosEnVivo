-- M1 Cuentas y acceso: personas, usuarios, roles y estados (RF-01, RF-02, RF-03).

CREATE TABLE personas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombres    varchar(80) NOT NULL CHECK (length(trim(nombres)) > 0),
  apellidos  varchar(80) NOT NULL CHECK (length(trim(apellidos)) > 0),
  creado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  codigo      text PRIMARY KEY CHECK (codigo IN ('DOCENTE', 'ADMINISTRADOR')),
  descripcion text NOT NULL
);

INSERT INTO roles (codigo, descripcion) VALUES
  ('DOCENTE', 'Crea cuestionarios y dirige partidas con cuenta activa'),
  ('ADMINISTRADOR', 'Gestiona cuentas docentes y supervisa partidas');

-- Estado administrativo de la cuenta. El bloqueo por intentos fallidos (RN-04)
-- se guarda aparte para no mezclarlo con la decisión del administrador.
CREATE TABLE usuarios (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id         uuid NOT NULL UNIQUE REFERENCES personas(id),
  correo             varchar(254) NOT NULL CHECK (correo = lower(correo) AND correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  hash_contrasena    text NOT NULL,
  estado             text NOT NULL DEFAULT 'SIN_VERIFICAR'
                     CHECK (estado IN ('SIN_VERIFICAR', 'PENDIENTE', 'ACTIVA', 'RECHAZADA', 'SUSPENDIDA')),
  verificado_en      timestamptz,
  intentos_fallidos  smallint NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
  bloqueado_hasta    timestamptz,
  -- Se incrementa al suspender o cambiar la contraseña para invalidar sesiones existentes.
  version_sesion     integer NOT NULL DEFAULT 1,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  CHECK (estado = 'SIN_VERIFICAR' OR verificado_en IS NOT NULL)
);
CREATE UNIQUE INDEX usuarios_correo ON usuarios (correo);

CREATE TABLE usuario_roles (
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol        text NOT NULL REFERENCES roles(codigo),
  PRIMARY KEY (usuario_id, rol)
);

-- Solo los docentes se limitan al dominio institucional (RN-01).
CREATE FUNCTION validar_dominio_docente() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.rol = 'DOCENTE' AND NOT EXISTS (
    SELECT 1 FROM usuarios WHERE id = NEW.usuario_id AND correo LIKE '%@espe.edu.ec'
  ) THEN
    RAISE EXCEPTION 'El rol DOCENTE requiere un correo @espe.edu.ec';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER usuario_roles_dominio
  BEFORE INSERT OR UPDATE ON usuario_roles
  FOR EACH ROW EXECUTE FUNCTION validar_dominio_docente();
