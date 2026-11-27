const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createPublicKey, verify } = require('node:crypto');
const path = require('node:path');
const { buildApp } = require('../dist/app');
const { hashPassword } = require('../dist/cuentas/reglas');

// Pruebas de contrato v1 de identidad: M1 se levanta con las cuentas de referencia de
// equipos/a/test/fixtures y se consume exactamente como lo hace equipos/b/src/identity.ts.
const fixture = require(path.join(__dirname, '../../test/fixtures/identidad-v1.json'));
const porCaso = Object.fromEntries(fixture.cuentas.map(c => [c.caso, c]));

// Pool en memoria con las dos consultas que usa el contrato: login por correo y acceso por id.
const filas = new Map();
async function query(sql, p = []) {
  if (!sql.includes('LEFT JOIN usuario_roles')) return { rows: [] };
  const fila = sql.includes('u.correo = $1') ? [...filas.values()].find(f => f.correo === p[0]) : filas.get(p[0]);
  return { rows: fila ? [fila] : [] };
}

let app, base;
const previo = { SERVICE_TOKEN: process.env.SERVICE_TOKEN, JWT_ISSUER: process.env.JWT_ISSUER };
before(async () => {
  for (const c of fixture.cuentas) {
    filas.set(c.user_id, { id: c.user_id, correo: c.correo, hash_contrasena: await hashPassword(c.contrasena), estado: c.estado, version_sesion: c.version_sesion, roles: c.roles });
  }
  process.env.SERVICE_TOKEN = fixture.token_servicio;
  process.env.JWT_ISSUER = fixture.emisor;
  app = await buildApp('m1', { query, connect: async () => ({ query, release() {} }) }, { enviar: async () => {} });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
});
after(async () => {
  await app.close();
  for (const [k, v] of Object.entries(previo)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});

const login = c => fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ correo: c.correo, contrasena: c.contrasena }) });
const tokenDe = res => res.headers.getSetCookie().find(x => x.startsWith('cv_acceso='))?.split(';')[0].slice('cv_acceso='.length);
const acceso = (id, token = fixture.token_servicio) => fetch(`${base}/internal/v1/accounts/${id}/access`, { headers: { authorization: `Bearer ${token}` } });
const decodificar = p => JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));

// Réplica de las comprobaciones de authorizeTeacherOrAdmin (equipos/b/src/identity.ts): si A
// cambia algo que B exige, esta función falla antes de que falle la integración real.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function autorizaComoB(token, rol, tokenServicio = fixture.token_servicio) {
  const [h, b, firma] = token.split('.');
  const cabecera = decodificar(h);
  const claims = decodificar(b);
  if (cabecera.alg !== 'RS256' || typeof cabecera.kid !== 'string' || !cabecera.kid) return false;
  if (claims.iss !== fixture.emisor) return false;
  if (!(claims.aud === fixture.audiencia_b || (Array.isArray(claims.aud) && claims.aud.includes(fixture.audiencia_b)))) return false;
  if (typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000)) return false;
  if (typeof claims.sub !== 'string' || !UUID.test(claims.sub) || !Array.isArray(claims.roles) || !claims.roles.includes(rol)) return false;
  const { keys } = await (await fetch(`${base}/api/v1/auth/jwks`)).json();
  const llaves = keys.filter(k => k.kid === cabecera.kid && k.kty === 'RSA' && (k.alg === undefined || k.alg === 'RS256') && (k.use === undefined || k.use === 'sig'));
  if (llaves.length !== 1) return false;
  if (!verify('RSA-SHA256', Buffer.from(`${h}.${b}`), createPublicKey({ key: llaves[0], format: 'jwk' }), Buffer.from(firma, 'base64url'))) return false;
  const res = await acceso(claims.sub, tokenServicio);
  if (!res.ok) return false;
  const estado = await res.json();
  return estado.user_id === claims.sub && estado.status === 'ACTIVA' && Array.isArray(estado.roles) && estado.roles.includes(rol);
}

// Simula un JWT emitido mientras la cuenta estaba ACTIVA, antes de que cambiara su estado.
async function tokenEmitidoAntesDelCambio(c) {
  const fila = filas.get(c.user_id);
  fila.estado = 'ACTIVA';
  try { return tokenDe(await login(c)); } finally { fila.estado = c.estado; }
}

for (const c of fixture.cuentas) {
  test(`contrato v1 (${c.caso}): el acceso interno responde exactamente lo esperado por B`, async () => {
    const res = await acceso(c.user_id);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^application\/json/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const cuerpo = await res.json();
    assert.deepEqual(Object.keys(cuerpo).sort(), fixture.campos_acceso);
    assert.ok(fixture.estados_validos.includes(cuerpo.status));
    assert.deepEqual(cuerpo, c.esperado.acceso);
  });

  test(`contrato v1 (${c.caso}): login y autorización en B coinciden con el fixture`, async () => {
    const res = await login(c);
    assert.equal(res.status, c.esperado.login);
    const token = c.esperado.login === 200 ? tokenDe(res) : await tokenEmitidoAntesDelCambio(c);
    if (c.esperado.login !== 200) assert.equal(tokenDe(res), undefined, 'una cuenta no activa no recibe cookie');
    assert.ok(token);
    assert.equal(await autorizaComoB(token, 'DOCENTE'), c.esperado.b_autoriza);
  });
}

test('contrato v1: el JWT de la cuenta activa trae los claims que B verifica', async () => {
  const c = porCaso.activa;
  const claims = decodificar(tokenDe(await login(c)).split('.')[1]);
  assert.equal(claims.sub, c.user_id);
  assert.deepEqual(claims.roles, c.roles);
  assert.ok(claims.aud.includes(fixture.audiencia_b));
  assert.ok(claims.exp > claims.iat && claims.exp - claims.iat <= 3600, 'vida corta');
});

test('contrato v1: B no autoriza con rol ajeno, credencial de servicio errónea ni cuenta inexistente', async () => {
  const token = tokenDe(await login(porCaso.activa));
  assert.equal(await autorizaComoB(token, 'ADMINISTRADOR'), false);
  assert.equal(await autorizaComoB(token, 'DOCENTE', 'X'.repeat(40)), false);
  assert.equal((await acceso(porCaso.activa.user_id, 'X'.repeat(40))).status, 401);
  assert.equal((await acceso('99999999-9999-4999-8999-999999999999')).status, 404);
});

test('contrato v1: una suspensión posterior al login se refleja de inmediato en B', async () => {
  const c = porCaso.activa;
  const token = tokenDe(await login(c));
  assert.equal(await autorizaComoB(token, 'DOCENTE'), true);
  filas.get(c.user_id).estado = 'SUSPENDIDA';
  try {
    assert.equal(await autorizaComoB(token, 'DOCENTE'), false);
  } finally {
    filas.get(c.user_id).estado = c.estado;
  }
});
