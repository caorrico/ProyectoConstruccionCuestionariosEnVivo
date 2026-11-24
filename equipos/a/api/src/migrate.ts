import { Pool, PoolClient } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { seed, seedEnabled, seedUsers } from './seed';

// Ejecutor de migraciones SQL por servicio. Cada archivo se aplica una sola vez,
// dentro de una transacción, y queda registrado en schema_migrations.
const LOCK_ID = 1129722401;
const FILE_PATTERN = /^\d{3}_[a-z0-9_]+\.sql$/;

export function pendingFiles(dir: string, applied: Set<string>): string[] {
  return readdirSync(dir)
    .filter(name => FILE_PATTERN.test(name))
    .sort()
    .filter(name => !applied.has(name));
}

type Queryable = Pick<PoolClient, 'query'>;

async function applied(client: Queryable): Promise<Set<string>> {
  const { rows } = await client.query<{ version: string }>('SELECT version FROM schema_migrations');
  return new Set(rows.map(row => row.version));
}

// Aplica en orden los archivos pendientes; si uno falla, se revierte solo ese y se detiene.
export async function applyMigrations(client: Queryable, dir: string, label: string): Promise<string[]> {
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const done: string[] = [];
  for (const file of pendingFiles(dir, await applied(client))) {
    await client.query('BEGIN');
    try {
      await client.query(readFileSync(join(dir, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Falló ${label}/${file}: ${(error as Error).message}`);
    }
    done.push(file);
  }
  return done;
}

async function main() {
  const service = process.env.SERVICE_NAME;
  if (!['m1', 'm2'].includes(service ?? '')) throw new Error('SERVICE_NAME debe ser m1 o m2');
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    const dir = join(process.cwd(), 'migrations', service!);
    for (const file of await applyMigrations(client, dir, service!)) console.log(`Aplicada ${service}/${file}`);
    // La semilla corre bajo el mismo bloqueo para que dos réplicas no la dupliquen.
    if (service === 'm1' && seedEnabled(process.env)) {
      const created = await seed(client, seedUsers(process.env));
      console.log(created.length ? `Semilla creada: ${created.join(', ')}` : 'Semilla ya presente');
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => undefined);
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
