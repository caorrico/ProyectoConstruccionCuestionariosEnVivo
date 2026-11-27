const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../dist/app');
const { tokenServicioValido } = require('../dist/cuentas/acceso-interno');

// Pool en memoria que imita la agregación de roles de la consulta interna.
const id = n => `00000000-0000-4000-8000-00000000000${n}`;
const TOKEN = 'servicio-de-prueba-'.padEnd(40, 'x');
const cuentas = [
  { id: id(1), estado: 'ACTIVA', roles: ['DOCENTE'] },
  { id: id(2), estado: 'SUSPENDIDA', roles: ['DOCENTE'] },
  { id: id(3), estado: 'PENDIENTE', roles: ['DOCENTE'] },
  { id: id(4), estado: 'ACTIVA', roles: ['ADMINISTRADOR'] },
  { id: id(5), estado: 'SIN_VERIFICAR', roles: [] },
];
const consultas = [];
async function query(sql, p = []) {
  consultas.push(p);
  if (!sql.includes('FROM usuarios u LEFT JOIN usuario_roles')) return { rows: [] };
  const c = cuentas.find(x => x.id === p[0]);
  return { rows: c ? [{ id: c.id, estado: c.estado, roles: c.roles }] : [] };
}
let app, base;
const previo = process.env.SERVICE_TOKEN;
before(async () => {
  process.env.SERVICE_TOKEN = TOKEN;
  app = await buildApp('m1', { query, connect: async () => ({ query, release() {} }) }, { enviar: async () => {} });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
});
after(async () => {
  await app.close();
  if (previo === undefined) delete process.env.SERVICE_TOKEN; else process.env.SERVICE_TOKEN = previo;
});

// Con un solo argumento envía el token correcto; `null` omite la cabecera Authorization.
const acceso = (cuenta, ...cabecera) => {
  const authorization = cabecera.length ? cabecera[0] : `Bearer ${TOKEN}`;
  return fetch(`${base}/internal/v1/accounts/${cuenta}/access`, { headers: authorization ? { authorization } : {} });
};

test('contrato v1: devuelve user_id, status y roles con el formato que consume B', async () => {
  const res = await acceso(id(1));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { user_id: id(1), status: 'ACTIVA', roles: ['DOCENTE'] });
  assert.deepEqual(await (await acceso(id(4))).json(), { user_id: id(4), status: 'ACTIVA', roles: ['ADMINISTRADOR'] });
});

test('RN-03 / RN-04: las cuentas no activas se informan tal cual para que B niegue la acción', async () => {
  assert.equal((await (await acceso(id(2))).json()).status, 'SUSPENDIDA');
  assert.equal((await (await acceso(id(3))).json()).status, 'PENDIENTE');
  assert.deepEqual(await (await acceso(id(5))).json(), { user_id: id(5), status: 'SIN_VERIFICAR', roles: [] });
});

test('contrato v1: 404 si la cuenta no existe o el identificador no es un UUID', async () => {
  assert.equal((await acceso(id(9))).status, 404);
  const antes = consultas.length;
  assert.equal((await acceso('no-es-uuid')).status, 404);
  assert.equal(consultas.length, antes, 'un id inválido no llega a la base');
});

test('contrato v1: sin token de servicio válido responde 401 y no consulta la base', async () => {
  const antes = consultas.length;
  for (const cabecera of [null, `Bearer ${TOKEN}x`, `Bearer ${TOKEN.slice(0, -1)}`, TOKEN, `Basic ${TOKEN}`, 'Bearer ']) {
    const res = await acceso(id(1), cabecera);
    assert.equal(res.status, 401, `cabecera: ${cabecera}`);
    assert.equal((await res.json()).user_id, undefined);
  }
  assert.equal(consultas.length, antes);
});

test('el guard falla cerrado si SERVICE_TOKEN falta o es demasiado corto', async () => {
  assert.equal(tokenServicioValido(`Bearer ${TOKEN}`, TOKEN), true);
  assert.equal(tokenServicioValido('Bearer ', ''), false);
  assert.equal(tokenServicioValido('Bearer corto', 'corto'), false);
  assert.equal(tokenServicioValido(`Bearer ${TOKEN}`, undefined), false);
  process.env.SERVICE_TOKEN = '';
  try {
    assert.equal((await acceso(id(1), 'Bearer ')).status, 401);
    assert.equal((await acceso(id(1))).status, 401);
  } finally {
    process.env.SERVICE_TOKEN = TOKEN;
  }
});
