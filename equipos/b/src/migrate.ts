import { Pool } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  const service = process.env.SERVICE_NAME;
  if (!['m3', 'm4', 'm5'].includes(service ?? '')) throw new Error('SERVICE_NAME inválido');
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(1129722417)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const dir = join(process.cwd(), 'migrations', service!);
    for (const file of readdirSync(dir).filter(x => /^\d+_[a-z0-9_]+\.sql$/.test(x)).sort()) {
      if ((await client.query('SELECT 1 FROM schema_migrations WHERE version=$1', [file])).rowCount) continue;
      await client.query('BEGIN');
      try { await client.query(readFileSync(join(dir, file), 'utf8')); await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file]); await client.query('COMMIT'); }
      catch (error) { await client.query('ROLLBACK'); throw error; }
      console.log(`Aplicada ${service}/${file}`);
    }
  } finally { await client.query('SELECT pg_advisory_unlock(1129722417)'); client.release(); await pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
