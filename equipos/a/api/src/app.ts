import 'reflect-metadata';
import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  INestApplication,
  Module,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Pool } from 'pg';
import { CuentasModule } from './cuentas/cuentas.module';
import { DatabaseModule, PG_POOL } from './database';

export type Servicio = 'm1' | 'm2';
const SERVICE_NAME = Symbol('SERVICE_NAME');

@Controller()
class HealthController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pick<Pool, 'query'>,
    @Inject(SERVICE_NAME) private readonly service: Servicio,
  ) {}

  @Get('health')
  async health() {
    await this.pool.query('SELECT 1');
    return { status: 'ok', service: this.service };
  }
}

@Module({})
class AppModule {}

// Errores de validación en español, agrupados por campo para el formulario.
export function erroresPorCampo(errors: ValidationError[]): BadRequestException {
  const campos: Record<string, string> = {};
  for (const error of errors) {
    const mensajes = Object.values(error.constraints ?? {});
    campos[error.property] = mensajes.at(-1) ?? 'Valor no permitido';
  }
  return new BadRequestException({ statusCode: 400, message: 'Revisa los datos enviados', errors: campos });
}

export async function buildApp(service: Servicio, pool: Pick<Pool, 'query' | 'connect'>): Promise<INestApplication> {
  const app = await NestFactory.create(
    {
      module: AppModule,
      imports: [DatabaseModule.forPool(pool), ...(service === 'm1' ? [CuentasModule] : [])],
      controllers: [HealthController],
      providers: [{ provide: SERVICE_NAME, useValue: service }],
    },
    { logger: ['error', 'warn'] },
  );
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: true,
      exceptionFactory: erroresPorCampo,
    }),
  );
  return app;
}
