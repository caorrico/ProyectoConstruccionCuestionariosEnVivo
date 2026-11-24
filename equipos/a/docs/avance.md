# Avance del equipo A

## Corte A1 — infraestructura (rama `equipo-a/a1`)

- [x] build(a): preparar infraestructura local de M1 y M2
- [x] feat(a): migraciones de cuentas con roles y estados
- [x] feat(a): esquema de cuestionarios y versiones publicadas
- [x] feat(a): datos semilla con administrador y docente de prueba — `src/seed.ts` crea admin y docente activos con argon2id si `SEED_DEMO=true`; idempotente y bajo el bloqueo de migración. Verificado: `npm run build` y `npm test` (6 pruebas con cliente simulado). No se probó contra PostgreSQL real: no había Docker en la máquina de desarrollo.
- [ ] test(a): pruebas del ejecutor de migraciones y del esquema

## Pedidos para el equipo B

Ninguno por ahora.
