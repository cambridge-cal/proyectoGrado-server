import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { PeriodoAcademico } from '../../horarios/entidades/periodo-academico.entity.js';
import type { Docente } from '../../seguridad/entidades/docente.entity.js';
import type { ResultadoKdd } from './resultado-kdd.entity.js';

export enum TipoAlerta {
  CRITICO = 'CRITICO',
  ADVERTENCIA = 'ADVERTENCIA',
  INFO = 'INFO',
}

/** ALERTA (Figura 6.10, RF-40, RF-44). La genera el pipeline KDD. */
@Entity('alerta')
@Index(['periodoAcademico', 'leida'])
export class Alerta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('Docente', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'docente_id' })
  docente: Docente;

  @ManyToOne('PeriodoAcademico', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'periodo_academico_id' })
  periodoAcademico: PeriodoAcademico;

  /** Vacío en las alertas INFO, que no nacen de un resultado. */
  @ManyToOne('ResultadoKdd', { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resultado_kdd_id' })
  resultadoKdd: ResultadoKdd | null;

  @Column({ type: 'enum', enum: TipoAlerta, enumName: 'tipo_alerta' })
  tipo: TipoAlerta;

  @Column({ length: 300 })
  mensaje: string;

  @Column({ default: false })
  leida: boolean;

  @CreateDateColumn({ name: 'creada_en' })
  creadaEn: Date;
}
