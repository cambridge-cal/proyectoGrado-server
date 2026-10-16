# TKT-006 · Exploración de Gemini 3.1 Pro

Exploración con timebox de 2 días (RNF-18, riesgo R01). El objetivo es comprobar, antes de construir el motor, que la API de Gemini 3.1 Pro sirve para la validación semántica descrita en las Figuras 6.4 y 6.5 de la tesis:

1. ¿Responde en un tiempo compatible con el límite de 3 minutos de RNF-02?
2. ¿Devuelve siempre un JSON con la forma que necesita el backend?
3. ¿Detecta problemas que el Algoritmo Genético y la Búsqueda Tabú no ven?

Esta carpeta no forma parte del servidor: tiene su propio `package.json` para no mezclar dependencias. Lo que funcione aquí (`prompt.mjs`) pasa al servicio de validación en TKT-020.

## Archivos

| Archivo | Contenido |
|---|---|
| `horario-ejemplo.json` | Horario que ya cumple las restricciones duras de RF-18, con dos problemas semánticos sembrados a propósito |
| `prompt.mjs` | Instrucciones de sistema, esquema JSON de la respuesta y validación de la respuesta |
| `validar-horario.mjs` | Llama a la API, mide el tiempo y guarda el resultado en `resultados/` |

## Cómo ejecutarla

1. Crea una clave en <https://aistudio.google.com/apikey> y ponla en el `.env` del servidor (`GEMINI_API_KEY=...`). El `.env` nunca se sube al repositorio (RNF-23).
2. Desde esta carpeta:

   ```bash
   npm install
   npm run prompt                          # revisa el prompt sin gastar llamadas
   npm run validar -- --repeticiones 3     # 3 llamadas para promediar el tiempo
   ```

Cada ejecución deja un archivo en `resultados/` con los tiempos, la respuesta completa y el uso de tokens.

## Decisiones de diseño

- **Salida estructurada.** Se usa `responseMimeType: application/json` con `responseJsonSchema`, así la API devuelve un JSON con la forma del esquema en lugar de texto libre.
- **Gemini no decide las restricciones duras.** El horario ya llega factible desde el AG + BT. Gemini solo opina sobre especialidad, continuidad del docente, reparto semanal y jornada.
- **Los ajustes se vuelven a verificar.** `validarRespuesta` descarta respuestas mal formadas o que mencionan docentes, aulas o asignaciones inexistentes. En TKT-020, además, cada ajuste debe pasar otra vez por la verificación de restricciones duras antes de aplicarse; si no pasa, se conserva el horario del AG + BT con `validadoGemini = false` (RNF-18).
- **Tiempo máximo.** Cada llamada se corta a los 60 s (`--timeout`). Si se agota, también aplica el respaldo de RNF-18.
- **Temperatura 0.2.** Respuestas estables entre ejecuciones.

## Resultados (completar y pegar en el issue de TKT-006)

| Ejecución | Tiempo (ms) | Respuesta válida | Detectó X05 (especialidad) | Detectó X03/X04 (reparto semanal) |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

- Tiempo promedio:
- Tokens por llamada (entrada / salida):
- ¿Algún ajuste propuesto rompía una restricción dura?:
- Conclusión: ¿se continúa con Gemini 3.1 Pro en TKT-020 o se ajusta el prompt?
