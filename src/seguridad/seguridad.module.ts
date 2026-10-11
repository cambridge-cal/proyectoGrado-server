import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaService } from './auditoria/auditoria.service.js';
import { AutenticacionController } from './autenticacion/autenticacion.controller.js';
import { AutenticacionService } from './autenticacion/autenticacion.service.js';
import { JwtAuthGuard } from './autenticacion/jwt-auth.guard.js';
import { ENTIDADES_SEGURIDAD } from './entidades/index.js';

/** Módulo de Seguridad: Autenticación JWT, control de acceso por roles y registro de auditoría (RF-01 a RF-08). */
@Module({
  // Los secretos se pasan en cada firma y verificación desde ConfigService.
  imports: [
    TypeOrmModule.forFeature(ENTIDADES_SEGURIDAD),
    JwtModule.register({}),
  ],
  controllers: [AutenticacionController],
  providers: [AutenticacionService, AuditoriaService, JwtAuthGuard],
  exports: [TypeOrmModule, AuditoriaService, JwtAuthGuard, JwtModule],
})
export class SeguridadModule {}
