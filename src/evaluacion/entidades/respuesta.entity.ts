import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Evaluacion } from './evaluacion.entity.js';
import type { Pregunta } from './pregunta.entity.js';

/**
 * RESPUESTA (Figura 6.10). Valor de 1 a 5 que un estudiante dio a una pregunta (RF-34).
 * No guarda quién respondió ni cuándo, para que no se pueda identificar al evaluador (RNF-10).
 */
@Entity('respuesta')
@Check('valor_numerico BETWEEN 1 AND 5')
export class Respuesta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne('Evaluacion', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'evaluacion_id' })
  evaluacion: Evaluacion;

  @Index()
  @ManyToOne('Pregunta', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pregunta_id' })
  pregunta: Pregunta;

  @Column({ name: 'valor_numerico', type: 'smallint' })
  valorNumerico: number;
}
