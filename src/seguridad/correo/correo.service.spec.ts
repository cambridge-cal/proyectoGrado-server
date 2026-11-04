import { ConfigService } from '@nestjs/config';
import { CorreoService } from './correo.service.js';

function crearConfig(valores: Record<string, string>): ConfigService {
  return {
    get: vi.fn((clave: string) => valores[clave] ?? undefined),
    getOrThrow: vi.fn((clave: string) => {
      if (valores[clave] === undefined)
        throw new Error(`${clave} no definida`);
      return valores[clave];
    }),
  } as unknown as ConfigService;
}

describe('CorreoService', () => {
  it('configurado devuelve false si falta SMTP_USER', () => {
    const servicio = new CorreoService(crearConfig({ SMTP_PASS: 'clave' }));
    expect(servicio.configurado).toBe(false);
  });

  it('configurado devuelve false si falta SMTP_PASS', () => {
    const servicio = new CorreoService(
      crearConfig({ SMTP_USER: 'user@gmail.com' }),
    );
    expect(servicio.configurado).toBe(false);
  });

  it('configurado devuelve true si ambos están definidos', () => {
    const servicio = new CorreoService(
      crearConfig({ SMTP_USER: 'user@gmail.com', SMTP_PASS: 'clave' }),
    );
    expect(servicio.configurado).toBe(true);
  });

  it('enviar sin config en desarrollo solo emite un warn', async () => {
    const servicio = new CorreoService(
      crearConfig({ NODE_ENV: 'development' }),
    );
    const warn = vi
      .spyOn(servicio['logger'], 'warn')
      .mockImplementation(() => undefined);

    await servicio.enviar({
      para: 'test@cambridge.edu.co',
      asunto: 'Prueba',
      texto: 'texto',
      html: '<p>html</p>',
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('test@cambridge.edu.co'));
  });

  it('enviar sin config en producción lanza error', async () => {
    const servicio = new CorreoService(
      crearConfig({ NODE_ENV: 'production' }),
    );

    await expect(
      servicio.enviar({
        para: 'test@cambridge.edu.co',
        asunto: 'Prueba',
        texto: 'texto',
        html: '<p>html</p>',
      }),
    ).rejects.toThrow(/SMTP_USER y SMTP_PASS son obligatorios/);
  });
});
