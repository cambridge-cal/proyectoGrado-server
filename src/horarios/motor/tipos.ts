/**
 * Tipos del motor de horarios (sección 6.3.1). El motor no conoce la base de datos:
 * recibe una instancia del problema ya cargada y devuelve un horario.
 */

export interface DocenteMotor {
  id: string;
  especialidad: string;
  /** Carga máxima semanal en horas (RF-15). */
  cargaMaximaHoras: number;
  /** Ids de las franjas en las que el docente está disponible (RF-16). */
  franjasDisponibles: ReadonlySet<string>;
}

export interface AulaMotor {
  id: string;
  capacidad: number;
  tipo: string;
}

export interface FranjaMotor {
  id: string;
  /** Días en que se repite la franja (por ejemplo martes a jueves). */
  dias: string[];
  horaInicio: string;
  horaFin: string;
  /** Horas por semana de la franja (sesión por número de días), para la carga docente. */
  horas: number;
}

export interface GrupoMotor {
  id: string;
  idioma: string;
  /** Estudiantes que deben caber en el aula: el cupo máximo del grupo (RF-12). */
  estudiantes: number;
  /** Número de franjas por semana que necesita el grupo según su intensidad horaria. */
  sesiones: number;
  /**
   * Franjas en las que se puede programar el grupo: las de su jornada y, si existen, las que
   * cubren su intensidad semanal en un solo bloque. Sin definir = cualquier franja.
   */
  franjas?: ReadonlySet<string>;
}

/** Instancia del problema: los datos del período activo (Figura 6.4, paso "Cargar"). */
export interface InstanciaMotor {
  docentes: DocenteMotor[];
  aulas: AulaMotor[];
  franjas: FranjaMotor[];
  grupos: GrupoMotor[];
}

/** Gen del cromosoma: una sesión de un grupo (sección 6.3.1). */
export interface Asignacion {
  grupoId: string;
  docenteId: string;
  aulaId: string;
  franjaId: string;
}

/** Un horario completo: un vector de asignaciones. */
export type Cromosoma = Asignacion[];

export type TipoViolacion =
  | 'CRUCE_DOCENTE'
  | 'CRUCE_AULA'
  | 'CRUCE_GRUPO'
  | 'SIN_DISPONIBILIDAD'
  | 'CAPACIDAD_AULA'
  | 'FRANJA_NO_PERMITIDA';

export interface Violacion {
  tipo: TipoViolacion;
  /** Posiciones de las asignaciones involucradas en el cromosoma. */
  asignaciones: number[];
}

export interface Evaluacion {
  aptitud: number;
  violacionesDuras: number;
  /** Horas por encima de la carga máxima, sumadas entre todos los docentes. */
  horasSobrecarga: number;
  asignacionesValidas: number;
  violaciones: Violacion[];
}

/** Parámetros del motor (RNF-30). Se leen de variables de entorno. */
export interface ParametrosMotor {
  poblacion: number;
  generaciones: number;
  tasaCruce: number;
  tasaMutacion: number;
  iteracionesTabu: number;
  tamanoTabu: number;
  /** Vecinos que la Búsqueda Tabú evalúa en cada iteración. */
  vecinosPorIteracion: number;
  maxIntentos: number;
  /** Semilla del generador aleatorio, para repetir una ejecución. */
  semilla?: number;
}
