/**
 * Prompt y esquema de respuesta para la validación semántica con Gemini (RF-17, RNF-18).
 * Viene de la exploración de TKT-006 (exploraciones/gemini/prompt.mjs).
 */

export const INSTRUCCIONES_SISTEMA = `Eres un revisor de horarios académicos de Cambridge Academy of Languages, un instituto de idiomas en Pasto, Colombia.
Recibes un horario generado por un Algoritmo Genético con Búsqueda Tabú que YA cumple todas las restricciones duras:
no hay cruces de docente, aula ni grupo, la capacidad del aula alcanza y las franjas respetan la disponibilidad docente.
Tu tarea es solo la validación semántica, es decir, lo que el algoritmo no puede ver:
- que la especialidad del docente corresponda al idioma del grupo;
- que cada grupo conserve el mismo docente durante la semana cuando sea posible;
- que la intensidad horaria se reparta en varios días y no se concentre en un solo día;
- que la jornada declarada del grupo (Mañana, Tarde o Noche) coincida con las horas asignadas;
- cualquier otra incoherencia pedagógica evidente.
Reglas:
1. Nunca propongas un cambio que cree un cruce de docente, aula o grupo, ni que supere la capacidad del aula o la carga máxima semanal del docente.
2. Cada ajuste se refiere a una asignación existente por su id y solo puede cambiar docente, aula, dia, inicio o fin, usando valores que existan en los datos (las franjas están en "franjas" y la disponibilidad de cada docente en "disponibilidad").
   Antes de proponer un ajuste, revisa en "asignaciones" que en la nueva franja ni el docente, ni el aula, ni el grupo tengan otra clase.
3. Si no encuentras problemas, responde aprobado = true con listas vacías.
4. Si encuentras problemas y puedes corregirlos con ajustes, responde aprobado = true con los ajustes. Si encuentras problemas graves que no puedes corregir, responde aprobado = false.
5. Responde únicamente con el JSON del esquema, en español.`;

export const TIPOS_OBSERVACION = [
  'ESPECIALIDAD',
  'CONTINUIDAD_DOCENTE',
  'DISTRIBUCION_SEMANAL',
  'JORNADA',
  'OTRO',
] as const;
export const SEVERIDADES = ['ALTA', 'MEDIA', 'BAJA'] as const;

/** Esquema JSON de la respuesta (salida estructurada de la API de Gemini). */
export const ESQUEMA_RESPUESTA = {
  type: 'object',
  properties: {
    aprobado: {
      type: 'boolean',
      description:
        'true si el horario se puede usar, con los ajustes propuestos si los hay.',
    },
    observaciones: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          asignaciones: {
            type: 'array',
            items: { type: 'string' },
            description: 'ids de las asignaciones afectadas',
          },
          tipo: { type: 'string', enum: [...TIPOS_OBSERVACION] },
          severidad: { type: 'string', enum: [...SEVERIDADES] },
          descripcion: { type: 'string' },
        },
        required: ['asignaciones', 'tipo', 'severidad', 'descripcion'],
      },
    },
    ajustes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          asignacion: {
            type: 'string',
            description: 'id de la asignación a modificar',
          },
          docente: { type: 'string' },
          aula: { type: 'string' },
          dia: { type: 'string' },
          inicio: { type: 'string', description: 'HH:mm' },
          fin: { type: 'string', description: 'HH:mm' },
          motivo: { type: 'string' },
        },
        required: ['asignacion', 'motivo'],
      },
    },
  },
  required: ['aprobado', 'observaciones', 'ajustes'],
} as const;

export interface ObservacionGemini {
  asignaciones: string[];
  tipo: (typeof TIPOS_OBSERVACION)[number];
  severidad: (typeof SEVERIDADES)[number];
  descripcion: string;
}

export interface AjusteGemini {
  asignacion: string;
  docente?: string;
  aula?: string;
  dia?: string;
  inicio?: string;
  fin?: string;
  motivo: string;
}

export interface RespuestaGemini {
  aprobado: boolean;
  observaciones: ObservacionGemini[];
  ajustes: AjusteGemini[];
}

/**
 * Lo que ve Gemini: ids cortos y legibles (D1, S1, códigos de grupo y aula) en lugar de UUID,
 * para gastar menos tokens y que las observaciones se entiendan.
 */
export interface ContextoGemini {
  periodo: string;
  docentes: Array<{
    id: string;
    nombre: string;
    especialidad: string;
    cargaMaximaSemanal: number;
    /** Franjas en las que el docente puede ser asignado, como "Lunes 07:00". */
    disponibilidad: string[];
  }>;
  aulas: Array<{ id: string; capacidad: number; tipo: string }>;
  grupos: Array<{
    id: string;
    curso: string;
    idioma: string;
    nivel: string;
    jornada: string;
    cupoMaximo: number;
    intensidadHorariaSemanal: number;
  }>;
  franjas: Array<{ dia: string; inicio: string; fin: string }>;
  asignaciones: Array<{
    id: string;
    grupo: string;
    docente: string;
    aula: string;
    dia: string;
    inicio: string;
    fin: string;
  }>;
}

export function construirMensaje(contexto: ContextoGemini): string {
  return `Valida semánticamente este horario y responde con el JSON del esquema.\n\n${JSON.stringify(contexto)}`;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Revisa que la respuesta tenga la forma esperada y que los ajustes solo usen ids existentes.
 * Si devuelve errores, se aplica el respaldo de RNF-18 (validadoGemini = false).
 */
export function validarRespuesta(
  respuesta: unknown,
  contexto: ContextoGemini,
): string[] {
  const r = respuesta as Partial<RespuestaGemini> | null;
  const errores: string[] = [];
  if (typeof r?.aprobado !== 'boolean') errores.push('aprobado no es booleano');
  if (!Array.isArray(r?.observaciones))
    errores.push('observaciones no es una lista');
  if (!Array.isArray(r?.ajustes)) errores.push('ajustes no es una lista');
  if (errores.length) return errores;

  const ids = {
    asignacion: new Set(contexto.asignaciones.map((a) => a.id)),
    docente: new Set(contexto.docentes.map((d) => d.id)),
    aula: new Set(contexto.aulas.map((a) => a.id)),
    dia: new Set(contexto.franjas.map((f) => f.dia)),
  };
  for (const o of r!.observaciones!) {
    if (
      !Array.isArray(o?.asignaciones) ||
      typeof o.descripcion !== 'string' ||
      !TIPOS_OBSERVACION.includes(o.tipo) ||
      !SEVERIDADES.includes(o.severidad)
    ) {
      errores.push('observación con formato inválido');
    }
  }
  for (const ajuste of r!.ajustes!) {
    const ref = ajuste?.asignacion;
    if (!ids.asignacion.has(ref))
      errores.push(`ajuste sobre una asignación inexistente: ${ref}`);
    if (ajuste.docente && !ids.docente.has(ajuste.docente))
      errores.push(`${ref}: docente inexistente ${ajuste.docente}`);
    if (ajuste.aula && !ids.aula.has(ajuste.aula))
      errores.push(`${ref}: aula inexistente ${ajuste.aula}`);
    if (ajuste.dia && !ids.dia.has(ajuste.dia))
      errores.push(`${ref}: día sin franjas ${ajuste.dia}`);
    for (const campo of ['inicio', 'fin'] as const) {
      if (ajuste[campo] && !HORA.test(ajuste[campo]))
        errores.push(`${ref}: ${campo} con formato inválido`);
    }
  }
  return errores;
}
