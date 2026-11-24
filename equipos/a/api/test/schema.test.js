const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Client } = require('pg');
const { pendingFiles } = require('../dist/migrate');

// Aplica las migraciones en un esquema temporal dentro de una transacción que se
// revierte al final, así la prueba no deja rastro en la base de desarrollo.
const url = process.env.DATABASE_URL;
const skip = url ? false : 'requiere DATABASE_URL (PostgreSQL de equipos/a/compose.yml)';

async function withSchema(service, body) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN');
    const schema = `prueba_${service}_${process.pid}`;
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}, public`);
    const dir = join(__dirname, '..', 'migrations', service);
    for (const file of pendingFiles(dir, new Set())) await client.query(readFileSync(join(dir, file), 'utf8'));
    const rejects = async (sql, params, pattern) => {
      await client.query('SAVEPOINT caso');
      await assert.rejects(client.query(sql, params), pattern);
      await client.query('ROLLBACK TO SAVEPOINT caso');
    };
    await body(client, rejects);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
}

async function usuario(client, correo, estado = 'SIN_VERIFICAR') {
  const persona = await client.query("INSERT INTO personas (nombres, apellidos) VALUES ('Ana', 'Paz') RETURNING id");
  const verificado = estado === 'SIN_VERIFICAR' ? null : new Date();
  const { rows } = await client.query(
    "INSERT INTO usuarios (persona_id, correo, hash_contrasena, estado, verificado_en) VALUES ($1, $2, 'h', $3, $4) RETURNING id",
    [persona.rows[0].id, correo, estado, verificado],
  );
  return rows[0].id;
}

test('M1: estados, verificación y dominio docente (RN-01, RN-03)', { skip }, () =>
  withSchema('m1', async (client, rejects) => {
    const roles = await client.query('SELECT codigo FROM roles ORDER BY codigo');
    assert.deepEqual(roles.rows.map(r => r.codigo), ['ADMINISTRADOR', 'DOCENTE']);

    const docente = await usuario(client, 'ana@espe.edu.ec', 'ACTIVA');
    await client.query("INSERT INTO usuario_roles VALUES ($1, 'DOCENTE')", [docente]);
    const externo = await usuario(client, 'ana@gmail.com', 'ACTIVA');
    await rejects("INSERT INTO usuario_roles VALUES ($1, 'DOCENTE')", [externo], /requiere un correo @espe\.edu\.ec/);
    await client.query("INSERT INTO usuario_roles VALUES ($1, 'ADMINISTRADOR')", [externo]);

    const persona = await client.query("INSERT INTO personas (nombres, apellidos) VALUES ('Luis', 'Mora') RETURNING id");
    const insertar = 'INSERT INTO usuarios (persona_id, correo, hash_contrasena, estado) VALUES ($1, $2, $3, $4)';
    await rejects(insertar, [persona.rows[0].id, 'luis@espe.edu.ec', 'h', 'ACTIVA'], /check/i);
    await rejects(insertar, [persona.rows[0].id, 'luis@espe.edu.ec', 'h', 'BORRADA'], /check/i);
    await rejects(insertar, [persona.rows[0].id, 'Luis@espe.edu.ec', 'h', 'SIN_VERIFICAR'], /check/i);
    await rejects(insertar, [persona.rows[0].id, 'ana@espe.edu.ec', 'h', 'SIN_VERIFICAR'], /usuarios_correo/);
  }));

test('M2: límites de preguntas y versiones publicadas inmutables (RN-05)', { skip }, () =>
  withSchema('m2', async (client, rejects) => {
    const owner = '7d1f7c8e-4b8a-4f7e-9a51-2a0c3c1d9e01';
    const { rows } = await client.query("INSERT INTO cuestionarios (propietario_id, titulo) VALUES ($1, 'Redes') RETURNING id, estado", [owner]);
    assert.equal(rows[0].estado, 'BORRADOR');
    const quiz = rows[0].id;

    const pregunta = "INSERT INTO preguntas (cuestionario_id, orden, tipo, tiempo_segundos) VALUES ($1, $2, $3, $4)";
    await client.query(pregunta, [quiz, 1, 'TRUE_FALSE', 5]);
    await client.query(pregunta, [quiz, 50, 'SHORT_ANSWER', 120]);
    await rejects(pregunta, [quiz, 51, 'TRUE_FALSE', 20], /check/i);
    await rejects(pregunta, [quiz, 2, 'TRUE_FALSE', 4], /check/i);
    await rejects(pregunta, [quiz, 2, 'ESSAY', 20], /check/i);

    const version = await client.query(
      "INSERT INTO versiones_publicadas (cuestionario_id, numero, propietario_id, titulo, preguntas) VALUES ($1, 1, $2, 'Redes', '[{}]') RETURNING id",
      [quiz, owner],
    );
    const id = version.rows[0].id;
    await rejects("UPDATE versiones_publicadas SET titulo = 'Otro' WHERE id = $1", [id], /inmutables/);
    await rejects('DELETE FROM versiones_publicadas WHERE id = $1', [id], /inmutables/);
    await rejects(
      "INSERT INTO versiones_publicadas (cuestionario_id, numero, propietario_id, titulo, preguntas) VALUES ($1, 2, $2, 'Redes', '[]')",
      [quiz, owner],
      /check/i,
    );
  }));
