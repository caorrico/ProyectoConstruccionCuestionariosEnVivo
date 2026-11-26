import { ForbiddenException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { verify } from 'argon2';
import type { Pool } from 'pg';
import { PG_POOL } from '../database';
import { RELOJ, Reloj } from '../reloj';
import { FIRMADOR, FirmadorJwt } from './jwt';
import { hashPassword } from './reglas';

type FilaLogin = {
  id: string;
  hash_contrasena: string;
  estado: string;
  version_sesion: number;
  intentos_fallidos?: number;
  bloqueado_hasta?: Date | null;
  roles: string[];
};

// RN-04: cinco intentos fallidos seguidos bloquean el acceso durante 15 minutos.
export const MAX_INTENTOS = 5;
export const BLOQUEO_MS = 15 * 60 * 1000;

// Solo se explica el estado cuando la contraseña ya fue correcta, para no revelar cuentas ajenas.
const MOTIVO_ESTADO: Record<string, string> = {
  SIN_VERIFICAR: 'Confirma tu correo antes de iniciar sesión',
  PENDIENTE: 'Tu cuenta espera la aprobación de un administrador',
  RECHAZADA: 'La solicitud de esta cuenta fue rechazada',
  SUSPENDIDA: 'Esta cuenta está suspendida',
};

function bloqueada(hasta: Date, ahora: Date): HttpException {
  const segundos = Math.ceil((hasta.getTime() - ahora.getTime()) / 1000);
  const minutos = Math.ceil(segundos / 60);
  return new HttpException(
    {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: `Cuenta bloqueada por ${MAX_INTENTOS} intentos fallidos. Intenta de nuevo en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`,
      retry_after_seconds: segundos,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

@Injectable()
export class SesionService {
  // Hash de relleno: un correo inexistente cuesta lo mismo que uno real (sin enumeración por tiempo).
  private relleno?: Promise<string>;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pick<Pool, 'query'>,
    @Inject(FIRMADOR) private readonly firmador: FirmadorJwt,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  // RF-03: entran docentes y administradores con cuenta ACTIVA.
  async iniciar(correo: string, contrasena: string) {
    const ahora = this.reloj();
    const { rows } = await this.pool.query<FilaLogin>(
      `SELECT u.id, u.hash_contrasena, u.estado, u.version_sesion, u.intentos_fallidos, u.bloqueado_hasta,
              coalesce(array_agg(r.rol ORDER BY r.rol) FILTER (WHERE r.rol IS NOT NULL), '{}') AS roles
       FROM usuarios u LEFT JOIN usuario_roles r ON r.usuario_id = u.id
       WHERE u.correo = $1 GROUP BY u.id`,
      [correo],
    );
    const fila = rows[0];
    // RN-04: el bloqueo se aplica antes de mirar la contraseña y sin importar el estado de la cuenta.
    if (fila?.bloqueado_hasta && fila.bloqueado_hasta > ahora) throw bloqueada(fila.bloqueado_hasta, ahora);

    this.relleno ??= hashPassword('relleno-sin-cuenta-A1');
    const valida = await verify(fila?.hash_contrasena ?? (await this.relleno), contrasena).catch(() => false);
    if (fila && !valida) await this.registrarFallo(fila.id, ahora);
    if (!fila || !valida) throw new UnauthorizedException('Correo o contraseña incorrectos');
    // Una contraseña correcta reinicia la cuenta de intentos (deben ser fallos seguidos).
    if (fila.intentos_fallidos || fila.bloqueado_hasta) {
      await this.pool.query('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1', [fila.id]);
    }
    if (fila.estado !== 'ACTIVA') throw new ForbiddenException(MOTIVO_ESTADO[fila.estado] ?? 'La cuenta no está activa');
    if (fila.roles.length === 0) throw new ForbiddenException('La cuenta no tiene un rol asignado');

    const token = this.firmador.firmar({ sub: fila.id, roles: fila.roles, sv: fila.version_sesion }, ahora.getTime());
    return { token, user_id: fila.id, roles: fila.roles, expires_in: this.firmador.vidaSegundos };
  }

  // Incremento atómico en SQL: los intentos simultáneos no se pierden. Al quinto fallo se bloquea y el
  // contador vuelve a cero, así que tras el bloqueo hay otros cinco intentos. Un bloqueo vigente no se alarga.
  private async registrarFallo(id: string, ahora: Date): Promise<void> {
    const { rows } = await this.pool.query<{ bloqueado_hasta: Date | null }>(
      `UPDATE usuarios SET
         intentos_fallidos = CASE WHEN intentos_fallidos + 1 >= $2 THEN 0 ELSE intentos_fallidos + 1 END,
         bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= $2 THEN $3::timestamptz ELSE bloqueado_hasta END,
         actualizado_en = now()
       WHERE id = $1 AND (bloqueado_hasta IS NULL OR bloqueado_hasta <= $4)
       RETURNING bloqueado_hasta`,
      [id, MAX_INTENTOS, new Date(ahora.getTime() + BLOQUEO_MS), ahora],
    );
    const hasta = rows[0]?.bloqueado_hasta;
    if (hasta && hasta > ahora) throw bloqueada(hasta, ahora);
  }

  jwks() {
    return this.firmador.jwks();
  }
}
