# TKT-044 · QA de regresión de los módulos 1 y 2

Verificación de punta a punta de los flujos de las Figuras 6.4, 6.6 y 6.17. Cada flujo tiene una suite e2e que recorre el diagrama completo por la API, con la base de datos real y sin llamar a servicios externos: Gemini se reemplaza por un cliente simulado.

## Cómo se ejecuta

```bash
docker compose up -d
npm run test:e2e
```

Las suites comparten la base de datos y `POST /horarios/generar` programa todos los grupos registrados, no solo los de la prueba. Por eso corren una a la vez (`fileParallelism: false` en `vitest.config.e2e.ts`): en paralelo, los grupos de otras suites vuelven infactible el horario de la regresión.

La regresión de la Figura 6.6 crea su propio período activo, para que el KDD manual solo toque sus evaluaciones, y al terminar vuelve a activar el período que estaba activo.

## Cobertura por figura

### Figura 6.4 · Generación de horario con IA

Suite: [`test/regresion-horario.e2e-spec.ts`](../test/regresion-horario.e2e-spec.ts). El Administrador crea por la API el período, el nivel, el curso, los grupos, las aulas, las franjas, los docentes y su disponibilidad, y luego genera el horario.

| Paso o decisión de la figura | Prueba |
|---|---|
| Cargar grupos, docentes, aulas, franjas y disponibilidades | Preparación de la suite y todas las generaciones |
| ¿Cumple RF-18? No, y se agotaron los intentos: informar las restricciones no satisfechas | `sin horario factible informa las restricciones no satisfechas y no guarda nada` |
| ¿Cumple RF-18? Sí: enviar la propuesta a Gemini | `Gemini aprueba: el horario se guarda con validadoGemini = true` |
| Gemini aprueba: aplicar ajustes semánticos | `Gemini aprueba con ajustes que cumplen RF-18: se aplican` |
| Ajustes que rompen RF-18 | `los ajustes de Gemini que rompen RF-18 no se aplican ni tras la corrección` |
| Gemini no aprueba: conservar la propuesta del AG + BT | `Gemini rechaza la propuesta: se conserva el horario del motor con validadoGemini = false` |
| Gemini no responde (RNF-18) | `Gemini no responde: el horario se guarda sin validar (RNF-18)` |
| Restricciones voluntarias (RF-19) y servidor sin Gemini | `sin Gemini configurado respeta los tipos de aula excluidos (RF-19)` |
| Guardar horario y metadatos, y mostrarlo con su estado de validación | `cada horario generado queda guardado y auditado` |

En cada horario generado la suite vuelve a comprobar las restricciones duras de RF-18 contra la base de datos, sin usar el motor: cruces de docente, aula y grupo, disponibilidad del docente y capacidad del aula.

### Figura 6.6 · Evaluación docente

Suite: [`test/regresion-evaluacion.e2e-spec.ts`](../test/regresion-evaluacion.e2e-spec.ts). Dos estudiantes inscritos por la API en dos grupos evalúan a los dos docentes que les dictan clase: uno termina bien evaluado y el otro bajo el umbral.

| Paso o decisión de la figura | Prueba |
|---|---|
| El Administrador crea el formulario y lo asigna, una evaluación por docente | `el Administrador crea el formulario y lo asigna: una evaluación PENDIENTE por docente` |
| Los estudiantes ven las evaluaciones de los docentes de sus grupos | `cada estudiante ve solo las evaluaciones de los docentes de sus grupos` |
| El estudiante responde de forma anónima; ¿completó todo el grupo? No | `la primera respuesta se guarda anónima y la evaluación queda EN_PROGRESO sin resultado` |
| ¿Completó todo el grupo? Sí: el pipeline KDD recalcula solo; puntaje sobre el umbral | `cuando responde todo el grupo el KDD se ejecuta solo y publica el resultado` |
| ¿Puntaje global bajo el umbral? Sí: generar alerta | `un puntaje bajo el umbral genera la alerta y deja la evaluación en ALERTA` |
| El Administrador solicita la reejecución manual | `la reejecución manual recalcula sin duplicar resultados ni alertas` |
| El Administrador revisa la alerta | `el Administrador revisa la alerta y la evaluación se cierra` |
| Resultados disponibles en el dashboard del docente | `cada docente ve en su dashboard solo su resultado y los comentarios anónimos` |
| Cierre del período de evaluación | `al cierre las evaluaciones se archivan y dejan de recibir respuestas` |

