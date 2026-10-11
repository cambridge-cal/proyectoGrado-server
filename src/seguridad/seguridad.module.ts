import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENTIDADES_SEGURIDAD } from './entidades/index.js';

/** Módulo de Seguridad: Autenticación JWT, control de acceso por roles y registro de auditoría (RF-01 a RF-08). */
@Module({
  imports: [TypeOrmModule.forFeature(ENTIDADES_SEGURIDAD)],
  exports: [TypeOrmModule],
})
export class SeguridadModule {}
