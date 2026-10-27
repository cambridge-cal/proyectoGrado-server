import { Aleatorio } from './aleatorio.js';
import { ejecutarAlgoritmoGenetico } from './algoritmo-genetico.js';
import { ejecutarBusquedaTabu } from './busqueda-tabu.js';
import { generarInstancia } from './instancia-sintetica.js';
import { PARAMETROS_POR_DEFECTO } from './parametros.js';
import { Problema } from './problema.js';

// Instancia ajustada: 3 aulas y 20 franjas para 30 grupos de dos sesiones.
const ajustada = () =>
  new Problema(
    generarInstancia({
      docentes: 50,
      grupos: 30,
      aulas: 3,
      bloquesPorDia: 4,
      dias: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      disponibilidad: 0.5,
      semilla: 11,
    }),
  );

describe('Búsqueda Tabú (sección 6.3.1)', () => {
  it('mejora el mejor cromosoma del AG hasta cumplir las restricciones duras', () => {
    const problema = ajustada();
    const aleatorio = new Aleatorio(1);
    const ag = ejecutarAlgoritmoGenetico(
      problema,
      PARAMETROS_POR_DEFECTO,
      aleatorio,
    );
    const tabu = ejecutarBusquedaTabu(
      problema,
      ag.mejor,
      PARAMETROS_POR_DEFECTO,
      aleatorio,
    );

    expect(ag.evaluacion.violacionesDuras).toBeGreaterThan(0);
    expect(tabu.evaluacion.aptitud).toBeGreaterThan(ag.evaluacion.aptitud);
    expect(tabu.evaluacion.violacionesDuras).toBe(0);
    expect(tabu.iteraciones).toBeLessThanOrEqual(50);
  });

  it('nunca devuelve una solución peor que la inicial', () => {
    const problema = ajustada();
    const inicial = problema.construir(new Aleatorio(3));
    const tabu = ejecutarBusquedaTabu(
      problema,
      inicial,
      { ...PARAMETROS_POR_DEFECTO, iteracionesTabu: 5 },
      new Aleatorio(3),
    );
    for (let i = 1; i < tabu.historial.length; i++)
      expect(tabu.historial[i]).toBeGreaterThanOrEqual(tabu.historial[i - 1]);
  });

  it('respeta el máximo de iteraciones', () => {
    const problema = ajustada();
    const tabu = ejecutarBusquedaTabu(
      problema,
      problema.construir(new Aleatorio(4)),
      { ...PARAMETROS_POR_DEFECTO, iteracionesTabu: 3 },
      new Aleatorio(4),
    );
    expect(tabu.iteraciones).toBeLessThanOrEqual(3);
  });
});
