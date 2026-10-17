import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { Rol } from '../entidades/rol.enum.js';
import { AutenticacionService } from './autenticacion.service.js';
import { hashRefreshToken } from './tokens.js';

const SECRETOS: Record<string, string> = {
  JWT_SECRET: 'secreto-access-de-pruebas-0123456789',
  JWT_REFRESH_SECRET: 'secreto-refresh-de-pruebas-0123456789',
};
const jwt = new JwtService();
const usuario = {
  id: 'u-1',
  nombre: 'Ana Pérez',
  email: 'ana@cambridge.edu.co',
  rol: Rol.ESTUDIANTE,
  activo: true,
};

function refresh(
  sid: string,
  opciones: { sub?: string; expiresIn?: number } = {},
) {
  return jwt.sign(
    { sub: opciones.sub ?? usuario.id, sid },
    {
      secret: SECRETOS.JWT_REFRESH_SECRET,
      expiresIn: opciones.expiresIn ?? 3600,
    },
  );
}

function crear(sesion: Record<string, unknown> | null) {
  const sesiones = {
    findOne: vi.fn().mockResolvedValue(sesion),
    delete: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn().mockResolvedValue(undefined),
  };
  const usuarios = { existsBy: vi.fn().mockResolvedValue(true) };
  const auditoria = { registrar: vi.fn().mockResolvedValue(undefined) };
  const config = {
    getOrThrow: (clave: string) => SECRETOS[clave],
  } as unknown as ConfigService;
  const servicio = new AutenticacionService(
    usuarios as never,
    sesiones as never,
    jwt,
    config,
    auditoria as unknown as AuditoriaService,
  );
  return { servicio, sesiones, usuarios, auditoria };
}

function sesionDe(token: string, cambios: Record<string, unknown> = {}) {
  return {
    id: 's-1',
    usuario,
    refreshTokenHash: hashRefreshToken(token),
    expiraEn: new Date(Date.now() + 60_000),
    ...cambios,
  };
}

describe('AutenticacionService.renovar (RF-02)', () => {
  it('con un Refresh Token válido emite tokens nuevos e invalida el usado', async () => {
    const token = refresh('s-1');
    const { servicio, sesiones } = crear(sesionDe(token));

    const respuesta = await servicio.renovar(token, null);

    expect(
      jwt.verify(respuesta.accessToken, { secret: SECRETOS.JWT_SECRET }),
    ).toMatchObject({
      sub: usuario.id,
      rol: 'ESTUDIANTE',
    });
    expect(respuesta.refreshToken).not.toBe(token);
    expect(sesiones.delete).toHaveBeenCalledWith({ id: 's-1' });
    expect(sesiones.insert).toHaveBeenCalledOnce();
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const falso = jwt.sign(
      { sub: usuario.id, sid: 's-1' },
      { secret: SECRETOS.JWT_SECRET },
    );
    const { servicio, sesiones } = crear(null);
    await expect(servicio.renovar(falso, null)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sesiones.findOne).not.toHaveBeenCalled();
  });

  it('rechaza un token vencido', async () => {
    const token = refresh('s-1', { expiresIn: -10 });
    const { servicio } = crear(sesionDe(token));
    await expect(servicio.renovar(token, null)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('si el token ya se usó, cierra todas las sesiones del usuario y lo audita', async () => {
    const token = refresh('s-borrada');
    const { servicio, sesiones, auditoria } = crear(null);

    await expect(servicio.renovar(token, '10.0.0.5')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sesiones.delete).toHaveBeenCalledWith({
      usuario: { id: usuario.id },
    });
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'REFRESH_REUTILIZADO',
        ip: '10.0.0.5',
      }),
    );
  });

  it.each([
    [
      'el hash no coincide',
      (t: string) => sesionDe(t, { refreshTokenHash: 'otro' }),
    ],
    [
      'la sesión venció en la base',
      (t: string) => sesionDe(t, { expiraEn: new Date(Date.now() - 1000) }),
    ],
    [
      'la cuenta está inactiva',
      (t: string) => sesionDe(t, { usuario: { ...usuario, activo: false } }),
    ],
  ])('rechaza e invalida la sesión cuando %s', async (_caso, fila) => {
    const token = refresh('s-1');
    const { servicio, sesiones } = crear(fila(token));
    await expect(servicio.renovar(token, null)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sesiones.delete).toHaveBeenCalledWith({ id: 's-1' });
    expect(sesiones.insert).not.toHaveBeenCalled();
  });
});

describe('AutenticacionService.cerrarSesion (RF-03)', () => {
  it('borra la sesión del Refresh Token y registra el LOGOUT', async () => {
    const token = refresh('s-1');
    const { servicio, sesiones, auditoria } = crear(sesionDe(token));
    await servicio.cerrarSesion(token, '10.0.0.7');
    expect(sesiones.delete).toHaveBeenCalledWith({ id: 's-1' });
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        usuarioId: usuario.id,
        accion: 'LOGOUT',
        ip: '10.0.0.7',
      }),
    );
  });

  it('acepta un Refresh Token ya vencido para poder cerrar la sesión', async () => {
    const token = refresh('s-1', { expiresIn: -10 });
    const { servicio, sesiones } = crear(sesionDe(token));
    await servicio.cerrarSesion(token, null);
    expect(sesiones.delete).toHaveBeenCalledWith({ id: 's-1' });
  });

  it('no falla si la sesión ya no existe', async () => {
    const { servicio, sesiones } = crear(null);
    await expect(
      servicio.cerrarSesion(refresh('s-x'), null),
    ).resolves.toBeUndefined();
    expect(sesiones.delete).not.toHaveBeenCalled();
  });
});
