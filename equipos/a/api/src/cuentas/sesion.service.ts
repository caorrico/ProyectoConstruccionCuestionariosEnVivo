import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { verify } from 'argon2';
import type { Pool } from 'pg';
import { PG_POOL } from '../database';
import { FIRMADOR, FirmadorJwt } from './jwt';
import { hashPassword } from './reglas';

type FilaLogin = { id: string; hash_contrasena: string; estado: string; version_sesion: number; roles: string[] };

// Solo se explica el estado cuando la contraseña ya fue correcta, para no revelar cuentas ajenas.
const MOTIVO_ESTADO: Record<string, string> = {
  SIN_VERIFICAR: 'Confirma tu correo antes de iniciar sesión',
  PENDIENTE: 'Tu cuenta espera la aprobación de un administrador',
  RECHAZADA: 'La solicitud de esta cuenta fue rechazada',
  SUSPENDIDA: 'Esta cuenta está suspendida',
};

@Injectable()
export class SesionService {
  // Hash de relleno: un correo inexistente cuesta lo mismo que uno real (sin enumeración por tiempo).
  private relleno?: Promise<string>;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pick<Pool, 'query'>,
    @Inject(FIRMADOR) private readonly firmador: FirmadorJwt,
  ) {}

  // RF-03: entran docentes y administradores con cuenta ACTIVA.
  async iniciar(correo: string, contrasena: string) {
    const { rows } = await this.pool.query<FilaLogin>(
      `SELECT u.id, u.hash_contrasena, u.estado, u.version_sesion,
              coalesce(array_agg(r.rol ORDER BY r.rol) FILTER (WHERE r.rol IS NOT NULL), '{}') AS roles
       FROM usuarios u LEFT JOIN usuario_roles r ON r.usuario_id = u.id
       WHERE u.correo = $1 GROUP BY u.id`,
      [correo],
    );
    const fila = rows[0];
    this.relleno ??= hashPassword('relleno-sin-cuenta-A1');
    const valida = await verify(fila?.hash_contrasena ?? (await this.relleno), contrasena).catch(() => false);
    if (!fila || !valida) throw new UnauthorizedException('Correo o contraseña incorrectos');
    if (fila.estado !== 'ACTIVA') throw new ForbiddenException(MOTIVO_ESTADO[fila.estado] ?? 'La cuenta no está activa');
    if (fila.roles.length === 0) throw new ForbiddenException('La cuenta no tiene un rol asignado');

    const token = this.firmador.firmar({ sub: fila.id, roles: fila.roles, sv: fila.version_sesion });
    return { token, user_id: fila.id, roles: fila.roles, expires_in: this.firmador.vidaSegundos };
  }

  jwks() {
    return this.firmador.jwks();
  }
}
