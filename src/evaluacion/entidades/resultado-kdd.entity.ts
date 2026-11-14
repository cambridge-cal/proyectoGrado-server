import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Evaluacion } from './evaluacion.entity.js';

export interface PuntajeDimension {
  dimensionId: string;
  nombre: string;
  peso: number;
  /** Promedio de 1 a 5; null si la dimensión no recibió respuestas válidas. */
  promedio: number | null;
  respuestas: number;
}

/** RESULTADOKDD (Figura 6.10, RF-39). Un resultado por evaluación; se recalcula en cada ejecución. */
@Entity('resultado_kdd')
export class ResultadoKdd {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne('Evaluacion', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'evaluacion_id' })
  evaluacion: Evaluacion;

  /** Promedio ponderado por el peso de cada dimensión, de 1 a 5. */
  @Column({ name: 'puntaje_global', type: 'double precision' })
  puntajeGlobal: number;

  @Column({ name: 'puntajes_por_dimension', type: 'jsonb' })
  puntajesPorDimension: PuntajeDimension[];

  /** Estudiantes que respondieron y estudiantes que podían responder. */
  @Column({ type: 'int' })
  participantes: number;

  @Column({ type: 'int' })
  elegibles: number;

  /** true mientras falten estudiantes por responder (resultado parcial, Figura 6.15). */
  @Column({ default: false })
  parcial: boolean;

  @Column({ name: 'calculado_en', type: 'timestamptz' })
  calculadoEn: Date;
}
