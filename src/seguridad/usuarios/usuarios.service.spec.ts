import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Rol } from '../entidades/rol.enum.js';
import {
  aRespuesta,
  CARGA_MAXIMA_POR_DEFECTO,
  UsuariosService,
} from './usuarios.service.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';

const actor = { id: 'actor-1', ip: '10.0.0.1' };

function crearUsuario(parcial: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    nombre: 'María García',
    email: 'maria@cambridge.edu.co',
    rol: Rol.ADMIN,
    activo: true,
    estudiante: null,
    docente: null,
    ...parcial,
  };
}

function crearQueryBuilder(resultados: unknown[], total: number) {
  return {
    leftJoinAndSelect: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getManyAndCount: vi.fn().mockResolvedValue([resultados, total]),
  };
}

function crearFuente(overrides: Record<string, unknown> = {}) {
  const qb = crearQueryBuilder([], 0);
  return {
    getRepository: vi.fn().mockReturnValue({
      createQueryBuilder: vi.fn().mockReturnValue(qb),
    }),
    manager: {
      findOne: vi.fn().mockResolvedValue(null),
      countBy: vi.fn().mockResolvedValue(2),
    },
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        create: vi.fn((_: unknown, datos: unknown) => datos),
        save: vi.fn(async (_: unknown, datos: unknown) => ({
          id: 'nuevo-1',
          ...(datos as object),
        })),
        delete: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      };
      return fn(tx);
    }),
    ...overrides,
  } as never;
}

/** AuditoriaService falso: solo interesa saber si se registró la acción. */
function crearAuditoria() {
  return {
    registrar: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditoriaService & { registrar: ReturnType<typeof vi.fn> };
}

describe('aRespuesta', () => {
  it('mapea usuario con perfil de estudiante', () => {
    const usuario = crearUsuario({
      rol: Rol.ESTUDIANTE,
      estudiante: { codigo: 'EST-001' },
      docente: null,
    });
    const dto = aRespuesta(usuario as never);
    expect(dto.codigo).toBe('EST-001');
    expect(dto.especialidad).toBeNull();
  });

  it('mapea usuario con perfil de docente', () => {
    const usuario = crearUsuario({
      rol: Rol.DOCENTE,
      estudiante: null,
      docente: { especialidad: 'Inglés', cargaMaximaSemanal: 20 },
    });
    const dto = aRespuesta(usuario as never);
    expect(dto.especialidad).toBe('Inglés');
    expect(dto.cargaMaximaSemanal).toBe(20);
    expect(dto.codigo).toBeNull();
  });
});

describe('UsuariosService.listar', () => {
  it('devuelve página con filtros', async () => {
    const usuario = crearUsuario();
    const qb = crearQueryBuilder([usuario], 1);
    const fuente = crearFuente({
      getRepository: vi.fn().mockReturnValue({
        createQueryBuilder: vi.fn().mockReturnValue(qb),
      }),
    });
    const servicio = new UsuariosService(fuente, crearAuditoria());

    const resultado = await servicio.listar({
      page: 1,
      size: 20,
      rol: Rol.ADMIN,
      activo: true,
      busqueda: 'garcía',
    });

    expect(resultado.total).toBe(1);
    expect(qb.andWhere).toHaveBeenCalledTimes(3);
  });
});

describe('UsuariosService.obtener', () => {
  it('lanza NotFoundException si no existe', async () => {
    const fuente = crearFuente();
    const servicio = new UsuariosService(fuente, crearAuditoria());

    await expect(servicio.obtener('inexistente')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('retorna el usuario si existe', async () => {
    const usuario = crearUsuario();
    const fuente = crearFuente({
      manager: {
        findOne: vi.fn().mockResolvedValue(usuario),
        countBy: vi.fn().mockResolvedValue(2),
      },
    });
    const servicio = new UsuariosService(fuente, crearAuditoria());

    const dto = await servicio.obtener('u-1');
    expect(dto.email).toBe('maria@cambridge.edu.co');
  });
});

describe('UsuariosService.crear', () => {
  it('crea un admin y registra auditoría', async () => {
    const auditoria = crearAuditoria();
    const servicio = new UsuariosService(crearFuente(), auditoria);

    const dto = await servicio.crear(
      {
        nombre: 'Nuevo Admin',
        email: 'nuevo@cambridge.edu.co',
        contrasena: 'Clave-2026!',
        rol: Rol.ADMIN,
      },
      actor,
    );

    expect(dto.id).toBe('nuevo-1');
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'CREAR', modulo: 'USUARIOS' }),
    );
  });

  it('rechaza código en un usuario que no es estudiante', async () => {
    const servicio = new UsuariosService(crearFuente(), crearAuditoria());

    await expect(
      servicio.crear(
        {
          nombre: 'Doc',
          email: 'doc@cambridge.edu.co',
          contrasena: 'Clave-2026!',
          rol: Rol.DOCENTE,
          codigo: 'EST-001',
          especialidad: 'Inglés',
        },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza estudiante sin código', async () => {
    const servicio = new UsuariosService(crearFuente(), crearAuditoria());

    await expect(
      servicio.crear(
        {
          nombre: 'Est',
          email: 'est@cambridge.edu.co',
          contrasena: 'Clave-2026!',
          rol: Rol.ESTUDIANTE,
        },
        actor,
      ),
    ).rejects.toThrow(/código de estudiante es obligatorio/);
  });

  it('CARGA_MAXIMA_POR_DEFECTO es 40', () => {
    expect(CARGA_MAXIMA_POR_DEFECTO).toBe(40);
  });
});

describe('UsuariosService.actualizar', () => {
  it('impide desactivar la propia cuenta', async () => {
    const usuario = crearUsuario({ id: 'actor-1' });
    const fuente = crearFuente({
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          findOne: vi.fn().mockResolvedValue(usuario),
          countBy: vi.fn().mockResolvedValue(2),
          save: vi.fn(),
          delete: vi.fn(),
        };
        return fn(tx);
      }),
    });
    const servicio = new UsuariosService(fuente, crearAuditoria());

    await expect(
      servicio.actualizar('actor-1', { activo: false }, actor),
    ).rejects.toThrow(/No puedes desactivar tu propia cuenta/);
  });
});

