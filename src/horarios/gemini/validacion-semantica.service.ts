import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiaSemana, Jornada } from '../entidades/enums.js';
import { evaluar, indexar } from '../motor/aptitud.js';
import type { Asignacion, Evaluacion, InstanciaMotor } from '../motor/tipos.js';
import { CLIENTE_GEMINI, type ClienteGemini } from './cliente-gemini.js';
import {
  construirMensaje,
  type ContextoGemini,
  ESQUEMA_RESPUESTA,
  INSTRUCCIONES_SISTEMA,
  type ObservacionGemini,
  type RespuestaGemini,
  validarRespuesta,
} from './prompt.js';

export const NOMBRES_DIA: Record<DiaSemana, string> = {
  [DiaSemana.LUN]: 'Lunes',
  [DiaSemana.MAR]: 'Martes',
  [DiaSemana.MIE]: 'Miércoles',
  [DiaSemana.JUE]: 'Jueves',
  [DiaSemana.VIE]: 'Viernes',
  [DiaSemana.SAB]: 'Sábado',
};
const NOMBRES_JORNADA: Record<Jornada, string> = {
  [Jornada.MANANA]: 'Mañana',
  [Jornada.TARDE]: 'Tarde',
  [Jornada.NOCHE]: 'Noche',
};

/** Datos del horario que se envía a validar, ya cargados de PostgreSQL. */
export interface DatosValidacion {
  periodo: string;
  docentes: Array<{
    id: string;
    nombre: string;
    especialidad: string;
    cargaMaximaSemanal: number;
  }>;
  aulas: Array<{ id: string; codigo: string; capacidad: number; tipo: string }>;
  grupos: Array<{
    id: string;
    codigo: string;
    curso: string;
    idioma: string;
    nivel: string;
    jornada: Jornada;
    cupoMaximo: number;
    intensidadHoraria: number;
  }>;
  franjas: Array<{
    id: string;
    diaSemana: DiaSemana;
    horaInicio: string;
    horaFin: string;
  }>;
  /** La misma instancia que recibió el motor, para volver a verificar las restricciones duras. */
  instancia: InstanciaMotor;
  /** Horario factible del AG + Búsqueda Tabú. */
  asignaciones: Asignacion[];
}

/**
 * Resultado de la validación (Figuras 6.4 y 6.5). Solo APROBADO y APROBADO_CON_AJUSTES
 * dejan validadoGemini = true; los demás conservan el horario del AG + BT (RNF-18).
 */
export type EstadoValidacion =
  | 'APROBADO'
  | 'APROBADO_CON_AJUSTES'
  | 'RECHAZADO'
  | 'RESPUESTA_INVALIDA'
  | 'AJUSTES_INVALIDOS'
  | 'TIEMPO_AGOTADO'
  | 'ERROR'
  | 'SIN_CONFIGURAR';

export interface ObservacionHorario {
  tipo: ObservacionGemini['tipo'];
  severidad: ObservacionGemini['severidad'];
  descripcion: string;
  /** Posiciones de las asignaciones afectadas en el horario. */
  asignaciones: number[];
}

export interface AjusteAplicado {
  posicion: number;
  motivo: string;
}

export interface ResultadoValidacion {
  validadoGemini: boolean;
  estado: EstadoValidacion;
  asignaciones: Asignacion[];
  evaluacion: Evaluacion;
  observaciones: ObservacionHorario[];
  ajustesAplicados: AjusteAplicado[];
  modelo: string;
  tiempoMs: number;
  /** Motivo del respaldo, para el Administrador. Nunca incluye la clave. */
  detalle: string | null;
}

export const TIMEOUT_POR_DEFECTO_MS = 60_000;

/** Ids cortos que ve Gemini y su traducción a los ids reales. */
interface Traduccion {
  contexto: ContextoGemini;
  docentePorEtiqueta: Map<string, string>;
  aulaPorEtiqueta: Map<string, string>;
  franjas: DatosValidacion['franjas'];
}

/**
 * Validación semántica con Gemini AI (RF-17, RNF-18, Figura 6.5). Si Gemini aprueba,
 * aplica sus ajustes solo cuando siguen cumpliendo las restricciones duras de RF-18.
 * Ante rechazo, respuesta inválida, error o tiempo agotado conserva el horario del
 * AG + Búsqueda Tabú con validadoGemini = false.
 */
@Injectable()
export class ValidacionSemanticaService {
  private readonly logger = new Logger(ValidacionSemanticaService.name);
  readonly timeoutMs: number;

