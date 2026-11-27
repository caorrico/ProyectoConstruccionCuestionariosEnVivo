import { createHash, timingSafeEqual } from 'node:crypto';
import { CanActivate, Controller, ExecutionContext, Get, Header, Inject, Injectable } from '@nestjs/common';
import { NotFoundException, Param, ParseUUIDPipe, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { Pool } from 'pg';
import { PG_POOL } from '../database';

// Un token de servicio corto se adivina: por debajo de este largo se trata como no configurado.
export const LARGO_MINIMO_TOKEN = 32;

// Se comparan los SHA-256 de ambos valores: tienen siempre 32 bytes, así timingSafeEqual
// no filtra por tiempo ni por excepción cuánto mide el token esperado.
export function tokenServicioValido(cabecera: string | undefined, esperado: string | undefined): boolean {
  if (!esperado || esperado.length < LARGO_MINIMO_TOKEN) return false;
  const recibido = /^Bearer (\S+)$/.exec(cabecera ?? '')?.[1];
  if (!recibido) return false;
  const resumen = (valor: string) => createHash('sha256').update(valor, 'utf8').digest();
  return timingSafeEqual(resumen(recibido), resumen(esperado));
}

// Contrato v1: /internal/v1 solo admite servicios con `Authorization: Bearer <SERVICE_TOKEN>`.
// Sin SERVICE_TOKEN configurado el guard falla cerrado: ninguna solicitud pasa.
@Injectable()
export class ServicioGuard implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const req = contexto.switchToHttp().getRequest<Request>();
    if (!tokenServicioValido(req.header('authorization'), process.env.SERVICE_TOKEN)) {
      throw new UnauthorizedException('Credencial de servicio inválida');
    }
    return true;
  }
}

type Estado = 'ACTIVA' | 'PENDIENTE' | 'SIN_VERIFICAR' | 'RECHAZADA' | 'SUSPENDIDA';
export interface AccesoCuenta { user_id: string; status: Estado; roles: string[] }

const UUID_404 = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

// B consulta el estado antes de cada acción privilegiada (docs/integracion.md): cualquier estado
// distinto de ACTIVA, o un 404, le impide actuar. La respuesta no se guarda en caché para que una
// suspensión se note de inmediato.
@Controller('internal/v1/accounts')
@UseGuards(ServicioGuard)
export class AccesoInternoController {
  constructor(@Inject(PG_POOL) private readonly pool: Pick<Pool, 'query'>) {}

  @Get(':id/access')
  @Header('Cache-Control', 'no-store')
  async acceso(@Param('id', UUID_404) id: string): Promise<AccesoCuenta> {
    const { rows } = await this.pool.query<{ id: string; estado: Estado; roles: string[] | null }>(
      `SELECT u.id, u.estado, array_remove(array_agg(r.rol ORDER BY r.rol), NULL) AS roles
       FROM usuarios u LEFT JOIN usuario_roles r ON r.usuario_id = u.id
       WHERE u.id = $1 GROUP BY u.id, u.estado`,
      [id],
    );
    const fila = rows[0];
    if (!fila) throw new NotFoundException('No existe una cuenta con ese identificador');
    return { user_id: fila.id, status: fila.estado, roles: fila.roles ?? [] };
  }
}
