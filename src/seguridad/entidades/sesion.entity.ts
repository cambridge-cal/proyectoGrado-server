import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Usuario } from './usuario.entity.js';

/** SESION (Figura 6.8). Un Refresh Token emitido a un usuario; solo se guarda su hash (RNF-06). */
@Entity('sesion')
export class Sesion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne('Usuario', (usuario: Usuario) => usuario.sesiones, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Column({ name: 'refresh_token_hash', length: 72 })
  refreshTokenHash: string;

  @CreateDateColumn({ name: 'creada_en', type: 'timestamptz' })
  creadaEn: Date;

  @Column({ name: 'expira_en', type: 'timestamptz' })
  expiraEn: Date;
}
