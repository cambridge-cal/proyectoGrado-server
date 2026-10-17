import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { CorreoService } from '../correo/correo.service.js';
import { Rol } from '../entidades/rol.enum.js';
import {
  correoRecuperacion,
  MENSAJE_ENLACE_INVALIDO,
  MENSAJE_RECUPERACION,
  RecuperacionService,
  VIGENCIA_RESTABLECER_SEGUNDOS,
} from './recuperacion.service.js';

const CONFIG: Record<string, string> = {
  JWT_SECRET: 'secreto-access-de-pruebas-0123456789',
  URL_CLIENTE: 'http://localhost:5173/',
};
const hashInicial = bcrypt.hashSync('ClaveVieja1', 4);

function crear(usuario: Record<string, unknown> | null) {
  let actual = usuario ? { ...usuario } : null;
  const consulta = {
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getOne: vi.fn(async () => actual),
  };
  const usuarios = {
    createQueryBuilder: vi.fn(() => consulta),
    update: vi.fn(
      async (_filtro: unknown, cambios: Record<string, unknown>) => {
        actual = { ...actual, ...cambios };
      },
    ),
  };
  const sesiones = { delete: vi.fn().mockResolvedValue(undefined) };
  const correo = { enviar: vi.fn().mockResolvedValue(undefined) };
  const auditoria = { registrar: vi.fn().mockResolvedValue(undefined) };
  const config = {
    get: (clave: string) => CONFIG[clave],
    getOrThrow: (clave: string) => CONFIG[clave],
  } as unknown as ConfigService;
  const servicio = new RecuperacionService(
    usuarios as never,
    sesiones as never,
    new JwtService(),
    config,
    correo as unknown as CorreoService,
    auditoria as unknown as AuditoriaService,
  );
  return { servicio, usuarios, sesiones, correo, auditoria };
}

const usuario = {
  id: 'u-1',
  nombre: 'Ana Pérez',
  email: 'ana@cambridge.edu.co',
  rol: Rol.DOCENTE,
  activo: true,
  contrasenaHash: hashInicial,
};

function tokenDelCorreo(correo: { enviar: ReturnType<typeof vi.fn> }): string {
  const { texto } = correo.enviar.mock.calls[0][0];
  const enlace = texto.split('\n').find((l: string) => l.startsWith('http'));
  return decodeURIComponent(new URL(enlace).searchParams.get('token')!);
}

describe('RecuperacionService.solicitar (RF-04)', () => {
  it('envía un enlace al cliente con un token que vence en 30 minutos', async () => {
    const { servicio, correo, auditoria } = crear(usuario);
    const respuesta = await servicio.solicitar(
      ' Ana@Cambridge.edu.co ',
      '10.0.0.1',
    );

    expect(respuesta).toEqual({ mensaje: MENSAJE_RECUPERACION });
    const enviado = correo.enviar.mock.calls[0][0];
    expect(enviado.para).toBe('ana@cambridge.edu.co');
    expect(enviado.texto).toContain(
      'http://localhost:5173/restablecer-contrasena?token=',
    );

    const payload = new JwtService().decode(tokenDelCorreo(correo));
    expect(payload.exp - payload.iat).toBe(VIGENCIA_RESTABLECER_SEGUNDOS);
    expect(payload).toMatchObject({ sub: 'u-1', proposito: 'restablecer' });
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'RECUPERACION_SOLICITADA' }),
    );
  });

  it.each([
    ['el correo no existe', null],
    ['la cuenta está inactiva', { ...usuario, activo: false }],
  ])('si %s responde lo mismo y no envía nada', async (_caso, fila) => {
    const { servicio, correo } = crear(fila);
    await expect(
      servicio.solicitar('x@cambridge.edu.co', null),
    ).resolves.toEqual({
      mensaje: MENSAJE_RECUPERACION,
    });
    expect(correo.enviar).not.toHaveBeenCalled();
  });

  it('si el correo falla, igual responde el mensaje genérico', async () => {
    const { servicio, correo } = crear(usuario);
    correo.enviar.mockRejectedValue(new Error('SMTP caído'));
    await expect(servicio.solicitar(usuario.email, null)).resolves.toEqual({
      mensaje: MENSAJE_RECUPERACION,
    });
  });
});

describe('RecuperacionService.restablecer (RF-05)', () => {
  it('cambia la contraseña, cierra todas las sesiones y lo audita', async () => {
    const { servicio, usuarios, sesiones, correo, auditoria } = crear(usuario);
    await servicio.solicitar(usuario.email, null);
    const token = tokenDelCorreo(correo);

    await servicio.restablecer(token, 'ClaveNueva2026', '10.0.0.2');

    const nuevoHash = usuarios.update.mock.calls[0][1].contrasenaHash as string;
    expect(await bcrypt.compare('ClaveNueva2026', nuevoHash)).toBe(true);
    expect(sesiones.delete).toHaveBeenCalledWith({ usuario: { id: 'u-1' } });
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'CONTRASENA_RESTABLECIDA',
        ip: '10.0.0.2',
      }),
    );
  });

  it('el mismo enlace no sirve dos veces', async () => {
    const { servicio, correo } = crear(usuario);
    await servicio.solicitar(usuario.email, null);
    const token = tokenDelCorreo(correo);

    await servicio.restablecer(token, 'ClaveNueva2026', null);
    await expect(
      servicio.restablecer(token, 'OtraClave2026', null),
    ).rejects.toThrow(MENSAJE_ENLACE_INVALIDO);
  });

  it('rechaza un enlace vencido', async () => {
    const { servicio } = crear(usuario);
    const vencido = new JwtService().sign(
      {
        sub: 'u-1',
        proposito: 'restablecer',
        exp: Math.floor(Date.now() / 1000) - 5,
      },
      { secret: `${CONFIG.JWT_SECRET}:${hashInicial}` },
    );
    await expect(
      servicio.restablecer(vencido, 'ClaveNueva2026', null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no acepta un Access Token como enlace de restablecimiento', async () => {
    const { servicio } = crear(usuario);
    const access = new JwtService().sign(
      { sub: 'u-1', rol: 'DOCENTE' },
      { secret: CONFIG.JWT_SECRET, expiresIn: 60 },
    );
    await expect(
      servicio.restablecer(access, 'ClaveNueva2026', null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('correoRecuperacion', () => {
  it('escapa el nombre en el HTML', () => {
    const { html } = correoRecuperacion(
      '<script>x</script>',
      'a@b.co',
      'http://x',
    );
    expect(html).not.toContain('<script>x</script>');
  });
});
