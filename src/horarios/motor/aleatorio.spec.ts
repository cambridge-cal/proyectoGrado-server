import { Aleatorio } from './aleatorio.js';

describe('Aleatorio (generador pseudoaleatorio con semilla)', () => {
  it('produce la misma secuencia con la misma semilla', () => {
    const a = new Aleatorio(42);
    const b = new Aleatorio(42);
    for (let i = 0; i < 100; i++) expect(a.siguiente()).toBe(b.siguiente());
  });

  it('siguiente() devuelve valores en [0, 1)', () => {
    const rng = new Aleatorio(1);
    for (let i = 0; i < 1000; i++) {
      const v = rng.siguiente();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('entero(n) devuelve valores en [0, n)', () => {
    const rng = new Aleatorio(7);
    for (let i = 0; i < 200; i++) {
      const v = rng.entero(5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('elegir devuelve un elemento de la lista', () => {
    const rng = new Aleatorio(3);
    const lista = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) expect(lista).toContain(rng.elegir(lista));
  });

  it('probabilidad respeta la distribución esperada', () => {
    const rng = new Aleatorio(10);
    let verdaderos = 0;
    const n = 10_000;
    for (let i = 0; i < n; i++) if (rng.probabilidad(0.3)) verdaderos++;
    expect(verdaderos / n).toBeCloseTo(0.3, 1);
  });

  it('barajar mantiene todos los elementos', () => {
    const rng = new Aleatorio(5);
    const original = [1, 2, 3, 4, 5, 6, 7, 8];
    const copia = [...original];
    rng.barajar(copia);
    expect(copia.sort()).toEqual(original.sort());
  });

  it('barajar altera el orden (con alta probabilidad)', () => {
    const rng = new Aleatorio(99);
    const lista = Array.from({ length: 20 }, (_, i) => i);
    const original = [...lista];
    rng.barajar(lista);
    expect(lista).not.toEqual(original);
  });
});
