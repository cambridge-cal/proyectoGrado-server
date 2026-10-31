import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { TipoAula } from './enums.js';
import type { PeriodoAcademico } from './periodo-academico.entity.js';

/** Una asignación del horario: grupo, docente, aula y franja (sección 6.3.1). */
export interface AsignacionHorario {
  grupoId: string;
  docenteId: string;
  aulaId: string;
  franjaId: string;
}

/** Resultado de la validación semántica que se guarda con el horario (RNF-18). */
export interface ValidacionHorario {
  estado: string;
  modelo: string;
  tiempoMs: number;
  detalle: string | null;
  observaciones: Array<{
    tipo: string;
    severidad: string;
    descripcion: string;
    asignaciones: number[];
  }>;
  ajustesAplicados: Array<{ posicion: number; motivo: string }>;
  /** Rondas con Gemini (2 si hubo que corregir los ajustes); 0 si no se llamó. */
  rondas?: number;
}

/**
 * HORARIO (Figura 6.9). Las asignaciones se guardan como JSONB (sección 6.5.2): las
 * referencias a grupo, docente, aula y franja se verifican en el servicio antes de guardar.
 * Ciclo de vida de la Figura 6.16: ACTIVO (archivado = false) o ARCHIVADO.
 */
@Entity('horario')
@Index(['periodo', 'archivado'])
export class Horario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('PeriodoAcademico', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'periodo_academico_id' })
  periodo: PeriodoAcademico;

  @Column({ type: 'jsonb' })
  asignaciones: AsignacionHorario[];

  @Column({ type: 'double precision' })
  fitness: number;

  @Column({ type: 'int' })
  generaciones: number;

  /** Tiempo total: motor de IA más la validación con Gemini, en milisegundos. */
  @Column({ name: 'tiempo_ejecucion_ms', type: 'int' })
  tiempoEjecucionMs: number;

  /** Intentos del motor hasta obtener el horario (máximo MOTOR_MAX_INTENTOS). */
  @Column({ type: 'int', default: 1 })
  intentos: number;

  @Column({ name: 'validado_gemini', default: false })
  validadoGemini: boolean;

  @Column({ type: 'jsonb' })
  validacion: ValidacionHorario;

  /** Tipos de aula excluidos al generar (RF-19). */
  @Column({
    name: 'tipos_aula_excluidos',
    type: 'text',
    array: true,
    default: () => "'{}'",
  })
  tiposAulaExcluidos: TipoAula[];

  @Column({ default: false })
  archivado: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}
