import { timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { Pool } from 'pg';
import { PG_POOL } from '../database';
import { RELOJ, Reloj } from '../reloj';
import { FIRMADOR, FirmadorJwt } from './jwt';

export const COOKIE_ACCESO = 'cv_acceso';
export const COOKIE_CSRF = 'cv_csrf';
export type SolicitudAutenticada = Request & { actorId?: string };

const leerCookies = (cabecera = ''): Record<string, string> =>
  Object.fromEntries(cabecera.split(';').map(p => p.trim().split(/=(.*)/s, 2)).filter(([k, v]) => k && v !== undefined));
const iguales = (a = '', b = '', x = Buffer.from(a), y = Buffer.from(b)) =>
  x.length > 0 && x.length === y.length && timingSafeEqual(x, y);

// RF-02: solo un ADMINISTRADOR con sesión vigente gestiona cuentas. La firma no basta: se confirma en la
// base que la cuenta sigue ACTIVA y que `sv` coincide con version_sesion (sesiones invalidadas, RN-04).
// Las escrituras con cookie exigen el doble envío CSRF (cabecera X-CSRF-Token igual a la cookie cv_csrf).
@Injectable()
export class AdministradorGuard implements CanActivate {
  constructor(
    @Inject(FIRMADOR) private readonly firmador: FirmadorJwt,
    @Inject(PG_POOL) private readonly pool: Pick<Pool, 'query'>,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<SolicitudAutenticada>();
    const cookies = leerCookies(req.headers.cookie);
    const claims = cookies[COOKIE_ACCESO] ? this.firmador.verificar(cookies[COOKIE_ACCESO], this.reloj().getTime()) : null;
    if (!claims) throw new UnauthorizedException('Inicia sesión para continuar');
    if (!['GET', 'HEAD'].includes(req.method) && !iguales(req.header('x-csrf-token'), cookies[COOKIE_CSRF])) {
      throw new ForbiddenException('Falta la protección CSRF; recarga la página e inténtalo de nuevo');
    }
    const { rows } = await this.pool.query<{ estado: string; version_sesion: number; admin: boolean }>(
      `SELECT u.estado, u.version_sesion,
              EXISTS (SELECT 1 FROM usuario_roles r WHERE r.usuario_id = u.id AND r.rol = 'ADMINISTRADOR') AS admin
       FROM usuarios u WHERE u.id = $1`,
      [claims.sub],
    );
    const vigente = rows[0]?.estado === 'ACTIVA' && rows[0].version_sesion === claims.sv;
    if (!vigente) throw new UnauthorizedException('Tu sesión ya no es válida; inicia sesión de nuevo');
    if (!rows[0].admin) throw new ForbiddenException('Solo un administrador puede gestionar cuentas');
    req.actorId = claims.sub;
    return true;
  }
}
