import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import type { Actor } from '../../compartido/actor.js';
import { PeriodoAcademico } from '../../horarios/entidades/periodo-academico.entity.js';
import { AuditoriaService } from '../../seguridad/auditoria/auditoria.service.js';
import { Docente } from '../../seguridad/entidades/docente.entity.js';
import { Alerta, TipoAlerta } from '../entidades/alerta.entity.js';
import { EstadoEvaluacion } from '../entidades/estado-evaluacion.enum.js';
import { Evaluacion } from '../entidades/evaluacion.entity.js';
import { Respuesta } from '../entidades/respuesta.entity.js';
import {
  ResultadoKdd,
  type PuntajeDimension,
} from '../entidades/resultado-kdd.entity.js';
import {
  calcularParticipacion,
  estudiantesPorGrupo,
  gruposPorDocente,
} from './participacion.js';
import {
  calcularResultado,
  clasificar,
  etiquetaDesempeno,
  UMBRAL_ADVERTENCIA,
  UMBRAL_CRITICO,
} from './calculo.js';

export type ModoKdd = 'AUTOMATICO' | 'MANUAL';

/** Estados que el pipeline puede (re)calcular; las cerradas y archivadas no se tocan. */
const RECALCULABLES = [
  EstadoEvaluacion.EN_PROGRESO,
  EstadoEvaluacion.COMPLETADA,
  EstadoEvaluacion.ANALIZADA,
  EstadoEvaluacion.ALERTA,
];
/** Estados con resultado definitivo, visibles para el docente (RF-42). */
const PUBLICADOS = [
  EstadoEvaluacion.ANALIZADA,
  EstadoEvaluacion.ALERTA,
  EstadoEvaluacion.CERRADA,
  EstadoEvaluacion.ARCHIVADA,
];

export interface ResumenEjecucion {
  periodo: { id: string; nombre: string };
  evaluacionesProcesadas: number;
  sinRespuestas: number;
  alertas: Record<TipoAlerta, number>;
  tiempoMs: number;
}

export interface ResultadoDocente {
  evaluacionId: string;
  estado: EstadoEvaluacion;
  docente: { id: string; nombre: string };
  formulario: { id: string; nombre: string };
  puntajeGlobal: number;
  etiqueta: string;
  puntajesPorDimension: PuntajeDimension[];
  participantes: number;
  elegibles: number;
  parcial: boolean;
  calculadoEn: Date;
}

export interface ResultadoPropio extends Omit<ResultadoDocente, 'docente'> {
  comentarios: string[];
}

/**
 * Pipeline KDD (Figura 6.7, RF-39 a RF-41): selección, preprocesamiento, transformación,
 * análisis con estadística descriptiva e interpretación con los umbrales de alerta.
 */
@Injectable()
export class KddService {
  private readonly logger = new Logger(KddService.name);

