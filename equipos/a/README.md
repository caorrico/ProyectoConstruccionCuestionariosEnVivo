# Equipo A — Cuentas y cuestionarios

Mitad autónoma del sistema: **M1 Cuentas y acceso** y **M2 Cuestionarios e importación**. El contrato con el equipo B está en [docs/integracion.md](../../docs/integracion.md).

## Corte A1 — en preparación

Infraestructura base: PostgreSQL local con una base y un rol de mínimo privilegio por servicio, Mailpit para correos de prueba y servicios mínimos M1 y M2 con `/health`. Registro, editor, importación y frontend pertenecen a los cortes A2–A5.

## Arranque local

Requiere Docker Compose. Desde `equipos/a`:

```powershell
Copy-Item .env.example .env
docker compose --env-file .env -f compose.yml up --build
```

| Servicio   | Dirección local          |
|------------|--------------------------|
| PostgreSQL | `127.0.0.1:5541`         |
| Mailpit UI | `http://127.0.0.1:8025`  |

Las variables de `.env.example` son solo para desarrollo local; no usarlas en staging ni producción. `docker compose down` conserva el volumen `a-postgres`.

## Datos semilla

Con `SEED_DEMO=true`, M1 crea tras migrar dos cuentas activas: `admin@espe.edu.ec` (ADMINISTRADOR) y `docente@espe.edu.ec` (DOCENTE). Las contraseñas salen de `SEED_ADMIN_PASSWORD` y `SEED_DOCENTE_PASSWORD`, deben cumplir RN-02 y se guardan con argon2id. La semilla es idempotente: si la cuenta ya existe no se modifica. Fuera de desarrollo, dejar `SEED_DEMO=false`.
