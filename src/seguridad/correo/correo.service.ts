import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export interface Correo {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

/**
 * Envío de correos por el servidor SMTP de Gmail con TLS en el puerto 587
 * (Figuras 6.1 y 6.14). Las credenciales vienen del .env (RNF-23).
 * En desarrollo, si no hay SMTP_USER, el correo se muestra en la consola
 * para poder probar el flujo sin una cuenta de Gmail.
 */
@Injectable()
export class CorreoService {
  private readonly logger = new Logger(CorreoService.name);
  private transporte: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  get configurado(): boolean {
    return Boolean(
      this.config.get<string>('SMTP_USER') &&
      this.config.get<string>('SMTP_PASS'),
    );
  }

  async enviar(correo: Correo): Promise<void> {
    if (!this.configurado) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new Error(
          'SMTP_USER y SMTP_PASS son obligatorios en producción.',
        );
      }
      this.logger.warn(
        `SMTP sin configurar. Correo para ${correo.para} | ${correo.asunto}\n${correo.texto}`,
      );
      return;
    }

    this.transporte ??= nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST') || 'smtp.gmail.com',
      port: Number(this.config.get<string>('SMTP_PORT') || 587),
      secure: false,
      requireTLS: true,
      auth: {
        user: this.config.getOrThrow<string>('SMTP_USER'),
        pass: this.config.getOrThrow<string>('SMTP_PASS'),
      },
    });

    await this.transporte.sendMail({
      from: `"Sistema CAL · Cambridge Academy" <${this.config.getOrThrow<string>('SMTP_USER')}>`,
      to: correo.para,
      subject: correo.asunto,
      text: correo.texto,
      html: correo.html,
    });
  }
}
