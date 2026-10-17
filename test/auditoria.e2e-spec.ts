import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import {
  AuditLog,
  Rol,
  Sesion,
  Usuario,
} from '../src/seguridad/entidades/index.js';

// Requiere la base de datos de docker compose en ejecución y un archivo .env.
describe('GET /api/audit-log (e2e)', () => {
  let app: INestApplication;
  let fuente: DataSource;
  const marca = `e2ea${Date.now()}`;
  const clave = 'ClaveE2E-2026';
  const ids: Partial<Record<Rol, string>> = {};
  const tokens: Partial<Record<Rol, string>> = {};

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

    for (const rol of [Rol.ADMIN, Rol.ESTUDIANTE]) {
      const usuario = await fuente.getRepository(Usuario).save({
        nombre: `${marca} ${rol}`,
        email: `${marca}.${rol.toLowerCase()}@cambridge.edu.co`,
        contrasenaHash: await bcrypt.hash(clave, 10),
        rol,
        activo: true,
      });
      ids[rol] = usuario.id;
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: usuario.email, contrasena: clave })
        .expect(200);
      tokens[rol] = login.body.accessToken;
    }
  });

  afterAll(async () => {
    const lista = Object.values(ids);
    await fuente.getRepository(Sesion).delete({ usuario: { id: In(lista) } });
    await fuente.getRepository(AuditLog).delete({ usuario: { id: In(lista) } });
    await fuente.getRepository(Usuario).delete({ id: In(lista) });
    await app.close();
  });

  const comoAdmin = () => ({ Authorization: `Bearer ${tokens.ADMIN}` });

  it('el Administrador consulta el historial filtrado por usuario, módulo y acción', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/audit-log')
      .query({
        usuarioId: ids.ESTUDIANTE,
        modulo: 'SEGURIDAD',
        accion: 'login',
      })
      .set(comoAdmin())
      .expect(200);

    expect(respuesta.body.total).toBe(1);
    expect(respuesta.body.datos[0]).toMatchObject({
      modulo: 'SEGURIDAD',
      accion: 'LOGIN',
      usuario: { id: ids.ESTUDIANTE, rol: 'ESTUDIANTE' },
    });
    expect(respuesta.body.datos[0].ip).toBeTruthy();
    expect(respuesta.body.datos[0].usuario).not.toHaveProperty(
      'contrasenaHash',
    );
  });

  it('pagina con page/size y ordena del más reciente al más antiguo', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/audit-log')
      .query({ page: 1, size: 5 })
      .set(comoAdmin())
      .expect(200);
    expect(respuesta.body).toMatchObject({ page: 1, size: 5 });
    const fechas = respuesta.body.datos.map((r: { fechaHora: string }) =>
      Date.parse(r.fechaHora),
    );
    expect([...fechas].sort((a, b) => b - a)).toEqual(fechas);
  });

  it('filtra por rango de fechas', async () => {
    const vacia = await request(app.getHttpServer())
      .get('/api/audit-log')
      .query({ usuarioId: ids.ADMIN, hasta: '2020-01-01' })
      .set(comoAdmin())
      .expect(200);
    expect(vacia.body.total).toBe(0);
    await request(app.getHttpServer())
      .get('/api/audit-log')
      .query({ desde: 'ayer' })
      .set(comoAdmin())
      .expect(400);
  });

  it('devuelve los módulos y acciones para los filtros', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/audit-log/opciones')
      .set(comoAdmin())
      .expect(200);
    expect(respuesta.body.modulos).toContain('USUARIOS');
    expect(respuesta.body.acciones).toContain('LOGIN');
  });

  it('otros roles reciben 403 y no existe forma de modificar ni borrar (RNF-11)', async () => {
    await request(app.getHttpServer())
      .get('/api/audit-log')
      .set('Authorization', `Bearer ${tokens.ESTUDIANTE}`)
      .expect(403);
    const { body } = await request(app.getHttpServer())
      .get('/api/audit-log')
      .query({ size: 1 })
      .set(comoAdmin())
      .expect(200);
    const id = body.datos[0].id;
    await request(app.getHttpServer())
      .delete(`/api/audit-log/${id}`)
      .set(comoAdmin())
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/audit-log/${id}`)
      .set(comoAdmin())
      .send({ detalle: 'x' })
      .expect(404);
  });
});
