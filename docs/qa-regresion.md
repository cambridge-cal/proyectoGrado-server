# TKT-044 · QA de regresión de los módulos 1 y 2

Verificación de punta a punta de los flujos de las Figuras 6.4, 6.6 y 6.17. Cada flujo tiene una suite e2e que recorre el diagrama completo por la API, con la base de datos real y sin llamar a servicios externos: Gemini se reemplaza por un cliente simulado.

## Cómo se ejecuta

```bash
docker compose up -d
npm run test:e2e -- --no-file-parallelism
```

Las suites comparten la base de datos y `POST /horarios/generar` programa todos los grupos registrados, no solo los de la prueba. Por eso deben correr una a la vez: en paralelo, los grupos de otras suites vuelven infactible el horario de la regresión.

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

### Figura 6.6 · Evaluación docente

Pendiente. El flujo completo (respuestas anónimas, estados, pipeline KDD y alertas) llega con TKT-032 a TKT-039, que todavía no están en `main`. La suite se agrega cuando se integren.

## Resultados

Ejecución del 14 de noviembre de 2026 sobre `main` (`6020866`), con PostgreSQL 15 y las suites en serie.

| Conjunto | Suites | Pruebas | Resultado |
|---|---|---|---|
| Unitarias (`npm test`) | 25 | 184 | Todas pasan |
| e2e existentes | 9 | 45 | Todas pasan |
| Regresión Figura 6.4 | 1 | 8 | Todas pasan |
| Regresión Figura 6.17 | 1 | 8 | Todas pasan |

Las suites de regresión no dejan datos en la base al terminar.

## Hallazgos

| # | Prioridad | Hallazgo | Estado |
|---|---|---|---|
| 1 | Alta | El CI de `main` falla en sus tres trabajos: `tsc --noEmit` da 9 errores de tipos en tres archivos de pruebas, el paso de cobertura no encuentra `coverage/coverage-summary.json` y las e2e chocan al correr en paralelo. | Corregido en la rama de TKT-032 a TKT-039; se cierra cuando se integre. |
| 2 | Media | Las e2e dependen de correr en serie, porque la generación de horarios programa todos los grupos de la base. | Documentado arriba. |
| 3 | Baja | `oxlint` advierte un import sin usar (`Type`) en `src/evaluacion/evaluaciones/evaluacion.dto.ts`. | Abierto, para TKT-046. |

No se encontraron defectos funcionales en los flujos de las Figuras 6.4 y 6.17.
