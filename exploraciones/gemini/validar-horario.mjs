// TKT-006: mide tiempo de respuesta y formato de salida de Gemini 3.1 Pro al validar un horario.
//
// Uso (desde esta carpeta):
//   npm install
//   npm run prompt                         -> solo muestra el prompt, no llama a la API
//   npm run validar                        -> 1 llamada con horario-ejemplo.json
//   npm run validar -- --repeticiones 3    -> 3 llamadas para promediar el tiempo
//   npm run validar -- --timeout 30000     -> tiempo máximo por llamada en ms (por defecto 60000)
//
// Lee GEMINI_API_KEY y GEMINI_MODEL del .env del servidor (../../.env). Nunca escribas la clave aquí.

import { GoogleGenAI } from '@google/genai';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  construirMensaje,
  ESQUEMA_RESPUESTA,
  INSTRUCCIONES_SISTEMA,
  validarRespuesta,
} from './prompt.mjs';

const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : porDefecto;
};
const archivo = args.find((a) => a.endsWith('.json')) ?? 'horario-ejemplo.json';
const repeticiones = Number(opcion('--repeticiones', 1));
const timeoutMs = Number(opcion('--timeout', 60_000));
const modelo = process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview';

const horario = JSON.parse(
  readFileSync(new URL(archivo, import.meta.url), 'utf8'),
);
const mensaje = construirMensaje(horario);

if (args.includes('--solo-prompt')) {
  console.log('=== Instrucciones de sistema ===\n' + INSTRUCCIONES_SISTEMA);
  console.log('\n=== Mensaje ===\n' + mensaje);
  console.log(
    `\nTamaño aproximado: ${INSTRUCCIONES_SISTEMA.length + mensaje.length} caracteres`,
  );
  process.exit(0);
}

if (!process.env.GEMINI_API_KEY) {
  console.error(
    'Falta GEMINI_API_KEY en el .env del servidor. Créala en https://aistudio.google.com/apikey',
  );
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function llamar() {
  const inicio = performance.now();
  try {
    const respuesta = await ai.models.generateContent({
      model: modelo,
      contents: mensaje,
      config: {
        systemInstruction: INSTRUCCIONES_SISTEMA,
        responseMimeType: 'application/json',
        responseJsonSchema: ESQUEMA_RESPUESTA,
        temperature: 0.2,
        abortSignal: AbortSignal.timeout(timeoutMs),
      },
    });
    const ms = Math.round(performance.now() - inicio);
    let json = null;
    let errores = [];
    try {
      json = JSON.parse(respuesta.text ?? '');
      errores = validarRespuesta(json, horario);
    } catch {
      errores = ['La respuesta no es JSON válido'];
    }
    return {
      ms,
      ok: errores.length === 0,
      errores,
      json,
      uso: respuesta.usageMetadata ?? null,
    };
  } catch (error) {
    const ms = Math.round(performance.now() - inicio);
    const tipo =
      error?.name === 'TimeoutError' || error?.name === 'AbortError'
        ? 'TIEMPO_AGOTADO'
        : 'ERROR_API';
    return {
      ms,
      ok: false,
      errores: [`${tipo}: ${error?.message ?? error}`],
      json: null,
      uso: null,
    };
  }
}

console.log(
  `Modelo: ${modelo} | Horario: ${archivo} | Repeticiones: ${repeticiones} | Timeout: ${timeoutMs} ms\n`,
);
const resultados = [];
for (let i = 1; i <= repeticiones; i++) {
  const r = await llamar();
  resultados.push(r);
  const estado = r.ok
    ? r.json.aprobado
      ? 'APROBADO'
      : 'RECHAZADO con ajustes'
    : 'RESPALDO RNF-18';
  console.log(`#${i}  ${r.ms} ms  ${estado}`);
  if (!r.ok) console.log('    ' + r.errores.join('\n    '));
  else {
    for (const o of r.json.observaciones)
      console.log(
        `    [${o.severidad}] ${o.tipo} ${o.asignaciones.join(', ')}: ${o.descripcion}`,
      );
    for (const a of r.json.ajustes)
      console.log(`    ajuste ${a.asignacion}: ${a.motivo}`);
  }
}

const tiempos = resultados.map((r) => r.ms);
const resumen = {
  fecha: new Date().toISOString(),
  modelo,
  archivo,
  timeoutMs,
  repeticiones,
  tiempoMs: {
    minimo: Math.min(...tiempos),
    promedio: Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length),
    maximo: Math.max(...tiempos),
  },
  respuestasValidas: resultados.filter((r) => r.ok).length,
  problemasSembrados: horario.problemasSembrados ?? [],
  resultados,
};

mkdirSync(new URL('./resultados/', import.meta.url), { recursive: true });
const salida = new URL(
  `./resultados/${resumen.fecha.replace(/[:.]/g, '-')}.json`,
  import.meta.url,
);
writeFileSync(salida, JSON.stringify(resumen, null, 2));
console.log(
  `\nTiempo (ms): mín ${resumen.tiempoMs.minimo}, prom ${resumen.tiempoMs.promedio}, máx ${resumen.tiempoMs.maximo}`,
);
console.log(`Respuestas válidas: ${resumen.respuestasValidas}/${repeticiones}`);
console.log(
  `Resultado guardado en resultados/${salida.pathname.split('/').pop()}`,
);
