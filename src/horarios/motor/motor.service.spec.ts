import { ConfigService } from '@nestjs/config';
import { generarInstancia } from './instancia-sintetica.js';
import { MotorService } from './motor.service.js';

const config = (valores: Record<string, string>) =>
  ({ get: (clave: string) => valores[clave] }) as unknown as ConfigService;

describe('MotorService (RNF-30)', () => {
  it('toma los parámetros de las variables MOTOR_* del entorno', () => {
    const servicio = new MotorService(
      config({ MOTOR_GENERACIONES: '30', MOTOR_ITERACIONES_TABU: '10' }),
    );
    expect(servicio.parametros).toMatchObject({
      generaciones: 30,
      iteracionesTabu: 10,
      poblacion: 50,
    });
  });

  it('impide arrancar con un parámetro inválido', () => {
    expect(
      () => new MotorService(config({ MOTOR_TASA_MUTACION: 'mucho' })),
    ).toThrow(/MOTOR_TASA_MUTACION/);
  });

  it('genera un horario con los parámetros configurados', () => {
    const servicio = new MotorService(config({}));
    const resultado = servicio.generar(
      generarInstancia({ docentes: 10, grupos: 6, aulas: 4, semilla: 1 }),
      { semilla: 1 },
    );
    expect(resultado.factible).toBe(true);
  });
});
