const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../dist/app');
const { hashPassword } = require('../dist/cuentas/reglas');

// RN-04 con reloj inyectable: el tiempo avanza a mano, sin esperar 15 minutos reales.
let ahora = new Date('2026-11-26T10:00:00Z');
const avanzar = minutos => (ahora = new Date(ahora.getTime() + minutos * 60_000));

// Pool en memoria que imita las tres consultas de SesionService sobre `usuarios`.
const cuentas = {};
const porId = id => Object.values(cuentas).find(c => c.id === id);
const query = async (sql, p = []) => {
  if (sql.includes('LEFT JOIN usuario_roles')) return { rows: cuentas[p[0]] ? [{ ...cuentas[p[0]] }] : [] };
  if (sql.includes('intentos_fallidos + 1')) {
    const [id, max, hasta, momento] = p;
    const c = porId(id);
    if (!c || (c.bloqueado_hasta && c.bloqueado_hasta > momento)) return { rows: [] };
    const n = c.intentos_fallidos + 1;
    [c.intentos_fallidos, c.bloqueado_hasta] = n >= max ? [0, hasta] : [n, c.bloqueado_hasta];
    return { rows: [{ bloqueado_hasta: c.bloqueado_hasta }] };
  }
  if (sql.includes('intentos_fallidos = 0')) Object.assign(porId(p[0]), { intentos_fallidos: 0, bloqueado_hasta: null });
  return { rows: [] };
};
const pool = { query, connect: async () => ({ query, release() {} }) };

let app;
let base;
before(async () => {
  const hash = await hashPassword('Clave2026');
  let n = 0;
  for (const [correo, estado] of [['ana@espe.edu.ec', 'ACTIVA'], ['luis@espe.edu.ec', 'ACTIVA'], ['susp@espe.edu.ec', 'SUSPENDIDA']]) {
    const id = `00000000-0000-4000-8000-00000000000${++n}`;
    cuentas[correo] = { id, hash_contrasena: hash, estado, version_sesion: 1, intentos_fallidos: 0, bloqueado_hasta: null, roles: ['DOCENTE'] };
  }
  app = await buildApp('m1', pool, { enviar: async () => undefined }, () => ahora);
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
});
after(() => app.close());

const login = (correo, contrasena = 'Clave2026') =>
  fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ correo, contrasena }) });
const fallar = async (correo, veces) => {
  const estados = [];
  for (let i = 0; i < veces; i++) estados.push((await login(correo, 'Mala2026')).status);
  return estados;
};

test('RN-04: el quinto fallo bloquea 15 minutos, incluso con la contraseña correcta', async () => {
  assert.deepEqual(await fallar('ana@espe.edu.ec', 5), [401, 401, 401, 401, 429]);
  const bloqueo = await login('ana@espe.edu.ec');
  assert.equal(bloqueo.status, 429);
  const cuerpo = await bloqueo.json();
  assert.match(cuerpo.message, /bloqueada por 5 intentos fallidos.*15 minutos/);
  assert.equal(cuerpo.retry_after_seconds, 900);
  assert.equal(bloqueo.headers.getSetCookie().length, 0);

  avanzar(14);
  const casi = await login('ana@espe.edu.ec');
  assert.equal(casi.status, 429);
  assert.match((await casi.json()).message, /en 1 minuto$/);
  assert.equal(cuentas['ana@espe.edu.ec'].bloqueado_hasta.toISOString(), '2026-11-26T10:15:00.000Z'); // no se alarga

  avanzar(1);
  assert.equal((await login('ana@espe.edu.ec')).status, 200);
  assert.deepEqual([cuentas['ana@espe.edu.ec'].intentos_fallidos, cuentas['ana@espe.edu.ec'].bloqueado_hasta], [0, null]);
});

test('RN-04: tras un bloqueo vencido se cuentan otros cinco intentos', async () => {
  assert.deepEqual(await fallar('ana@espe.edu.ec', 5), [401, 401, 401, 401, 429]);
  avanzar(15);
  assert.deepEqual(await fallar('ana@espe.edu.ec', 5), [401, 401, 401, 401, 429]);
  avanzar(15);
});

test('RN-04: un inicio correcto reinicia el contador; solo cuentan los fallos seguidos', async () => {
  assert.deepEqual(await fallar('luis@espe.edu.ec', 4), [401, 401, 401, 401]);
  assert.equal((await login('luis@espe.edu.ec')).status, 200);
  assert.deepEqual(await fallar('luis@espe.edu.ec', 4), [401, 401, 401, 401]);
  assert.equal(cuentas['luis@espe.edu.ec'].bloqueado_hasta, null);
});

test('RN-04: el bloqueo es independiente del estado de la cuenta', async () => {
  assert.deepEqual(await fallar('susp@espe.edu.ec', 5), [401, 401, 401, 401, 429]);
  assert.equal((await login('susp@espe.edu.ec')).status, 429); // no 403: el bloqueo va primero
  avanzar(15);
  assert.equal((await login('susp@espe.edu.ec')).status, 403);
});

test('RN-04: un correo sin cuenta nunca se bloquea', async () => {
  assert.deepEqual(await fallar('nadie@espe.edu.ec', 6), [401, 401, 401, 401, 401, 401]);
});
