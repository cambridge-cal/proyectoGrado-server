import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generarHorario, type ResultadoMotor } from './motor.js';
import { leerParametros } from './parametros.js';
import type { InstanciaMotor, ParametrosMotor } from './tipos.js';

/**
 * Punto de entrada del motor de IA para el resto del servidor. Los parámetros se leen
 * de las variables MOTOR_* del .env (RNF-30), así se ajustan sin recompilar.
 * La carga de datos desde PostgreSQL y la validación con Gemini llegan con TKT-020 y TKT-021.
 */
@Injectable()
export class MotorService {
  readonly parametros: ParametrosMotor;

  constructor(config: ConfigService) {
    this.parametros = leerParametros((clave) => config.get<string>(clave));
  }

  generar(
    instancia: InstanciaMotor,
    ajustes: Partial<ParametrosMotor> = {},
  ): ResultadoMotor {
    return generarHorario(instancia, { ...this.parametros, ...ajustes });
  }
}
