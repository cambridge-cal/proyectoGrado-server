import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Rol } from '../entidades/rol.enum.js';
import { Publico, Roles } from './decoradores.js';
import { RolesGuard } from './roles.guard.js';

@Roles(Rol.ADMIN)
class SoloAdmin {
  listar() {}
  @Roles(Rol.ADMIN, Rol.DOCENTE)
  compartida() {}
}

class Abierto {
  perfil() {}
  @Publico()
  salud() {}
}

const guard = new RolesGuard(new Reflector());

function contexto(clase: new () => object, metodo: string, rol?: Rol) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        usuario: rol ? { sub: 'u', email: 'e', rol } : undefined,
      }),
    }),
    getHandler: () => (clase.prototype as Record<string, unknown>)[metodo],
    getClass: () => clase,
  } as unknown as ExecutionContext;
}

describe('RolesGuard (RF-07)', () => {
  it('permite al rol indicado en el controlador', () => {
    expect(guard.canActivate(contexto(SoloAdmin, 'listar', Rol.ADMIN))).toBe(
      true,
    );
  });

  it.each([Rol.DOCENTE, Rol.ESTUDIANTE])('bloquea con 403 al rol %s', (rol) => {
    expect(() => guard.canActivate(contexto(SoloAdmin, 'listar', rol))).toThrow(
      ForbiddenException,
    );
  });

  it('el decorador del método reemplaza al del controlador', () => {
    expect(
      guard.canActivate(contexto(SoloAdmin, 'compartida', Rol.DOCENTE)),
    ).toBe(true);
    expect(() =>
      guard.canActivate(contexto(SoloAdmin, 'compartida', Rol.ESTUDIANTE)),
    ).toThrow(ForbiddenException);
  });

  it('sin @Roles basta con estar autenticado', () => {
    expect(guard.canActivate(contexto(Abierto, 'perfil', Rol.ESTUDIANTE))).toBe(
      true,
    );
  });

  it('las rutas públicas no revisan rol', () => {
    expect(guard.canActivate(contexto(Abierto, 'salud'))).toBe(true);
  });
});
