import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PayloadAccess } from '../autenticacion/tokens.js';
import type { Rol } from '../entidades/rol.enum.js';
import { CLAVE_PUBLICO, CLAVE_ROLES } from './decoradores.js';

/** Control de acceso por roles (RF-07, Figura 6.2). Se ejecuta después de JwtAuthGuard. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const objetivos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, objetivos))
      return true;

    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(
      CLAVE_ROLES,
      objetivos,
    );
    if (!roles?.length) return true;

    const usuario = contexto
      .switchToHttp()
      .getRequest<{ usuario?: PayloadAccess }>().usuario;
    if (usuario && roles.includes(usuario.rol)) return true;
    throw new ForbiddenException(
      'Tu rol no tiene permiso para esta operación.',
    );
  }
}
