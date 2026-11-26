import { randomBytes } from 'node:crypto';
import { Body, Controller, Get, Header, HttpCode, Module, Post, Res } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { AdministracionController, AdministracionService } from './administracion';
import { AdministradorGuard, COOKIE_ACCESO, COOKIE_CSRF } from './autenticacion';
import { CuentasService } from './cuentas.service';
import { FIRMADOR, firmadorDesdeEntorno } from './jwt';
import { LoginDto, ReenvioDto, RegistroDto, RestablecerDto, VerificacionDto } from './registro.dto';
import { SesionService } from './sesion.service';

export { COOKIE_ACCESO, COOKIE_CSRF };

// Secure solo bajo HTTPS: en desarrollo local (http) el navegador descartaría la cookie.
const seguro = () => process.env.COOKIE_SECURE === 'true' || (process.env.APP_BASE_URL ?? '').startsWith('https://');
const opciones = (httpOnly: boolean): CookieOptions => ({ httpOnly, sameSite: 'lax', path: '/', secure: seguro() });

@Controller('api/v1/auth')
export class CuentasController {
  constructor(
    private readonly cuentas: CuentasService,
    private readonly sesion: SesionService,
  ) {}

  // RF-01: el docente queda SIN_VERIFICAR hasta confirmar su correo.
  @Post('register')
  @HttpCode(201)
  registrar(@Body() dto: RegistroDto) {
    return this.cuentas.registrar(dto);
  }

  @Post('verify')
  @HttpCode(200)
  verificar(@Body() dto: VerificacionDto) {
    return this.cuentas.verificar(dto.token);
  }

  @Post('verification/resend')
  @HttpCode(202)
  reenviar(@Body() dto: ReenvioDto) {
    return this.cuentas.reenviarVerificacion(dto.correo);
  }

  // RF-03: recuperación de contraseña con enlace de un solo uso válido 1 h.
  @Post('password/forgot')
  @HttpCode(202)
  olvide(@Body() dto: ReenvioDto) {
    return this.cuentas.solicitarRecuperacion(dto.correo);
  }

  // Además de invalidar las sesiones por version_sesion, borra las cookies de este navegador.
  @Post('password/reset')
  @HttpCode(200)
  async restablecer(@Body() dto: RestablecerDto, @Res({ passthrough: true }) res: Response) {
    const resultado = await this.cuentas.restablecer(dto.token, dto.contrasena);
    res.clearCookie(COOKIE_ACCESO, opciones(true));
    res.clearCookie(COOKIE_CSRF, opciones(false));
    return resultado;
  }

  // RF-03: el JWT viaja solo en la cookie HttpOnly; el cuerpo no lo expone a JavaScript.
  // cv_csrf (legible) sirve para el doble envío en escrituras con cookie (cabecera X-CSRF-Token).
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, ...sesion } = await this.sesion.iniciar(dto.correo, dto.contrasena);
    const maxAge = sesion.expires_in * 1000;
    res.cookie(COOKIE_ACCESO, token, { ...opciones(true), maxAge });
    res.cookie(COOKIE_CSRF, randomBytes(32).toString('base64url'), { ...opciones(false), maxAge });
    return sesion;
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_ACCESO, opciones(true));
    res.clearCookie(COOKIE_CSRF, opciones(false));
  }

  // Contrato v1: llaves públicas para que M2 y el equipo B verifiquen la firma RS256.
  @Get('jwks')
  @Header('Cache-Control', 'public, max-age=300')
  jwks() {
    return this.sesion.jwks();
  }
}

@Module({
  controllers: [CuentasController, AdministracionController],
  providers: [CuentasService, SesionService, AdministracionService, AdministradorGuard, { provide: FIRMADOR, useFactory: () => firmadorDesdeEntorno() }],
})
export class CuentasModule {}
