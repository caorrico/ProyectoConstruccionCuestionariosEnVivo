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
- [x] feat(a): bloqueo temporal tras cinco intentos fallidos — RN-04 en `SesionService`: el quinto fallo seguido bloquea 15 min (429 con minutos restantes y `retry_after_seconds`), aunque luego la contraseña sea correcta y sea cual sea el estado; el incremento es atómico en SQL, no alarga un bloqueo vigente y un acierto reinicia el contador. Reloj inyectable (`src/reloj.ts`, cuarto parámetro de `buildApp`). Verificado: `npm run build` y `npm test` (36 pasan, 2 omitidas sin `DATABASE_URL`) con reloj falso y pool en memoria; la consulta `UPDATE` no se probó contra PostgreSQL real.
- [x] feat(a): recuperación de contraseña con enlace de una hora — `POST /api/v1/auth/password/forgot` (202 idéntico exista o no la cuenta; enlace `/cuentas/restablecer?token=` de 1 h que invalida el anterior) y `POST /api/v1/auth/password/reset` (política RN-02; en una sola sentencia consume el token, cambia el hash e incrementa `version_sesion`; borra las cookies y avisa del cambio por correo; no levanta un bloqueo de RN-04). Verificado: `npm run build` y `npm test` (40 pasan, 2 omitidas sin `DATABASE_URL`), incluido que el JWT posterior lleva `sv` + 1; no se probó contra PostgreSQL ni Mailpit reales. El rechazo de JWT con `sv` antiguo lo aplicará la consulta interna de acceso (punto 12).
- [x] feat(a): gestión administrativa de cuentas con auditoría — migración `003_auditoria.sql` (bitácora solo de inserción por trigger); `POST /api/v1/accounts/{id}/approve|reject|suspend|reactivate` protegidos por `AdministradorGuard` (JWT verificado, cuenta ACTIVA, `sv` igual a `version_sesion`, rol ADMINISTRADOR y CSRF de doble envío). Cambio de estado y auditoría (actor, acción, estados, motivo) en una sola sentencia; rechazar y suspender exigen motivo; suspender incrementa `version_sesion`; cada resolución se notifica por correo; SIN_VERIFICAR y transiciones inválidas dan 409. El listado de cuentas para el panel queda para el punto 16. Verificado: `npm run build` y `npm test` (43 pasan, 2 omitidas sin `DATABASE_URL`) con pool en memoria; la migración y la sentencia con CTE no se probaron contra PostgreSQL real.

- [x] feat(a): consulta interna de acceso para servicios — `GET /internal/v1/accounts/{id}/access` → `{user_id, status, roles}` (formato del simulador de B), `Cache-Control: no-store`, 404 si la cuenta no existe o el id no es UUID. `ServicioGuard` exige `Authorization: Bearer <SERVICE_TOKEN>` comparando los SHA-256 con `timingSafeEqual` (tiempo constante, sin revelar el largo); falla cerrado (401) si `SERVICE_TOKEN` falta o tiene menos de 32 caracteres. Variable agregada a `compose.yml` y `.env.example`. Verificado: `npm run build` y `npm test` (48 pasan, 2 omitidas sin `DATABASE_URL`) con pool en memoria; la consulta con `array_agg` no se probó contra PostgreSQL real. Aclaración sobre `version_sesion`: el contrato solo envía el `userId`, así que esta consulta no puede rechazar un JWT con `sv` antiguo; ver pedido para B.
- [x] test(a): pruebas de contrato de identidad — `test/fixtures/identidad-v1.json` define las cuentas activa, suspendida y pendiente con la respuesta esperada de login y de `/internal/v1/accounts/{id}/access`. `api/test/contrato-identidad.test.js` levanta M1 con esas cuentas y consume la API con una réplica de las comprobaciones de `equipos/b/src/identity.ts` (firma con el JWKS, `iss`, `aud`, `exp`, `sub` UUID, rol y `status` ACTIVA): solo la activa queda autorizada; un rol ajeno, un token de servicio erróneo o una suspensión posterior al login dejan de autorizar. Verificado: `npm run build` y `npm test` (57 pasan, 2 omitidas sin `DATABASE_URL`) con pool en memoria. La rama `equipo-b/integracion-a` de B ya probó M1 real con PostgreSQL temporal (`compose.identidad-prueba.yml`); aquí no se repitió porque no había Docker.

### Texto sugerido para el PR de A2

**Título:** Equipo A — corte A2: cuentas, sesión e identidad para B

**Descripción:**

Implementa M1 (Cuentas y acceso) según RF-01 a RF-03 y el contrato v1 de identidad con B.

- Registro de docentes `POST /api/v1/auth/register` con dominio `@espe.edu.ec` y política de contraseña (RN-01, RN-02).
- Verificación de correo con enlace de un solo uso de 24 h y reenvío; tokens guardados como SHA-256 (`002_tokens.sql`). Correo por SMTP con TLS obligatorio salvo Mailpit local.
- Login con JWT RS256 en cookie HttpOnly (SameSite=Lax), cookie CSRF de doble envío, `GET /api/v1/auth/jwks` y logout.
- Bloqueo de 15 min tras 5 fallos seguidos, independiente del estado (RN-04), con reloj inyectable.
- Recuperación de contraseña con enlace de 1 h que incrementa `version_sesion`.
- Aprobar, rechazar, suspender y reactivar cuentas verificadas con auditoría inmutable (`003_auditoria.sql`) y aviso por correo (RF-02, RN-03).
- `GET /internal/v1/accounts/{id}/access` con `SERVICE_TOKEN` comparado en tiempo constante; falla cerrado si no está configurado.
- Pruebas de contrato con fixtures (`equipos/a/test/fixtures/identidad-v1.json`) que consumen M1 como lo hace `equipos/b/src/identity.ts`.

**Cómo probar:** `cd equipos/a/api && npm ci && npm run build && npm test` (57 pasan; 2 de esquema se omiten sin `DATABASE_URL`).

**Pendiente conocido:** las migraciones y las consultas SQL se probaron con pool en memoria, no contra PostgreSQL real desde A (B sí probó login, JWKS y acceso interno con M1 real). El listado de cuentas para el panel queda para A3 (punto 16). Ver los pedidos para B sobre `SERVICE_TOKEN` y `version_sesion`.

Requisitos: RF-01, RF-02, RF-03, RN-01, RN-02, RN-03, RN-04; contrato v1 (JWKS y acceso interno).

## Pedidos para el equipo B

- Configurar en B el mismo `SERVICE_TOKEN` que en M1 (mínimo 32 caracteres); con un valor vacío o corto A responde 401 a todo `/internal/v1`.
- Sesiones invalidadas: tras restablecer la contraseña la cuenta sigue `ACTIVA`, de modo que un JWT anterior seguiría valiendo en B hasta su `exp` (15 min). Si se quiere cerrar ese margen, proponemos para una v1.1 del contrato que B envíe el claim `sv` (p. ej. `?session_version=N`) y A responda 401 cuando no coincida. No se cambió el contrato v1.
