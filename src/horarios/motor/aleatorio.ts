/**
 * Generador pseudoaleatorio con semilla (mulberry32). Con la misma semilla el
 * motor produce el mismo horario, lo que permite probarlo y reproducir resultados.
 */
export class Aleatorio {
  private estado: number;

  constructor(semilla = Date.now()) {
    this.estado = semilla >>> 0;
  }

  /** Número en [0, 1). */
  siguiente(): number {
    this.estado = (this.estado + 0x6d2b79f5) >>> 0;
    let t = this.estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Entero en [0, n). */
  entero(n: number): number {
    return Math.floor(this.siguiente() * n);
  }

  elegir<T>(lista: readonly T[]): T {
    return lista[this.entero(lista.length)];
  }

  probabilidad(p: number): boolean {
    return this.siguiente() < p;
  }

  barajar<T>(lista: T[]): T[] {
    for (let i = lista.length - 1; i > 0; i--) {
      const j = this.entero(i + 1);
      [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    return lista;
  }
}
