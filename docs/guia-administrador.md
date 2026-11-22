# Guía de uso del Sistema CAL

Guía para el Administrador de Cambridge Academy of Languages, con un resumen de lo que ven el docente y el estudiante. La instalación está en el [README](../README.md) y el despliegue en [produccion.md](produccion.md).

## Primer ingreso

1. Abre el sistema e inicia sesión con tu correo y tu contraseña.
2. La primera vez aparece el aviso de privacidad. Léelo, marca la autorización y elige **Autorizar y continuar**. Sin esa autorización no se puede usar el sistema (Ley 1581 de 2012). Les aparece a todos los usuarios, una sola vez.
3. Si olvidas la contraseña usa **¿Olvidaste tu contraseña?**: llega un enlace al correo, válido por 30 minutos.

## Orden recomendado al empezar un período

Todo se hace desde el menú del Administrador.

### 1. Configuración

Las pestañas van en el orden en que conviene llenarlas:

| Pestaña | Qué se registra |
|---|---|
| Períodos | El período académico y sus fechas. Solo uno puede estar activo. |
| Niveles | Los niveles de cada idioma, por ejemplo ING-A1. |
| Cursos | El curso de cada nivel y su intensidad horaria semanal. |
| Grupos | Los grupos de cada curso, con cupo, jornada y, si cambia respecto al curso, su intensidad semanal (por ejemplo 6 h en modalidad intensiva o 3 h en regular). Cada grupo recibe un código de acceso para que los estudiantes se inscriban. |
| Aulas | Salones, laboratorios y aulas virtuales, con su capacidad. |
| Franjas | Los bloques en que se dictan clases. Un bloque puede repetirse varios días a la misma hora, por ejemplo martes a jueves de 8:00 a 10:00 o sábados de 8:30 a 12:00. Dos franjas no pueden cruzarse en un mismo día. |
| Docentes | Especialidad y carga máxima semanal de cada docente. |
| Disponibilidad | Las franjas en las que cada docente puede dictar. El docente también la registra desde su cuenta. |

### 2. Usuarios

Crea las cuentas de docentes y estudiantes, con su rol. Desde aquí también se actualizan o eliminan a solicitud del titular. Si el usuario ya tiene historial, el sistema borra sus datos personales y conserva los registros sin identificarlo.

### 3. Horarios

1. En **Horarios** elige **Generar con IA**.
2. Si quieres, excluye tipos de aula (por ejemplo, las virtuales) y elige **Iniciar generación**.
3. El sistema arma el horario con el Algoritmo Genético y la Búsqueda Tabú y lo envía a Gemini para la validación. Puede tardar hasta tres minutos. Cada grupo queda en una franja de su jornada; si existe un bloque que cubre su intensidad semanal (por ejemplo martes a jueves de 2 h para un grupo de 6 h), queda en ese bloque.
4. El resultado indica si Gemini lo aprobó, si propuso ajustes o si quedó sin validar. Un horario sin validar cumple todas las restricciones obligatorias; solo le falta la revisión adicional.
5. Si falta información o no hay forma de cumplir las restricciones, el sistema dice cuáles faltan y no guarda nada.
6. **Ver horario** abre la grilla, con filtros por docente, aula, nivel y jornada.
7. Cuando un horario deja de usarse, **Archivar** lo pasa al **Historial**, desde donde se puede consultar o eliminar.

Los docentes y los estudiantes ven siempre el horario más reciente que no esté archivado. Si generas uno nuevo, archiva el anterior para que no queden dos activos.

### 4. Evaluación docente

La sección **Evaluación** tiene cuatro pestañas.

1. **Formularios**: crea el formulario con sus dimensiones (por ejemplo Metodología y Puntualidad), el peso de cada una y sus preguntas. Los pesos deben sumar 100.
2. **Asignaciones**: elige el formulario y asígnalo a uno o a todos los docentes. Cada asignación es una evaluación que responden los estudiantes de los grupos de ese docente.
3. **Resultados**: muestra el puntaje global y por dimensión de cada docente. El sistema calcula solo cuando un grupo termina de responder. **Ejecutar KDD** recalcula con las respuestas recibidas hasta el momento, por ejemplo al cerrar el plazo.
4. **Alertas**: lista los avisos del análisis. Crítico es un puntaje menor que 3.0, advertencia menor que 3.5 e información un docente sin evaluaciones respondidas. Al marcar una alerta como leída, la evaluación queda cerrada.

Estados de una evaluación: Pendiente, En progreso, Completada, Analizada, Alerta, Cerrada y Archivada.

### 5. Dashboard y auditoría

- **Dashboard**: resumen del período activo, con evaluaciones analizadas, promedio global, alertas sin leer y estado del horario.
- **Auditoría**: registro de quién hizo qué y cuándo, con filtros por módulo, acción, usuario y fecha.

## Lo que ve el docente

- **Mi horario**: sus clases de la semana.
- **Mi disponibilidad**: las franjas en las que puede dictar.
- **Mis resultados**: puntaje global, resultado por dimensión, participación y comentarios anónimos, por período. Aparecen cuando la evaluación ya fue analizada.

## Lo que ve el estudiante

- **Mis grupos**: se inscribe con el código de acceso del grupo. Puede tener un grupo activo por idioma. Para darse de baja debe escribir la confirmación.
- **Mi horario**: las clases de sus grupos.
- **Mis evaluaciones**: las evaluaciones pendientes de los docentes que le dan clase. Responde de 1 a 5 y puede dejar un comentario de mínimo 30 caracteres. Las respuestas son anónimas y solo se pueden enviar una vez.

## Preguntas frecuentes

**Un estudiante no ve su evaluación.** Debe estar inscrito en un grupo que tenga clases en el horario activo con ese docente, y el formulario debe estar activo.

**El docente no ve resultados.** Solo se publican cuando responden todos los estudiantes de sus grupos o cuando el Administrador ejecuta el KDD.

**El horario quedó "sin validar".** Falta la clave de Gemini en el servidor, se agotó la cuota o Gemini no respondió a tiempo. El horario es válido; se puede generar de nuevo más tarde.

**No llega el correo de recuperación.** Revisa la configuración SMTP del servidor (`SMTP_USER` y `SMTP_PASS`).
