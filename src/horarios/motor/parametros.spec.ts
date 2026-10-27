import { leerParametros, PARAMETROS_POR_DEFECTO } from './parametros.js';

describe('Parámetros del motor (RNF-30)', () => {
  it('usa los valores de la sección 6.3.1 si no hay variables', () => {
    expect(leerParametros(() => undefined)).toEqual(PARAMETROS_POR_DEFECTO);
    expect(PARAMETROS_POR_DEFECTO).toMatchObject({
      poblacion: 50,
      generaciones: 100,
      tasaCruce: 0.8,
      tasaMutacion: 0.1,
      iteracionesTabu: 50,
      tamanoTabu: 20,
    });
  });

  it('lee los valores del entorno sin recompilar', () => {
    const entorno: Record<string, string> = {
      MOTOR_POBLACION: '80',
      MOTOR_TASA_MUTACION: '0.2',
      MOTOR_SEMILLA: '7',
    };
    expect(leerParametros((c) => entorno[c])).toMatchObject({
      poblacion: 80,
      tasaMutacion: 0.2,
      semilla: 7,
    });
  });

  it('rechaza valores fuera de rango', () => {
    expect(() =>
      leerParametros((c) => (c === 'MOTOR_TASA_CRUCE' ? '1.5' : undefined)),
    ).toThrow(/MOTOR_TASA_CRUCE/);
    expect(() =>
      leerParametros((c) => (c === 'MOTOR_POBLACION' ? '10.5' : undefined)),
    ).toThrow(/entero/);
  });
});
