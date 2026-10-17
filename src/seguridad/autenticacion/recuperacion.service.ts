import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { CorreoService } from '../correo/correo.service.js';
import { Sesion } from '../entidades/sesion.entity.js';
import { Usuario } from '../entidades/usuario.entity.js';
import { SALT_ROUNDS } from './autenticacion.service.js';

/** RF-04: el enlace de restablecimiento vence en 30 minutos. */
export const VIGENCIA_RESTABLECER_SEGUNDOS = 30 * 60;

export const MENSAJE_RECUPERACION =
  'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.';

export const MENSAJE_ENLACE_INVALIDO =
  'El enlace de restablecimiento no es válido o ya venció. Solicita uno nuevo.';

interface PayloadRestablecer {
  sub: string;
  proposito: 'restablecer';
}

/**
 * Recuperación y restablecimiento de contraseña (RF-04 y RF-05).
 *
 * El token no se guarda en la base: es un JWT de 30 minutos firmado con
 * JWT_SECRET más el hash actual de la contraseña. Cuando la contraseña cambia,
 * la firma deja de coincidir, así que cada enlace sirve una sola vez y los
 * enlaces anteriores quedan anulados.
 */
@Injectable()
export class RecuperacionService {
  private readonly logger = new Logger(RecuperacionService.name);

  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(Sesion) private readonly sesiones: Repository<Sesion>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly correo: CorreoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** RF-04. Responde lo mismo exista o no el correo, para no revelar qué cuentas existen. */
  async solicitar(
    email: string,
    ip: string | null,
  ): Promise<{ mensaje: string }> {
    const usuario = await this.buscarConHash('usuario.email = :email', {
      email: email.trim().toLowerCase(),
    });

    if (usuario?.activo) {
      const token = await this.jwt.signAsync(
        {
          sub: usuario.id,
          proposito: 'restablecer',
        } satisfies PayloadRestablecer,
        {
          secret: this.secretoPara(usuario.contrasenaHash),
          algorithm: 'HS256',
          expiresIn: VIGENCIA_RESTABLECER_SEGUNDOS,
        },
      );
      const urlCliente = (
        this.config.get<string>('URL_CLIENTE') || 'http://localhost:5173'
      ).replace(/\/$/, '');
      const enlace = `${urlCliente}/restablecer-contrasena?token=${encodeURIComponent(token)}`;

      try {
        await this.correo.enviar(
          correoRecuperacion(usuario.nombre, usuario.email, enlace),
        );
      } catch (error) {
        // No se revela al cliente: la respuesta debe ser la misma en todos los casos.
        this.logger.error(
          `No se pudo enviar el correo a ${usuario.email}`,
          error as Error,
        );
      }

      await this.auditoria.registrar({
        usuarioId: usuario.id,
        modulo: 'SEGURIDAD',
        accion: 'RECUPERACION_SOLICITADA',
        ip,
      });
    }

    return { mensaje: MENSAJE_RECUPERACION };
  }

  /** RF-05. Valida la vigencia del token antes de cambiar la contraseña. */
  async restablecer(
    token: string,
    nuevaContrasena: string,
    ip: string | null,
  ): Promise<{ mensaje: string }> {
    const sub = (
      this.jwt.decode<Partial<PayloadRestablecer> | null>(token) ?? {}
    ).sub;
    const usuario = sub
      ? await this.buscarConHash('usuario.id = :id', { id: sub })
      : null;
    if (!usuario?.activo)
      throw new BadRequestException(MENSAJE_ENLACE_INVALIDO);

    try {
      const payload = await this.jwt.verifyAsync<PayloadRestablecer>(token, {
        secret: this.secretoPara(usuario.contrasenaHash),
        algorithms: ['HS256'],
      });
      if (payload.proposito !== 'restablecer') throw new Error('propósito');
    } catch {
      throw new BadRequestException(MENSAJE_ENLACE_INVALIDO);
    }

    await this.usuarios.update(
      { id: usuario.id },
      { contrasenaHash: await bcrypt.hash(nuevaContrasena, SALT_ROUNDS) },
    );
    // Con la contraseña nueva se cierran todas las sesiones abiertas.
    await this.sesiones.delete({ usuario: { id: usuario.id } });
    await this.auditoria.registrar({
      usuarioId: usuario.id,
      modulo: 'SEGURIDAD',
      accion: 'CONTRASENA_RESTABLECIDA',
      ip,
    });

    return { mensaje: 'Tu contraseña se actualizó. Ya puedes iniciar sesión.' };
  }

  private buscarConHash(condicion: string, parametros: Record<string, string>) {
    return this.usuarios
      .createQueryBuilder('usuario')
      .addSelect('usuario.contrasenaHash')
      .where(condicion, parametros)
      .getOne();
  }

  private secretoPara(contrasenaHash: string): string {
    return `${this.config.getOrThrow<string>('JWT_SECRET')}:${contrasenaHash}`;
  }
}

function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function correoRecuperacion(
  nombre: string,
  email: string,
  enlace: string,
) {
  const asunto = 'Restablece tu contraseña del Sistema CAL';
  const texto = [
    `Hola, ${nombre}.`,
    '',
    'Recibimos una solicitud para restablecer la contraseña de tu cuenta del Sistema CAL.',
    'Abre este enlace para crear una contraseña nueva. Vence en 30 minutos y solo se puede usar una vez:',
    '',
    enlace,
    '',
    'Si no fuiste tú, ignora este correo: tu contraseña no cambiará.',
    '',
    'Cambridge Academy of Languages',
  ].join('\n');
  const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#f2f4f7;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8ee;border-radius:12px">
        <tr><td style="background:#0e1a34;color:#ffffff;padding:20px 28px;border-radius:12px 12px 0 0;font-weight:bold;font-size:16px">Cambridge Academy of Languages</td></tr>
        <tr><td style="padding:28px">
          <p style="margin:0 0 12px;font-size:18px;font-weight:bold">Restablece tu contraseña</p>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6">Hola, ${escaparHtml(nombre)}. Recibimos una solicitud para restablecer la contraseña de <strong>${escaparHtml(email)}</strong>.</p>
          <p style="margin:0 0 24px"><a href="${escaparHtml(enlace)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 20px;border-radius:10px">Crear contraseña nueva</a></p>
          <p style="margin:0 0 8px;font-size:13px;color:#475569">El enlace vence en 30 minutos y solo se puede usar una vez.</p>
          <p style="margin:0;font-size:13px;color:#475569">Si no fuiste tú, ignora este correo: tu contraseña no cambiará.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { para: email, asunto, texto, html };
}
