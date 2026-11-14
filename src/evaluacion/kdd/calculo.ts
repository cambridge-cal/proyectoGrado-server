import { TipoAlerta } from '../entidades/alerta.entity.js';
import type { PuntajeDimension } from '../entidades/resultado-kdd.entity.js';

/** Umbrales de RF-40 sobre el puntaje global (escala 1 a 5). */
export const UMBRAL_CRITICO = 3.0;
export const UMBRAL_ADVERTENCIA = 3.5;

export interface DimensionKdd {
  id: string;
  nombre: string;
  peso: number;
  preguntaIds: string[];
}

export interface RespuestaKdd {
  preguntaId: string;
  valor: number;
}

export interface CalculoKdd {
  /** null si ninguna respuesta fue válida. */
  puntajeGlobal: number | null;
  puntajesPorDimension: PuntajeDimension[];
  respuestasValidas: number;
  descartadas: number;
}

const redondear = (valor: number) => Math.round(valor * 100) / 100;

/**
 * Etapas 2 a 4 del proceso KDD (Figura 6.7), sin acceso a datos:
 * preprocesamiento (descarta valores fuera de la escala 1 a 5 o de preguntas ajenas),
 * transformación (agrupa por dimensión) y análisis (promedio por dimensión y puntaje
 * global ponderado por el peso de cada dimensión).
 */
export function calcularResultado(
  dimensiones: DimensionKdd[],
  respuestas: RespuestaKdd[],
): CalculoKdd {
  const dimensionDe = new Map<string, string>();
  for (const dimension of dimensiones)
    for (const preguntaId of dimension.preguntaIds)
      dimensionDe.set(preguntaId, dimension.id);

  const acumulado = new Map<string, { suma: number; cuenta: number }>();
  let descartadas = 0;
  for (const respuesta of respuestas) {
    const dimensionId = dimensionDe.get(respuesta.preguntaId);
    const valido =
      Number.isInteger(respuesta.valor) &&
      respuesta.valor >= 1 &&
      respuesta.valor <= 5;
    if (!dimensionId || !valido) {
      descartadas++;
      continue;
    }
    const actual = acumulado.get(dimensionId) ?? { suma: 0, cuenta: 0 };
    actual.suma += respuesta.valor;
    actual.cuenta++;
    acumulado.set(dimensionId, actual);
  }

  const puntajesPorDimension = dimensiones.map((dimension) => {
    const datos = acumulado.get(dimension.id);
    return {
      dimensionId: dimension.id,
      nombre: dimension.nombre,
      peso: dimension.peso,
      promedio: datos ? redondear(datos.suma / datos.cuenta) : null,
      respuestas: datos?.cuenta ?? 0,
    };
  });

  // El promedio global usa los promedios sin redondear y solo las dimensiones con datos.
  // Si el formulario es anterior a los pesos (todos en 0), las dimensiones pesan igual.
  const conDatos = dimensiones.filter((d) => acumulado.has(d.id));
  const sinPesos = conDatos.every((d) => !(d.peso > 0));
  let suma = 0;
  let pesos = 0;
  for (const dimension of conDatos) {
    const datos = acumulado.get(dimension.id)!;
    const peso = sinPesos ? 1 : Math.max(dimension.peso, 0);
    suma += (datos.suma / datos.cuenta) * peso;
    pesos += peso;
  }
  return {
    puntajeGlobal: pesos > 0 ? redondear(suma / pesos) : null,
    puntajesPorDimension,
    respuestasValidas: respuestas.length - descartadas,
    descartadas,
  };
}

/** Etapa 5, interpretación (RF-40): qué alerta corresponde al puntaje global. */
export function clasificar(
  puntajeGlobal: number,
): TipoAlerta.CRITICO | TipoAlerta.ADVERTENCIA | null {
  if (puntajeGlobal < UMBRAL_CRITICO) return TipoAlerta.CRITICO;
  if (puntajeGlobal < UMBRAL_ADVERTENCIA) return TipoAlerta.ADVERTENCIA;
  return null;
}

/** Etiqueta de desempeño del dashboard del docente (RF-42). */
export function etiquetaDesempeno(puntajeGlobal: number): string {
  if (puntajeGlobal >= 4.5) return 'Excelente';
  if (puntajeGlobal >= 4.0) return 'Sobresaliente';
  if (puntajeGlobal >= UMBRAL_ADVERTENCIA) return 'Satisfactorio';
  if (puntajeGlobal >= UMBRAL_CRITICO) return 'En observación';
  return 'Crítico';
}
