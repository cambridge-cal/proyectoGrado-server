import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { PayloadAccess } from '../autenticacion/tokens.js';
import type { Rol } from '../entidades/rol.enum.js';

export const CLAVE_PUBLICO = 'publico';
export const CLAVE_ROLES = 'roles';

/** Ruta que no exige Access Token (login, recuperación de contraseña, salud). */
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);

/** Roles que pueden usar la ruta o el controlador (RF-07). Sin este decorador basta con estar autenticado. */
export const Roles = (...roles: Rol[]) => SetMetadata(CLAVE_ROLES, roles);

/** Usuario dueño del Access Token de la petición. */
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): PayloadAccess =>
    contexto.switchToHttp().getRequest<{ usuario: PayloadAccess }>().usuario,
);
