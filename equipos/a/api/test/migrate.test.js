const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { applyMigrations, pendingFiles } = require('../dist/migrate');

function tempDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'migr-a-'));
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
}

// Cliente que registra cada sentencia y simula schema_migrations en memoria.
function fakeClient(failOn) {
  const versions = [];
  const log = [];
  return {
    versions,
    log,
    async query(sql, params = []) {
      log.push(sql.trim().split(/\s+/)[0]);
      if (sql.startsWith('SELECT version')) return { rows: versions.map(version => ({ version })) };
      if (sql.startsWith('INSERT INTO schema_migrations')) versions.push(params[0]);
      if (failOn && sql.includes(failOn)) throw new Error('error de sintaxis');
      return { rows: [] };
    },
  };
}

test('pendingFiles ordena por número e ignora nombres que no cumplen el patrón', t => {
  const dir = tempDir({ '010_c.sql': '', '002_b.sql': '', '001_a.sql': '', 'notas.txt': '', '3_x.sql': '', '004_Mal.sql': '' });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(pendingFiles(dir, new Set()), ['001_a.sql', '002_b.sql', '010_c.sql']);
});

test('pendingFiles excluye las migraciones ya aplicadas', t => {
  const dir = tempDir({ '001_a.sql': '', '002_b.sql': '' });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(pendingFiles(dir, new Set(['001_a.sql'])), ['002_b.sql']);
  assert.deepEqual(pendingFiles(dir, new Set(['001_a.sql', '002_b.sql'])), []);
});

test('aplica cada archivo en su propia transacción y lo registra', async t => {
  const dir = tempDir({ '001_a.sql': 'CREATE TABLE a ()', '002_b.sql': 'CREATE TABLE b ()' });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const client = fakeClient();
  assert.deepEqual(await applyMigrations(client, dir, 'm1'), ['001_a.sql', '002_b.sql']);
  assert.deepEqual(client.versions, ['001_a.sql', '002_b.sql']);
  assert.equal(client.log.filter(s => s === 'BEGIN').length, 2);
  assert.equal(client.log.filter(s => s === 'COMMIT').length, 2);
  assert.deepEqual(await applyMigrations(client, dir, 'm1'), [], 'una segunda corrida no reaplica nada');
});

test('si un archivo falla revierte, informa el archivo y no sigue con los demás', async t => {
  const dir = tempDir({ '001_a.sql': 'CREATE TABLE a ()', '002_b.sql': 'ROTO', '003_c.sql': 'CREATE TABLE c ()' });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const client = fakeClient('ROTO');
  await assert.rejects(applyMigrations(client, dir, 'm2'), /Falló m2\/002_b\.sql: error de sintaxis/);
  assert.equal(client.log.at(-1), 'ROLLBACK');
  assert.deepEqual(client.versions, ['001_a.sql']);
});

test('todas las migraciones del repositorio siguen el patrón NNN_nombre.sql', () => {
  for (const service of ['m1', 'm2']) {
    const dir = join(__dirname, '..', 'migrations', service);
    const sql = readdirSync(dir).filter(name => name.endsWith('.sql'));
    assert.ok(sql.length > 0, `${service} no tiene migraciones`);
    assert.deepEqual(pendingFiles(dir, new Set()), sql.sort(), `${service} tiene archivos que se ignorarían`);
  }
});
