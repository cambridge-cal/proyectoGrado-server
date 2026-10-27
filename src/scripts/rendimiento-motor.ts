/**
 * TKT-019: prueba de rendimiento del motor de IA (RNF-02).
 * Mide el tiempo del AG + Búsqueda Tabú con 50 docentes y 30 grupos en escenarios de
 * dificultad creciente. No toca la base de datos ni llama a Gemini.
 *
 * Uso: npm run rendimiento:motor            (5 repeticiones por escenario)
 *      npm run rendimiento:motor -- 10      (10 repeticiones)
 */
import { cpus } from 'node:os';
import {
  generarInstancia,
  type OpcionesInstancia,
} from '../horarios/motor/instancia-sintetica.js';
import { generarHorario } from '../horarios/motor/motor.js';
import { PARAMETROS_POR_DEFECTO } from '../horarios/motor/parametros.js';

const LIMITE_MS = 3 * 60 * 1000;
const repeticiones = Number(process.argv[2] ?? 5);

const ESCENARIOS: Array<{ nombre: string; opciones: OpcionesInstancia }> = [
  {
    nombre: 'Holgado: 15 aulas, 6 días x 7 franjas, 60 % de disponibilidad',
    opciones: { docentes: 50, grupos: 30, aulas: 15, disponibilidad: 0.6 },
  },
  {
    nombre: 'Medio: 6 aulas, 5 días x 6 franjas, 50 % de disponibilidad',
    opciones: {
      docentes: 50,
      grupos: 30,
      aulas: 6,
      bloquesPorDia: 6,
      dias: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      disponibilidad: 0.5,
    },
  },
  {
    nombre: 'Ajustado: 3 aulas, 5 días x 4 franjas, 50 % de disponibilidad',
    opciones: {
      docentes: 50,
      grupos: 30,
      aulas: 3,
      bloquesPorDia: 4,
      dias: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
      disponibilidad: 0.5,
    },
  },
  {
    nombre:
      'Intensivo: 30 grupos de 8 horas semanales, 8 aulas, 40 % de disponibilidad',
    opciones: {
      docentes: 50,
      grupos: 30,
      aulas: 8,
      intensidadHoraria: 8,
      disponibilidad: 0.4,
    },
  },
];

console.log(
  `Motor de IA: AG (población ${PARAMETROS_POR_DEFECTO.poblacion}, ${PARAMETROS_POR_DEFECTO.generaciones} generaciones) + Búsqueda Tabú (${PARAMETROS_POR_DEFECTO.iteracionesTabu} iteraciones)`,
);
console.log(
  `Equipo: ${cpus()[0]?.model ?? 'desconocido'}, Node.js ${process.version}. Repeticiones por escenario: ${repeticiones}\n`,
);

let todoBajoElLimite = true;
for (const escenario of ESCENARIOS) {
  const tiempos: number[] = [];
  let factibles = 0;
  let intentos = 0;
  for (let r = 0; r < repeticiones; r++) {
    const instancia = generarInstancia({
      ...escenario.opciones,
      semilla: 100 + r,
    });
    const resultado = generarHorario(instancia, {
      ...PARAMETROS_POR_DEFECTO,
      semilla: 1 + r,
    });
    tiempos.push(resultado.tiempoEjecucionMs);
    if (resultado.factible) factibles++;
    intentos += resultado.intentos.length;
  }
  const maximo = Math.max(...tiempos);
  const promedio = Math.round(
    tiempos.reduce((a, b) => a + b, 0) / tiempos.length,
  );
  todoBajoElLimite &&= maximo < LIMITE_MS;
  console.log(escenario.nombre);
  console.log(
    `  tiempo (ms): mín ${Math.min(...tiempos)}, prom ${promedio}, máx ${maximo} | factibles ${factibles}/${repeticiones} | intentos promedio ${(intentos / repeticiones).toFixed(1)}\n`,
  );
}

console.log(
  todoBajoElLimite
    ? 'Resultado: todas las ejecuciones terminaron en menos de 3 minutos (RNF-02).'
    : 'Resultado: alguna ejecución superó los 3 minutos.',
);
process.exitCode = todoBajoElLimite ? 0 : 1;
