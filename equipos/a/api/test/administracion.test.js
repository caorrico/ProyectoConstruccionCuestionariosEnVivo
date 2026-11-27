const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../dist/app');
const { hashPassword } = require('../dist/cuentas/reglas');

// Pool en memoria: login, guard de administrador y la sentencia de resolución con auditoría.
const id = n => `00000000-0000-4000-8000-00000000000${n}`;
const [cuentas, auditoria, correos] = [[], [], []];
const porId = x => cuentas.find(c => c.id === x);
async function query(sql, p = []) {
  const c = porId(p[0]);
  if (sql.includes('LEFT JOIN usuario_roles')) return { rows: cuentas.filter(x => x.correo === p[0]) };
  if (sql.includes('AS admin')) return { rows: c ? [{ ...c, admin: c.roles.includes('ADMINISTRADOR') }] : [] };
  const [, desde, hacia, accion, cierra, actor, motivo] = p;
  if (!sql.startsWith('WITH actual AS') || !c?.roles.includes('DOCENTE')) return { rows: [] };
  const fila = { estado: c.estado, correo: c.correo, nombres: 'Ana', cambiado: c.estado === desde };
  if (fila.cambiado) Object.assign(c, { estado: hacia, version_sesion: c.version_sesion + cierra });
  if (fila.cambiado) auditoria.push([actor, accion, desde, hacia, motivo]);
  return { rows: [fila] };
}
let app, base;
before(async () => {
  const hash_contrasena = await hashPassword('Clave2026');
  [['ACTIVA', ['ADMINISTRADOR']], ['PENDIENTE'], ['ACTIVA'], ['SIN_VERIFICAR']].forEach(([estado, roles = ['DOCENTE']], i) =>
    cuentas.push({ id: id(i + 1), correo: `c${i + 1}@espe.edu.ec`, estado, roles, hash_contrasena, version_sesion: 1 }));
  app = await buildApp('m1', { query, connect: async () => ({ query, release() {} }) }, { enviar: async m => void correos.push(m) });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
});
after(() => app.close());

const post = (ruta, body, headers = {}) =>
  fetch(`${base}${ruta}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
async function sesion(n) {
  const res = await post('/api/v1/auth/login', { correo: `c${n}@espe.edu.ec`, contrasena: 'Clave2026' });
  const pares = res.headers.getSetCookie().map(c => c.split(';')[0]);
  return { cookie: pares.join('; '), csrf: pares.find(c => c.startsWith('cv_csrf=')).slice(8) };
}
const resolver = (s, n, accion, body = {}, csrf = s.csrf) =>
  post(`/api/v1/accounts/${typeof n === 'number' ? id(n) : n}/${accion}`, body, { cookie: s.cookie, 'x-csrf-token': csrf });

test('RF-02: sin sesión, con sesión de docente o sin CSRF no se gestionan cuentas', async () => {
  assert.equal((await resolver({ cookie: '' }, 2, 'approve', {}, 'x')).status, 401);
  assert.equal((await resolver(await sesion(3), 2, 'approve')).status, 403);
  assert.equal((await resolver(await sesion(1), 2, 'approve', {}, 'otro')).status, 403);
  assert.equal(porId(id(2)).estado, 'PENDIENTE');
});

test('RF-02: aprobar, suspender y reactivar auditan, notifican e invalidan sesiones al suspender', async () => {
  const admin = await sesion(1);
  assert.deepEqual(await (await resolver(admin, 2, 'approve')).json(), { user_id: id(2), status: 'ACTIVA' });
  assert.match(correos.at(-1).texto, /fue aprobada/);
  const docente = await sesion(2);
  assert.equal((await resolver(admin, 2, 'suspend')).status, 400, 'suspender exige motivo');
  assert.equal((await (await resolver(admin, 2, 'suspend', { motivo: '  Uso indebido ' })).json()).status, 'SUSPENDIDA');
  assert.equal(porId(id(2)).version_sesion, 2);
  assert.match(correos.at(-1).texto, /suspendida[\s\S]*Motivo: Uso indebido$/);
  assert.equal((await resolver(admin, 2, 'reactivate')).status, 200);
  assert.deepEqual(auditoria, [
    [id(1), 'APROBAR', 'PENDIENTE', 'ACTIVA', null],
    [id(1), 'SUSPENDER', 'ACTIVA', 'SUSPENDIDA', 'Uso indebido'],
    [id(1), 'REACTIVAR', 'SUSPENDIDA', 'ACTIVA', null],
  ]);
  // El JWT previo a la suspensión lleva sv = 1: aunque la cuenta vuelva a estar activa (y fuera admin), ya no vale.
  porId(id(2)).roles.push('ADMINISTRADOR');
  assert.equal((await resolver(docente, 3, 'suspend', { motivo: 'x' })).status, 401);
  porId(id(2)).roles.pop();
});

test('RN-03: no se resuelven cuentas sin verificar, transiciones inválidas ni administradores', async () => {
  const admin = await sesion(1);
  for (const [n, accion, mensaje] of [[4, 'approve', /no verificó su correo/], [3, 'reject', /rechazar una cuenta en estado ACTIVA/]]) {
    const res = await resolver(admin, n, accion, { motivo: 'Duplicada' });
    assert.equal(res.status, 409);
    assert.match((await res.json()).message, mensaje);
  }
  for (const [n, accion] of [[1, 'suspend'], [3, 'delete'], ['no-es-uuid', 'approve']]) {
    assert.equal((await resolver(admin, n, accion, { motivo: 'x' })).status, 404);
  }
  assert.equal(auditoria.length, 3);
});
