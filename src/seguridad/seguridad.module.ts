import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaService } from './auditoria/auditoria.service.js';
import { AutenticacionController } from './autenticacion/autenticacion.controller.js';
import { AutenticacionService } from './autenticacion/autenticacion.service.js';
import { JwtAuthGuard } from './autenticacion/jwt-auth.guard.js';
import { RecuperacionService } from './autenticacion/recuperacion.service.js';
import { RolesGuard } from './autorizacion/roles.guard.js';
import { CorreoService } from './correo/correo.service.js';
import { ENTIDADES_SEGURIDAD } from './entidades/index.js';
import { UsuariosController } from './usuarios/usuarios.controller.js';
import { UsuariosService } from './usuarios/usuarios.service.js';

/** Módulo de Seguridad: Autenticación JWT, control de acceso por roles y registro de auditoría (RF-01 a RF-08). */
@Module({
  // Los secretos se pasan en cada firma y verificación desde ConfigService.
  imports: [
    TypeOrmModule.forFeature(ENTIDADES_SEGURIDAD),
    JwtModule.register({}),
  ],
  controllers: [AutenticacionController, UsuariosController],
  providers: [
    AutenticacionService,
    RecuperacionService,
    CorreoService,
    AuditoriaService,
    UsuariosService,
    JwtAuthGuard,
    // RF-07: toda la API exige Access Token y luego se revisa el rol.
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [TypeOrmModule, AuditoriaService, JwtAuthGuard, JwtModule],
})
export class SeguridadModule {}
