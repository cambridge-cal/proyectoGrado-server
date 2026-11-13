import { Alerta, TipoAlerta } from './alerta.entity.js';
import { Dimension } from './dimension.entity.js';
import { Evaluacion } from './evaluacion.entity.js';
import { Formulario } from './formulario.entity.js';
import { Pregunta } from './pregunta.entity.js';
import { Respuesta } from './respuesta.entity.js';
import { ResultadoKdd } from './resultado-kdd.entity.js';

export {
  Alerta,
  Dimension,
  Evaluacion,
  Formulario,
  Pregunta,
  Respuesta,
  ResultadoKdd,
  TipoAlerta,
};
export type { PuntajeDimension } from './resultado-kdd.entity.js';
export {
  EstadoEvaluacion,
  ESTADOS_ABIERTOS,
  TRANSICIONES_MANUALES,
} from './estado-evaluacion.enum.js';

/** Entidades del módulo de Evaluación (Figura 6.10). */
export const ENTIDADES_EVALUACION = [
  Formulario,
  Dimension,
  Pregunta,
  Evaluacion,
  Respuesta,
  ResultadoKdd,
  Alerta,
];
