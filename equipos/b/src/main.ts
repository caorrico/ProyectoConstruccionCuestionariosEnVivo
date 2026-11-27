import 'reflect-metadata';
import { Controller, Get, Header, Module, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request } from 'express';
import { Pool } from 'pg';
import { authorizeTeacherOrAdmin } from './identity';
import { identityConfigFromEnv } from './identity-config';

const service = process.env.SERVICE_NAME;
if (!['m3', 'm4', 'm5'].includes(service ?? '')) throw new Error('SERVICE_NAME debe ser m3, m4 o m5');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
@Controller()
class HealthController {
  @Get('health') async health() { await pool.query('SELECT 1'); return { status: 'ok', service }; }
}
@Controller('api/v1/games')
class SessionController {
  @Get('session') @Header('Cache-Control','no-store') async session(@Req() req: Request) {
    const cookies=(req.headers.cookie ?? '').split(';').map(x=>x.trim()).filter(x=>x.startsWith('cv_acceso='));
    if(cookies.length!==1) throw new UnauthorizedException('Sesión no válida');
    let config;
    try { config=identityConfigFromEnv(process.env); } catch { throw new ServiceUnavailableException('Proveedor de identidad no configurado'); }
    try { const principal=await authorizeTeacherOrAdmin(cookies[0].slice('cv_acceso='.length),'DOCENTE',config); return {user_id:principal.userId,roles:principal.roles}; }
    catch { throw new UnauthorizedException('Sesión no válida'); }
  }
}
@Module({ controllers: service==='m3' ? [HealthController,SessionController] : [HealthController] })
class AppModule {}
async function main() { const app = await NestFactory.create(AppModule); app.enableShutdownHooks(); await app.listen(Number(process.env.PORT || 3000), '0.0.0.0'); }
void main();
