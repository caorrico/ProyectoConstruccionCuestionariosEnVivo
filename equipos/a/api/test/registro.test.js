const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { verify } = require('argon2');
const { buildApp } = require('../dist/app');
const { esCorreoDocente, normalizarCorreo } = require('../dist/cuentas/reglas');

// Pool mínimo que simula las tablas de M1 con la restricción única de correo.
function fakePool() {
  const db = { personas: [], usuarios: [], roles: [], log: [] };
  const client = {
    async query(sql, params = []) {
      db.log.push(sql.trim().split(/\s+/)[0]);
      if (sql.startsWith('INSERT INTO personas')) {
        db.personas.push({ nombres: params[0], apellidos: params[1] });
        return { rows: [{ id: `p${db.personas.length}` }] };
      }
      if (sql.startsWith('INSERT INTO usuarios')) {
        if (db.usuarios.some(u => u.correo === params[1])) throw Object.assign(new Error('duplicado'), { code: '23505' });
        const id = `00000000-0000-4000-8000-00000000000${db.usuarios.length + 1}`;
        db.usuarios.push({ id, correo: params[1], hash: params[2] });
        return { rows: [{ id }] };
      }
      if (sql.startsWith('INSERT INTO usuario_roles')) db.roles.push({ usuario_id: params[0], sql });
      return { rows: [] };
    },
    release() {},
  };
  return { db, query: async () => ({ rows: [] }), connect: async () => client };
}

const pool = fakePool();
let app;
let base;

before(async () => {
  app = await buildApp('m1', pool);
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
});
after(() => app.close());

const valido = { nombres: ' Ana ', apellidos: 'Peñafiel', correo: ' Ana.Pena@ESPE.edu.ec ', contrasena: 'Clave2026' };

function registrar(body) {
  return fetch(`${base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('RN-01: solo se aceptan correos institucionales', () => {
  assert.equal(normalizarCorreo('  Ana@ESPE.edu.ec '), 'ana@espe.edu.ec');
  assert.equal(esCorreoDocente('ana@espe.edu.ec'), true);
  assert.equal(esCorreoDocente('@espe.edu.ec'), false);
  assert.equal(esCorreoDocente('ana@gmail.com'), false);
  assert.equal(esCorreoDocente('ana@otro.espe.edu.ec.com'), false);
  assert.equal(esCorreoDocente('a@b@espe.edu.ec'), false);
});

test('RF-01: registra al docente SIN_VERIFICAR con rol DOCENTE y hash argon2id', async () => {
  const res = await registrar(valido);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.status, 'SIN_VERIFICAR');
  assert.match(body.user_id, /^[0-9a-f-]{36}$/);
  const usuario = pool.db.usuarios.at(-1);
  assert.equal(usuario.correo, 'ana.pena@espe.edu.ec');
  assert.deepEqual(pool.db.personas.at(-1), { nombres: 'Ana', apellidos: 'Peñafiel' });
  assert.match(usuario.hash, /^\$argon2id\$/);
  assert.equal(await verify(usuario.hash, 'Clave2026'), true);
  assert.match(pool.db.roles.at(-1).sql, /'DOCENTE'/);
  assert.equal(pool.db.log.at(-1), 'COMMIT');
});

test('rechaza un correo ya registrado con 409 y revierte', async () => {
  const res = await registrar({ ...valido, correo: 'ana.pena@espe.edu.ec' });
  assert.equal(res.status, 409);
  assert.equal(pool.db.log.at(-1), 'ROLLBACK');
});

test('RN-01: correo fuera del dominio devuelve el error por campo', async () => {
  const res = await registrar({ ...valido, correo: 'ana@gmail.com' });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.errors.correo, 'El correo debe ser institucional (@espe.edu.ec)');
});

test('RN-02: explica qué le falta a la contraseña', async () => {
  const casos = [
    ['Cl4ve', 'La contraseña debe tener al menos 8 caracteres'],
    ['clave2026', 'La contraseña debe incluir una letra mayúscula'],
    ['ClaveSegura', 'La contraseña debe incluir un número'],
  ];
  for (const [contrasena, mensaje] of casos) {
    const res = await registrar({ ...valido, correo: 'otro@espe.edu.ec', contrasena });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errors.contrasena, mensaje);
  }
});

test('exige nombres y apellidos y rechaza campos no permitidos', async () => {
  const res = await registrar({ nombres: '   ', rol: 'ADMINISTRADOR' });
  assert.equal(res.status, 400);
  const { errors } = await res.json();
  assert.equal(errors.nombres, 'Los nombres son obligatorios');
  assert.equal(errors.apellidos, 'Los apellidos son obligatorios');
  assert.equal(errors.correo, 'El correo es obligatorio');
  assert.equal(errors.contrasena, 'La contraseña es obligatoria');
  assert.ok(errors.rol);
  const largo = await registrar({ ...valido, correo: 'x@espe.edu.ec', contrasena: `A1${'a'.repeat(130)}` });
  assert.equal((await largo.json()).errors.contrasena, 'La contraseña admite hasta 128 caracteres');
});