  constructor(
    @Inject(CLIENTE_GEMINI) private readonly cliente: ClienteGemini,
    config: ConfigService,
  ) {
    const valor = Number(config.get<string>('GEMINI_TIMEOUT_MS'));
    this.timeoutMs =
      Number.isInteger(valor) && valor > 0 ? valor : TIMEOUT_POR_DEFECTO_MS;
  }

  async validar(datos: DatosValidacion): Promise<ResultadoValidacion> {
    const inicio = performance.now();
    const indices = indexar(datos.instancia);
    const original = evaluar(datos.asignaciones, indices);
    const respaldo = (
      estado: EstadoValidacion,
      detalle: string,
      observaciones: ObservacionHorario[] = [],
    ): ResultadoValidacion => {
      this.logger.warn(
        `Horario sin validar por Gemini (${estado}): ${detalle}`,
      );
      return {
        validadoGemini: false,
        estado,
        asignaciones: datos.asignaciones,
        evaluacion: original,
        observaciones,
        ajustesAplicados: [],
        modelo: this.cliente.modelo,
        tiempoMs: Math.round(performance.now() - inicio),
        detalle,
      };
    };

    if (!this.cliente.configurado) {
      return respaldo(
        'SIN_CONFIGURAR',
        'Falta GEMINI_API_KEY en el servidor; el horario se guardó sin validación semántica.',
      );
    }

    const traduccion = traducir(datos);
    let texto: string;
    try {
      texto = await this.cliente.generar({
        instrucciones: INSTRUCCIONES_SISTEMA,
        mensaje: construirMensaje(traduccion.contexto),
        esquema: ESQUEMA_RESPUESTA,
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      const nombre = (error as Error)?.name;
      return nombre === 'TimeoutError' || nombre === 'AbortError'
        ? respaldo(
            'TIEMPO_AGOTADO',
            `Gemini no respondió en ${Math.round(this.timeoutMs / 1000)} s.`,
          )
        : respaldo('ERROR', 'La API de Gemini devolvió un error.');
    }

    let respuesta: RespuestaGemini;
    try {
      respuesta = JSON.parse(texto) as RespuestaGemini;
    } catch {
      return respaldo(
        'RESPUESTA_INVALIDA',
        'La respuesta de Gemini no es JSON.',
      );
    }
    const errores = validarRespuesta(respuesta, traduccion.contexto);
    if (errores.length) {
      return respaldo(
        'RESPUESTA_INVALIDA',
        `La respuesta de Gemini no tiene el formato esperado: ${errores.slice(0, 3).join('; ')}.`,
      );
    }

    const observaciones = respuesta.observaciones.map((o) => ({
      tipo: o.tipo,
      severidad: o.severidad,
      descripcion: o.descripcion,
      asignaciones: o.asignaciones
        .map(posicionDe)
        .filter((p) => p >= 0 && p < datos.asignaciones.length),
    }));

    if (!respuesta.aprobado) {
      return respaldo(
        'RECHAZADO',
        'Gemini rechazó la propuesta; se conserva el horario del AG + Búsqueda Tabú.',
        observaciones,
      );
    }
    if (respuesta.ajustes.length === 0) {
      return {
        validadoGemini: true,
        estado: 'APROBADO',
        asignaciones: datos.asignaciones,
        evaluacion: original,
        observaciones,
        ajustesAplicados: [],
        modelo: this.cliente.modelo,
        tiempoMs: Math.round(performance.now() - inicio),
        detalle: null,
      };
    }

    const ajustado = aplicarAjustes(datos.asignaciones, respuesta, traduccion);
    if (typeof ajustado === 'string') {
      return respaldo('AJUSTES_INVALIDOS', ajustado, observaciones);
    }
    const evaluacion = evaluar(ajustado, indices);
    if (evaluacion.violacionesDuras > 0) {
      return respaldo(
        'AJUSTES_INVALIDOS',
        'Los ajustes de Gemini rompían restricciones duras de RF-18; no se aplicaron.',
        observaciones,
      );
    }
    if (evaluacion.horasSobrecarga > original.horasSobrecarga) {
      return respaldo(
        'AJUSTES_INVALIDOS',
        'Los ajustes de Gemini superaban la carga máxima de un docente; no se aplicaron.',
        observaciones,
      );
    }
    return {
      validadoGemini: true,
      estado: 'APROBADO_CON_AJUSTES',
      asignaciones: ajustado,
      evaluacion,
      observaciones,
      ajustesAplicados: respuesta.ajustes.map((a) => ({
        posicion: posicionDe(a.asignacion),
        motivo: a.motivo,
      })),
      modelo: this.cliente.modelo,
      tiempoMs: Math.round(performance.now() - inicio),
      detalle: null,
    };
  }
}

const etiquetaAsignacion = (posicion: number) => `S${posicion + 1}`;
function posicionDe(etiqueta: string): number {
  const n = /^S(\d+)$/.exec(etiqueta);
  return n ? Number(n[1]) - 1 : -1;
}

function traducir(datos: DatosValidacion): Traduccion {
  const etiquetaDocente = new Map(
    datos.docentes.map((d, i) => [d.id, `D${i + 1}`]),
  );
  const aula = new Map(datos.aulas.map((a) => [a.id, a]));
  const grupo = new Map(datos.grupos.map((g) => [g.id, g]));
  const franja = new Map(datos.franjas.map((f) => [f.id, f]));
  const contexto: ContextoGemini = {
    periodo: datos.periodo,
    docentes: datos.docentes.map((d) => ({
      id: etiquetaDocente.get(d.id)!,
      nombre: d.nombre,
      especialidad: d.especialidad,
      cargaMaximaSemanal: d.cargaMaximaSemanal,
    })),
    aulas: datos.aulas.map((a) => ({
      id: a.codigo,
      capacidad: a.capacidad,
      tipo: a.tipo,
    })),
    grupos: datos.grupos.map((g) => ({
      id: g.codigo,
      curso: g.curso,
      idioma: g.idioma,
      nivel: g.nivel,
      jornada: NOMBRES_JORNADA[g.jornada],
      cupoMaximo: g.cupoMaximo,
      intensidadHorariaSemanal: g.intensidadHoraria,
    })),
    franjas: datos.franjas.map((f) => ({
      dia: NOMBRES_DIA[f.diaSemana],
      inicio: f.horaInicio,
      fin: f.horaFin,
    })),
    asignaciones: datos.asignaciones.map((a, i) => {
      const f = franja.get(a.franjaId);
      return {
        id: etiquetaAsignacion(i),
        grupo: grupo.get(a.grupoId)?.codigo ?? a.grupoId,
        docente: etiquetaDocente.get(a.docenteId) ?? a.docenteId,
        aula: aula.get(a.aulaId)?.codigo ?? a.aulaId,
        dia: f ? NOMBRES_DIA[f.diaSemana] : '',
        inicio: f?.horaInicio ?? '',
        fin: f?.horaFin ?? '',
      };
    }),
  };
  return {
    contexto,
    docentePorEtiqueta: new Map(
      [...etiquetaDocente].map(([id, etiqueta]) => [etiqueta, id]),
    ),
    aulaPorEtiqueta: new Map(datos.aulas.map((a) => [a.codigo, a.id])),
    franjas: datos.franjas,
  };
}

/** Aplica los ajustes sobre una copia. Devuelve un mensaje si alguno no se puede traducir. */
function aplicarAjustes(
  asignaciones: Asignacion[],
  respuesta: RespuestaGemini,
  t: Traduccion,
): Asignacion[] | string {
  const copia = asignaciones.map((a) => ({ ...a }));
  const franja = new Map(t.franjas.map((f) => [f.id, f]));
  for (const ajuste of respuesta.ajustes) {
    const gen = copia[posicionDe(ajuste.asignacion)];
    if (ajuste.docente)
      gen.docenteId = t.docentePorEtiqueta.get(ajuste.docente)!;
    if (ajuste.aula) gen.aulaId = t.aulaPorEtiqueta.get(ajuste.aula)!;
    if (ajuste.dia || ajuste.inicio || ajuste.fin) {
      const actual = franja.get(gen.franjaId)!;
      const dia = ajuste.dia ?? NOMBRES_DIA[actual.diaSemana];
      const inicio =
        ajuste.inicio ?? (ajuste.fin ? undefined : actual.horaInicio);
      const destino = t.franjas.find(
        (f) =>
          NOMBRES_DIA[f.diaSemana] === dia &&
          (inicio === undefined || f.horaInicio === inicio) &&
          (ajuste.fin === undefined || f.horaFin === ajuste.fin),
      );
      if (!destino) {
        return `El ajuste de ${ajuste.asignacion} pide una franja que no existe (${dia} ${ajuste.inicio ?? ''}).`;
      }
      gen.franjaId = destino.id;
    }
  }
  return copia;
}
