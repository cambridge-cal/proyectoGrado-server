import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { LessThan, Repository } from 'typeorm';
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

/** RF-02 y RF-03: mismo mensaje para cualquier Refresh Token que no sirva. */
export const MENSAJE_SESION_INVALIDA =
  'La sesión no es válida o expiró. Inicia sesión de nuevo.';

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

    // Limpieza: las sesiones vencidas del usuario ya no sirven para nada.
    await this.sesiones.delete({
      usuario: { id: usuario.id },
      expiraEn: LessThan(new Date()),
    });

    const respuesta = await this.emitirTokens(usuario);
    await this.auditoria.registrar({
      usuarioId: usuario.id,
      modulo: 'SEGURIDAD',
      accion: 'LOGIN',
      ip,
    });
    return respuesta;
  }

  /**
   * RF-02 y RNF-06: emite un Access Token nuevo a partir de un Refresh Token válido.
   * El Refresh Token usado se invalida y se entrega uno nuevo (rotación).
   * Si llega un Refresh Token bien firmado pero ya usado, se asume que fue robado
   * y se cierran todas las sesiones del usuario.
   */
  async renovar(
    refreshToken: string,
    ip: string | null,
  ): Promise<RespuestaSesionDto> {
    const payload = await this.verificarRefresh(refreshToken);
    if (!payload) throw new UnauthorizedException(MENSAJE_SESION_INVALIDA);

    const sesion = await this.sesiones.findOne({
      where: { id: payload.sid },
      relations: { usuario: true },
    });

    if (!sesion || sesion.usuario.id !== payload.sub) {
      await this.sesiones.delete({ usuario: { id: payload.sub } });
      const existe = await this.usuarios.existsBy({ id: payload.sub });
      if (existe) {
        await this.auditoria.registrar({
          usuarioId: payload.sub,
          modulo: 'SEGURIDAD',
          accion: 'REFRESH_REUTILIZADO',
          detalle: 'Se cerraron todas las sesiones del usuario por seguridad.',
          ip,
        });
      }
      throw new UnauthorizedException(MENSAJE_SESION_INVALIDA);
    }

    const valida =
      sesion.refreshTokenHash === hashRefreshToken(refreshToken) &&
      sesion.expiraEn.getTime() > Date.now() &&
      sesion.usuario.activo;

    // El token usado se invalida siempre, sea válido o no.
    await this.sesiones.delete({ id: sesion.id });
    if (!valida) throw new UnauthorizedException(MENSAJE_SESION_INVALIDA);

    return this.emitirTokens(sesion.usuario);
  }

  /** RF-03: invalida el Refresh Token en SESION. Responde igual si ya estaba invalidado. */
  async cerrarSesion(refreshToken: string, ip: string | null): Promise<void> {
    const payload = await this.verificarRefresh(refreshToken, true);
    if (!payload) return;

    const sesion = await this.sesiones.findOne({
      where: { id: payload.sid },
      relations: { usuario: true },
    });
    if (!sesion || sesion.refreshTokenHash !== hashRefreshToken(refreshToken))
      return;

    await this.sesiones.delete({ id: sesion.id });
    await this.auditoria.registrar({
      usuarioId: sesion.usuario.id,
      modulo: 'SEGURIDAD',
      accion: 'LOGOUT',
      ip,
    });
  }

  /** Verifica firma y vigencia del Refresh Token. Al cerrar sesión se acepta uno vencido. */
  private async verificarRefresh(
    token: string,
    ignorarVencimiento = false,
  ): Promise<PayloadRefresh | null> {
    try {
      const payload = await this.jwt.verifyAsync<PayloadRefresh>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        algorithms: ['HS256'],
        ignoreExpiration: ignorarVencimiento,
      });
      return payload.sub && payload.sid ? payload : null;
    } catch {
      return null;
    }
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
