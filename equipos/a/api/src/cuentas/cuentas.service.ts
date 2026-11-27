import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { Mailer, MAILER } from '../correo';
import { PG_POOL } from '../database';
import type { RegistroDto } from './registro.dto';
import { hashPassword } from './reglas';
import { emitirToken, hashToken, VIGENCIA_HORAS } from './tokens';

export interface CuentaRegistrada {
  user_id: string;
  status: 'SIN_VERIFICAR';
}

@Injectable()
export class CuentasService {
  private readonly logger = new Logger(CuentasService.name);
  private readonly baseUrl = (process.env.APP_BASE_URL ?? 'http://localhost:3100').replace(/\/$/, '');

  constructor(
    @Inject(PG_POOL) private readonly pool: Pick<Pool, 'connect' | 'query'>,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  // Crea persona, usuario SIN_VERIFICAR, rol DOCENTE y enlace de verificación en una sola transacción.
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
      const token = await emitirToken(client, userId, 'VERIFICACION');
      await client.query('COMMIT');
      await this.enviarVerificacion(dto.correo, dto.nombres, token);
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

  // RF-01: enlace de un solo uso que vence a las 24 h; la cuenta pasa a PENDIENTE.
  // Una sola sentencia: consumir el token y cambiar el estado ocurren juntos o no ocurren.
  async verificar(token: string) {
    const { rows } = await this.pool.query<{ id: string }>(
      `WITH t AS (
         UPDATE tokens SET usado_en = now()
         WHERE hash_token = $1 AND proposito = 'VERIFICACION' AND usado_en IS NULL AND expira_en > now()
         RETURNING usuario_id
       )
       UPDATE usuarios u SET estado = 'PENDIENTE', verificado_en = now(), actualizado_en = now()
       FROM t WHERE u.id = t.usuario_id AND u.estado = 'SIN_VERIFICAR' RETURNING u.id`,
      [hashToken(token)],
    );
    if (!rows[0]) throw new BadRequestException('El enlace de verificación no es válido, ya se usó o expiró');
    return { user_id: rows[0].id, status: 'PENDIENTE' as const };
  }

  // Reenvío: responde lo mismo exista o no la cuenta, para no revelar correos registrados.
  async reenviarVerificacion(correo: string) {
    const { rows } = await this.pool.query<{ id: string; nombres: string }>(
      `SELECT u.id, p.nombres FROM usuarios u JOIN personas p ON p.id = u.persona_id
       WHERE u.correo = $1 AND u.estado = 'SIN_VERIFICAR'`,
      [correo],
    );
    if (rows[0]) {
      const token = await emitirToken(this.pool, rows[0].id, 'VERIFICACION');
      await this.enviarVerificacion(correo, rows[0].nombres, token);
    }
    return { message: 'Si la cuenta existe y no está verificada, enviamos un nuevo enlace' };
  }

  // RF-03: enlace de recuperación de un solo uso, válido 1 h. Igual que el reenvío, la respuesta
  // no revela si el correo está registrado. Emitir uno nuevo invalida el anterior.
  async solicitarRecuperacion(correo: string) {
    const { rows } = await this.pool.query<{ id: string; nombres: string }>(
      `SELECT u.id, p.nombres FROM usuarios u JOIN personas p ON p.id = u.persona_id
       WHERE u.correo = $1 AND u.estado <> 'SIN_VERIFICAR'`,
      [correo],
    );
    if (rows[0]) {
      const token = await emitirToken(this.pool, rows[0].id, 'RECUPERACION');
      const enlace = `${this.baseUrl}/cuentas/restablecer?token=${token}`;
      const texto = `Hola ${rows[0].nombres}:\n\nPara elegir una contraseña nueva usa este enlace (válido ${VIGENCIA_HORAS.RECUPERACION} hora, un solo uso):\n${enlace}\n\nSi no lo pediste, ignora este mensaje: tu contraseña no cambiará.`;
      await this.mailer
        .enviar({ para: correo, asunto: 'Recupera tu contraseña de Cuestionarios en Vivo', texto })
        .catch(error => this.logger.error(`No se pudo enviar la recuperación: ${(error as Error).message}`));
    }
    return { message: 'Si la cuenta existe, enviamos un enlace para restablecer la contraseña' };
  }

  // Consumir el token, cambiar el hash e incrementar version_sesion ocurren en una sola sentencia:
  // los JWT emitidos antes llevan el `sv` anterior y dejan de valer. El bloqueo de RN-04 no se levanta.
  async restablecer(token: string, contrasena: string) {
    const hashContrasena = await hashPassword(contrasena);
    const { rows } = await this.pool.query<{ id: string; correo: string }>(
      `WITH t AS (
         UPDATE tokens SET usado_en = now()
         WHERE hash_token = $1 AND proposito = 'RECUPERACION' AND usado_en IS NULL AND expira_en > now()
         RETURNING usuario_id
       )
       UPDATE usuarios u SET hash_contrasena = $2, version_sesion = u.version_sesion + 1, actualizado_en = now()
       FROM t WHERE u.id = t.usuario_id RETURNING u.id, u.correo`,
      [hashToken(token), hashContrasena],
    );
    if (!rows[0]) throw new BadRequestException('El enlace de recuperación no es válido, ya se usó o expiró');
    await this.mailer
      .enviar({
        para: rows[0].correo,
        asunto: 'Tu contraseña de Cuestionarios en Vivo cambió',
        texto: 'Tu contraseña se cambió y se cerraron las sesiones abiertas.\n\nSi no fuiste tú, solicita una recuperación de inmediato y avisa a un administrador.',
      })
      .catch(error => this.logger.error(`No se pudo avisar el cambio de contraseña: ${(error as Error).message}`));
    return { user_id: rows[0].id, message: 'Contraseña actualizada. Inicia sesión con la nueva contraseña' };
  }

  // Si el correo falla, la cuenta ya existe y el docente puede pedir el reenvío.
  private async enviarVerificacion(correo: string, nombres: string, token: string) {
    const enlace = `${this.baseUrl}/cuentas/verificar?token=${token}`;
    const texto = `Hola ${nombres}:\n\nConfirma tu correo con este enlace (válido ${VIGENCIA_HORAS.VERIFICACION} horas, un solo uso):\n${enlace}\n\nDespués, un administrador revisará tu cuenta.`;
    await this.mailer
      .enviar({ para: correo, asunto: 'Verifica tu correo en Cuestionarios en Vivo', texto })
      .catch(error => this.logger.error(`No se pudo enviar la verificación: ${(error as Error).message}`));
  }
}
