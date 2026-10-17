import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { Rol } from '../entidades/rol.enum.js';
import {
  AutenticacionService,
  MENSAJE_CREDENCIALES_INVALIDAS,
  SALT_ROUNDS,
} from './autenticacion.service.js';
import {
  hashRefreshToken,
  VIGENCIA_ACCESS_SEGUNDOS,
  VIGENCIA_REFRESH_SEGUNDOS,
} from './tokens.js';

const SECRETOS: Record<string, string> = {
  JWT_SECRET: 'secreto-access-de-pruebas-0123456789',
  JWT_REFRESH_SECRET: 'secreto-refresh-de-pruebas-0123456789',
};
const CONTRASENA = 'ClaveSegura2026';
const hash = bcrypt.hashSync(CONTRASENA, SALT_ROUNDS);

function crearServicio(usuario: Record<string, unknown> | null) {
  const consulta = {
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getOne: vi.fn().mockResolvedValue(usuario),
  };
  const usuarios = { createQueryBuilder: vi.fn(() => consulta) };
  const sesiones = {
    insert: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const auditoria = { registrar: vi.fn().mockResolvedValue(undefined) };
  const config = {
    getOrThrow: (clave: string) => SECRETOS[clave],
  } as unknown as ConfigService;
  const jwt = new JwtService();
  const servicio = new AutenticacionService(
    usuarios as never,
    sesiones as never,
    jwt,
    config,
    auditoria as unknown as AuditoriaService,
  );
  return { servicio, consulta, sesiones, auditoria, jwt };
}

const usuarioActivo = {
  id: '6f1c2a3b-0000-4000-8000-000000000001',
  nombre: 'Ana Pérez',
  email: 'ana@cambridge.edu.co',
  rol: Rol.DOCENTE,
  activo: true,
  contrasenaHash: hash,
};

describe('AutenticacionService.iniciarSesion (RF-01)', () => {
  it('con credenciales válidas devuelve Access Token de 8 h y Refresh Token de 7 d', async () => {
    const { servicio, jwt } = crearServicio(usuarioActivo);
    const respuesta = await servicio.iniciarSesion(
      'ana@cambridge.edu.co',
      CONTRASENA,
      '10.0.0.1',
    );

    const access = jwt.verify(respuesta.accessToken, {
      secret: SECRETOS.JWT_SECRET,
    });
    expect(access).toMatchObject({
      sub: usuarioActivo.id,
      rol: 'DOCENTE',
      email: usuarioActivo.email,
    });
    expect(access.exp - access.iat).toBe(VIGENCIA_ACCESS_SEGUNDOS);

    const refresh = jwt.verify(respuesta.refreshToken, {
      secret: SECRETOS.JWT_REFRESH_SECRET,
    });
    expect(refresh.exp - refresh.iat).toBe(VIGENCIA_REFRESH_SEGUNDOS);

    expect(respuesta.usuario).toEqual({
      id: usuarioActivo.id,
      nombre: 'Ana Pérez',
      email: 'ana@cambridge.edu.co',
      rol: 'DOCENTE',
    });
    expect(respuesta).not.toHaveProperty('usuario.contrasenaHash');
  });

  it('el Access Token no sirve como Refresh Token: usan secretos distintos', async () => {
    const { servicio, jwt } = crearServicio(usuarioActivo);
    const { accessToken } = await servicio.iniciarSesion(
      usuarioActivo.email,
      CONTRASENA,
      null,
    );
    expect(() =>
      jwt.verify(accessToken, { secret: SECRETOS.JWT_REFRESH_SECRET }),
    ).toThrow();
  });

  it('guarda en SESION solo el hash del Refresh Token, con su vencimiento', async () => {
    const { servicio, sesiones } = crearServicio(usuarioActivo);
    const antes = Date.now();
    const { refreshToken } = await servicio.iniciarSesion(
      usuarioActivo.email,
      CONTRASENA,
      null,
    );

    const fila = sesiones.insert.mock.calls[0][0];
    expect(fila.refreshTokenHash).toBe(hashRefreshToken(refreshToken));
    expect(fila.refreshTokenHash).not.toContain(refreshToken);
    expect(fila.usuario).toEqual({ id: usuarioActivo.id });
    expect(fila.expiraEn.getTime()).toBeGreaterThanOrEqual(
      antes + VIGENCIA_REFRESH_SEGUNDOS * 1000,
    );
  });

  it('el sid del Refresh Token es el id de la fila de SESION', async () => {
    const { servicio, sesiones, jwt } = crearServicio(usuarioActivo);
    const { refreshToken } = await servicio.iniciarSesion(
      usuarioActivo.email,
      CONTRASENA,
      null,
    );
    expect(jwt.decode(refreshToken).sid).toBe(
      sesiones.insert.mock.calls[0][0].id,
    );
  });

  it('registra el inicio de sesión con la IP en el Audit Log', async () => {
    const { servicio, auditoria } = crearServicio(usuarioActivo);
    await servicio.iniciarSesion(
      usuarioActivo.email,
      CONTRASENA,
      '190.85.1.20',
    );
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        usuarioId: usuarioActivo.id,
        accion: 'LOGIN',
        ip: '190.85.1.20',
      }),
    );
  });

  it('busca el email sin importar mayúsculas ni espacios', async () => {
    const { servicio, consulta } = crearServicio(usuarioActivo);
    await servicio.iniciarSesion('  Ana@Cambridge.EDU.co ', CONTRASENA, null);
    expect(consulta.where).toHaveBeenCalledWith(expect.any(String), {
      email: 'ana@cambridge.edu.co',
    });
  });

  it.each([
    ['la contraseña es incorrecta', usuarioActivo, 'OtraClave123'],
    ['el email no existe', null, CONTRASENA],
    [
      'la cuenta está inactiva',
      { ...usuarioActivo, activo: false },
      CONTRASENA,
    ],
  ])(
    'responde 401 con el mismo mensaje cuando %s',
    async (_caso, usuario, contrasena) => {
      const { servicio, sesiones, auditoria } = crearServicio(usuario);
      const intento = servicio.iniciarSesion(
        'ana@cambridge.edu.co',
        contrasena,
        '10.0.0.9',
      );

      await expect(intento).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(intento).rejects.toThrow(MENSAJE_CREDENCIALES_INVALIDAS);
      expect(sesiones.insert).not.toHaveBeenCalled();
      if (usuario) {
        expect(auditoria.registrar).toHaveBeenCalledWith(
          expect.objectContaining({
            usuarioId: usuarioActivo.id,
            accion: 'LOGIN_FALLIDO',
            ip: '10.0.0.9',
          }),
        );
      } else {
        // Sin usuario no hay a quién asociar el registro (Figura 6.8).
        expect(auditoria.registrar).not.toHaveBeenCalled();
      }
    },
  );
});

describe('hashRefreshToken', () => {
  it('distingue dos tokens que comparten los primeros 72 caracteres', () => {
    const prefijo = 'x'.repeat(72);
    expect(hashRefreshToken(`${prefijo}A`)).not.toBe(
      hashRefreshToken(`${prefijo}B`),
    );
  });
});
