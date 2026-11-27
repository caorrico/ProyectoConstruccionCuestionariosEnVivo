import { DynamicModule, Module } from '@nestjs/common';

// Reloj inyectable: las reglas con tiempo (RN-04) se prueban sin esperar minutos reales.
export const RELOJ = Symbol('RELOJ');
export type Reloj = () => Date;
export const relojSistema: Reloj = () => new Date();

@Module({})
export class RelojModule {
  static forReloj(reloj: Reloj = relojSistema): DynamicModule {
    return { module: RelojModule, global: true, providers: [{ provide: RELOJ, useValue: reloj }], exports: [RELOJ] };
  }
}
