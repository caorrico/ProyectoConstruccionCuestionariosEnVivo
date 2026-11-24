const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verify } = require('argon2');
const { hashPassword, passwordIssue, seed, seedEnabled, seedUsers } = require('../dist/seed');

const env = { SEED_DEMO: 'true', SEED_ADMIN_PASSWORD: 'Admin2026x', SEED_DOCENTE_PASSWORD: 'Docente2026' };

// Cliente mínimo que simula las tablas de M1 en memoria.
function fakeClient() {
  const db = { personas: [], usuarios: [], roles: [], log: [] };
  return {
    db,
    async query(sql, params = []) {
      db.log.push(sql.trim().split(/\s+/)[0]);
      if (sql.startsWith('SELECT 1 FROM usuarios')) {
        const rows = db.usuarios.filter(u => u.correo === params[0]);
        return { rows, rowCount: rows.length };
      }
      if (sql.startsWith('INSERT INTO personas')) {
        const id = `p${db.personas.length + 1}`;
        db.personas.push({ id, nombres: params[0] });
        return { rows: [{ id }], rowCount: 1 };
      }
      if (sql.startsWith('INSERT INTO usuarios')) {
        const id = `u${db.usuarios.length + 1}`;
        db.usuarios.push({ id, persona_id: params[0], correo: params[1], hash: params[2] });
        return { rows: [{ id }], rowCount: 1 };
      }
      if (sql.startsWith('INSERT INTO usuario_roles')) {
        db.roles.push({ usuario_id: params[0], rol: params[1] });
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

test('la semilla solo se activa con SEED_DEMO=true', () => {
  assert.equal(seedEnabled({ SEED_DEMO: 'true' }), true);
  assert.equal(seedEnabled({ SEED_DEMO: '1' }), false);
  assert.equal(seedEnabled({}), false);
});

test('exige contraseñas presentes y conformes a RN-02', () => {
  assert.throws(() => seedUsers({ ...env, SEED_ADMIN_PASSWORD: undefined }), /Falta SEED_ADMIN_PASSWORD/);
  assert.throws(() => seedUsers({ ...env, SEED_DOCENTE_PASSWORD: 'corta1A' }), /al menos 8/);
  assert.equal(passwordIssue('sinmayuscula1'), 'debe incluir una letra mayúscula');
  assert.equal(passwordIssue('SinNumeros'), 'debe incluir un número');
  assert.equal(passwordIssue('Valida123'), null);
});

test('crea administrador y docente activos con sus roles', async () => {
  const client = fakeClient();
  const created = await seed(client, seedUsers(env), async p => `hash:${p}`);
  assert.deepEqual(created, ['admin@espe.edu.ec', 'docente@espe.edu.ec']);
  assert.deepEqual(client.db.roles.map(r => r.rol), ['ADMINISTRADOR', 'DOCENTE']);
  assert.equal(client.db.log[0], 'BEGIN');
  assert.equal(client.db.log.at(-1), 'COMMIT');
});

test('es idempotente: una segunda ejecución no crea nada', async () => {
  const client = fakeClient();
  const users = seedUsers(env);
  await seed(client, users, async p => `hash:${p}`);
  const again = await seed(client, users, async p => `hash:${p}`);
  assert.deepEqual(again, []);
  assert.equal(client.db.usuarios.length, 2);
  assert.equal(client.db.personas.length, 2);
});

test('revierte la transacción si falla una inserción', async () => {
  const client = fakeClient();
  const query = client.query.bind(client);
  client.query = async (sql, params) => {
    if (sql.startsWith('INSERT INTO usuario_roles')) throw new Error('trigger');
    return query(sql, params);
  };
  await assert.rejects(seed(client, seedUsers(env), async p => p), /trigger/);
  assert.equal(client.db.log.at(-1), 'ROLLBACK');
});

test('las contraseñas se guardan con argon2id', async () => {
  const digest = await hashPassword('Docente2026');
  assert.match(digest, /^\$argon2id\$/);
  assert.equal(await verify(digest, 'Docente2026'), true);
});
