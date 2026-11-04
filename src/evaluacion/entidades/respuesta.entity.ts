import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Evaluacion } from './evaluacion.entity.js';
import type { Pregunta } from './pregunta.entity.js';

/**
 * RESPUESTA (Figura 6.10). Respuesta anónima a una pregunta de evaluación (RF-34, RNF-10).
 * No almacena ningún identificador del estudiante que la envía.
 */
@Entity('respuesta')
@Check('valor >= 1 AND valor <= 5')
export class Respuesta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne('Evaluacion', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'evaluacion_id' })
  evaluacion: Evaluacion;

  @ManyToOne('Pregunta', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pregunta_id' })
  pregunta: Pregunta;

  /** Valor de la escala: 1 a 5 (RF-30). */
  @Column({ type: 'int' })
  valor: number;

  /** Comentario opcional de mínimo 30 caracteres (RF-35). */
  @Column({ type: 'text', nullable: true })
  comentario: string | null;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
