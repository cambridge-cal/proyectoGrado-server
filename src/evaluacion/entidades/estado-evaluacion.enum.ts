/** Estados del ciclo de vida de una evaluación (Figura 6.15). */
export enum EstadoEvaluacion {
  /** Asignada por el Administrador; nadie ha respondido (RF-31). */
  PENDIENTE = 'PENDIENTE',
  /** Al menos un estudiante envió sus respuestas. */
  EN_PROGRESO = 'EN_PROGRESO',
  /** Respondieron todos los estudiantes de los grupos del docente. */
  COMPLETADA = 'COMPLETADA',
  /** El pipeline KDD calculó su resultado (RF-39). */
  ANALIZADA = 'ANALIZADA',
  /** El resultado quedó bajo el umbral y generó una alerta (RF-40). */
  ALERTA = 'ALERTA',
  /** Resultados publicados o alerta revisada. */
  CERRADA = 'CERRADA',
  /** Cierre del período académico. */
  ARCHIVADA = 'ARCHIVADA',
}

/** Estados en los que la evaluación todavía recibe respuestas de los estudiantes. */
export const ESTADOS_ABIERTOS: readonly EstadoEvaluacion[] = [
  EstadoEvaluacion.PENDIENTE,
  EstadoEvaluacion.EN_PROGRESO,
  EstadoEvaluacion.COMPLETADA,
];

/**
 * Transiciones que el Administrador puede hacer a mano (Figura 6.15). Las demás las hace el
 * sistema: el envío de respuestas (RF-36) y el pipeline KDD (RF-39).
 */
export const TRANSICIONES_MANUALES: Readonly<
  Partial<Record<EstadoEvaluacion, readonly EstadoEvaluacion[]>>
> = {
  [EstadoEvaluacion.ANALIZADA]: [EstadoEvaluacion.CERRADA],
  [EstadoEvaluacion.ALERTA]: [EstadoEvaluacion.CERRADA],
  [EstadoEvaluacion.CERRADA]: [EstadoEvaluacion.ARCHIVADA],
};
