const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../dist/app');
const { hashPassword } = require('../dist/cuentas/reglas');
const { hashToken } = require('../dist/cuentas/tokens');

// Pool en memoria: cuentas, tokens y la consulta de login; `reloj` hace las veces de now().
let reloj = Date.parse('2026-11-26T10:00:00Z');
const cuentas = [];
const tokens = [];
const vigente = t => !t.usado && t.expira > reloj;
async function query(sql, p = []) {
  if (sql.startsWith('SELECT u.id, p.nombres')) {
    return { rows: cuentas.filter(c => c.correo === p[0] && c.estado !== 'SIN_VERIFICAR') };
  }
  if (sql.startsWith('WITH anteriores')) {
    for (const t of tokens) if (t.usuario_id === p[0] && t.proposito === p[1] && vigente(t)) t.usado = true;
    tokens.push({ usuario_id: p[0], proposito: p[1], hash: p[2], expira: reloj + p[3] * 3600e3 });
    return { rows: [] };
  }
  if (sql.startsWith('WITH t AS') && sql.includes("'RECUPERACION'")) {
    const t = tokens.find(x => x.hash === p[0] && x.proposito === 'RECUPERACION' && vigente(x));
    if (!t) return { rows: [] };
    t.usado = true;
    const c = cuentas.find(x => x.id === t.usuario_id);
    c.hash_contrasena = p[1];
    c.version_sesion += 1;
    return { rows: [{ id: c.id, correo: c.correo }] };
  }
  if (sql.includes('LEFT JOIN usuario_roles')) return { rows: cuentas.filter(c => c.correo === p[0]) };
  return { rows: [] };
}
const pool = { query, connect: async () => ({ query, release() {} }) };

const correos = [];
let app;
let base;
before(async () => {
  const hash = await hashPassword('Clave2026');
  const cuenta = (n, correo, estado) =>
    cuentas.push({ id: `00000000-0000-4000-8000-00000000000${n}`, correo, nombres: 'Ana', estado, hash_contrasena: hash, version_sesion: 1, roles: ['DOCENTE'] });
  cuenta(1, 'ana@espe.edu.ec', 'ACTIVA');
  cuenta(2, 'sinverificar@espe.edu.ec', 'SIN_VERIFICAR');
  app = await buildApp('m1', pool, { enviar: async m => void correos.push(m) }, () => new Date(reloj));
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
});
after(() => app.close());

const post = (ruta, body) =>
  fetch(`${base}/api/v1/auth/${ruta}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const tokenDe = m => new URL(m.texto.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
const svDe = res => {
  const cookie = res.headers.getSetCookie().find(c => c.startsWith('cv_acceso='));
  return JSON.parse(Buffer.from(cookie.split(';')[0].split('.')[1], 'base64url')).sv;
};
async function pedirEnlace(correo = 'ana@espe.edu.ec') {
  const res = await post('password/forgot', { correo });
  assert.equal(res.status, 202);
  return tokenDe(correos.at(-1));
}

test('RF-03: la recuperación envía un enlace de 1 h y solo se guarda su hash', async () => {
  const token = await pedirEnlace(' ANA@espe.edu.ec ');
  assert.equal(correos.at(-1).para, 'ana@espe.edu.ec');
  assert.match(correos.at(-1).texto, /^http:\/\/localhost:3100\/cuentas\/restablecer\?token=/m);
  assert.match(correos.at(-1).texto, /válido 1 hora, un solo uso/);
  assert.equal(tokens.at(-1).hash, hashToken(token));
  assert.equal(tokens.at(-1).expira - reloj, 3600e3);
});

test('RF-03: restablecer cambia la contraseña, incrementa version_sesion y el enlace es de un solo uso', async () => {
  const antes = await post('login', { correo: 'ana@espe.edu.ec', contrasena: 'Clave2026' });
  const svAnterior = svDe(antes);
  const token = await pedirEnlace();

  const res = await post('password/reset', { token, contrasena: 'NuevaClave7' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).user_id, cuentas[0].id);
  assert.ok(res.headers.getSetCookie().some(c => /^cv_acceso=;/.test(c)), 'borra la cookie de acceso');
  assert.match(correos.at(-1).asunto, /contraseña .* cambió/);

  assert.equal((await post('login', { correo: 'ana@espe.edu.ec', contrasena: 'Clave2026' })).status, 401);
  const despues = await post('login', { correo: 'ana@espe.edu.ec', contrasena: 'NuevaClave7' });
  assert.equal(despues.status, 200);
  assert.equal(svDe(despues), svAnterior + 1);

  const otraVez = await post('password/reset', { token, contrasena: 'OtraClave8' });
  assert.equal(otraVez.status, 400);
  assert.match((await otraVez.json()).message, /ya se usó o expiró/);
});

test('RF-03: el enlace vence a la hora y un enlace nuevo invalida el anterior', async () => {
  const viejo = await pedirEnlace();
  const nuevo = await pedirEnlace();
  assert.equal((await post('password/reset', { token: viejo, contrasena: 'NuevaClave8' })).status, 400);
  reloj += 3600e3 + 1;
  assert.equal((await post('password/reset', { token: nuevo, contrasena: 'NuevaClave8' })).status, 400);
});

test('la solicitud no revela si la cuenta existe y la nueva contraseña cumple RN-02', async () => {
  const enviados = correos.length;
  const existe = await post('password/forgot', { correo: 'ana@espe.edu.ec' });
  const enviadosTrasExiste = correos.length;
  for (const correo of ['nadie@espe.edu.ec', 'sinverificar@espe.edu.ec']) {
    const res = await post('password/forgot', { correo });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), await existe.clone().json());
  }
  assert.equal(enviadosTrasExiste, enviados + 1);
  assert.equal(correos.length, enviadosTrasExiste);

  const token = tokenDe(correos.at(-1));
  const debil = await post('password/reset', { token, contrasena: 'sinmayuscula1' });
  assert.equal(debil.status, 400);
  assert.match((await debil.json()).errors.contrasena, /mayúscula/);
  const falso = await post('password/reset', { token: "x' OR 1=1", contrasena: 'NuevaClave9' });
  assert.equal((await falso.json()).errors.token, 'El enlace de recuperación no es válido');
});
