import { Pool } from 'pg';
import { buildApp, Servicio } from './app';

const SERVICES: Servicio[] = ['m1', 'm2'];
const service = process.env.SERVICE_NAME as Servicio;
if (!SERVICES.includes(service)) {
  throw new Error('SERVICE_NAME debe ser m1 o m2');
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const app = await buildApp(service, pool);
  app.enableShutdownHooks();
  await app.listen(3000, '0.0.0.0');
}

void main();
