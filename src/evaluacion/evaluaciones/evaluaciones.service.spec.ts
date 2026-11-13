import { ConflictException, NotFoundException } from '@nestjs/common';
import { EstadoEvaluacion } from '../entidades/estado-evaluacion.enum.js';
import { EvaluacionesService } from './evaluaciones.service.js';

const docente = { id: 'd-1', usuario: { id: 'u-1', nombre: 'Ana' } };
const formulario = { id: 'f-1', nombre: 'Evaluación 2026-II' };

const evaluacionBase = {
  id: 'e-1',
  formulario,
  docente,
  estado: EstadoEvaluacion.PENDIENTE,
  creadoEn: new Date(),
};

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

function crearFuente(overrides: Record<string, unknown> = {}) {
  const qb = crearQb([evaluacionBase], 1);
  return {
    getRepository: vi.fn().mockReturnValue({
      createQueryBuilder: vi.fn().mockReturnValue(qb),
      findOne: vi.fn().mockResolvedValue(evaluacionBase),
      findOneBy: vi.fn().mockResolvedValue(formulario),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn((datos: unknown) => datos),
      save: vi.fn(async (datos: unknown) =>
        Array.isArray(datos)
          ? datos.map((d, i) => ({ id: `e-${i}`, ...d }))
          : { id: 'e-1', ...(datos as object) },
      ),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
    }),
    ...overrides,
  } as never;
}

function crearAuditoria() {
  return { registrar: vi.fn().mockResolvedValue(undefined) } as never;
}

const actor = { id: 'u-1', rol: 'ADMIN' as never, ip: '127.0.0.1' };

describe('EvaluacionesService', () => {
  describe('listar', () => {
    it('devuelve una página de evaluaciones', async () => {
      const servicio = new EvaluacionesService(crearFuente(), crearAuditoria());
      const resultado = await servicio.listar({ page: 1, size: 20 });
      expect(resultado.datos).toHaveLength(1);
      expect(resultado.total).toBe(1);
    });
  });

  describe('obtener', () => {
    it('retorna la evaluación con relaciones', async () => {
      const servicio = new EvaluacionesService(crearFuente(), crearAuditoria());
      const resultado = await servicio.obtener('e-1');
      expect(resultado.estado).toBe(EstadoEvaluacion.PENDIENTE);
    });

    it('lanza NotFoundException si no existe', async () => {
      const fuente = crearFuente();
      (fuente as any).getRepository().findOne.mockResolvedValue(null);
      const servicio = new EvaluacionesService(fuente, crearAuditoria());
      await expect(servicio.obtener('e-no')).rejects.toThrow(NotFoundException);
    });
  });

  describe('asignar', () => {
    it('crea evaluación en estado PENDIENTE', async () => {
      const fuente = crearFuente();
      const repo = (fuente as any).getRepository();
      repo.findOne.mockResolvedValueOnce(null).mockResolvedValue(evaluacionBase);
      repo.findOneBy
        .mockResolvedValueOnce(formulario)
        .mockResolvedValueOnce(docente);
      const auditoria = crearAuditoria();
      const servicio = new EvaluacionesService(fuente, auditoria);
      const resultado = await servicio.asignar(
        { formularioId: 'f-1', docenteId: 'd-1' },
        actor,
      );
      expect(resultado.estado).toBe(EstadoEvaluacion.PENDIENTE);
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'ASIGNAR_EVALUACION' }),
      );
    });

    it('lanza ConflictException si ya existe', async () => {
      const fuente = crearFuente();
      const repo = (fuente as any).getRepository();
      repo.findOneBy.mockResolvedValue(formulario);
      const servicio = new EvaluacionesService(fuente, crearAuditoria());
      await expect(
        servicio.asignar({ formularioId: 'f-1', docenteId: 'd-1' }, actor),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('asignarMasivo', () => {
    it('crea una evaluación por docente', async () => {
      const fuente = crearFuente();
      const repo = (fuente as any).getRepository();
      repo.findOneBy.mockResolvedValue(formulario);
      repo.find
        .mockResolvedValueOnce([{ id: 'd-1' }, { id: 'd-2' }])
        .mockResolvedValueOnce([]);
      const auditoria = crearAuditoria();
      const servicio = new EvaluacionesService(fuente, auditoria);
      const resultado = await servicio.asignarMasivo(
        { formularioId: 'f-1', docenteIds: ['d-1', 'd-2'] },
        actor,
      );
      expect(resultado.creadas).toBe(2);
      expect(resultado.omitidas).toBe(0);
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'ASIGNAR_EVALUACION_MASIVA' }),
      );
    });

    it('omite docentes que ya tienen evaluación', async () => {
      const fuente = crearFuente();
      const repo = (fuente as any).getRepository();
      repo.findOneBy.mockResolvedValue(formulario);
      repo.find
        .mockResolvedValueOnce([{ id: 'd-1' }, { id: 'd-2' }])
        .mockResolvedValueOnce([{ docente: { id: 'd-1' } }]);
      const servicio = new EvaluacionesService(fuente, crearAuditoria());
      const resultado = await servicio.asignarMasivo(
        { formularioId: 'f-1', docenteIds: ['d-1', 'd-2'] },
        actor,
      );
      expect(resultado.creadas).toBe(1);
      expect(resultado.omitidas).toBe(1);
    });

    it('lanza NotFoundException si no hay docentes válidos', async () => {
      const fuente = crearFuente();
      const repo = (fuente as any).getRepository();
      repo.findOneBy.mockResolvedValue(formulario);
      repo.find.mockResolvedValueOnce([]);
      const servicio = new EvaluacionesService(fuente, crearAuditoria());
      await expect(
        servicio.asignarMasivo(
          { formularioId: 'f-1', docenteIds: ['d-no'] },
          actor,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cambiarEstado', () => {
    it('actualiza el estado y registra auditoría', async () => {
      const auditoria = crearAuditoria();
      const servicio = new EvaluacionesService(crearFuente(), auditoria);
      const resultado = await servicio.cambiarEstado(
        'e-1',
        { estado: EstadoEvaluacion.EN_PROGRESO },
        actor,
      );
      expect(resultado).toBeDefined();
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'CAMBIAR_ESTADO_EVALUACION' }),
      );
    });
  });

  describe('eliminar', () => {
    it('elimina y registra auditoría', async () => {
      const auditoria = crearAuditoria();
      const servicio = new EvaluacionesService(crearFuente(), auditoria);
      await servicio.eliminar('e-1', actor);
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'ELIMINAR_EVALUACION' }),
      );
    });
  });
});
