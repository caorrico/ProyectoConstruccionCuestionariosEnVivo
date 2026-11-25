import { Body, Controller, HttpCode, Module, Post } from '@nestjs/common';
import { CuentasService } from './cuentas.service';
import { RegistroDto } from './registro.dto';

@Controller('api/v1/auth')
export class CuentasController {
  constructor(private readonly cuentas: CuentasService) {}

  // RF-01: el docente queda SIN_VERIFICAR hasta confirmar su correo.
  @Post('register')
  @HttpCode(201)
  registrar(@Body() dto: RegistroDto) {
    return this.cuentas.registrar(dto);
  }
}

@Module({ controllers: [CuentasController], providers: [CuentasService] })
export class CuentasModule {}
