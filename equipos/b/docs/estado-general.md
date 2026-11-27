# Estado general y pruebas — 27 de noviembre de 2026

Revisado `main` (0e7b0f6) y PR de GitHub al iniciar esta revisión. A: API de cuentas y acceso con registro, verificación, login, recuperación y acciones administrativas; esquema de cuestionarios, pero sin API de edición/publicación ni interfaz. B: infraestructura PostgreSQL y operaciones internas de sala, sesión, apertura y respuestas; no tiene aún API jugable, interfaz, cierre ni resultados. Las operaciones de moderación aún requieren auditoría. No existe composición integrada de producto ni recorrido de los tres roles.

La prueba aislada de identidad construyó M1 de A sin modificar sus archivos y usó PostgreSQL temporal: login real, cookie, JWKS y acceso interno confirmaron la identidad del docente en B; también se rechazaron rol, credencial de servicio y emisor incorrectos. Se verificó compilación y 7 pruebas de B. Esto demuestra la conexión de identidad, no el flujo de juego ni la seguridad completa.

## Prueba manual parcial de identidad (solo local)

Desde la raíz, con Docker y Node instalados, en PowerShell:

```powershell
$env:SERVICE_TOKEN='prueba-local-identidad-entre-servicios-2026'
docker compose -f compose.identidad-prueba.yml up -d --build
cd equipos/b
npm ci
npm run build
$env:SERVICE_NAME='m3'
$env:PORT='3202'
$env:A_JWKS_URL='http://localhost:3211/api/v1/auth/jwks'
$env:A_ACCOUNTS_URL='http://localhost:3211/internal/v1/accounts'
$env:A_JWT_ISSUER='http://localhost:3211'
$env:A_JWT_AUDIENCE='cuestionarios-b'
$env:A_SERVICE_TOKEN=$env:SERVICE_TOKEN
node dist/main.js
```

En otra terminal, iniciar sesión y consultar B con la misma sesión HTTP:

```powershell
$body = @{ correo='docente@espe.edu.ec'; contrasena='DocenteLocal2026' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3211/api/v1/auth/login -ContentType 'application/json' -Body $body -SessionVariable sesion
Invoke-RestMethod -Uri http://localhost:3202/api/v1/games/session -WebSession $sesion
```

La segunda respuesta debe contener `user_id` y rol `DOCENTE`; sin cookie debe responder 401. Estas credenciales y la base en tmpfs son solo para esta prueba; apagar el proceso Node y ejecutar desde la raíz `docker compose -f compose.identidad-prueba.yml down` elimina los contenedores y los datos temporales. Esta prueba no requiere ni modifica los archivos ni las bases de A existentes. El servicio B iniciado así solo permite probar la identidad; su `/health` requiere configurar PostgreSQL B.

## Restante y estimación

B2 requiere rutas seguras, consumo del snapshot, WebSocket, reconexión de interfaz, cierre y moderación auditada; B3 calificación, ranking, podio y reportes; B4 monitor, interrupción y retención; B5 gateway, CI, despliegue y pruebas de carga e integración. Estimación inicial: 4–7 PR adicionales de B después de este PR de identidad, según cómo se agrupen y revisen los cortes. No es una cifra contractual ni incluye los PR de A. La prueba manual de identidad puede hacerse ahora; una partida parcial requiere terminar el flujo jugable B2 y un snapshot suministrado por simulador; la prueba completa necesita además B3–B5, publicación real de A y una composición integrada. No hay fecha fiable sin velocidad de trabajo, revisión y disponibilidad del equipo A.
