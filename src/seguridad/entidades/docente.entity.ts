import {
  Check,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Usuario } from './usuario.entity.js';

/** DOCENTE (Figura 6.8). Perfil de un usuario con rol DOCENTE. */
@Entity('docente')
@Check('carga_maxima_semanal > 0')
export class Docente {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // RNF-19: ON DELETE RESTRICT. Un usuario tiene como máximo un perfil de docente.
  @OneToOne('Usuario', (usuario: Usuario) => usuario.docente, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Column({ length: 120 })
  especialidad: string;

  /** Horas de clase que el docente puede dictar por semana; la usa el motor de horarios. */
  @Column({ name: 'carga_maxima_semanal', type: 'int' })
  cargaMaximaSemanal: number;
}
