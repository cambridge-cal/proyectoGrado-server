import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiaSemana, Jornada } from '../entidades/enums.js';
import { evaluar, indexar } from '../motor/aptitud.js';
import type {
  Asignacion,
  Evaluacion,
  InstanciaMotor,
  Violacion,
} from '../motor/tipos.js';
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
  | 'CUOTA_AGOTADA'
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
  /** Rondas con Gemini: 2 si hizo falta corregir los ajustes. */
  rondas?: number;
}

/** RNF-02 da 3 minutos al proceso completo; el AG y la BT tardan pocos segundos (TKT-019). */
export const TIMEOUT_POR_DEFECTO_MS = 120_000;

/** Ids cortos que ve Gemini y su traducción a los ids reales. */
interface Traduccion {
  contexto: ContextoGemini;
  docentePorEtiqueta: Map<string, string>;
  aulaPorEtiqueta: Map<string, string>;
  franjas: DatosValidacion['franjas'];
}

/**
 * Validación semántica con Gemini AI (RF-17, RNF-18, Figura 6.5). Si Gemini aprueba,
 * aplica sus ajustes solo cuando siguen cumpliendo las restricciones duras de RF-18; si
 * no las cumplen, le explica a Gemini qué restricción rompe cada uno y le pide una corrección.
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
    let mensaje = construirMensaje(traduccion.contexto);
    let ultimoMotivo = '';
    let ultimasObservaciones: ObservacionHorario[] = [];

    // Hasta MAX_RONDAS: si los ajustes rompen RF-18, se le explica a Gemini por qué y corrige.
    for (let ronda = 1; ronda <= MAX_RONDAS; ronda++) {
      const restante = this.timeoutMs - (performance.now() - inicio);
      if (ronda > 1 && restante < MINIMO_RONDA_MS) break;

      let texto: string;
      try {
        texto = await this.cliente.generar({
          instrucciones: INSTRUCCIONES_SISTEMA,
          mensaje,
          esquema: ESQUEMA_RESPUESTA,
          timeoutMs: Math.round(restante),
        });
      } catch (error) {
        const e = error as { name?: string; status?: number; message?: string };
        if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
          return respaldo(
            'TIEMPO_AGOTADO',
            `Gemini no respondió en ${Math.round(this.timeoutMs / 1000)} s.`,
            ultimasObservaciones,
          );
        }
        if (e?.status === 429 || /RESOURCE_EXHAUSTED/.test(e?.message ?? '')) {
          return respaldo(
            'CUOTA_AGOTADA',
            `Se agotó la cuota de la API de Gemini para el modelo ${this.cliente.modelo}.`,
            ultimasObservaciones,
          );
        }
        return respaldo(
          'ERROR',
          'La API de Gemini devolvió un error.',
          ultimasObservaciones,
        );
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
      ultimasObservaciones = observaciones;
      const exito = (
        estado: EstadoValidacion,
        asignaciones: Asignacion[],
        evaluacion: Evaluacion,
      ): ResultadoValidacion => ({
        validadoGemini: true,
        estado,
        asignaciones,
        evaluacion,
        observaciones,
        ajustesAplicados: respuesta.ajustes.map((a) => ({
          posicion: posicionDe(a.asignacion),
          motivo: a.motivo,
        })),
        modelo: this.cliente.modelo,
        tiempoMs: Math.round(performance.now() - inicio),
        detalle: null,
        rondas: ronda,
      });

      if (!respuesta.aprobado) {
        return respaldo(
          'RECHAZADO',
          'Gemini rechazó la propuesta; se conserva el horario del AG + Búsqueda Tabú.',
          observaciones,
        );
      }
      if (respuesta.ajustes.length === 0) {
        return exito('APROBADO', datos.asignaciones, original);
      }

      const ajustado = aplicarAjustes(
        datos.asignaciones,
        respuesta,
        traduccion,
      );
      let problemas: string[];
      let evaluacion: Evaluacion | null = null;
      if (typeof ajustado === 'string') {
        ultimoMotivo = ajustado;
        problemas = [ajustado];
      } else {
        evaluacion = evaluar(ajustado, indices);
        problemas = describirProblemas(
          evaluacion,
          original,
          datos.asignaciones,
        );
        if (!problemas.length) {
          return exito('APROBADO_CON_AJUSTES', ajustado, evaluacion);
        }
        ultimoMotivo =
          evaluacion.violacionesDuras > 0
            ? 'Los ajustes de Gemini rompían restricciones duras de RF-18; no se aplicaron.'
            : 'Los ajustes de Gemini superaban la carga máxima de un docente; no se aplicaron.';
      }
      mensaje = mensajeDeCorreccion(traduccion.contexto, texto, problemas);
    }

    return respaldo(
      'AJUSTES_INVALIDOS',
      `${ultimoMotivo} Gemini no logró corregirlos en ${MAX_RONDAS} intentos.`,
      ultimasObservaciones,
    );
  }
}

/** Rondas con Gemini: la propuesta inicial y una corrección si los ajustes rompen RF-18. */
export const MAX_RONDAS = 2;
/** Si queda menos de este tiempo de espera, no se intenta la corrección. */
const MINIMO_RONDA_MS = 15_000;

const NOMBRE_VIOLACION: Record<Violacion['tipo'], string> = {
  CRUCE_DOCENTE: 'el docente queda con dos clases en la misma franja',
  CRUCE_AULA: 'el aula queda con dos grupos en la misma franja',
  CRUCE_GRUPO: 'el grupo queda con dos clases en la misma franja',
  SIN_DISPONIBILIDAD: 'el docente no tiene disponibilidad en esa franja',
  CAPACIDAD_AULA: 'el aula no tiene capacidad para el grupo',
};

/** Explica en texto qué restricciones rompen los ajustes, con los ids que ve Gemini. */
function describirProblemas(
  evaluacion: Evaluacion,
  original: Evaluacion,
  asignaciones: Asignacion[],
): string[] {
  const problemas = evaluacion.violaciones
    .filter((v) => v.asignaciones.every((p) => p < asignaciones.length))
    .slice(0, 10)
    .map(
      (v) =>
        `${v.asignaciones.map(etiquetaAsignacion).join(' y ')}: ${NOMBRE_VIOLACION[v.tipo]}`,
    );
  if (evaluacion.horasSobrecarga > original.horasSobrecarga) {
    problemas.push('algún docente supera su carga máxima semanal');
  }
  return problemas;
}

function mensajeDeCorreccion(
  contexto: ContextoGemini,
  respuestaAnterior: string,
  problemas: string[],
): string {
  return `${construirMensaje(contexto)}

Tu respuesta anterior fue:
${respuestaAnterior}

Esos ajustes no se pueden aplicar porque rompen restricciones duras:
- ${problemas.join('\n- ')}

Corrige los ajustes usando solo franjas en las que el docente esté disponible y en las que ni el docente, ni el aula, ni el grupo tengan otra clase. Si no puedes corregirlos, responde aprobado = true sin ajustes y deja los problemas como observaciones.`;
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
      disponibilidad: datos.franjas
        .filter((f) =>
          datos.instancia.docentes
            .find((x) => x.id === d.id)
            ?.franjasDisponibles.has(f.id),
        )
        .map((f) => `${NOMBRES_DIA[f.diaSemana]} ${f.horaInicio}`),
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
