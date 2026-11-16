# Cumplimiento de protección de datos personales

Lista de verificación del Sistema CAL frente a la Ley 1581 de 2012, el Decreto 1377 de 2013 y la Ley 1266 de 2008 (RNF-31 y RNF-32, TKT-043).

Este documento describe lo que hace el software. No reemplaza la revisión jurídica de la academia, que es el responsable del tratamiento.

## Datos personales que guarda el sistema

| Dato | Dónde | Quién lo ve |
|---|---|---|
| Nombre, correo y rol | `usuario` | El titular y el Administrador |
| Contraseña | `usuario.contrasena_hash` (bcrypt, nunca sale en las consultas) | Nadie |
| Código de estudiante | `estudiante` | El titular y el Administrador |
| Especialidad, carga y disponibilidad del docente | `docente`, `disponibilidad_docente` | El titular y el Administrador |
| Inscripciones a grupos | `estudiante_grupo` | El titular y el Administrador |
| Respuestas de evaluación (1 a 5) | `respuesta`, sin estudiante ni fecha | Solo agregadas: el docente evaluado y el Administrador |
| Comentarios de evaluación | `evaluacion.comentarios_anonimos` | El docente evaluado, sin autor ni orden de llegada |
| Quién ya respondió una evaluación | `evaluacion.estudiantes_completaron`, nunca se devuelve por la API | Nadie |
| Fecha, IP y acción | `audit_log` | El Administrador |
| Autorización de tratamiento | `usuario.autorizacion_datos_en`, `usuario.version_aviso_privacidad` | El titular y el Administrador |

## Lista de verificación

### Autorización (Ley 1581, art. 9; Decreto 1377, arts. 5 a 7)

- [x] En el primer ingreso el sistema muestra el aviso de privacidad y no deja usar ninguna vista hasta que el titular marca la autorización expresa (`/autorizacion-datos` en el cliente).
- [x] La autorización queda registrada con fecha, versión del aviso y un registro `AUTORIZAR_TRATAMIENTO_DATOS` en el Audit Log, como prueba (`POST /api/auth/autorizacion-datos`).
- [x] Si cambia el texto del aviso se cambia `VERSION_AVISO_PRIVACIDAD` y el sistema vuelve a pedir la autorización.
- [x] Quien no autoriza no entra: la única opción es cerrar la sesión.
- [x] El aviso se puede consultar sin iniciar sesión en `/aviso-de-privacidad`, enlazado desde el inicio de sesión.
- [ ] Menores de edad: el aviso indica que la autorización la da el representante legal, pero el sistema no la verifica. La academia debe recogerla en la matrícula (Decreto 1377, art. 12).

### Aviso de privacidad (Decreto 1377, arts. 14 y 15)

- [x] Identifica al responsable del tratamiento.
- [x] Describe los datos tratados y sus finalidades.
- [x] Enumera los derechos del titular.
- [x] Indica cómo ejercerlos y los plazos de respuesta (10 días hábiles para consultas y 15 para reclamos).
- [ ] La academia debe revisar el texto, definir el correo de contacto (`VITE_CORREO_DATOS` en el cliente) y publicar su política de tratamiento de la información.

### Acceso (Ley 1581, art. 8, literal a)

- [x] Cada rol ve solo lo suyo: control de acceso por rol en todos los endpoints (`JwtAuthGuard` y `RolesGuard`, RF-07).
- [x] El estudiante consulta sus grupos, su horario y sus evaluaciones; el docente su horario, su disponibilidad y sus resultados.
- [x] El Administrador consulta los datos de cualquier titular en la gestión de usuarios, para atender una solicitud de acceso.
- [ ] No hay una opción para que el titular descargue todos sus datos; la consulta se atiende a través del Administrador.

### Rectificación y actualización (Ley 1581, art. 8, literal a; RNF-32)

- [x] El Administrador actualiza nombre, correo, rol y estado de cualquier usuario (`PATCH /api/usuarios/:id`), y cada cambio queda en el Audit Log.
- [x] El titular cambia su contraseña con el flujo de recuperación.
- [ ] El titular no puede editar su nombre o correo por sí mismo; lo solicita al Administrador.

### Supresión (Ley 1581, art. 8, literal e; RNF-32)

- [x] El Administrador elimina un usuario a solicitud del titular (`DELETE /api/usuarios/:id`).
- [x] Si el usuario tiene historial que no se puede borrar (inscripciones, horarios o auditoría), el sistema borra sus datos personales: nombre, correo, contraseña, código de estudiante y autorización, y cierra sus sesiones. Los registros quedan sin identificar al titular.
- [x] Al eliminar una evaluación se eliminan sus respuestas, su resultado y sus alertas (RF-38).
- [x] La eliminación queda en el Audit Log con quién la hizo, sin los datos eliminados.

### Seguridad y confidencialidad (Ley 1581, art. 4, literales g y h; RNF-31)

- [x] Contraseñas con bcrypt, factor de costo 10 (RNF-05).
- [x] Sesiones con JWT de 8 horas y rotación del token de renovación (RNF-06).
- [x] Límite de peticiones por IP (RNF-04) y bloqueo de orígenes no autorizados (RNF-09).
- [x] TLS 1.2 o superior en producción (RNF-07, ver `docs/produccion.md`).
- [x] Las respuestas de evaluación no guardan estudiante ni fecha, y los comentarios se guardan en posición aleatoria (RNF-10).
- [x] La validación de horarios envía a Gemini códigos internos, no nombres ni correos.
- [x] Registro de auditoría de las acciones relevantes.

## Pruebas que lo respaldan

- `test/autorizacion-datos.e2e-spec.ts`: autorización en el primer ingreso, expresa y con prueba en el Audit Log.
- `src/seguridad/autenticacion/autenticacion.service.spec.ts`: registro de la autorización y nueva solicitud al cambiar la versión del aviso.
- `test/usuarios.e2e-spec.ts` y `src/seguridad/usuarios/usuarios.service.spec.ts`: actualización, eliminación y borrado de datos personales.
- `test/evaluaciones-estudiante.e2e-spec.ts` y `test/kdd.e2e-spec.ts`: anonimato de las respuestas y control de acceso a los resultados.

## Pendientes que no son de software

1. Revisión del aviso de privacidad por la academia o su asesor jurídico.
2. Política de tratamiento de la información publicada por la academia.
3. Registro de la base de datos ante la Superintendencia de Industria y Comercio, si la academia está obligada.
4. Autorización de los representantes legales para los estudiantes menores de edad.
