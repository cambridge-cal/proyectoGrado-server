import {
  Column,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { AuditLog } from './audit-log.entity.js';
import type { Docente } from './docente.entity.js';
import type { Estudiante } from './estudiante.entity.js';
import { Rol } from './rol.enum.js';
import type { Sesion } from './sesion.entity.js';
import { emailNormalizado } from './transformadores.js';

/** USUARIO (Figura 6.8). Cuenta de acceso de cualquier rol. */
@Entity('usuario')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  nombre: string;

  @Column({ length: 160, unique: true, transformer: emailNormalizado })
  email: string;

  /** Hash bcrypt de la contraseña (RNF-05). No se incluye en las consultas por defecto. */
  @Column({ name: 'contrasena_hash', length: 72, select: false })
  contrasenaHash: string;

  @Column({ type: 'enum', enum: Rol, enumName: 'rol_usuario' })
  rol: Rol;

  @Column({ default: true })
  activo: boolean;

  @OneToOne('Estudiante', (estudiante: Estudiante) => estudiante.usuario)
  estudiante?: Estudiante;

  @OneToOne('Docente', (docente: Docente) => docente.usuario)
  docente?: Docente;

  @OneToMany('Sesion', (sesion: Sesion) => sesion.usuario)
  sesiones?: Sesion[];

  @OneToMany('AuditLog', (registro: AuditLog) => registro.usuario)
  registrosAuditoria?: AuditLog[];
}
