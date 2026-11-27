# Integración entre equipos — contrato v1

El equipo B mantiene este documento. La fuente normativa inicial es el contrato v1 facilitado en el encargo; cualquier cambio incompatible requiere acuerdo de ambos equipos y PR de contrato antes de modificar consumidores.

A provee JWKS en `GET /api/v1/auth/jwks` y JWT asimétricos de vida corta con `iss`, `aud`, `sub`, `exp` y roles. B debe verificar firma y claims, y consultar `GET /internal/v1/accounts/{userId}/access` con credencial de servicio antes de acciones privilegiadas. Estado distinto de ACTIVA o imposibilidad de confirmarlo impide la acción. El estudiante usa sesión propia de B.

A publica `GET /api/v1/quizzes?status=PUBLICADO` y `GET /internal/v1/quizzes/{quizId}/published-snapshot?owner_id=<UUID>`; este último requiere credencial de servicio y verifica propiedad y publicación. Contiene `quiz_id`, `version_id`, `owner_id`, `title` y `questions` con `id`, `order`, `prompt`, `time_limit_seconds`, `type`, `data` y `correct_answer`. B conservará el snapshot y nunca expondrá claves de solución en ronda abierta.

Tipos v1: `SINGLE_CHOICE` (`option_id`), `TRUE_FALSE` (`value`), `MULTIPLE_CHOICE` (`option_ids`), `MATCHING` (`pairs` con `left_id` y `right_id`) y `SHORT_ANSWER` (`text`; solución `accepted_answers`). Los identificadores son opacos. El simulador contiene un cuestionario de ejemplo con los cinco tipos; no sustituye las pruebas de contrato con A.

El gateway integrado deberá dirigir `/cuentas`, `/cuestionarios`, `/api/v1/auth`, `/api/v1/accounts` y `/api/v1/quizzes` a A; `/jugar`, `/partidas`, `/admin/partidas`, `/api/v1/games` y `/ws` a B. `/internal/v1` permanece privado. La composición integrada y sus adaptadores aún no están implementados.

## Estado de la conexión de identidad (revisión del 27-11-2026)

M1 de A entrega JWT en la cookie `cv_acceso`, JWKS y consulta privada de estado y roles. B dispone de `GET /api/v1/games/session` para verificar un docente mediante esos servicios; todavía no hay rutas de creación ni control de partidas conectadas. B exige `A_JWKS_URL`, `A_ACCOUNTS_URL`, `A_JWT_ISSUER`, `A_JWT_AUDIENCE` y `A_SERVICE_TOKEN` (mínimo 32 caracteres, igual al `SERVICE_TOKEN` de A). Las URLs de M1 deben ser alcanzables desde el proceso B; `/internal/v1` debe permanecer en red privada. `compose.b.yml` usa el simulador por defecto y admite sobrescribir las URLs y claims mediante `A_*`.

La consulta v1 no proporciona `version_sesion`. Después de restablecer la contraseña, un JWT emitido antes puede seguir siendo aceptado por B hasta que expire si la cuenta continúa activa. Cerrar ese margen requiere acordar un cambio de contrato con A; no se ha cambiado v1. M2 todavía no implementa el catálogo ni el snapshot publicado: se necesita que A entregue ambos según el contrato antes de ejecutar el recorrido integrado.
