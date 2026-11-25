import type { ClientBase } from 'pg';
import { hashPassword, passwordIssue } from './cuentas/reglas';

// Datos semilla de demostración para M1: un administrador y un docente activo.
// Solo se ejecutan si SEED_DEMO=true y nunca sobrescriben cuentas existentes.
export interface SeedUser {
  correo: string;
  nombres: string;
  apellidos: string;
  rol: 'DOCENTE' | 'ADMINISTRADOR';
  contrasena: string;
}

type Env = Record<string, string | undefined>;
type Hasher = (password: string) => Promise<string>;

export { hashPassword, passwordIssue };

export function seedEnabled(env: Env): boolean {
  return env.SEED_DEMO === 'true';
}

export function seedUsers(env: Env): SeedUser[] {
  const users: SeedUser[] = [
    {
      correo: 'admin@espe.edu.ec',
      nombres: 'Administración',
      apellidos: 'Demo',
      rol: 'ADMINISTRADOR',
      contrasena: env.SEED_ADMIN_PASSWORD ?? '',
    },
    {
      correo: 'docente@espe.edu.ec',
      nombres: 'Docente',
      apellidos: 'Demo',
      rol: 'DOCENTE',
      contrasena: env.SEED_DOCENTE_PASSWORD ?? '',
    },
  ];
  for (const user of users) {
    const variable = user.rol === 'ADMINISTRADOR' ? 'SEED_ADMIN_PASSWORD' : 'SEED_DOCENTE_PASSWORD';
    if (!user.contrasena) throw new Error(`Falta ${variable} para los datos semilla`);
    const issue = passwordIssue(user.contrasena);
    if (issue) throw new Error(`${variable} ${issue}`);
  }
  return users;
}

// Crea las cuentas que falten dentro de una transacción. Devuelve los correos creados.
export async function seed(client: ClientBase, users: SeedUser[], hasher: Hasher = hashPassword): Promise<string[]> {
  const created: string[] = [];
  await client.query('BEGIN');
  try {
    for (const user of users) {
      const existing = await client.query('SELECT 1 FROM usuarios WHERE correo = $1', [user.correo]);
      if (existing.rowCount) continue;
      const persona = await client.query<{ id: string }>(
        'INSERT INTO personas (nombres, apellidos) VALUES ($1, $2) RETURNING id',
        [user.nombres, user.apellidos],
      );
      const usuario = await client.query<{ id: string }>(
        `INSERT INTO usuarios (persona_id, correo, hash_contrasena, estado, verificado_en)
         VALUES ($1, $2, $3, 'ACTIVA', now()) RETURNING id`,
        [persona.rows[0].id, user.correo, await hasher(user.contrasena)],
      );
      await client.query('INSERT INTO usuario_roles (usuario_id, rol) VALUES ($1, $2)', [usuario.rows[0].id, user.rol]);
      created.push(user.correo);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  return created;
}
