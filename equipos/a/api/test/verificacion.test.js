const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../dist/app');
const { hashToken } = require('../dist/cuentas/tokens');

// Pool en memoria con usuarios y tokens; `reloj` hace las veces de now() de PostgreSQL.
let reloj = Date.parse('2026-11-25T10:00:00Z');
const usuarios = [];
const tokens = [];
const vigente = t => !t.usado && t.expira > reloj;
async function query(sql, p = []) {
  if (sql.startsWith('INSERT INTO usuarios')) {
    const id = `00000000-0000-4000-8000-${String(usuarios.length + 1).padStart(12, '0')}`;
    usuarios.push({ id, correo: p[1], nombres: 'Ana', estado: 'SIN_VERIFICAR' });
    return { rows: [{ id: usuarios.at(-1).id }] };
  }
  if (sql.startsWith('WITH anteriores')) {
    for (const t of tokens) if (t.usuario_id === p[0] && t.proposito === p[1] && vigente(t)) t.usado = true;
    tokens.push({ usuario_id: p[0], proposito: p[1], hash: p[2], expira: reloj + p[3] * 3600e3 });
  }
  if (sql.startsWith('WITH t AS')) {
    const t = tokens.find(x => x.hash === p[0] && x.proposito === 'VERIFICACION' && vigente(x));
    if (t) t.usado = true;
    const u = t && usuarios.find(x => x.id === t.usuario_id && x.estado === 'SIN_VERIFICAR');
    if (u) u.estado = 'PENDIENTE';
    return { rows: u ? [{ id: u.id }] : [] };
  }
  if (sql.startsWith('SELECT u.id')) return { rows: usuarios.filter(u => u.correo === p[0] && u.estado === 'SIN_VERIFICAR') };
  return { rows: [{ id: 'persona' }] };
}
const pool = { query, connect: async () => ({ query, release() {} }) };

const correos = [];
let app;
let base;
before(async () => {
  app = await buildApp('m1', pool, { enviar: async m => void correos.push(m) });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
});
after(() => app.close());

const post = (ruta, body) =>
  fetch(`${base}/api/v1/auth/${ruta}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const tokenDe = m => new URL(m.texto.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
const estadoDe = correo => usuarios.find(u => u.correo === correo).estado;
async function registrar(correo) {
  const res = await post('register', { nombres: 'Ana', apellidos: 'Peña', correo, contrasena: 'Clave2026' });
  assert.equal(res.status, 201);
  return tokenDe(correos.at(-1));
}

test('RF-01: el registro envía un enlace de 24 h y solo se guarda su hash SHA-256', async () => {
  const token = await registrar('ana@espe.edu.ec');
  assert.equal(correos.at(-1).para, 'ana@espe.edu.ec');
  assert.match(correos.at(-1).texto, /^http:\/\/localhost:3100\/cuentas\/verificar\?token=/m);
  assert.match(correos.at(-1).texto, /válido 24 horas, un solo uso/);
  assert.equal(tokens.at(-1).hash, hashToken(token));
  assert.notEqual(tokens.at(-1).hash, token);
  assert.equal(tokens.at(-1).expira - reloj, 24 * 3600e3);
});

test('RF-01: verificar deja la cuenta PENDIENTE y el enlace es de un solo uso', async () => {
  const token = await registrar('beto@espe.edu.ec');
  const res = await post('verify', { token });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'PENDIENTE');
  assert.equal(estadoDe('beto@espe.edu.ec'), 'PENDIENTE');
  const otraVez = await post('verify', { token });
  assert.equal(otraVez.status, 400);
  assert.match((await otraVez.json()).message, /ya se usó o expiró/);
});

test('el reenvío invalida el enlace anterior y no revela si la cuenta existe', async () => {
  const viejo = await registrar('dani@espe.edu.ec');
  const res = await post('verification/resend', { correo: ' DANI@espe.edu.ec ' });
  assert.equal(res.status, 202);
  const nuevo = tokenDe(correos.at(-1));
  assert.equal((await post('verify', { token: viejo })).status, 400);
  assert.equal((await post('verify', { token: nuevo })).status, 200);

  const enviados = correos.length;
  const desconocido = await post('verification/resend', { correo: 'nadie@espe.edu.ec' });
  assert.equal(desconocido.status, 202);
  assert.deepEqual(await desconocido.json(), await res.json());
  assert.equal(correos.length, enviados);
});

test('RF-01: el enlace vence a las 24 horas y se rechazan formatos inválidos', async () => {
  const token = await registrar('caro@espe.edu.ec');
  reloj += 24 * 3600e3 + 1;
  assert.equal((await post('verify', { token })).status, 400);
  assert.equal(estadoDe('caro@espe.edu.ec'), 'SIN_VERIFICAR');
  const res = await post('verify', { token: "x' OR 1=1" });
  assert.equal((await res.json()).errors.token, 'El enlace de verificación no es válido');
});
