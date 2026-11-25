import { DynamicModule, Module } from '@nestjs/common';
import type { Pool } from 'pg';

export const PG_POOL = Symbol('PG_POOL');

// Comparte el pool de PostgreSQL con todos los módulos del servicio.
@Module({})
export class DatabaseModule {
  static forPool(pool: Pick<Pool, 'query' | 'connect'>): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: [{ provide: PG_POOL, useValue: pool }],
      exports: [PG_POOL],
    };
  }
}
