/**
 * TKT-049: prueba de carga de la API (RNF-01).
 * Dispara 50 usuarios concurrentes contra los endpoints principales y
 * verifica que el P95 se mantenga por debajo de 500 ms.
 *
 * Requisito: el servidor debe estar corriendo en la URL indicada.
 *
 * Uso: npm run carga:api                       (http://localhost:3000, 30 s)
 *      npm run carga:api -- http://localhost:4000 60
 */
import autocannon from 'autocannon';
import { cpus } from 'node:os';

const BASE_URL = process.argv[2] ?? 'http://localhost:3000';
const DURACION_S = Number(process.argv[3] ?? 30);
const CONCURRENCIA = 50;
const LIMITE_P95_MS = 500;

interface ResultadoEndpoint {
  ruta: string;
  metodo: string;
  p95Ms: number;
  promedioMs: number;
  rps: number;
  totalReq: number;
  errores: number;
  cumple: boolean;
}

async function probarEndpoint(
  ruta: string,
  metodo: 'GET' | 'POST' = 'GET',
  body?: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<ResultadoEndpoint> {
  const opciones: autocannon.Options = {
    url: `${BASE_URL}/api${ruta}`,
    connections: CONCURRENCIA,
    duration: DURACION_S,
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };

  const resultado = await autocannon(opciones);

  const p95Ms = resultado.latency.p97_5;
  return {
    ruta: `${metodo} /api${ruta}`,
    metodo,
    p95Ms,
    promedioMs: resultado.latency.average,
    rps: resultado.requests.average,
    totalReq: resultado.requests.total,
    errores: resultado.errors + resultado.timeouts,
    cumple: p95Ms < LIMITE_P95_MS,
  };
}

async function obtenerToken(): Promise<string | null> {
  try {
    const respuesta = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        correo: 'admin@cal.edu.co',
        contrasena: process.env.SEMILLA_CONTRASENA ?? 'Clave123*',
      }),
    });
    if (!respuesta.ok) return null;
    const datos = (await respuesta.json()) as { accessToken?: string };
    return datos.accessToken ?? null;
  } catch {
    return null;
  }
}

console.log('=== Prueba de carga de la API (TKT-049, RNF-01) ===\n');
console.log(
  `Equipo: ${cpus()[0]?.model ?? 'desconocido'}, Node.js ${process.version}`,
);
console.log(
  `Configuración: ${CONCURRENCIA} usuarios concurrentes, ${DURACION_S} s por endpoint`,
);
console.log(`Servidor: ${BASE_URL}`);
console.log(`Límite P95: ${LIMITE_P95_MS} ms\n`);

const token = await obtenerToken();
if (!token) {
  console.error(
    'No se pudo obtener un token JWT. Asegúrate de que el servidor esté corriendo ' +
      'y que exista el usuario admin (npm run semilla).',
  );
  process.exitCode = 1;
  process.exit();
}

const authHeaders = { authorization: `Bearer ${token}` };

const endpoints: Array<{
  ruta: string;
  metodo?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  auth?: boolean;
}> = [
  { ruta: '/salud' },
  { ruta: '/auth/login', metodo: 'POST', body: { correo: 'admin@cal.edu.co', contrasena: process.env.SEMILLA_CONTRASENA ?? 'Clave123*' } },
  { ruta: '/auth/perfil', auth: true },
  { ruta: '/usuarios', auth: true },
  { ruta: '/periodos', auth: true },
  { ruta: '/cursos', auth: true },
  { ruta: '/niveles', auth: true },
  { ruta: '/docentes', auth: true },
  { ruta: '/grupos', auth: true },
  { ruta: '/horarios', auth: true },
  { ruta: '/audit-log', auth: true },
];

const resultados: ResultadoEndpoint[] = [];

for (const ep of endpoints) {
  console.log(`Probando ${ep.metodo ?? 'GET'} /api${ep.ruta} ...`);
  const resultado = await probarEndpoint(
    ep.ruta,
    ep.metodo ?? 'GET',
    ep.body,
    ep.auth ? authHeaders : undefined,
  );
  resultados.push(resultado);
  const estado = resultado.cumple ? 'OK' : 'FALLA';
  console.log(
    `  [${estado}] P95: ${resultado.p95Ms} ms | Prom: ${resultado.promedioMs.toFixed(1)} ms | ` +
      `RPS: ${resultado.rps.toFixed(0)} | Errores: ${resultado.errores}\n`,
  );
}

console.log('\n=== Resumen ===\n');
console.log(
  'Endpoint'.padEnd(35) +
    'P95 (ms)'.padStart(10) +
    'Prom (ms)'.padStart(10) +
    'RPS'.padStart(8) +
    'Errores'.padStart(9) +
    '  Estado',
);
console.log('-'.repeat(85));

for (const r of resultados) {
  const estado = r.cumple ? 'OK' : 'FALLA';
  console.log(
    r.ruta.padEnd(35) +
      String(r.p95Ms).padStart(10) +
      r.promedioMs.toFixed(1).padStart(10) +
      r.rps.toFixed(0).padStart(8) +
      String(r.errores).padStart(9) +
      `  ${estado}`,
  );
}

const todoOk = resultados.every((r) => r.cumple);
console.log(
  `\nResultado: ${todoOk ? 'todos los endpoints cumplen P95 < 500 ms con 50 usuarios concurrentes (RNF-01)' : 'algún endpoint superó el límite de P95 = 500 ms'}`,
);
process.exitCode = todoOk ? 0 : 1;
