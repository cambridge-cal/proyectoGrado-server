import { TipoAlerta } from '../entidades/alerta.entity.js';
import {
  calcularResultado,
  clasificar,
  etiquetaDesempeno,
  type DimensionKdd,
  type RespuestaKdd,
} from './calculo.js';

const dimensiones: DimensionKdd[] = [
  { id: 'd1', nombre: 'Metodología', peso: 60, preguntaIds: ['p1', 'p2'] },
  { id: 'd2', nombre: 'Puntualidad', peso: 40, preguntaIds: ['p3'] },
];
const r = (preguntaId: string, valor: number): RespuestaKdd => ({
  preguntaId,
  valor,
});

describe('Cálculo del pipeline KDD (RF-39, Figura 6.7)', () => {
  it('promedia por dimensión y pondera el puntaje global por el peso', () => {
    const resultado = calcularResultado(dimensiones, [
      r('p1', 5),
      r('p2', 4),
      r('p1', 3),
      r('p2', 4),
      r('p3', 2),
      r('p3', 3),
    ]);
    expect(resultado.puntajesPorDimension).toEqual([
      {
        dimensionId: 'd1',
        nombre: 'Metodología',
        peso: 60,
        promedio: 4,
        respuestas: 4,
      },
      {
        dimensionId: 'd2',
        nombre: 'Puntualidad',
        peso: 40,
        promedio: 2.5,
        respuestas: 2,
      },
    ]);
    // 4 * 0.6 + 2.5 * 0.4
    expect(resultado.puntajeGlobal).toBe(3.4);
    expect(resultado.descartadas).toBe(0);
  });

  it('descarta respuestas fuera de la escala 1 a 5 o de preguntas ajenas', () => {
    const resultado = calcularResultado(dimensiones, [
      r('p1', 5),
      r('p1', 0),
      r('p2', 6),
      r('p2', 3.5),
      r('otra', 4),
      r('p3', 5),
    ]);
    expect(resultado.descartadas).toBe(4);
    expect(resultado.respuestasValidas).toBe(2);
    expect(resultado.puntajeGlobal).toBe(5);
  });

  it('una dimensión sin respuestas no entra en el promedio global', () => {
    const resultado = calcularResultado(dimensiones, [r('p3', 4), r('p3', 2)]);
    expect(resultado.puntajesPorDimension[0]).toMatchObject({
      promedio: null,
      respuestas: 0,
    });
    expect(resultado.puntajeGlobal).toBe(3);
  });

  it('sin respuestas válidas no hay puntaje', () => {
    expect(calcularResultado(dimensiones, []).puntajeGlobal).toBeNull();
  });

  it('los formularios sin pesos promedian sus dimensiones por igual', () => {
    const sinPesos = dimensiones.map((d) => ({ ...d, peso: 0 }));
    const resultado = calcularResultado(sinPesos, [r('p1', 5), r('p3', 2)]);
    expect(resultado.puntajeGlobal).toBe(3.5);
  });

  it('clasifica con los umbrales de RF-40', () => {
    expect(clasificar(2.99)).toBe(TipoAlerta.CRITICO);
    expect(clasificar(3)).toBe(TipoAlerta.ADVERTENCIA);
    expect(clasificar(3.49)).toBe(TipoAlerta.ADVERTENCIA);
    expect(clasificar(3.5)).toBeNull();
    expect(etiquetaDesempeno(4.6)).toBe('Excelente');
    expect(etiquetaDesempeno(3.2)).toBe('En observación');
    expect(etiquetaDesempeno(2)).toBe('Crítico');
  });

  it('calcula 200 evaluaciones de 40 estudiantes en mucho menos de 30 s (RNF-03)', () => {
    const grandes: DimensionKdd[] = Array.from({ length: 5 }, (_, d) => ({
      id: `d${d}`,
      nombre: `Dimensión ${d}`,
      peso: 20,
      preguntaIds: Array.from({ length: 4 }, (_, p) => `d${d}p${p}`),
    }));
    const respuestas: RespuestaKdd[] = [];
    for (let estudiante = 0; estudiante < 40; estudiante++)
      for (const dimension of grandes)
        for (const preguntaId of dimension.preguntaIds)
          respuestas.push(
            r(preguntaId, 1 + ((estudiante + preguntaId.length) % 5)),
          );
    const inicio = performance.now();
    for (let evaluacion = 0; evaluacion < 200; evaluacion++)
      expect(
        calcularResultado(grandes, respuestas).puntajeGlobal,
      ).not.toBeNull();
    expect(performance.now() - inicio).toBeLessThan(2000);
  });
});
