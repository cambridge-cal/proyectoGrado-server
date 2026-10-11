import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Usuario } from './usuario.entity.js';

/** ESTUDIANTE (Figura 6.8). Perfil de un usuario con rol ESTUDIANTE. */
@Entity('estudiante')
export class Estudiante {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // RNF-19: ON DELETE RESTRICT. Un usuario tiene como máximo un perfil de estudiante.
  @OneToOne('Usuario', (usuario: Usuario) => usuario.estudiante, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Column({ length: 30, unique: true })
  codigo: string;
}
