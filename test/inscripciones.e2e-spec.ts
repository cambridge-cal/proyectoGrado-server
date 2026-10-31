import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import {
  Curso,
  EstudianteGrupo,
  Grupo,
  Jornada,
  NivelIdioma,
} from '../src/horarios/entidades/index.js';
import { Estudiante, Rol } from '../src/seguridad/entidades/index.js';
import { borrarUsuarios, crearApp, usuarioConSesion } from './utilidades.js';

// Requiere la base de datos de docker compose en ejecución y un archivo .env.
describe('Inscripción y baja en grupos (e2e, RF-26, RF-27)', () => {
  let app: INestApplication;
  let fuente: DataSource;
  const marca = `e2ei${Date.now()}`;
  const corta = Date.now().toString(36).slice(-5).toUpperCase();
  type Sesion = { id: string; token: string };
  let admin: Sesion;
  let ana: Sesion;
  let beto: Sesion;
  let sinPerfil: Sesion;
  let estudianteAna: string;
  let estudianteBeto: string;
  const niveles: string[] = [];
  const cursos: string[] = [];
  const grupos: Record<'inglesLleno' | 'ingles' | 'frances', Grupo> =
    {} as never;

  beforeAll(async () => {
    ({ app, fuente } = await crearApp());
    admin = await usuarioConSesion(app, fuente, marca, Rol.ADMIN);
    ana = await usuarioConSesion(app, fuente, `${marca}a`, Rol.ESTUDIANTE);
    beto = await usuarioConSesion(app, fuente, `${marca}b`, Rol.ESTUDIANTE);
    sinPerfil = await usuarioConSesion(
      app,
      fuente,
      `${marca}c`,
      Rol.ESTUDIANTE,
    );
    const perfiles = fuente.getRepository(Estudiante);
    estudianteAna = (
      await perfiles.save({ usuario: { id: ana.id }, codigo: `${marca}-A` })
    ).id;
    estudianteBeto = (
      await perfiles.save({ usuario: { id: beto.id }, codigo: `${marca}-B` })
    ).id;

    for (const idioma of ['Inglés', 'Francés']) {
      const nivel = await fuente.getRepository(NivelIdioma).save({
        codigo: `${corta}-${idioma.slice(0, 3)}`,
        nombre: 'A1',
        idioma,
      });
      niveles.push(nivel.id);
      const curso = await fuente.getRepository(Curso).save({
        nivelIdioma: nivel,
        nombre: `${idioma} A1`,
        intensidadHoraria: 4,
      });
      cursos.push(curso.id);
    }
    const grupo = (sufijo: string, curso: string, cupoMaximo: number) =>
      fuente.getRepository(Grupo).save({
        curso: { id: curso },
        codigo: `${marca}-${sufijo}`,
        cupoMaximo,
        jornada: Jornada.MANANA,
        codigoAcceso: `${corta}${sufijo}`,
      });
    grupos.inglesLleno = await grupo('IL', cursos[0], 1);
    grupos.ingles = await grupo('IN', cursos[0], 5);
    grupos.frances = await grupo('FR', cursos[1], 5);
  });

  afterAll(async () => {
    const idsGrupos = Object.values(grupos).map((g) => g.id);
    await fuente
      .getRepository(EstudianteGrupo)
      .delete({ grupo: { id: In(idsGrupos) } });
    await fuente.getRepository(Grupo).delete({ id: In(idsGrupos) });
    await fuente.getRepository(Curso).delete({ id: In(cursos) });
    await fuente.getRepository(NivelIdioma).delete({ id: In(niveles) });
    await fuente
      .getRepository(Estudiante)
      .delete({ id: In([estudianteAna, estudianteBeto]) });
    await borrarUsuarios(fuente, [admin.id, ana.id, beto.id, sinPerfil.id]);
    await app.close();
  });

  const unirse = (s: Sesion, codigoAcceso: string, id = 'yo') =>
    request(app.getHttpServer())
      .post(`/api/estudiantes/${id}/unirse`)
      .set('Authorization', `Bearer ${s.token}`)
      .send({ codigoAcceso });
  const misGrupos = (s: Sesion, consulta = '') =>
    request(app.getHttpServer())
      .get(`/api/estudiantes/yo/grupos${consulta}`)
      .set('Authorization', `Bearer ${s.token}`);
  const baja = (s: Sesion, grupoId: string, activo: unknown = false) =>
    request(app.getHttpServer())
      .patch(`/api/estudiantes/yo/grupos/${grupoId}`)
      .set('Authorization', `Bearer ${s.token}`)
      .send({ activo });

  it('solo estudiantes con perfil de estudiante', async () => {
    await unirse(admin, grupos.ingles.codigoAcceso).expect(403);
    const r = await unirse(sinPerfil, grupos.ingles.codigoAcceso).expect(403);
    expect(r.body.message).toContain('perfil de estudiante');
  });

  it('valida el código de acceso', async () => {
    await unirse(ana, 'X').expect(400);
    const r = await unirse(ana, 'ZZZZZZZZ').expect(404);
    expect(r.body.message).toContain('código de acceso');
  });

  it('inscribe con el código aunque llegue en minúsculas y con espacios', async () => {
    const r = await unirse(
      ana,
      `  ${grupos.inglesLleno.codigoAcceso.toLowerCase()} `,
    ).expect(201);
    expect(r.body).toMatchObject({
      activo: true,
      fechaBaja: null,
      grupo: {
        id: grupos.inglesLleno.id,
        idioma: 'Inglés',
        curso: 'Inglés A1',
      },
    });
  });

  it('rechaza un grupo sin cupo', async () => {
    const r = await unirse(beto, grupos.inglesLleno.codigoAcceso).expect(409);
    expect(r.body.message).toContain('no tiene cupo');
  });

  it('máximo un grupo activo por idioma, pero varios idiomas a la vez', async () => {
    const r = await unirse(ana, grupos.ingles.codigoAcceso).expect(409);
    expect(r.body.message).toContain('de Inglés');
    await unirse(ana, grupos.frances.codigoAcceso).expect(201);
    const lista = await misGrupos(ana).expect(200);
    expect(
      lista.body.map((i: { grupo: { id: string } }) => i.grupo.id).sort(),
    ).toEqual([grupos.inglesLleno.id, grupos.frances.id].sort());
  });

  it('nadie gestiona las inscripciones de otro estudiante', async () => {
    await unirse(ana, grupos.ingles.codigoAcceso, estudianteBeto).expect(403);
    await request(app.getHttpServer())
      .get(`/api/estudiantes/${estudianteAna}/grupos`)
      .set('Authorization', `Bearer ${ana.token}`)
      .expect(200);
  });

  it('la baja marca la inscripción como inactiva y libera el cupo y el idioma', async () => {
    await baja(ana, grupos.inglesLleno.id, true).expect(400);
    const r = await baja(ana, grupos.inglesLleno.id).expect(200);
    expect(r.body.activo).toBe(false);
    expect(r.body.fechaBaja).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await baja(ana, grupos.inglesLleno.id).expect(404);

    await unirse(ana, grupos.ingles.codigoAcceso).expect(201);
    await unirse(beto, grupos.inglesLleno.codigoAcceso).expect(201);

    const activos = await misGrupos(ana).expect(200);
    expect(activos.body).toHaveLength(2);
    const historial = await misGrupos(ana, '?historial=true').expect(200);
    expect(historial.body).toHaveLength(3);
    expect(
      historial.body.filter((i: { activo: boolean }) => !i.activo),
    ).toHaveLength(1);
  });

  it('un grupo con inscripciones no se puede eliminar (RNF-19)', async () => {
    await request(app.getHttpServer())
      .delete(`/api/grupos/${grupos.ingles.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(409);
  });
});
