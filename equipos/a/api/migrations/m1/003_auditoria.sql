-- RF-02 / RN-03: cada resolución administrativa queda registrada con actor, fecha, acción y motivo.
CREATE TABLE auditoria_cuentas (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id         uuid NOT NULL REFERENCES usuarios(id),
  usuario_id       uuid NOT NULL REFERENCES usuarios(id) CHECK (usuario_id <> actor_id),
  accion           text NOT NULL CHECK (accion IN ('APROBAR', 'RECHAZAR', 'SUSPENDER', 'REACTIVAR')),
  estado_anterior  text NOT NULL,
  estado_nuevo     text NOT NULL,
  motivo           varchar(500),
  creado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_cuentas_usuario ON auditoria_cuentas (usuario_id, creado_en DESC);

-- La bitácora solo admite inserciones: nadie corrige ni borra una resolución ya registrada.
CREATE FUNCTION auditoria_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'La auditoría de cuentas no se modifica ni se borra'; END $$;
CREATE TRIGGER auditoria_cuentas_inmutable BEFORE UPDATE OR DELETE ON auditoria_cuentas
  FOR EACH ROW EXECUTE FUNCTION auditoria_inmutable();
