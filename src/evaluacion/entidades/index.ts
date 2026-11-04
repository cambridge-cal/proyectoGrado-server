import { Dimension } from './dimension.entity.js';
import { Evaluacion } from './evaluacion.entity.js';
import { Formulario } from './formulario.entity.js';
import { Pregunta } from './pregunta.entity.js';

export { Dimension, Evaluacion, Formulario, Pregunta };
export { EstadoEvaluacion } from './estado-evaluacion.enum.js';

/** Entidades del módulo de Evaluación (Figura 6.10). */
export const ENTIDADES_EVALUACION = [
  Formulario,
  Dimension,
  Pregunta,
  Evaluacion,
];
