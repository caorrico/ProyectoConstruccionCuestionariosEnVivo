# Trazabilidad del equipo A

Matriz requisito → implementación → prueba. Se actualiza en cada commit que toca un requisito.
Estado: **Implementado** (hay código y prueba automática), **Parcial** (solo esquema o base),
**Pendiente** (planificado en un corte posterior).

| Requisito | Implementación | Prueba | Estado |
|---|---|---|---|
| RF-01 / RN-01 dominio `@espe.edu.ec` para docentes | `api/src/cuentas/reglas.ts` (`esCorreoDocente`), `registro.dto.ts`; trigger `usuario_roles_dominio` en `001_cuentas.sql` | `api/test/registro.test.js`, `api/test/schema.test.js` (M1) | Implementado |
| RF-01 verificación de correo de un solo uso (24 h) y reenvío | `api/migrations/m1/002_tokens.sql`, `api/src/cuentas/tokens.ts`, `cuentas.service.ts` (`verificar`, `reenviarVerificacion`), `api/src/correo.ts` | `api/test/verificacion.test.js` | Implementado |
| RF-01 / RN-02 contraseña ≥ 8, mayúscula y número | `api/src/cuentas/reglas.ts` (`passwordIssue`), `registro.dto.ts` | `api/test/registro.test.js`, `api/test/seed.test.js` | Implementado |
| RF-01 registro `POST /api/v1/auth/register` | `api/src/cuentas/cuentas.module.ts`, `cuentas.service.ts` | `api/test/registro.test.js` | Implementado |
| RF-02 / RN-03 estados de cuenta | `api/migrations/m1/001_cuentas.sql` (`usuarios.estado`, `verificado_en`) | `api/test/schema.test.js` (M1) | Parcial: falta gestión administrativa (A2) |
| RF-03 inicio de sesión, JWT RS256 en cookie HttpOnly y JWKS | `api/src/cuentas/jwt.ts`, `sesion.service.ts`, `cuentas.module.ts` (`login`, `logout`, `jwks`) | `api/test/sesion.test.js` | Implementado |
| RF-03 / RN-04 bloqueo de 15 min tras 5 fallos seguidos, independiente del estado | `api/src/cuentas/sesion.service.ts` (`registrarFallo`, `MAX_INTENTOS`, `BLOQUEO_MS`), `api/src/reloj.ts`; columnas `intentos_fallidos`, `bloqueado_hasta` | `api/test/bloqueo.test.js` | Implementado |
| RF-03 / RN-04 invalidación de sesiones (`version_sesion`) | `api/migrations/m1/001_cuentas.sql` (`version_sesion`), claim `sv` en `jwt.ts` | — | Pendiente (A2) |
| RF-04 / RN-05 1–50 preguntas, 5–120 s, cinco tipos | `api/migrations/m2/001_cuestionarios.sql` (`preguntas`) | `api/test/schema.test.js` (M2) | Parcial: falta validación al publicar (A3) |
| RF-04 versiones publicadas inmutables | `api/migrations/m2/001_cuestionarios.sql` (trigger `versiones_publicadas_inmutables`) | `api/test/schema.test.js` (M2) | Parcial: falta publicar (A3) |
| RF-05 / RN-06 importación TXT, DOCX y PDF | — | — | Pendiente (A4) |
| RF-06 vista previa con errores por pregunta | — | — | Pendiente (A3/A4) |
| Contrato v1: JWKS, acceso interno, catálogo y snapshot | — | — | Pendiente (A2, A5) |
| Infraestructura: migraciones únicas, ordenadas y transaccionales | `api/src/migrate.ts` (`pendingFiles`, `applyMigrations`) | `api/test/migrate.test.js` | Implementado |
| Datos de demostración idempotentes | `api/src/seed.ts` | `api/test/seed.test.js` | Implementado |

## Cómo ejecutar las pruebas

```sh
cd equipos/a/api
npm run build && npm test
# Pruebas de esquema contra PostgreSQL (se omiten sin DATABASE_URL):
DATABASE_URL=postgres://m1:<clave>@127.0.0.1:5541/m1 npm test
```
