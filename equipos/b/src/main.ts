import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';

const service = process.env.SERVICE_NAME;
if (!['m3', 'm4', 'm5'].includes(service ?? '')) throw new Error('SERVICE_NAME debe ser m3, m4 o m5');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
@Controller()
class HealthController {
  @Get('health') async health() { await pool.query('SELECT 1'); return { status: 'ok', service }; }
}
@Module({ controllers: [HealthController] })
class AppModule {}
async function main() { const app = await NestFactory.create(AppModule); app.enableShutdownHooks(); await app.listen(3000, '0.0.0.0'); }
void main();
