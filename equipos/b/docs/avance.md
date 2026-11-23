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

## B2 — inicio en equipo-b/b2

Se prepararon piezas internas para verificar JWT RS256 contra JWKS y confirmar estado y rol efectivo, validar el snapshot de los cinco tipos, construir una proyección pública sin respuestas correctas y crear salas con PIN aleatorio. La entrada serializa sobre la fila de partida, aplica máximo de 30, apodos únicos y una lista inicial limitada de palabras, y guarda solo el hash del token de participante. La migración 002 añade el hash; los tokens y reconexión todavía no están conectados a rutas.

Validado: `npm run check` (compilación y 5 pruebas); `TEST_DATABASE_URL=... node --test test/rooms.integration.js` contra PostgreSQL local (35 ingresos simultáneos, 30 admitidos, colisión de apodos, cierre de sala y hashes). La prueba elimina solamente las partidas que crea. Se aplicó la migración 002 localmente. El PR #2 de pruebas B1 seguía abierto al iniciar B2 y no es una dependencia funcional.

Pendiente: conectar identidad y snapshot reales a rutas con autorización, sesiones y reconexión; endpoints y WebSocket, moderación, reloj y rondas, respuestas, interfaz, pruebas de navegador y ampliación del filtro. Las funciones actuales son módulos internos y todavía no constituyen una partida jugable. No se ha probado p95 ni integración con A.
