import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';

const SERVICES = ['m1', 'm2'] as const;
const service = process.env.SERVICE_NAME;
if (!SERVICES.includes(service as (typeof SERVICES)[number])) {
  throw new Error('SERVICE_NAME debe ser m1 o m2');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

@Controller()
class HealthController {
  @Get('health')
  async health() {
    await pool.query('SELECT 1');
    return { status: 'ok', service };
  }
}

@Module({ controllers: [HealthController] })
class AppModule {}

async function main() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(3000, '0.0.0.0');
}

void main();
