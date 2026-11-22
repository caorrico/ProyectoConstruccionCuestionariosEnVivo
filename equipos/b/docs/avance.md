# Avance B

## B1 — en preparación

El remoto consultado está vacío: no existe rama predeterminada con commits ni base para PR. Se creó `equipo-b/b1` en un clon separado. La autenticación de GitHub observada es inválida. No se ha publicado ni integrado trabajo.

Construidos: esquemas iniciales y ejecutor de migraciones, servicios mínimos con health check, composición PostgreSQL con tres bases y roles, y simulador de identidad y cuestionarios con JWT RSA efímero y datos mixtos. Pendiente: verificar instalación y arranque completo, pruebas de contrato y aislamiento, y revisar integridad antes de considerar B1 terminado. Las funciones de juego y experiencia visual pertenecen a B2–B5.

Fuente disponible: `Grupo03_Taller2_1.docx` (referencia complementaria v1.1); los otros originales enumerados en el encargo no estaban en la carpeta de esta conversación. Las condiciones explícitas del encargo se usan para completar el contexto.

Verificación parcial: Compose aceptó la configuración; el simulador respondió 200 a health, JWKS y emisión de token, y 401 al acceso interno sin credencial. La instalación de npm y el arranque de Compose no terminaron durante la sesión: falta package-lock.json y Dockerfile usa npm ci, por lo que aún no se puede afirmar que la composición construya. No se ejecutaron migraciones contra PostgreSQL ni pruebas de contrato. El intento de publicación se interrumpió; no se verificó ninguna rama remota nueva. Antes de publicar, establecer y sincronizar una rama base sin convertir la rama del corte en predeterminada.
