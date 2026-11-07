import { AuditoriaService, MODULOS_AUDITORIA } from './auditoria.service.js';

describe('AuditoriaService.registrar (RNF-11)', () => {
  it('inserta usuario, módulo, acción, detalle e IP', async () => {
    const registros = { insert: vi.fn().mockResolvedValue(undefined) };
    const servicio = new AuditoriaService(registros as never);
    await servicio.registrar({
      usuarioId: 'u-1',
      modulo: 'USUARIOS',
      accion: 'CREAR',
      detalle: '{"rol":"DOCENTE"}',
      ip: '10.0.0.1',
    });
    expect(registros.insert).toHaveBeenCalledWith({
      usuario: { id: 'u-1' },
      modulo: 'USUARIOS',
      accion: 'CREAR',
      detalle: '{"rol":"DOCENTE"}',
      ip: '10.0.0.1',
    });
  });

  it('si la base falla, no tumba la operación principal', async () => {
    const registros = { insert: vi.fn().mockRejectedValue(new Error('caída')) };
    const servicio = new AuditoriaService(registros as never);
    vi.spyOn(servicio['logger'], 'error').mockImplementation(() => undefined);
    await expect(
      servicio.registrar({
        usuarioId: 'u-1',
        modulo: 'SEGURIDAD',
        accion: 'LOGIN',
      }),
    ).resolves.toBeUndefined();
  });

  it('el servicio no ofrece operaciones para modificar o borrar', () => {
    const metodos = Object.getOwnPropertyNames(AuditoriaService.prototype);
    expect(
      metodos.filter((m) => /actualizar|modificar|eliminar|borrar/i.test(m)),
    ).toEqual([]);
    expect(MODULOS_AUDITORIA).toEqual([
      'SEGURIDAD',
      'USUARIOS',
      'HORARIOS',
      'EVALUACION',
    ]);
  });
});

describe('AuditoriaService.listar (RF-08)', () => {
  const registro = {
    id: 'r-1',
    fechaHora: new Date('2026-11-01'),
    modulo: 'SEGURIDAD',
    accion: 'LOGIN',
    detalle: null,
    ip: '10.0.0.1',
    usuario: {
      id: 'u-1',
      nombre: 'Admin',
      email: 'admin@cambridge.edu.co',
      rol: 'ADMIN',
    },
  };

  function crearQueryBuilder(resultados: unknown[], total: number) {
    const qb = {
      innerJoin: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getManyAndCount: vi.fn().mockResolvedValue([resultados, total]),
    };
    return qb;
  }

  it('devuelve registros paginados sin filtros', async () => {
    const qb = crearQueryBuilder([registro], 1);
    const repo = { createQueryBuilder: vi.fn().mockReturnValue(qb) };
    const servicio = new AuditoriaService(repo as never);

    const resultado = await servicio.listar({ page: 1, size: 20 });

    expect(resultado.total).toBe(1);
    expect(resultado.datos[0].id).toBe('r-1');
    expect(resultado.datos[0].usuario.email).toBe('admin@cambridge.edu.co');
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.take).toHaveBeenCalledWith(20);
  });

  it('aplica filtros de módulo, acción, usuario, desde y hasta', async () => {
    const qb = crearQueryBuilder([], 0);
    const repo = { createQueryBuilder: vi.fn().mockReturnValue(qb) };
    const servicio = new AuditoriaService(repo as never);

    await servicio.listar({
      page: 2,
      size: 10,
      modulo: 'USUARIOS',
      accion: 'CREAR',
      usuarioId: 'u-2',
      desde: '2026-10-01',
      hasta: '2026-10-31',
    });

    expect(qb.andWhere).toHaveBeenCalledTimes(5);
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
  });
});

describe('AuditoriaService.opciones', () => {
  it('devuelve módulos y acciones distintas', async () => {
    const qb = {
      select: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      getRawMany: vi
        .fn()
        .mockResolvedValue([{ accion: 'CREAR' }, { accion: 'LOGIN' }]),
    };
    const repo = { createQueryBuilder: vi.fn().mockReturnValue(qb) };
    const servicio = new AuditoriaService(repo as never);

    const opciones = await servicio.opciones();

    expect(opciones.modulos).toEqual(MODULOS_AUDITORIA);
    expect(opciones.acciones).toEqual(['CREAR', 'LOGIN']);
  });
});