El anonimato (RNF-10) se comprueba en tres lugares: la tabla `respuesta` no tiene ninguna columna del estudiante, el detalle que ve el Administrador no incluye su identificador y el registro de auditoría solo guarda el id de la evaluación.

### Figura 6.17 · Inscripción de estudiante a grupo

Suite: [`test/regresion-inscripcion.e2e-spec.ts`](../test/regresion-inscripcion.e2e-spec.ts). Un estudiante creado por el Administrador inicia sesión y recorre el diagrama en orden.

| Paso o decisión de la figura | Prueba |
|---|---|
| Entra y ve sus grupos activos | `el estudiante entra y todavía no tiene grupos ni clases` |
| ¿Código válido? No | `un código incorrecto se rechaza y deja reintentar` |
| ¿Grupo con cupo? No | `un grupo sin cupo se rechaza` |
| Crea la fila activa y accede al horario del grupo | `con código válido y cupo queda inscrito y accede al horario del grupo` |
| ¿Ya tiene un grupo activo del mismo idioma? Sí | `no admite otro grupo activo del mismo idioma, pero sí de otro idioma` |
| Baja confirmada: el grupo sale de sus grupos activos | `la baja solo se acepta confirmada y saca el grupo de sus grupos activos` |
| Reinscripción después de la baja | `tras la baja puede volver al mismo grupo y la baja sigue en el historial` |
| Registro de auditoría (RNF-11) | `inscripciones y bajas quedan en el registro de auditoría` |

El modal de confirmación de la baja es del cliente web; en el servidor se verifica que solo se acepta `activo = false`.

## Resultados

Ejecución del 14 de noviembre de 2026 sobre el código de `main` (`290527e`), con PostgreSQL 15.

| Conjunto | Suites | Pruebas | Resultado |
|---|---|---|---|
| Unitarias (`npm test`) | 27 | 202 | Todas pasan |
| e2e existentes | 12 | 76 | Todas pasan |
| Regresión Figura 6.4 | 1 | 8 | Todas pasan |
| Regresión Figura 6.6 | 1 | 9 | Todas pasan |
| Regresión Figura 6.17 | 1 | 8 | Todas pasan |

Con `npm run test:cov:total`, la cobertura de líneas es del 92,8 %. Las suites de regresión no dejan datos en la base al terminar.

## Hallazgos

No se encontraron defectos funcionales en los flujos de las Figuras 6.4, 6.6 y 6.17.

| # | Prioridad | Hallazgo | Estado |
|---|---|---|---|
| 1 | Alta | `npm audit --audit-level=high` falla en el workflow de Seguridad: 5 vulnerabilidades altas. Tres en producción (`@nestjs/platform-express` con `multer` y `body-parser`) y dos en desarrollo (`tmp` y `undici`, por `@nestjs/mau`). | Abierto, para TKT-046. |
| 2 | Media | El escaneo de secretos (gitleaks) falla porque la organización no tiene el secreto `GITLEAKS_LICENSE`. | Abierto; requiere un administrador del repositorio. |
| 3 | Baja | `oxlint` advierte un import sin usar (`Type`) en `src/evaluacion/evaluaciones/evaluacion.dto.ts`. | Abierto, para TKT-046. |
| 4 | Informativo | Las e2e dependen de correr en serie, porque la generación de horarios programa todos los grupos de la base. | Documentado arriba. |
