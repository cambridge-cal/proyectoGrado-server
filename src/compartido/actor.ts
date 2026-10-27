import type { Request } from 'express';
import type { PayloadAccess } from '../seguridad/autenticacion/tokens.js';

/** Quién hace la operación, para validar reglas y para el Audit Log. */
export interface Actor {
  id: string;
  rol: PayloadAccess['rol'];
  ip: string | null;
}

export function actorDe(usuario: PayloadAccess, peticion: Request): Actor {
  return { id: usuario.sub, rol: usuario.rol, ip: peticion.ip ?? null };
}
