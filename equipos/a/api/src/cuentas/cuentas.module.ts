import { Body, Controller, HttpCode, Module, Post } from '@nestjs/common';
import { CuentasService } from './cuentas.service';
import { ReenvioDto, RegistroDto, VerificacionDto } from './registro.dto';

@Controller('api/v1/auth')
export class CuentasController {
  constructor(private readonly cuentas: CuentasService) {}

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
}

@Module({ controllers: [CuentasController], providers: [CuentasService] })
export class CuentasModule {}
