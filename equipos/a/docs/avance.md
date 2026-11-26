# Avance del equipo A

## Corte A1 — infraestructura (rama `equipo-a/a1`)

- [x] build(a): preparar infraestructura local de M1 y M2
- [x] feat(a): migraciones de cuentas con roles y estados
- [x] feat(a): esquema de cuestionarios y versiones publicadas
- [x] feat(a): datos semilla con administrador y docente de prueba — `src/seed.ts` crea admin y docente activos con argon2id si `SEED_DEMO=true`; idempotente y bajo el bloqueo de migración. Verificado: `npm run build` y `npm test` (6 pruebas con cliente simulado). No se probó contra PostgreSQL real: no había Docker en la máquina de desarrollo.
- [x] test(a): pruebas del ejecutor de migraciones y del esquema — `applyMigrations` extraído de `main()` y probado con cliente simulado (orden, registro, rollback); `schema.test.js` valida restricciones de M1 y M2 en un esquema temporal revertido. Verificado: `npm run build` y `npm test` (11 pasan, 2 omitidas por no haber `DATABASE_URL`/Docker). Matriz en `docs/trazabilidad.md`.

### Texto sugerido para el PR de A1

**Título:** Equipo A — corte A1: infraestructura, esquemas y semilla de M1 y M2

**Descripción:**

Prepara la base de los módulos M1 (Cuentas y acceso) y M2 (Cuestionarios) del equipo A.

- `compose.yml` con PostgreSQL 16 (`127.0.0.1:5541`), Mailpit y los servicios `m1` y `m2`; bases separadas y sin acceso cruzado (`db/init.sh`).
- API NestJS con `/health` por servicio y ejecutor de migraciones transaccional con bloqueo consultivo.
- M1: personas, roles, usuarios con estados `SIN_VERIFICAR | PENDIENTE | ACTIVA | RECHAZADA | SUSPENDIDA`, campos de bloqueo (RN-04) y trigger de dominio `@espe.edu.ec` para docentes (RN-01).
- M2: cuestionarios (`BORRADOR | PUBLICADO | ARCHIVADO`), preguntas de los cinco tipos v1 con límites de RN-05 y versiones publicadas inmutables.
- Semilla opcional (`SEED_DEMO=true`) con administrador y docente activo, contraseñas argon2id, idempotente.
- Pruebas con `node --test`: ejecutor de migraciones, semilla y esquema (este último requiere `DATABASE_URL`).

**Cómo probar:** `cd equipos/a/api && npm ci && npm run build && npm test`. Con Docker: `docker compose -f equipos/a/compose.yml up -d` y repetir con `DATABASE_URL` apuntando a `m1` y a `m2`.

**Pendiente conocido:** las pruebas de esquema no se ejecutaron contra PostgreSQL real porque la máquina de desarrollo no tiene Docker; conviene correrlas en la revisión.

Requisitos: RF-01, RF-02, RF-03, RF-04, RN-01, RN-02, RN-03, RN-05.

## Corte A2 — cuentas (rama `equipo-a/a2`)

- [x] feat(a): registro de docentes con validación de dominio y contraseña — módulo `cuentas` en M1 con `POST /api/v1/auth/register` (`class-validator`, errores en español por campo, 409 si el correo existe); la cuenta queda `SIN_VERIFICAR` con rol `DOCENTE` y hash argon2id. `buildApp` separado de `main.ts` para probar la API sin red. Verificado: `npm run build` y `npm test` (17 pasan, 2 omitidas sin `DATABASE_URL`), con pool simulado; no se probó contra PostgreSQL real.
- [x] feat(a): verificación de correo con enlace de un solo uso — migración `002_tokens.sql` (hash SHA-256, propósito, expiración), `POST /api/v1/auth/verify` (cuenta → `PENDIENTE`) y `POST /api/v1/auth/verification/resend` (invalida el enlace anterior y responde igual exista o no la cuenta). Correo con `nodemailer` a `SMTP_URL` (Mailpit); enlace con `APP_BASE_URL`. Verificado: `npm run build` y `npm test` (21 pasan, 2 omitidas sin `DATABASE_URL`) con pool y correo en memoria; no se probó contra PostgreSQL ni Mailpit reales.
- [x] feat(a): inicio de sesión con JWT RS256 y JWKS — `POST /api/v1/auth/login` para cuentas `ACTIVA` (docente o administrador): JWT RS256 con `iss`, `aud`, `sub`, `roles`, `exp` (15 min) y `sv` (`version_sesion`) en la cookie HttpOnly `cv_acceso` (SameSite=Lax, Path=/, Secure con `COOKIE_SECURE`/HTTPS) más la cookie `cv_csrf` para el doble envío. `GET /api/v1/auth/jwks` con `kid` RFC 7638. Llave desde `JWT_PRIVATE_KEY`; efímera en desarrollo y obligatoria en producción. 401 idéntico para correo inexistente o contraseña errónea (hash de relleno); 403 con motivo para cuentas no activas. `POST /api/v1/auth/logout`. Verificado: `npm run build` y `npm test` (25 pasan, 2 omitidas sin `DATABASE_URL`); la firma se comprobó con el JWKS publicado, igual que lo hace `equipos/b/src/identity.ts`. No se probó contra PostgreSQL real.
- [x] fix(a): exigir TLS en el envío de correos — corrige la vulnerabilidad `typescript:S5332` que SonarQube Cloud marcó en el PR #8 (Security Rating B). `smtp://` exige STARTTLS (`requireTLS`) y `smtps://` usa TLS implícito; el texto claro solo se admite con `SMTP_SIN_TLS=true` hacia Mailpit o un host local, y cualquier otro destino falla al arrancar. Verificado: `npm run build` y `npm test` (31 pasan, 2 omitidas sin `DATABASE_URL`).

## Pedidos para el equipo B

Ninguno por ahora.
