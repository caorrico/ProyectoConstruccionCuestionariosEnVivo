const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createPublicKey, verify } = require('node:crypto');
const { buildApp } = require('../dist/app');
const { hashPassword } = require('../dist/cuentas/reglas');

// Pool en memoria que responde a la consulta de inicio de sesión.
const cuentas = {};
const query = async (sql, p = []) => ({ rows: sql.includes('LEFT JOIN usuario_roles') && cuentas[p[0]] ? [cuentas[p[0]]] : [] });
const pool = { query, connect: async () => ({ query, release() {} }) };
const ids = { docente: '11111111-1111-4111-8111-111111111111', admin: '22222222-2222-4222-8222-222222222222' };

let app;
let base;
before(async () => {
  const hash = await hashPassword('Clave2026');
  const cuenta = (correo, estado, roles, id = ids.docente) => (cuentas[correo] = { id, hash_contrasena: hash, estado, version_sesion: 3, roles });
  cuenta('docente@espe.edu.ec', 'ACTIVA', ['DOCENTE']);
  cuenta('admin@espe.edu.ec', 'ACTIVA', ['ADMINISTRADOR'], ids.admin);
  cuenta('pendiente@espe.edu.ec', 'PENDIENTE', ['DOCENTE']);
  cuenta('suspendida@espe.edu.ec', 'SUSPENDIDA', ['DOCENTE']);
  app = await buildApp('m1', pool, { enviar: async () => undefined });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
});
after(() => app.close());

const login = (correo, contrasena = 'Clave2026') =>
  fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ correo, contrasena }) });
const cookie = (res, nombre) => res.headers.getSetCookie().find(c => c.startsWith(`${nombre}=`));
const json = p => JSON.parse(Buffer.from(p, 'base64url'));

test('RF-03: el docente activo recibe un JWT RS256 en cookie HttpOnly verificable con el JWKS', async () => {
  const res = await login(' Docente@espe.edu.ec ');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { user_id: ids.docente, roles: ['DOCENTE'], expires_in: 900 });
  const acceso = cookie(res, 'cv_acceso');
  assert.match(acceso, /Path=\/.*HttpOnly; SameSite=Lax$/); // sin Secure en desarrollo http
  assert.doesNotMatch(cookie(res, 'cv_csrf'), /HttpOnly/);

  const jwksRes = await fetch(`${base}/api/v1/auth/jwks`);
  assert.match(jwksRes.headers.get('cache-control'), /max-age=300/);
  const { keys } = await jwksRes.json();
  // Solo la parte pública (sin `d`), con los campos que filtra equipos/b/src/identity.ts.
  assert.deepEqual(Object.keys(keys[0]).sort(), ['alg', 'e', 'kid', 'kty', 'n', 'use']);
  assert.deepEqual([keys.length, keys[0].kty, keys[0].alg, keys[0].use], [1, 'RSA', 'RS256', 'sig']);

  const [h, b, firma] = acceso.split(';')[0].slice('cv_acceso='.length).split('.');
  assert.deepEqual([json(h).alg, json(h).kid], ['RS256', keys[0].kid]);
  assert.ok(verify('RSA-SHA256', Buffer.from(`${h}.${b}`), createPublicKey({ key: keys[0], format: 'jwk' }), Buffer.from(firma, 'base64url')));
  const claims = json(b);
  assert.deepEqual(
    [claims.iss, claims.aud, claims.sub, claims.roles, claims.sv, claims.exp - claims.iat],
    ['http://localhost:3001', ['cuestionarios-a', 'cuestionarios-b'], ids.docente, ['DOCENTE'], 3, 900],
  );
});

test('RF-03: el administrador entra; credenciales incorrectas dan el mismo 401 exista o no la cuenta', async () => {
  assert.deepEqual((await (await login('admin@espe.edu.ec')).json()).roles, ['ADMINISTRADOR']);
  const mala = await login('docente@espe.edu.ec', 'Otra2026');
  const nadie = await login('nadie@espe.edu.ec');
  assert.deepEqual([mala.status, nadie.status], [401, 401]);
  assert.equal((await mala.json()).message, (await nadie.json()).message);
  assert.equal(cookie(mala, 'cv_acceso'), undefined);
});

test('RF-03: cuentas no activas reciben 403 con el motivo y sin cookie', async () => {
  const [pendiente, suspendida] = await Promise.all([login('pendiente@espe.edu.ec'), login('suspendida@espe.edu.ec')]);
  assert.deepEqual([pendiente.status, suspendida.status], [403, 403]);
  assert.match((await pendiente.json()).message, /aprobación de un administrador/);
  assert.equal(cookie(suspendida, 'cv_acceso'), undefined);
});

test('logout borra las cookies de sesión', async () => {
  const res = await fetch(`${base}/api/v1/auth/logout`, { method: 'POST' });
  assert.equal(res.status, 204);
  assert.match(cookie(res, 'cv_acceso'), /Expires=Thu, 01 Jan 1970/);
});
