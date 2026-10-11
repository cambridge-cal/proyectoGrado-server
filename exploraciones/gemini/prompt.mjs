// Prompt y esquema de respuesta para la validación semántica (RF-17, RNF-18).
// Este archivo es la parte que pasará al servicio de TKT-020 si la exploración resulta bien.

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
2. Cada ajuste se refiere a una asignación existente por su id y solo puede cambiar docente, aula, dia, inicio o fin, usando valores que existan en los datos.
3. Si no encuentras problemas, responde aprobado = true con listas vacías.
4. Responde únicamente con el JSON del esquema, en español.`;

/** Esquema JSON de la respuesta (structured output de la API de Gemini). */
export const ESQUEMA_RESPUESTA = {
  type: 'object',
  properties: {
    aprobado: {
      type: 'boolean',
      description:
        'true si el horario no tiene problemas semánticos que requieran cambios.',
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
          tipo: {
            type: 'string',
            enum: [
              'ESPECIALIDAD',
              'CONTINUIDAD_DOCENTE',
              'DISTRIBUCION_SEMANAL',
              'JORNADA',
              'OTRO',
            ],
          },
          severidad: { type: 'string', enum: ['ALTA', 'MEDIA', 'BAJA'] },
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
};

/** Mensaje de usuario: el horario sin la lista de problemas sembrados (Gemini no debe verla). */
export function construirMensaje(horario) {
  const {
    problemasSembrados: _omitido,
    descripcion: _descripcion,
    ...datos
  } = horario;
  return `Valida semánticamente este horario y responde con el JSON del esquema.\n\n${JSON.stringify(datos, null, 2)}`;
}

/**
 * Revisa que la respuesta tenga la forma esperada y que los ajustes solo usen ids existentes.
 * Si no pasa, el sistema aplicará el respaldo de RNF-18 (validadoGemini = false).
 */
export function validarRespuesta(respuesta, horario) {
  const errores = [];
  if (typeof respuesta?.aprobado !== 'boolean')
    errores.push('aprobado no es booleano');
  if (!Array.isArray(respuesta?.observaciones))
    errores.push('observaciones no es una lista');
  if (!Array.isArray(respuesta?.ajustes))
    errores.push('ajustes no es una lista');
  if (errores.length) return errores;

  const ids = {
    asignacion: new Set(horario.asignaciones.map((a) => a.id)),
    docente: new Set(horario.docentes.map((d) => d.id)),
    aula: new Set(horario.aulas.map((a) => a.id)),
  };
  const dias = new Set([
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado',
  ]);
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/;

  for (const ajuste of respuesta.ajustes) {
    const ref = ajuste.asignacion;
    if (!ids.asignacion.has(ref))
      errores.push(`ajuste sobre una asignación inexistente: ${ref}`);
    if (ajuste.docente && !ids.docente.has(ajuste.docente))
      errores.push(`${ref}: docente inexistente ${ajuste.docente}`);
    if (ajuste.aula && !ids.aula.has(ajuste.aula))
      errores.push(`${ref}: aula inexistente ${ajuste.aula}`);
    if (ajuste.dia && !dias.has(ajuste.dia))
      errores.push(`${ref}: día inválido ${ajuste.dia}`);
    for (const campo of ['inicio', 'fin']) {
      if (ajuste[campo] && !hora.test(ajuste[campo]))
        errores.push(`${ref}: ${campo} con formato inválido`);
    }
  }
  return errores;
}
