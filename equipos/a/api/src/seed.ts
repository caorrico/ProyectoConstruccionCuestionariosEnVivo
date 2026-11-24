import { hash } from 'argon2';
import type { ClientBase } from 'pg';

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

// RN-02: mínimo 8 caracteres, al menos una mayúscula y un número.
export function passwordIssue(password: string): string | null {
  if (password.length < 8) return 'debe tener al menos 8 caracteres';
  if (!/[A-ZÑ]/.test(password)) return 'debe incluir una letra mayúscula';
  if (!/[0-9]/.test(password)) return 'debe incluir un número';
  return null;
}

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

export const hashPassword: Hasher = password => hash(password, { type: 2 /* argon2id */ });

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
