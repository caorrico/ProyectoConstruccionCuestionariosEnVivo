# Integración entre equipos — contrato v1

El equipo B mantiene este documento. La fuente normativa inicial es el contrato v1 facilitado en el encargo; cualquier cambio incompatible requiere acuerdo de ambos equipos y PR de contrato antes de modificar consumidores.

A provee JWKS en `GET /api/v1/auth/jwks` y JWT asimétricos de vida corta con `iss`, `aud`, `sub`, `exp` y roles. B debe verificar firma y claims, y consultar `GET /internal/v1/accounts/{userId}/access` con credencial de servicio antes de acciones privilegiadas. Estado distinto de ACTIVA o imposibilidad de confirmarlo impide la acción. El estudiante usa sesión propia de B.

A publica `GET /api/v1/quizzes?status=PUBLICADO` y `GET /internal/v1/quizzes/{quizId}/published-snapshot?owner_id=<UUID>`; este último requiere credencial de servicio y verifica propiedad y publicación. Contiene `quiz_id`, `version_id`, `owner_id`, `title` y `questions` con `id`, `order`, `prompt`, `time_limit_seconds`, `type`, `data` y `correct_answer`. B conservará el snapshot y nunca expondrá claves de solución en ronda abierta.

Tipos v1: `SINGLE_CHOICE` (`option_id`), `TRUE_FALSE` (`value`), `MULTIPLE_CHOICE` (`option_ids`), `MATCHING` (`pairs` con `left_id` y `right_id`) y `SHORT_ANSWER` (`text`; solución `accepted_answers`). Los identificadores son opacos. El simulador contiene un cuestionario de ejemplo con los cinco tipos; no sustituye las pruebas de contrato con A.

El gateway integrado deberá dirigir `/cuentas`, `/cuestionarios`, `/api/v1/auth`, `/api/v1/accounts` y `/api/v1/quizzes` a A; `/jugar`, `/partidas`, `/admin/partidas`, `/api/v1/games` y `/ws` a B. `/internal/v1` permanece privado. La composición integrada y sus adaptadores aún no están implementados.
