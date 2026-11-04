import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EstadoEvaluacion } from '../entidades/estado-evaluacion.enum.js';
import { RespuestasService } from './respuestas.service.js';

const pregunta1 = { id: 'p-1', texto: '¿Explica con claridad?', orden: 1 };
const pregunta2 = { id: 'p-2', texto: '¿Es puntual?', orden: 2 };

const evaluacionEnCurso = {
  id: 'e-1',
  estado: EstadoEvaluacion.EN_CURSO,
  formulario: {
    id: 'f-1',
    dimensiones: [{ id: 'd-1', preguntas: [pregunta1, pregunta2] }],
  },
};

const evaluacionPendiente = {
  ...evaluacionEnCurso,
  estado: EstadoEvaluacion.PENDIENTE,
};

function crearFuente(overrides: {
  evaluacion?: unknown;
  respuestasExistentes?: unknown[];
} = {}) {
  const evalRepo = {
    findOne: vi.fn().mockResolvedValue(
      'evaluacion' in overrides ? overrides.evaluacion : evaluacionEnCurso,
    ),
  };
  const respRepo = {
    find: vi.fn().mockResolvedValue(overrides.respuestasExistentes ?? []),
    create: vi.fn((d: unknown) => d),
    save: vi.fn(async (d: unknown) => d),
  };

  const repos: Record<string, unknown> = {};
  repos.Evaluacion = evalRepo;
  repos.Respuesta = respRepo;

  return {
    getRepository: vi.fn((entidad: { name: string }) => {
      return repos[entidad.name] ?? respRepo;
    }),
  } as never;
}

describe('RespuestasService', () => {
  const datosValidos = {
    evaluacionId: 'e-1',
    respuestas: [
      { preguntaId: 'p-1', valor: 4 },
      { preguntaId: 'p-2', valor: 5, comentario: 'Excelente puntualidad, siempre llega a tiempo a las clases.' },
    ],
  };

  describe('enviar', () => {
    it('registra respuestas anónimas correctamente', async () => {
      const fuente = crearFuente();
      const servicio = new RespuestasService(fuente);
      const resultado = await servicio.enviar(datosValidos);
      expect(resultado.registradas).toBe(2);
    });

    it('lanza NotFoundException si la evaluación no existe', async () => {
      const fuente = crearFuente({ evaluacion: null });
      const servicio = new RespuestasService(fuente);
      await expect(servicio.enviar(datosValidos)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza BadRequestException si la evaluación no está EN_CURSO', async () => {
      const fuente = crearFuente({ evaluacion: evaluacionPendiente });
      const servicio = new RespuestasService(fuente);
      await expect(servicio.enviar(datosValidos)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza BadRequestException si una pregunta no pertenece a la evaluación', async () => {
      const fuente = crearFuente();
      const servicio = new RespuestasService(fuente);
      await expect(
        servicio.enviar({
          evaluacionId: 'e-1',
          respuestas: [{ preguntaId: 'p-inexistente', valor: 3 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza ConflictException si ya hay respuestas registradas', async () => {
      const fuente = crearFuente({
        respuestasExistentes: [{ id: 'r-1', pregunta: { id: 'p-1' } }],
      });
      const servicio = new RespuestasService(fuente);
      await expect(servicio.enviar(datosValidos)).rejects.toThrow(
        ConflictException,
      );
    });

    it('permite respuestas sin comentario', async () => {
      const fuente = crearFuente();
      const servicio = new RespuestasService(fuente);
      const resultado = await servicio.enviar({
        evaluacionId: 'e-1',
        respuestas: [{ preguntaId: 'p-1', valor: 3 }],
      });
      expect(resultado.registradas).toBe(1);
    });
  });
});
