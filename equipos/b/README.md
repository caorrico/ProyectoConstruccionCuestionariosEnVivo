# Equipo B — corte B1 en preparación

Se ha iniciado la infraestructura de M3, M4 y M5. No implementa todavía el juego, la interfaz, el gateway, informes ni administración; corresponden a B2–B5. No usar esta composición en staging ni producción.

Con Docker Compose y conexión para obtener imágenes y paquetes, desde la raíz:

```powershell
Copy-Item equipos/b/.env.example equipos/b/.env
docker compose --env-file equipos/b/.env -f compose.b.yml up --build
```

La instancia PostgreSQL escucha solo en `127.0.0.1:5542`; los servicios tienen bases y usuarios separados. El simulador escucha en `127.0.0.1:3201`. Cada servicio aplica sus migraciones al arrancar; consultar `/health` dentro de su red. El volumen `b-postgres` persiste entre reinicios. Las variables de ejemplo son exclusivamente locales; al cambiar las contraseñas de un volumen existente hay que actualizarlas también en PostgreSQL. Para URLs con caracteres especiales, codificar las contraseñas. `docker compose down` conserva los datos.

El simulador genera una clave RSA efímera en cada arranque: las credenciales anteriores dejan de ser válidas. Solo arranca con `NODE_ENV=development` y `ALLOW_DEV_SIMULATOR=true`; no se incluye en una imagen de producción. Emite tokens de cinco minutos en `/dev/token?as=teacher|admin|suspended` y expone JWKS; sus endpoints internos requieren `Authorization: Bearer <SERVICE_TOKEN>`. Son identidades y secretos de prueba. La autenticación y el catálogo reales deben validarse al implementar el consumidor.

Los scripts de migración son portables a PostgreSQL administrado; ejecutar el ejecutable compilado con `SERVICE_NAME` y `DATABASE_URL` del servicio correspondiente usando una identidad con permisos de migración. En despliegue separar identidad de migración de la de ejecución y usar TLS. La inicialización Docker solo sirve para un volumen local vacío.
