# Avance B

## B1 — en preparación

El remoto consultado está vacío: no existe rama predeterminada con commits ni base para PR. Se creó `equipo-b/b1` en un clon separado. La autenticación de GitHub observada es inválida. No se ha publicado ni integrado trabajo.

Construidos: esquemas iniciales y ejecutor de migraciones, servicios mínimos con health check, composición PostgreSQL con tres bases y roles, y simulador de identidad y cuestionarios con JWT RSA efímero y datos mixtos. Pendiente: verificar instalación y arranque completo, pruebas de contrato y aislamiento, y revisar integridad antes de considerar B1 terminado. Las funciones de juego y experiencia visual pertenecen a B2–B5.

Fuente disponible: `Grupo03_Taller2_1.docx` (referencia complementaria v1.1); los otros originales enumerados en el encargo no estaban en la carpeta de esta conversación. Las condiciones explícitas del encargo se usan para completar el contexto.

Verificación parcial: Compose aceptó la configuración; el simulador respondió 200 a health, JWKS y emisión de token, y 401 al acceso interno sin credencial. La instalación de npm y el arranque de Compose no terminaron durante la sesión: falta package-lock.json y Dockerfile usa npm ci, por lo que aún no se puede afirmar que la composición construya. No se ejecutaron migraciones contra PostgreSQL ni pruebas de contrato. El intento de publicación se interrumpió; no se verificó ninguna rama remota nueva. Antes de publicar, establecer y sincronizar una rama base sin convertir la rama del corte en predeterminada.

## Primera ejecución posterior

Se inició Docker Desktop. PostgreSQL creó las tres bases con propietarios separados; se verificó que cada rol solo puede conectar a su propia base. Los tres SQL se ejecutaron correctamente dentro de transacciones revertidas. El simulador pasó dos pruebas de contrato, incluyendo JWT, roles y rechazo de producción. Se generó `package-lock.json`, actualizó NestJS y `npm audit` informó cero vulnerabilidades. La compilación TypeScript de la imagen pasó.

El remoto sigue vacío, sin rama base para un PR. GitHub ahora tiene autenticación activa; no se publicó la rama porque al ser el primer push se convertiría en la predeterminada y el encargo prohíbe empujar a ella. El frontend, las funciones de juego y la demo completa están pendientes.

La composición se construyó y arrancó con PostgreSQL, simulador y M3–M5. Los registros muestran aplicada una migración por servicio y los tres controles /health respondieron 200. El volumen fue inicializado antes de añadir las restricciones CONNECT; estas se aplicaron y verificaron también en el volumen existente. La guía de arranque usa .env.example: no usar esos secretos fuera de desarrollo.

Actualización: a petición del usuario se creó y publicó main como rama base con un commit inicial vacío; equipo-b/b1 se publicó por separado para revisión. Las referencias anteriores a la falta de rama base describen el estado previo.

## Verificación adicional B1

- `node --test test/simulator.test.js`: 3 pruebas aprobadas, con cuenta suspendida, credencial de servicio inválida, cuestionario no disponible, orden del snapshot y rechazo de staging y producción. El identificador de cuestionario privado usado en la prueba representa uno no disponible; aún falta una fixture explícita de cuestionario privado y la prueba del consumidor real.
- La prueba transaccional `test/m3_integrity.sql` comprobó PIN activo duplicado, invalidación del PIN al terminar, apodo duplicado sin distinguir mayúsculas, participante de otra partida y respuesta duplicada. Ejecutar desde la raíz con PostgreSQL iniciado: `Get-Content -Raw equipos/b/test/m3_integrity.sql | docker exec -i cuestionarios-b-postgres-1 psql -v ON_ERROR_STOP=1 -U m3 -d m3`. La transacción termina con ROLLBACK.
- Se ejecutó de nuevo el migrador de cada servicio en su contenedor; las tres bases conservaron una sola migración registrada. `npm run check` local no se completó porque las dependencias locales no están instaladas; se ejecutaron las pruebas del simulador directamente con Node.
- La consulta de GitHub por `gh` respondió HTTP 401 en esta ejecución. El estado remoto anterior debe verificarse al recuperar autenticación.

Actualización: la autenticación de GitHub funcionó al usar las credenciales del equipo; el PR #1 ya fue integrado en main. Estas pruebas se trasladaron a equipo-b/b1-verificacion desde la versión sincronizada de main para revisión independiente.

## B2 — apertura de rondas

PR #3 integrado. En `equipo-b/b2-rondas` se añadió una operación interna que verifica rol y propiedad, bloquea la partida durante la transición, usa el reloj de PostgreSQL y devuelve únicamente la pregunta pública. `npm run check` pasó 6 pruebas; la prueba de integración `rounds.integration.js` verificó dos aperturas simultáneas, propietario incorrecto, duración y ausencia de la solución. Pendientes: conectar a rutas y autorización real, cierre automático, respuestas, WebSocket, reconexión, moderación e interfaz; no existe aún partida jugable.