  constructor(
    @InjectDataSource() private readonly fuente: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Calcula y guarda el resultado de una evaluación. En modo AUTOMATICO el resultado es
   * parcial mientras falten estudiantes (la evaluación sigue EN_PROGRESO); cuando todos
   * respondieron, o en modo MANUAL, queda ANALIZADA o en ALERTA.
   * Devuelve null si la evaluación no tiene respuestas válidas o ya está cerrada.
   */
  async ejecutarEvaluacion(
    evaluacionId: string,
    modo: ModoKdd,
  ): Promise<{ estado: EstadoEvaluacion; alerta: TipoAlerta | null } | null> {
    return this.fuente.transaction(async (tx) => {
      const bloqueada = await tx
        .getRepository(Evaluacion)
        .createQueryBuilder('evaluacion')
        .addSelect('evaluacion.estudiantesCompletaron')
        .setLock('pessimistic_write')
        .where('evaluacion.id = :id', { id: evaluacionId })
        .getOne();
      if (!bloqueada || !RECALCULABLES.includes(bloqueada.estado)) return null;

      // 1. Selección
      const evaluacion = (await tx.getRepository(Evaluacion).findOne({
        where: { id: evaluacionId },
        relations: {
          formulario: {
            periodoAcademico: true,
            dimensiones: { preguntas: true },
          },
          docente: { usuario: true },
        },
      }))!;
      const respuestas = await tx
        .getRepository(Respuesta)
        .createQueryBuilder('respuesta')
        .select('respuesta.pregunta_id', 'preguntaId')
        .addSelect('respuesta.valor_numerico', 'valor')
        .where('respuesta.evaluacion_id = :id', { id: evaluacionId })
        .getRawMany<{ preguntaId: string; valor: number }>();

      // 2 a 4. Preprocesamiento, transformación y análisis
      const calculo = calcularResultado(
        (evaluacion.formulario.dimensiones ?? []).map((d) => ({
          id: d.id,
          nombre: d.nombre,
          peso: d.peso,
          preguntaIds: (d.preguntas ?? []).map((p) => p.id),
        })),
        respuestas.map((r) => ({ ...r, valor: Number(r.valor) })),
      );
      if (calculo.puntajeGlobal === null) return null;

      const periodo = evaluacion.formulario.periodoAcademico;
      const grupos = [
        ...((await gruposPorDocente(tx, periodo.id)).get(
          evaluacion.docente.id,
        ) ?? []),
      ];
      const participacion = calcularParticipacion(
        (await estudiantesPorGrupo(tx, grupos)).values(),
        bloqueada.estudiantesCompletaron,
      );
      const definitivo =
        modo === 'MANUAL' ||
        participacion.todos ||
        bloqueada.estado !== EstadoEvaluacion.EN_PROGRESO;
      // RF-39: el disparo automático solo calcula cuando un grupo terminó de responder.
      if (!definitivo && !participacion.algunGrupoCompleto)
        return { estado: bloqueada.estado, alerta: null };

      const repoResultados = tx.getRepository(ResultadoKdd);
      const previo = await repoResultados.findOneBy({
        evaluacion: { id: evaluacionId },
      });
      const resultado = await repoResultados.save({
        ...(previo ? { id: previo.id } : {}),
        evaluacion: { id: evaluacionId },
        puntajeGlobal: calculo.puntajeGlobal,
        puntajesPorDimension: calculo.puntajesPorDimension,
        participantes: bloqueada.estudiantesCompletaron.length,
        elegibles: Math.max(
          participacion.elegibles,
          bloqueada.estudiantesCompletaron.length,
        ),
        parcial: !definitivo,
        calculadoEn: new Date(),
      });
      if (!definitivo) return { estado: bloqueada.estado, alerta: null };

      // 5. Interpretación: alerta según los umbrales (RF-40)
      const tipo = clasificar(calculo.puntajeGlobal);
      await tx
        .getRepository(Alerta)
        .delete({ resultadoKdd: { id: resultado.id } });
      if (tipo) {
        const umbral =
          tipo === TipoAlerta.CRITICO ? UMBRAL_CRITICO : UMBRAL_ADVERTENCIA;
        await tx.getRepository(Alerta).insert({
          docente: { id: evaluacion.docente.id },
          periodoAcademico: { id: periodo.id },
          resultadoKdd: { id: resultado.id },
          tipo,
          mensaje: `${evaluacion.docente.usuario.nombre} obtuvo ${calculo.puntajeGlobal.toFixed(2)} en "${evaluacion.formulario.nombre}", por debajo de ${umbral.toFixed(1)}.`,
        });
      }
      const estado = tipo
        ? EstadoEvaluacion.ALERTA
        : EstadoEvaluacion.ANALIZADA;
      await tx
        .getRepository(Evaluacion)
        .update({ id: evaluacionId }, { estado });
      return { estado, alerta: tipo };
    });
  }

  /**
   * RF-39, disparo automático: se llama después de cada envío de respuestas y recalcula
   * si con ese envío terminó un grupo. Un fallo del KDD no debe tumbar el envío del
   * estudiante, así que se registra en el log y el envío sigue siendo válido.
   */
  async alResponder(evaluacionId: string): Promise<void> {
    try {
      await this.ejecutarEvaluacion(evaluacionId, 'AUTOMATICO');
    } catch (error) {
      this.logger.error(
        `No se pudo ejecutar el KDD de la evaluación ${evaluacionId}`,
        error as Error,
      );
    }
  }

  /** RF-39, ejecución manual: recalcula todas las evaluaciones con respuestas del período. */
  async ejecutarPeriodo(
    periodoId: string,
    actor: Actor,
  ): Promise<ResumenEjecucion> {
    const inicio = Date.now();
    const periodo = await this.periodo(periodoId);
    const evaluaciones = await this.fuente.getRepository(Evaluacion).find({
      where: {
        formulario: { periodoAcademico: { id: periodo.id } },
        estado: In(RECALCULABLES),
      },
      select: { id: true },
    });
    const alertas: Record<TipoAlerta, number> = {
      [TipoAlerta.CRITICO]: 0,
      [TipoAlerta.ADVERTENCIA]: 0,
      [TipoAlerta.INFO]: 0,
    };
    let procesadas = 0;
    let sinRespuestas = 0;
    for (const { id } of evaluaciones) {
      const resultado = await this.ejecutarEvaluacion(id, 'MANUAL');
      if (!resultado) {
        sinRespuestas++;
        continue;
      }
      procesadas++;
      if (resultado.alerta) alertas[resultado.alerta]++;
    }
    alertas[TipoAlerta.INFO] = await this.alertasSinEvaluaciones(periodo);

    const resumen = {
      periodo: { id: periodo.id, nombre: periodo.nombre },
      evaluacionesProcesadas: procesadas,
      sinRespuestas,
      alertas,
      tiempoMs: Date.now() - inicio,
    };
    await this.auditoria.registrar({
      usuarioId: actor.id,
      modulo: 'EVALUACION',
      accion: 'EJECUTAR_KDD',
      detalle: JSON.stringify(resumen),
      ip: actor.ip,
    });
    return resumen;
  }

  /** RF-40: alerta INFO por cada docente activo sin resultados en el período. */
  private async alertasSinEvaluaciones(
    periodo: PeriodoAcademico,
  ): Promise<number> {
    return this.fuente.transaction(async (tx) => {
      const conResultado = await tx
        .getRepository(ResultadoKdd)
        .createQueryBuilder('resultado')
        .innerJoin('resultado.evaluacion', 'evaluacion')
        .innerJoin('evaluacion.formulario', 'formulario')
        .select('DISTINCT evaluacion.docente_id', 'docenteId')
        .where('formulario.periodo_academico_id = :periodo', {
          periodo: periodo.id,
        })
        .getRawMany<{ docenteId: string }>();
      const evaluados = new Set(conResultado.map((fila) => fila.docenteId));
      const docentes = await tx.getRepository(Docente).find({
        where: { usuario: { activo: true } },
        relations: { usuario: true },
      });
      const sinEvaluar = docentes.filter((d) => !evaluados.has(d.id));

      // Las INFO se regeneran en cada ejecución; las ya leídas del mismo docente se conservan.
      const repo = tx.getRepository(Alerta);
      const existentes = await repo.find({
        where: { periodoAcademico: { id: periodo.id }, tipo: TipoAlerta.INFO },
        relations: { docente: true },
      });
      const vigentes = new Set(sinEvaluar.map((d) => d.id));
      const obsoletas = existentes.filter((a) => !vigentes.has(a.docente.id));
      if (obsoletas.length) await repo.delete(obsoletas.map((a) => a.id));
      const yaAvisados = new Set(existentes.map((a) => a.docente.id));
      const nuevas = sinEvaluar.filter((d) => !yaAvisados.has(d.id));
      if (nuevas.length)
        await repo.insert(
          nuevas.map((docente) => ({
            docente: { id: docente.id },
            periodoAcademico: { id: periodo.id },
            resultadoKdd: null,
            tipo: TipoAlerta.INFO,
            mensaje: `${docente.usuario.nombre} no tiene evaluaciones respondidas en el período ${periodo.nombre}.`,
          })),
        );
      return sinEvaluar.length;
    });
  }

  /** RF-41: puntaje global y por dimensión de cada docente del período. */
  async resultados(periodoId: string): Promise<ResultadoDocente[]> {
    const periodo = await this.periodo(periodoId);
    const filas = await this.consultaResultados(periodo.id).getMany();
    return filas
      .map((fila) => this.aRespuesta(fila))
      .sort((a, b) => a.puntajeGlobal - b.puntajeGlobal);
  }

  /** RF-42 y RF-43: resultados definitivos y comentarios anónimos del docente autenticado. */
  async misResultados(
    actor: Actor,
    periodoId?: string,
  ): Promise<{
    periodo: { id: string; nombre: string } | null;
    resultados: ResultadoPropio[];
  }> {
    const docente = await this.docenteDe(actor);
    const periodo = periodoId
      ? await this.periodo(periodoId)
      : await this.fuente
          .getRepository(PeriodoAcademico)
          .findOneBy({ activo: true });
    if (!periodo) return { periodo: null, resultados: [] };

    const filas = await this.consultaResultados(periodo.id)
      .addSelect('evaluacion.comentariosAnonimos')
      .andWhere('docente.id = :docente', { docente: docente.id })
      .andWhere('evaluacion.estado IN (:...estados)', { estados: PUBLICADOS })
      .andWhere('resultado.parcial = false')
      .getMany();
    return {
      periodo: { id: periodo.id, nombre: periodo.nombre },
      resultados: filas.map((fila) => {
        const { docente: _docente, ...resto } = this.aRespuesta(fila);
        return {
          ...resto,
          comentarios: fila.evaluacion.comentariosAnonimos,
        };
      }),
    };
  }

  /** RF-43: períodos en los que el docente tiene evaluaciones, más el período activo. */
  async misPeriodos(
    actor: Actor,
  ): Promise<Array<{ id: string; nombre: string; activo: boolean }>> {
    const docente = await this.docenteDe(actor);
    const periodos = await this.fuente
      .getRepository(PeriodoAcademico)
      .createQueryBuilder('periodo')
      .where('periodo.activo = true')
      .orWhere(
        `periodo.id IN (
          SELECT formulario.periodo_academico_id
          FROM evaluacion
          INNER JOIN formulario ON formulario.id = evaluacion.formulario_id
          WHERE evaluacion.docente_id = :docente
        )`,
        { docente: docente.id },
      )
      .orderBy('periodo.fechaInicio', 'DESC')
      .getMany();
    return periodos.map(({ id, nombre, activo }) => ({ id, nombre, activo }));
  }

  private async docenteDe(actor: Actor): Promise<Docente> {
    const docente = await this.fuente
      .getRepository(Docente)
      .findOneBy({ usuario: { id: actor.id } });
    if (!docente)
      throw new ForbiddenException(
        'Tu cuenta no tiene perfil de docente. Pídelo al Administrador.',
      );
    return docente;
  }

  private consultaResultados(periodoId: string) {
    return this.fuente
      .getRepository(ResultadoKdd)
      .createQueryBuilder('resultado')
      .innerJoinAndSelect('resultado.evaluacion', 'evaluacion')
      .innerJoinAndSelect('evaluacion.formulario', 'formulario')
      .innerJoinAndSelect('evaluacion.docente', 'docente')
      .innerJoinAndSelect('docente.usuario', 'usuario')
      .where('formulario.periodo_academico_id = :periodo', {
        periodo: periodoId,
      })
      .orderBy('resultado.calculadoEn', 'DESC');
  }

  private aRespuesta(fila: ResultadoKdd): ResultadoDocente {
    return {
      evaluacionId: fila.evaluacion.id,
      estado: fila.evaluacion.estado,
      docente: {
        id: fila.evaluacion.docente.id,
        nombre: fila.evaluacion.docente.usuario.nombre,
      },
      formulario: {
        id: fila.evaluacion.formulario.id,
        nombre: fila.evaluacion.formulario.nombre,
      },
      puntajeGlobal: fila.puntajeGlobal,
      etiqueta: etiquetaDesempeno(fila.puntajeGlobal),
      puntajesPorDimension: fila.puntajesPorDimension,
      participantes: fila.participantes,
      elegibles: fila.elegibles,
      parcial: fila.parcial,
      calculadoEn: fila.calculadoEn,
    };
  }

  private async periodo(id: string): Promise<PeriodoAcademico> {
    const periodo = await this.fuente
      .getRepository(PeriodoAcademico)
      .findOneBy({ id });
    if (!periodo)
      throw new NotFoundException('El período académico no existe.');
    return periodo;
  }
}
