import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { EstadoEvaluacion } from '../entidades/estado-evaluacion.enum.js';
import { Evaluacion } from '../entidades/evaluacion.entity.js';
import { Pregunta } from '../entidades/pregunta.entity.js';
import { Respuesta } from '../entidades/respuesta.entity.js';
import type { EnviarRespuestasDto } from './respuesta.dto.js';

@Injectable()
export class RespuestasService {
  constructor(@InjectDataSource() private readonly fuente: DataSource) {}

  private get repo() {
    return this.fuente.getRepository(Respuesta);
  }

  async enviar(datos: EnviarRespuestasDto): Promise<{ registradas: number }> {
    const evaluacion = await this.fuente.getRepository(Evaluacion).findOne({
      where: { id: datos.evaluacionId },
      relations: {
        formulario: { dimensiones: { preguntas: true } },
      },
    });
    if (!evaluacion)
      throw new NotFoundException('La evaluación no existe.');

    if (evaluacion.estado !== EstadoEvaluacion.EN_CURSO)
      throw new BadRequestException(
        'Solo se pueden enviar respuestas a evaluaciones en curso.',
      );

    const preguntaIds = evaluacion.formulario.dimensiones.flatMap((d) =>
      d.preguntas.map((p) => p.id),
    );
    const preguntaIdsSet = new Set(preguntaIds);

    for (const r of datos.respuestas) {
      if (!preguntaIdsSet.has(r.preguntaId))
        throw new BadRequestException(
          `La pregunta ${r.preguntaId} no pertenece a esta evaluación.`,
        );
    }

    const existentes = await this.repo.find({
      where: {
        evaluacion: { id: evaluacion.id },
        pregunta: { id: In(datos.respuestas.map((r) => r.preguntaId)) },
      },
      relations: { pregunta: true },
    });

    if (existentes.length > 0)
      throw new ConflictException(
        'Ya existen respuestas para algunas preguntas de esta evaluación.',
      );

    const entidades = datos.respuestas.map((r) =>
      this.repo.create({
        evaluacion,
        pregunta: { id: r.preguntaId } as Pregunta,
        valor: r.valor,
        comentario: r.comentario ?? null,
      }),
    );

    await this.repo.save(entidades);

    return { registradas: entidades.length };
  }
}
