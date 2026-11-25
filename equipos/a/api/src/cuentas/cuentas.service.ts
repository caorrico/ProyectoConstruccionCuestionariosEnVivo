import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database';
import type { RegistroDto } from './registro.dto';
import { hashPassword } from './reglas';

export interface CuentaRegistrada {
  user_id: string;
  status: 'SIN_VERIFICAR';
}

@Injectable()
export class CuentasService {
  constructor(@Inject(PG_POOL) private readonly pool: Pick<Pool, 'connect'>) {}

  // Crea persona, usuario SIN_VERIFICAR y rol DOCENTE en una sola transacción.
  async registrar(dto: RegistroDto): Promise<CuentaRegistrada> {
    const hashContrasena = await hashPassword(dto.contrasena);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const persona = await client.query<{ id: string }>(
        'INSERT INTO personas (nombres, apellidos) VALUES ($1, $2) RETURNING id',
        [dto.nombres, dto.apellidos],
      );
      const usuario = await client.query<{ id: string }>(
        'INSERT INTO usuarios (persona_id, correo, hash_contrasena) VALUES ($1, $2, $3) RETURNING id',
        [persona.rows[0].id, dto.correo, hashContrasena],
      );
      const userId = usuario.rows[0].id;
      await client.query("INSERT INTO usuario_roles (usuario_id, rol) VALUES ($1, 'DOCENTE')", [userId]);
      await client.query('COMMIT');
      return { user_id: userId, status: 'SIN_VERIFICAR' };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Ya existe una cuenta registrada con ese correo');
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
