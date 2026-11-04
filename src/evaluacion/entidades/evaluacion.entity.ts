import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Docente } from '../../seguridad/entidades/docente.entity.js';
import { EstadoEvaluacion } from './estado-evaluacion.enum.js';
import type { Formulario } from './formulario.entity.js';

/** EVALUACION (Figura 6.10). Asignación de un formulario a un docente (RF-31, RF-32). */
@Entity('evaluacion')
@Unique('UQ_evaluacion_formulario_docente', ['formulario', 'docente'])
export class Evaluacion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne('Formulario', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'formulario_id' })
  formulario: Formulario;

  @Index()
  @ManyToOne('Docente', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'docente_id' })
  docente: Docente;

  @Column({
    type: 'enum',
    enum: EstadoEvaluacion,
    enumName: 'estado_evaluacion',
    default: EstadoEvaluacion.PENDIENTE,
  })
  estado: EstadoEvaluacion;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;
}
