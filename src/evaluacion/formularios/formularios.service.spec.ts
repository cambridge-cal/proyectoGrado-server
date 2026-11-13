import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FormulariosService } from './formularios.service.js';

function crearQb(resultados: unknown[] = [], total = 0) {
  const qb: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of [
    'innerJoinAndSelect',
    'leftJoinAndSelect',
    'orderBy',
    'addOrderBy',
    'andWhere',
    'skip',
    'take',
  ]) {
    qb[m] = vi.fn().mockReturnValue(qb);
  }
  qb.getManyAndCount = vi.fn().mockResolvedValue([resultados, total]);
  return qb;
}

const formularioBase = {
  id: 'f-1',
  nombre: 'Evaluación 2026-II',
  activo: true,
  periodoAcademico: { id: 'p-1', nombre: '2026-II' },
  dimensiones: [
    {
      id: 'd-1',
      nombre: 'Metodología',
      orden: 1,
      peso: 100,
      preguntas: [{ id: 'q-1', texto: '¿Explica con claridad?', orden: 1 }],
    },
  ],
};

function crearFuente(overrides: Record<string, unknown> = {}) {
  const qb = crearQb([formularioBase], 1);
  return {
    getRepository: vi.fn().mockReturnValue({
      createQueryBuilder: vi.fn().mockReturnValue(qb),
      findOne: vi.fn().mockResolvedValue(formularioBase),
      findOneBy: vi.fn().mockResolvedValue({ id: 'p-1', nombre: '2026-II' }),
      create: vi.fn((datos: unknown) => datos),
      save: vi.fn(async (datos: unknown) => ({
        id: 'f-1',
        ...(datos as object),
      })),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
    }),
    ...overrides,
  } as never;
}

function crearAuditoria() {
  return { registrar: vi.fn().mockResolvedValue(undefined) } as never;
}

describe('FormulariosService', () => {
  describe('listar', () => {
    it('devuelve una página con formularios', async () => {
      const servicio = new FormulariosService(crearFuente(), crearAuditoria());
      const resultado = await servicio.listar({ page: 1, size: 20 });
      expect(resultado.datos).toHaveLength(1);
      expect(resultado.total).toBe(1);
    });

    it('aplica filtro por período', async () => {
      const qb = crearQb([], 0);
      const fuente = crearFuente();
      (fuente as any).getRepository().createQueryBuilder.mockReturnValue(qb);
      const servicio = new FormulariosService(fuente, crearAuditoria());
      await servicio.listar({
        page: 1,
        size: 20,
        periodoAcademicoId: 'p-1',
      });
      expect(qb.andWhere).toHaveBeenCalled();
    });
  });

  describe('obtener', () => {
    it('retorna el formulario con relaciones', async () => {
      const servicio = new FormulariosService(crearFuente(), crearAuditoria());
      const resultado = await servicio.obtener('f-1');
      expect(resultado.nombre).toBe('Evaluación 2026-II');
    });

    it('lanza NotFoundException si no existe', async () => {
      const fuente = crearFuente();
      (fuente as any).getRepository().findOne.mockResolvedValue(null);
      const servicio = new FormulariosService(fuente, crearAuditoria());
      await expect(servicio.obtener('f-no')).rejects.toThrow(NotFoundException);
    });
  });

  describe('crear', () => {
    it('crea formulario con dimensiones y preguntas', async () => {
      const auditoria = crearAuditoria();
      const servicio = new FormulariosService(crearFuente(), auditoria);
      const resultado = await servicio.crear(
        {
          nombre: 'Evaluación 2026-II',
          periodoAcademicoId: 'p-1',
          dimensiones: [
            {
              nombre: 'Metodología',
              orden: 1,
              peso: 100,
              preguntas: [{ texto: '¿Explica con claridad?', orden: 1 }],
            },
          ],
        },
        { id: 'u-1', rol: 'ADMIN' as never, ip: '127.0.0.1' },
      );
      expect(resultado).toBeDefined();
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'CREAR_FORMULARIO' }),
      );
    });

    it('lanza NotFoundException si el período no existe', async () => {
      const fuente = crearFuente();
      (fuente as any).getRepository().findOneBy.mockResolvedValue(null);
      const servicio = new FormulariosService(fuente, crearAuditoria());
      await expect(
        servicio.crear(
          {
            nombre: 'Test',
            periodoAcademicoId: 'p-no',
            dimensiones: [
              {
                nombre: 'Dim',
                orden: 1,
                peso: 100,
                preguntas: [{ texto: '¿Pregunta?', orden: 1 }],
              },
            ],
          },
          { id: 'u-1', rol: 'ADMIN' as never, ip: '127.0.0.1' },
        ),
      ).rejects.toThrow(NotFoundException);
    });
    it('rechaza pesos que no suman 100 (RF-29)', async () => {
      const fuente = crearFuente();
      const servicio = new FormulariosService(fuente, crearAuditoria());
      const dimension = (nombre: string, orden: number, peso: number) => ({
        nombre,
        orden,
        peso,
        preguntas: [{ texto: '¿Explica con claridad?', orden: 1 }],
      });
      await expect(
        servicio.crear(
          {
            nombre: 'Evaluación 2026-II',
            periodoAcademicoId: 'p-1',
            dimensiones: [
              dimension('Metodología', 1, 60),
              dimension('Puntualidad', 2, 30),
            ],
          },
          { id: 'u-1', rol: 'ADMIN' as never, ip: '127.0.0.1' },
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Los pesos de las dimensiones deben sumar 100 (suman 90).',
        ),
      );
      expect((fuente as any).getRepository().save).not.toHaveBeenCalled();
      await expect(
        servicio.actualizar(
          'f-1',
          { dimensiones: [dimension('Metodología', 1, 99)] },
          { id: 'u-1', rol: 'ADMIN' as never, ip: '127.0.0.1' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('guarda el peso de cada dimensión', async () => {
      const fuente = crearFuente();
      const servicio = new FormulariosService(fuente, crearAuditoria());
      await servicio.crear(
        {
          nombre: 'Evaluación 2026-II',
          periodoAcademicoId: 'p-1',
          dimensiones: [
            {
              nombre: 'Metodología',
              orden: 1,
              peso: 100,
              preguntas: [{ texto: '¿Explica con claridad?', orden: 1 }],
            },
          ],
        },
        { id: 'u-1', rol: 'ADMIN' as never, ip: '127.0.0.1' },
      );
      const guardado = (fuente as any).getRepository().save.mock.calls[0][0];
      expect(guardado.dimensiones[0].peso).toBe(100);
    });
  });

  describe('eliminar', () => {
    it('elimina y registra auditoría', async () => {
      const auditoria = crearAuditoria();
      const servicio = new FormulariosService(crearFuente(), auditoria);
      await servicio.eliminar('f-1', {
        id: 'u-1',
        rol: 'ADMIN' as never,
        ip: '127.0.0.1',
      });
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'ELIMINAR_FORMULARIO' }),
      );
    });
  });
});