describe('UsuariosService.eliminar', () => {
  it('impide eliminar la propia cuenta', async () => {
    const servicio = new UsuariosService(crearFuente(), crearAuditoria());

    await expect(servicio.eliminar('actor-1', actor)).rejects.toThrow(
      /No puedes eliminar tu propia cuenta/,
    );
  });

  it('protege al último admin activo', async () => {
    const admin = crearUsuario({ id: 'otro-admin', rol: Rol.ADMIN });
    const fuente = crearFuente({
      manager: {
        findOne: vi.fn().mockResolvedValue(admin),
        countBy: vi.fn().mockResolvedValue(1),
      },
    });
    const servicio = new UsuariosService(fuente, crearAuditoria());

    await expect(servicio.eliminar('otro-admin', actor)).rejects.toThrow(
      /al menos un Administrador activo/,
    );
  });

  it('anonimiza si hay FK que impiden borrar', async () => {
    const usuario = crearUsuario({ id: 'u-fk', rol: Rol.DOCENTE });
    const fkError = new QueryFailedError('DELETE', [], new Error('fk'));
    Object.assign(fkError, { driverError: { code: '23503' } });

    const fuente = crearFuente({
      manager: {
        findOne: vi.fn().mockResolvedValue(usuario),
        countBy: vi.fn().mockResolvedValue(2),
      },
      transaction: vi
        .fn()
        .mockRejectedValueOnce(fkError)
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            delete: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          };
          return fn(tx);
        }),
    });
    const auditoria = crearAuditoria();
    const servicio = new UsuariosService(fuente, auditoria);

    const resultado = await servicio.eliminar('u-fk', actor);

    expect(resultado.resultado).toBe('ANONIMIZADO');
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'ELIMINAR' }),
    );
  });
});
