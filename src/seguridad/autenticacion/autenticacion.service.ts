import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { Sesion } from '../entidades/sesion.entity.js';
import { Usuario } from '../entidades/usuario.entity.js';
import { RespuestaSesionDto } from './dto/respuesta-sesion.dto.js';
import {
  hashRefreshToken,
  PayloadAccess,
  PayloadRefresh,
  VIGENCIA_ACCESS_SEGUNDOS,
  VIGENCIA_REFRESH_SEGUNDOS,
} from './tokens.js';

/** RNF-05: bcrypt con 10 salt rounds. */
export const SALT_ROUNDS = 10;

/** Mismo mensaje para email inexistente, contraseña incorrecta o cuenta inactiva: no revela cuál falló. */
export const MENSAJE_CREDENCIALES_INVALIDAS = 'Email o contraseña incorrectos.';

// Hash de relleno para que un email inexistente tarde lo mismo que una contraseña incorrecta.
const HASH_DE_RELLENO = bcrypt.hashSync(
  'relleno-para-tiempo-constante',
  SALT_ROUNDS,
);

@Injectable()
export class AutenticacionService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(Sesion) private readonly sesiones: Repository<Sesion>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** RF-01 y Figura 6.3: valida credenciales, emite tokens y guarda el hash del Refresh Token en SESION. */
  async iniciarSesion(
    email: string,
    contrasena: string,
    ip: string | null,
  ): Promise<RespuestaSesionDto> {
    const usuario = await this.usuarios
      .createQueryBuilder('usuario')
      .addSelect('usuario.contrasenaHash')
      .where('usuario.email = :email', { email: email.trim().toLowerCase() })
      .getOne();

    const contrasenaValida = await bcrypt.compare(
      contrasena,
      usuario?.contrasenaHash ?? HASH_DE_RELLENO,
    );

    if (!usuario || !contrasenaValida || !usuario.activo) {
      // Los intentos sobre cuentas existentes quedan en el Audit Log. Los de un
      // email inexistente no tienen usuario al cual asociarse (Figura 6.8) y
      // los frena el límite de 10 intentos por minuto del controlador.
      if (usuario) {
        await this.auditoria.registrar({
          usuarioId: usuario.id,
          modulo: 'SEGURIDAD',
          accion: 'LOGIN_FALLIDO',
          detalle: usuario.activo ? 'Contraseña incorrecta' : 'Cuenta inactiva',
          ip,
        });
      }
      throw new UnauthorizedException(MENSAJE_CREDENCIALES_INVALIDAS);
    }

    const respuesta = await this.emitirTokens(usuario);
    await this.auditoria.registrar({
      usuarioId: usuario.id,
      modulo: 'SEGURIDAD',
      accion: 'LOGIN',
      ip,
    });
    return respuesta;
  }

  private async emitirTokens(usuario: Usuario): Promise<RespuestaSesionDto> {
    const payloadAccess: PayloadAccess = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
    };
    const accessToken = await this.jwt.signAsync(payloadAccess, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      algorithm: 'HS256',
      expiresIn: VIGENCIA_ACCESS_SEGUNDOS,
    });

    const sesionId = randomUUID();
    const payloadRefresh: PayloadRefresh = { sub: usuario.id, sid: sesionId };
    const refreshToken = await this.jwt.signAsync(payloadRefresh, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      algorithm: 'HS256',
      expiresIn: VIGENCIA_REFRESH_SEGUNDOS,
    });

    await this.sesiones.insert({
      id: sesionId,
      usuario: { id: usuario.id },
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiraEn: new Date(Date.now() + VIGENCIA_REFRESH_SEGUNDOS * 1000),
    });

    return {
      accessToken,
      refreshToken,
      tipoToken: 'Bearer',
      expiraEn: VIGENCIA_ACCESS_SEGUNDOS,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
      },
    };
  }
}
