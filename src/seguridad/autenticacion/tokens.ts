import { createHash } from 'node:crypto';
import { Rol } from '../entidades/rol.enum.js';

/** RNF-06: Access Token de 8 horas y Refresh Token de 7 días. */
export const VIGENCIA_ACCESS_SEGUNDOS = 8 * 60 * 60;
export const VIGENCIA_REFRESH_SEGUNDOS = 7 * 24 * 60 * 60;

/** Contenido del Access Token. */
export interface PayloadAccess {
  sub: string;
  email: string;
  rol: Rol;
}

/** Contenido del Refresh Token: sid identifica la fila de SESION. */
export interface PayloadRefresh {
  sub: string;
  sid: string;
}

/**
 * Hash del Refresh Token que se guarda en SESION.
 * Se usa SHA-256 y no bcrypt porque bcrypt solo lee los primeros 72 bytes y
 * un JWT es más largo: dos tokens del mismo usuario producirían el mismo hash.
 * El token ya tiene alta entropía, así que no necesita un hash lento.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
