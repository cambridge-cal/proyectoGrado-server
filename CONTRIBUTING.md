# Guía de trabajo del equipo

Esta guía aplica a los dos repositorios del Sistema CAL (`proyectoGrado-server` y `proyectoGrado-client`) y sigue la metodología Kanban descrita en el capítulo 3 de la tesis.

## Ramas

El proyecto usa una sola rama permanente:

- **`main`**: código estable y revisado. Está protegida: no admite push directo ni force push, y solo recibe cambios por Pull Request con una aprobación de un integrante distinto al autor.

Cada ticket del tablero se trabaja en una rama corta que nace de `main` y se elimina al fusionarse:

| Prefijo | Uso | Ejemplo |
|---|---|---|
| `feature/` | Ticket de Funcionalidad | `feature/TKT-005-login-jwt` |
| `fix/` | Ticket de Corrección (Bug) | `fix/TKT-030-defectos-m1` |
| `hotfix/` | Incidente Ad Hoc sobre `main` | `hotfix/caida-login` |
| `exploracion/` | Exploración con timebox de 2 días | `exploracion/TKT-006-gemini` |
| `test/` | Pruebas unitarias o de carga | `test/TKT-027-pruebas-motor` |
| `docs/` | Documentación y diagramas | `docs/TKT-045-documentacion` |
| `chore/` | Configuración, dependencias, Docker | `chore/TKT-002-infraestructura-servidor` |

## Ciclo de un ticket

1. Mueve el issue a **Análisis** y asígnatelo. Nadie trabaja un ticket sin responsable.
2. Crea la rama desde `main` actualizada:

   ```bash
   git switch main
   git pull
   git switch -c feature/TKT-XXX-descripcion-corta
   ```

3. Mueve el issue a **En Desarrollo**. Cada integrante tiene como máximo un ticket en esta columna (WIP personal = 1).
4. Haz commits pequeños con Conventional Commits:

   | Prefijo | Uso |
   |---|---|
   | `feat:` | Nueva funcionalidad |
   | `fix:` | Corrección de un defecto |
   | `docs:` | Documentación o diagramas |
   | `test:` | Pruebas |
   | `refactor:` | Cambio interno sin alterar el comportamiento |
   | `chore:` | Configuración, dependencias o tareas de mantenimiento |

   Ejemplo: `feat(seguridad): emitir access token y refresh token en el login`.

5. Sube la rama y abre el Pull Request con la plantilla. En la descripción escribe `Closes #N` con el número del issue.
6. Mueve el issue a **En Revisión**. El otro integrante revisa estándares, seguridad, legibilidad y pruebas.
7. Con la aprobación, el issue pasa a **En Pruebas** y se valida contra sus criterios de aceptación. Si falla, vuelve a **En Desarrollo** con un comentario que indique el criterio no cumplido.
8. Fusiona el Pull Request con **Squash and merge** y elimina la rama. El issue se cierra y pasa a **Hecho**.

Si algo bloquea el avance, mueve el issue a **Bloqueado** y registra el motivo, la fecha y la acción necesaria. Un bloqueo de más de 24 horas se escala en el Daily Standup.

## Definición de Hecho

Un ticket llega a **Hecho** solo si:

- pasó Code Review por un integrante diferente al autor;
- superó las pruebas funcionales contra sus criterios de aceptación;
- está integrado en `main`;
- quedó documentado (Swagger para endpoints y `docs/diagramas` del servidor si cambió el diseño).

## Reglas adicionales

- Nunca subas archivos `.env` ni claves. Usa `.env.example` como referencia.
- Durante la Semana 8 (freeze, desde el 30 de noviembre de 2026) no se inician funcionalidades nuevas: solo corrección de defectos, pruebas, documentación y despliegue.
