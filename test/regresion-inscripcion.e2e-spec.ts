import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import {
  Curso,
  EstudianteGrupo,
  Grupo,
  Horario,
  NivelIdioma,
  PeriodoAcademico,
} from '../src/horarios/entidades/index.js';
import { Estudiante, Rol } from '../src/seguridad/entidades/index.js';
import {
  borrarUsuarios,
  CLAVE_PRUEBA,
  crearApp,
  usuarioConSesion,
} from './utilidades.js';

const UUID_DOCENTE = '00000000-0000-4000-8000-000000000002';
const UUID_AULA = '00000000-0000-4000-8000-000000000003';
const UUID_FRANJA = '00000000-0000-4000-8000-000000000004';

// Requiere la base de datos de docker compose en ejecución y un archivo .env.
// TKT-044: recorre de punta a punta el flujo de la Figura 6.17 como un solo estudiante.
describe('Regresión: inscripción de estudiante a grupo (e2e, Figura 6.17)', () => {
  let app: INestApplication;
  let fuente: DataSource;
  const marca = `e2eri${Date.now()}`;
  const corta = Date.now().toString(36).slice(-5).toUpperCase();
  type Sesion = { id: string; token: string };
  type GrupoCreado = { id: string; codigoAcceso: string };
  let admin: Sesion;
  let ana: Sesion;
  let ocupante: Sesion;
  let periodoId: string;
  let periodoCreado = false;
  let horarioId: string;
  const niveles: string[] = [];
  const cursos: string[] = [];
  const grupos = {} as Record<
    'lleno' | 'ingles' | 'inglesB' | 'frances',
    GrupoCreado
  >;

  const http = () => request(app.getHttpServer());
  const comoAdmin = () => ({ Authorization: `Bearer ${admin.token}` });
  const unirse = (s: Sesion, codigoAcceso: string) =>
    http()
      .post('/api/estudiantes/yo/unirse')
      .set('Authorization', `Bearer ${s.token}`)
      .send({ codigoAcceso });
  const misGrupos = async (consulta = '') => {
    const r = await http()
      .get(`/api/estudiantes/yo/grupos${consulta}`)
      .set('Authorization', `Bearer ${ana.token}`)
      .expect(200);
    return r.body as Array<{ activo: boolean; grupo: { id: string } }>;
  };
  const gruposDeMiHorario = async () => {
    const r = await http()
      .get('/api/horarios/actual')
      .set('Authorization', `Bearer ${ana.token}`)
      .expect(200);
    expect(r.body.id).toBe(horarioId);
    return (r.body.asignaciones as Array<{ grupo: { id: string } }>)
      .map((a) => a.grupo.id)
      .sort();
  };
  const baja = (grupoId: string, activo: boolean) =>
    http()
      .patch(`/api/estudiantes/yo/grupos/${grupoId}`)
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ activo });

  /** El Administrador crea la cuenta y el estudiante entra al sistema con ella. */
  const estudianteNuevo = async (sufijo: string): Promise<Sesion> => {
    const email = `${marca}.${sufijo}@cambridge.edu.co`;
    const usuario = await http()
      .post('/api/usuarios')
      .set(comoAdmin())
      .send({
        nombre: `${marca} ${sufijo}`,
        email,
        contrasena: CLAVE_PRUEBA,
        rol: Rol.ESTUDIANTE,
        codigo: `${corta}-${sufijo}`,
      })
      .expect(201);
    const login = await http()
      .post('/api/auth/login')
      .send({ email, contrasena: CLAVE_PRUEBA })
      .expect(200);
    return { id: usuario.body.id, token: login.body.accessToken };
  };

  beforeAll(async () => {
    ({ app, fuente } = await crearApp());
    admin = await usuarioConSesion(app, fuente, marca, Rol.ADMIN);
    ana = await estudianteNuevo('ana');
    ocupante = await estudianteNuevo('ocu');

    const periodos = fuente.getRepository(PeriodoAcademico);
    let periodo = await periodos.findOneBy({ activo: true });
    if (!periodo) {
      periodo = await periodos.save({
        nombre: marca,
        fechaInicio: '2032-01-12',
        fechaFin: '2032-06-11',
        activo: true,
      });
      periodoCreado = true;
    }
    periodoId = periodo.id;

    for (const idioma of ['Inglés', 'Francés']) {
      const nivel = await http()
        .post('/api/niveles')
        .set(comoAdmin())
        .send({
          codigo: `${corta}-RI-${idioma.slice(0, 3)}`,
          nombre: 'A1',
          idioma,
        })
        .expect(201);
      niveles.push(nivel.body.id);
      const curso = await http()
        .post('/api/cursos')
        .set(comoAdmin())
        .send({
          nombre: `${idioma} A1 ${corta}`,
          nivelIdiomaId: nivel.body.id,
          intensidadHoraria: 4,
        })
        .expect(201);
      cursos.push(curso.body.id);
    }
    for (const [clave, curso, cupoMaximo] of [
      ['lleno', 0, 1],
      ['ingles', 0, 5],
      ['inglesB', 0, 5],
      ['frances', 1, 5],
    ] as const) {
      const grupo = await http()
        .post('/api/grupos')
        .set(comoAdmin())
        .send({
          codigo: `${corta}-RI-${clave}`,
          cursoId: cursos[curso],
          cupoMaximo,
          jornada: 'MAÑANA',
        })
        .expect(201);
      grupos[clave] = grupo.body;
    }
    await unirse(ocupante, grupos.lleno.codigoAcceso).expect(201);

    // El horario se inserta directo: su generación se recorre en regresion-horario.
    const horario = await fuente.getRepository(Horario).save({
      periodo: { id: periodoId },
      asignaciones: Object.values(grupos).map((g) => ({
        grupoId: g.id,
        docenteId: UUID_DOCENTE,
        aulaId: UUID_AULA,
        franjaId: UUID_FRANJA,
      })),
      fitness: 10,
      generaciones: 12,
      tiempoEjecucionMs: 150,
      intentos: 1,
      validadoGemini: false,
      validacion: {
        estado: 'SIN_CONFIGURAR',
        modelo: 'gemini-3.1-pro-preview',
        tiempoMs: 0,
        detalle: null,
        observaciones: [],
        ajustesAplicados: [],
      },
      tiposAulaExcluidos: [],
      archivado: false,
    });
    horarioId = horario.id;
  }, 30_000);

  afterAll(async () => {
    const idsGrupos = Object.values(grupos).map((g) => g.id);
    if (horarioId)
      await fuente.getRepository(Horario).delete({ id: horarioId });
    if (idsGrupos.length) {
      await fuente
        .getRepository(EstudianteGrupo)
        .delete({ grupo: { id: In(idsGrupos) } });
      await fuente.getRepository(Grupo).delete({ id: In(idsGrupos) });
    }
    if (cursos.length)
      await fuente.getRepository(Curso).delete({ id: In(cursos) });
    if (niveles.length) {
      await fuente.getRepository(NivelIdioma).delete({ id: In(niveles) });
    }
    if (periodoCreado) {
      await fuente.getRepository(PeriodoAcademico).delete({ id: periodoId });
    }
    const usuarios = [admin, ana, ocupante].filter(Boolean).map((s) => s.id);
    const estudiantes = [ana, ocupante].filter(Boolean).map((s) => s.id);
    if (estudiantes.length) {
      await fuente
        .getRepository(Estudiante)
        .delete({ usuario: { id: In(estudiantes) } });
    }
    await borrarUsuarios(fuente, usuarios);
    await app.close();
  });

  it('el estudiante entra y todavía no tiene grupos ni clases', async () => {
    expect(await misGrupos()).toEqual([]);
    expect(await gruposDeMiHorario()).toEqual([]);
  });

  it('un código incorrecto se rechaza y deja reintentar', async () => {
    const r = await unirse(ana, `ZZZ${corta}`).expect(404);
    expect(r.body.message).toContain('código de acceso');
    expect(await misGrupos()).toEqual([]);
  });

  it('un grupo sin cupo se rechaza', async () => {
    const r = await unirse(ana, grupos.lleno.codigoAcceso).expect(409);
    expect(r.body.message).toContain('no tiene cupo');
    expect(await misGrupos()).toEqual([]);
  });

  it('con código válido y cupo queda inscrito y accede al horario del grupo', async () => {
    const r = await unirse(ana, grupos.ingles.codigoAcceso).expect(201);
    expect(r.body).toMatchObject({
      activo: true,
      fechaBaja: null,
      grupo: { id: grupos.ingles.id, idioma: 'Inglés' },
    });
    expect((await misGrupos()).map((i) => i.grupo.id)).toEqual([
      grupos.ingles.id,
    ]);
    expect(await gruposDeMiHorario()).toEqual([grupos.ingles.id]);
  });

  it('no admite otro grupo activo del mismo idioma, pero sí de otro idioma', async () => {
    const r = await unirse(ana, grupos.inglesB.codigoAcceso).expect(409);
    expect(r.body.message).toContain('de Inglés');

    await unirse(ana, grupos.frances.codigoAcceso).expect(201);
    expect(await gruposDeMiHorario()).toEqual(
      [grupos.ingles.id, grupos.frances.id].sort(),
    );
  });

  it('la baja solo se acepta confirmada y saca el grupo de sus grupos activos', async () => {
    await baja(grupos.ingles.id, true).expect(400);
    expect(await misGrupos()).toHaveLength(2);

    const r = await baja(grupos.ingles.id, false).expect(200);
    expect(r.body.activo).toBe(false);
    expect(r.body.fechaBaja).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect((await misGrupos()).map((i) => i.grupo.id)).toEqual([
      grupos.frances.id,
    ]);
    expect(await gruposDeMiHorario()).toEqual([grupos.frances.id]);
    const historial = await misGrupos('?historial=true');
    expect(historial).toHaveLength(2);
    expect(historial.find((i) => i.grupo.id === grupos.ingles.id)?.activo).toBe(
      false,
    );
  });

  it('tras la baja puede volver al mismo grupo y la baja sigue en el historial', async () => {
    await unirse(ana, grupos.ingles.codigoAcceso).expect(201);
    expect(await gruposDeMiHorario()).toEqual(
      [grupos.ingles.id, grupos.frances.id].sort(),
    );
    const delGrupo = (await misGrupos('?historial=true')).filter(
      (i) => i.grupo.id === grupos.ingles.id,
    );
    expect(delGrupo.map((i) => i.activo).sort()).toEqual([false, true]);
  });

  it('inscripciones y bajas quedan en el registro de auditoría', async () => {
    const total = async (accion: string) =>
      (
        await http()
          .get('/api/audit-log')
          .set(comoAdmin())
          .query({ usuarioId: ana.id, accion })
          .expect(200)
      ).body.total;
    expect(await total('INSCRIBIR_GRUPO')).toBe(3);
    expect(await total('BAJA_GRUPO')).toBe(1);
  });
});
