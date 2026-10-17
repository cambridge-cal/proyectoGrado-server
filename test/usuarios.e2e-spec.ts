import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { DataSource, In, Like } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import {
  AuditLog,
  Docente,
  Estudiante,
  Rol,
  Sesion,
  Usuario,
} from '../src/seguridad/entidades/index.js';

// Requiere la base de datos de docker compose en ejecución y un archivo .env.
describe('Usuarios y control de acceso por roles (e2e)', () => {
  let app: INestApplication;
  let fuente: DataSource;
  const marca = `e2eu${Date.now()}`;
  const clave = 'ClaveE2E-2026';
  const tokens: Partial<Record<Rol, string>> = {};
  // Cuentas anonimizadas: ya no tienen la marca en el email, se limpian por id.
  const anonimizados: string[] = [];

  async function crearDirecto(rol: Rol) {
    return fuente.getRepository(Usuario).save({
      nombre: `${marca} ${rol}`,
      email: `${marca}.${rol.toLowerCase()}@cambridge.edu.co`,
      contrasenaHash: await bcrypt.hash(clave, 10),
      rol,
      activo: true,
    });
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    fuente = app.get(DataSource);
    await fuente.synchronize();

    for (const rol of [Rol.ADMIN, Rol.DOCENTE]) {
      const usuario = await crearDirecto(rol);
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: usuario.email, contrasena: clave })
        .expect(200);
      tokens[rol] = login.body.accessToken;
    }
  });

  afterAll(async () => {
    const usuarios = await fuente
      .getRepository(Usuario)
      .findBy([{ email: Like(`${marca}%`) }, { nombre: Like(`${marca}%`) }]);
    const ids = [...usuarios.map((u) => u.id), ...anonimizados];
    if (ids.length) {
      await fuente.getRepository(Sesion).delete({ usuario: { id: In(ids) } });
      await fuente.getRepository(AuditLog).delete({ usuario: { id: In(ids) } });
      await fuente
        .getRepository(Estudiante)
        .delete({ usuario: { id: In(ids) } });
      await fuente.getRepository(Docente).delete({ usuario: { id: In(ids) } });
      await fuente.getRepository(Usuario).delete({ id: In(ids) });
    }
    await app.close();
  });

  const comoAdmin = () => ({ Authorization: `Bearer ${tokens.ADMIN}` });

  it('401 sin token y 403 para un rol que no es Administrador (RF-07)', async () => {
    await request(app.getHttpServer()).get('/api/usuarios').expect(401);
    await request(app.getHttpServer())
      .get('/api/usuarios')
      .set('Authorization', `Bearer ${tokens.DOCENTE}`)
      .expect(403);
  });

  it('crea un estudiante y un docente con su perfil, y rechaza duplicados', async () => {
    const servidor = app.getHttpServer();
    const estudiante = await request(servidor)
      .post('/api/usuarios')
      .set(comoAdmin())
      .send({
        nombre: `${marca} Estudiante Nuevo`,
        email: `${marca}.nuevo.est@cambridge.edu.co`,
        contrasena: clave,
        rol: 'ESTUDIANTE',
        codigo: `${marca}-E1`,
      })
      .expect(201);
    expect(estudiante.body).toMatchObject({
      rol: 'ESTUDIANTE',
      codigo: `${marca}-E1`,
      activo: true,
    });
    expect(estudiante.body).not.toHaveProperty('contrasenaHash');

    await request(servidor)
      .post('/api/usuarios')
      .set(comoAdmin())
      .send({
        nombre: `${marca} Docente Nuevo`,
        email: `${marca}.nuevo.doc@cambridge.edu.co`,
        contrasena: clave,
        rol: 'DOCENTE',
        especialidad: 'Francés',
        cargaMaximaSemanal: 16,
      })
      .expect(201);

    // Docente sin especialidad: 400. Email repetido: 409. Código repetido: 409.
    await request(servidor)
      .post('/api/usuarios')
      .set(comoAdmin())
      .send({
        nombre: 'X',
        email: `${marca}.x@cambridge.edu.co`,
        contrasena: clave,
        rol: 'DOCENTE',
      })
      .expect(400);
    await request(servidor)
      .post('/api/usuarios')
      .set(comoAdmin())
      .send({
        nombre: `${marca} Repetido`,
        email: `${marca}.NUEVO.est@cambridge.edu.co`,
        contrasena: clave,
        rol: 'ADMIN',
      })
      .expect(409);
    await request(servidor)
      .post('/api/usuarios')
      .set(comoAdmin())
      .send({
        nombre: `${marca} Otro Estudiante`,
        email: `${marca}.otro.est@cambridge.edu.co`,
        contrasena: clave,
        rol: 'ESTUDIANTE',
        codigo: `${marca}-E1`,
      })
      .expect(409);
  });

  it('lista con paginación page/size y filtros (RNF-29)', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/usuarios')
      .query({ busqueda: marca, page: 1, size: 2 })
      .set(comoAdmin())
      .expect(200);
    expect(respuesta.body).toMatchObject({ page: 1, size: 2 });
    expect(respuesta.body.datos).toHaveLength(2);
    expect(respuesta.body.total).toBeGreaterThanOrEqual(4);

    const docentes = await request(app.getHttpServer())
      .get('/api/usuarios')
      .query({ busqueda: marca, rol: 'DOCENTE' })
      .set(comoAdmin())
      .expect(200);
    expect(
      docentes.body.datos.every((u: { rol: string }) => u.rol === 'DOCENTE'),
    ).toBe(true);
  });

  it('edita, desactiva (cerrando sesiones) y elimina usuarios', async () => {
    const servidor = app.getHttpServer();
    const lista = await request(servidor)
      .get('/api/usuarios')
      .query({ busqueda: `${marca}.nuevo.doc` })
      .set(comoAdmin())
      .expect(200);
    const id = lista.body.datos[0].id;

    const editado = await request(servidor)
      .patch(`/api/usuarios/${id}`)
      .set(comoAdmin())
      .send({
        nombre: `${marca} Docente Editado`,
        cargaMaximaSemanal: 12,
        activo: false,
      })
      .expect(200);
    expect(editado.body).toMatchObject({
      cargaMaximaSemanal: 12,
      activo: false,
    });

    await request(servidor)
      .patch(`/api/usuarios/${id}`)
      .set(comoAdmin())
      .send({ rol: 'ADMIN' })
      .expect(400);
    await request(servidor)
      .patch(`/api/usuarios/${id}`)
      .set(comoAdmin())
      .send({ codigo: 'NO-APLICA' })
      .expect(400);

    // Nunca inició sesión: se elimina por completo.
    const eliminado = await request(servidor)
      .delete(`/api/usuarios/${id}`)
      .set(comoAdmin())
      .expect(200);
    expect(eliminado.body).toEqual({ resultado: 'ELIMINADO' });
    await request(servidor)
      .get(`/api/usuarios/${id}`)
      .set(comoAdmin())
      .expect(404);
  });

  it('una cuenta con historial se anonimiza en lugar de borrarse (RNF-32, RNF-33)', async () => {
    const docente = await fuente
      .getRepository(Usuario)
      .findOneByOrFail({ email: `${marca}.docente@cambridge.edu.co` });
    const respuesta = await request(app.getHttpServer())
      .delete(`/api/usuarios/${docente.id}`)
      .set(comoAdmin())
      .expect(200);
    expect(respuesta.body).toEqual({ resultado: 'ANONIMIZADO' });
    anonimizados.push(docente.id);

    const anonimo = await fuente
      .getRepository(Usuario)
      .findOneByOrFail({ id: docente.id });
    expect(anonimo).toMatchObject({
      nombre: 'Usuario eliminado',
      activo: false,
    });
    expect(anonimo.email).toBe(`eliminado-${docente.id}@cal.invalid`);
  });

  it('el Administrador no puede eliminarse ni desactivarse a sí mismo', async () => {
    const admin = await fuente
      .getRepository(Usuario)
      .findOneByOrFail({ email: `${marca}.admin@cambridge.edu.co` });
    await request(app.getHttpServer())
      .delete(`/api/usuarios/${admin.id}`)
      .set(comoAdmin())
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/usuarios/${admin.id}`)
      .set(comoAdmin())
      .send({ activo: false })
      .expect(400);
  });
});
