import { AuditLog } from './audit-log.entity.js';
import { Docente } from './docente.entity.js';
import { Estudiante } from './estudiante.entity.js';
import { Sesion } from './sesion.entity.js';
import { Usuario } from './usuario.entity.js';

export { AuditLog, Docente, Estudiante, Sesion, Usuario };
export { Rol } from './rol.enum.js';

/** Entidades del módulo de Seguridad (Figura 6.8). */
export const ENTIDADES_SEGURIDAD = [
  Usuario,
  Estudiante,
  Docente,
  Sesion,
  AuditLog,
];
