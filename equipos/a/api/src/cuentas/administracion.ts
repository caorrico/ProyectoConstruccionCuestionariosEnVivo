import { BadRequestException, Body, ConflictException, Controller, HttpCode, Inject, Injectable, Logger } from '@nestjs/common';
import { NotFoundException, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { Pool } from 'pg';
import { Mailer, MAILER } from '../correo';
import { PG_POOL } from '../database';
import { AdministradorGuard, SolicitudAutenticada } from './autenticacion';

// RF-02 / RN-03: cada acción parte de un único estado; SIN_VERIFICAR nunca se resuelve.
// Suspender incrementa version_sesion para que los JWT ya emitidos dejen de valer (RN-04).
const TRANSICIONES = {
  approve: { accion: 'APROBAR', desde: 'PENDIENTE', hacia: 'ACTIVA', verbo: 'aprobar', motivo: false, cierra: 0,
    aviso: 'Tu cuenta fue aprobada. Ya puedes iniciar sesión y crear cuestionarios.' },
  reject: { accion: 'RECHAZAR', desde: 'PENDIENTE', hacia: 'RECHAZADA', verbo: 'rechazar', motivo: true, cierra: 0,
    aviso: 'Tu solicitud de cuenta fue rechazada.' },
  suspend: { accion: 'SUSPENDER', desde: 'ACTIVA', hacia: 'SUSPENDIDA', verbo: 'suspender', motivo: true, cierra: 1,
    aviso: 'Tu cuenta fue suspendida y se cerraron tus sesiones abiertas.' },
  reactivate: { accion: 'REACTIVAR', desde: 'SUSPENDIDA', hacia: 'ACTIVA', verbo: 'reactivar', motivo: false, cierra: 0,
    aviso: 'Tu cuenta fue reactivada. Ya puedes iniciar sesión de nuevo.' },
} as const;
type Accion = keyof typeof TRANSICIONES;

export class ResolucionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @MaxLength(500, { message: 'El motivo admite hasta 500 caracteres' })
  @IsString({ message: 'El motivo debe ser texto' })
  @IsOptional()
  motivo?: string;
}

@Injectable()
export class AdministracionService {
  private readonly logger = new Logger(AdministracionService.name);
  constructor(@Inject(PG_POOL) private readonly pool: Pick<Pool, 'query'>, @Inject(MAILER) private readonly mailer: Mailer) {}

  // Cambio de estado y auditoría (actor, fecha, acción, motivo) en una sola sentencia: ocurren juntos o no ocurren.
  async resolver(actorId: string, userId: string, nombre: Accion, motivo?: string) {
    const t = TRANSICIONES[nombre];
    if (t.motivo && !motivo) {
      const errors = { motivo: `Indica el motivo para ${t.verbo} la cuenta` };
      throw new BadRequestException({ statusCode: 400, message: 'Revisa los datos enviados', errors });
    }
    // Los administradores no se gestionan desde aquí: fuera de los docentes, la cuenta "no existe".
    const { rows } = await this.pool.query<{ estado: string; correo: string; nombres: string; cambiado: boolean }>(
      `WITH actual AS (
         SELECT u.id, u.estado, u.correo, p.nombres FROM usuarios u JOIN personas p ON p.id = u.persona_id
         WHERE u.id = $1 AND EXISTS (SELECT 1 FROM usuario_roles r WHERE r.usuario_id = u.id AND r.rol = 'DOCENTE')
       ), u AS (
         UPDATE usuarios u SET estado = $3, version_sesion = u.version_sesion + $5, actualizado_en = now()
         FROM actual WHERE u.id = actual.id AND u.estado = $2 RETURNING u.id
       ), a AS (
         INSERT INTO auditoria_cuentas (actor_id, usuario_id, accion, estado_anterior, estado_nuevo, motivo)
         SELECT $6, id, $4, $2, $3, $7 FROM u
       )
       SELECT estado, correo, nombres, EXISTS (SELECT 1 FROM u) AS cambiado FROM actual`,
      [userId, t.desde, t.hacia, t.accion, t.cierra, actorId, motivo ?? null],
    );
    const fila = rows[0];
    if (!fila) throw new NotFoundException('No existe una cuenta docente con ese identificador');
    if (fila.estado === 'SIN_VERIFICAR') throw new ConflictException('La cuenta aún no verificó su correo');
    if (!fila.cambiado) throw new ConflictException(`No se puede ${t.verbo} una cuenta en estado ${fila.estado}`);
    const texto = `Hola ${fila.nombres}:\n\n${t.aviso}${motivo ? `\n\nMotivo: ${motivo}` : ''}`;
    await this.mailer.enviar({ para: fila.correo, asunto: 'Novedades sobre tu cuenta de Cuestionarios en Vivo', texto })
      .catch(error => this.logger.error(`No se pudo notificar la resolución: ${(error as Error).message}`));
    return { user_id: userId, status: t.hacia };
  }
}

const UUID_404 = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
// El gateway dirige /api/v1/accounts a A (docs/integracion.md).
@Controller('api/v1/accounts')
@UseGuards(AdministradorGuard)
export class AdministracionController {
  constructor(private readonly servicio: AdministracionService) {}

  @Post(':id/:accion')
  @HttpCode(200)
  resolver(@Req() req: SolicitudAutenticada, @Param('id', UUID_404) id: string, @Param('accion') accion: string, @Body() dto: ResolucionDto) {
    if (!Object.hasOwn(TRANSICIONES, accion)) throw new NotFoundException('Acción no disponible');
    return this.servicio.resolver(req.actorId as string, id, accion as Accion, dto.motivo);
  }
}
