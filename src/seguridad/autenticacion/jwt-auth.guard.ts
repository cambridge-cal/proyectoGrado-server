import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { CLAVE_PUBLICO } from '../autorizacion/decoradores.js';
import { PayloadAccess } from './tokens.js';

export type PeticionAutenticada = Request & { usuario: PayloadAccess };

/**
 * Exige un Access Token válido en la cabecera Authorization: Bearer (RNF-06).
 * Está registrado para toda la API: solo las rutas con @Publico() quedan abiertas.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publico) return true;

    const peticion = contexto.switchToHttp().getRequest<PeticionAutenticada>();
    const [tipo, token] = peticion.headers.authorization?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token)
      throw new UnauthorizedException('Falta el token de acceso.');

    try {
      peticion.usuario = await this.jwt.verifyAsync<PayloadAccess>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        algorithms: ['HS256'],
      });
      return true;
    } catch {
      throw new UnauthorizedException(
        'El token de acceso no es válido o expiró.',
      );
    }
  }
}
