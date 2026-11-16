import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AuditLog, Rol, Usuario } from '../src/seguridad/entidades/index.js';
import {
  borrarUsuarios,
  CLAVE_PRUEBA,
  crearApp,
  usuarioConSesion,
} from './utilidades.js';

// Requiere la base de datos de docker compose en ejecución y un archivo .env.
describe('Autorización de tratamiento de datos (e2e, RNF-31, Ley 1581 de 2012)', () => {
  let app: INestApplication;
  let fuente: DataSource;
  const marca = `e2ed${Date.now()}`;
  let alumno: { id: string; token: string };
  let email: string;

  const iniciar = () =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, contrasena: CLAVE_PRUEBA });
  const autorizar = (cuerpo: object, token?: string) => {
    const peticion = request(app.getHttpServer()).post(
      '/api/auth/autorizacion-datos',
    );
    return (
      token ? peticion.set('Authorization', `Bearer ${token}`) : peticion
    ).send(cuerpo);
  };

  beforeAll(async () => {
    ({ app, fuente } = await crearApp());
    alumno = await usuarioConSesion(app, fuente, marca, Rol.ESTUDIANTE);
    email = (
      await fuente.getRepository(Usuario).findOneByOrFail({ id: alumno.id })
    ).email;
  });

  afterAll(async () => {
    await borrarUsuarios(fuente, [alumno.id]);
    await app.close();
  });

  it('en el primer ingreso el usuario todavía no ha autorizado', async () => {
    const sesion = await iniciar();
    expect(sesion.status).toBe(200);
    expect(sesion.body.usuario.autorizoDatos).toBe(false);
  });

  it('la autorización exige sesión y debe ser expresa', async () => {
    expect((await autorizar({ acepta: true })).status).toBe(401);
    const negada = await autorizar({ acepta: false }, alumno.token);
    expect(negada.status).toBe(400);
    expect(
      (await fuente.getRepository(Usuario).findOneByOrFail({ id: alumno.id }))
        .autorizacionDatosEn,
    ).toBeNull();
  });

  it('registra la fecha, la versión del aviso y la prueba en el Audit Log', async () => {
    const respuesta = await autorizar({ acepta: true }, alumno.token);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({
      autorizoDatos: true,
      versionAvisoPrivacidad: expect.any(String),
    });
    const usuario = await fuente
      .getRepository(Usuario)
      .findOneByOrFail({ id: alumno.id });
    expect(usuario.autorizacionDatosEn).toBeInstanceOf(Date);
    expect(usuario.versionAvisoPrivacidad).toBe(
      respuesta.body.versionAvisoPrivacidad,
    );
    expect(
      await fuente.getRepository(AuditLog).countBy({
        usuario: { id: alumno.id },
        accion: 'AUTORIZAR_TRATAMIENTO_DATOS',
      }),
    ).toBe(1);
  });

  it('repetirla no duplica el registro y el siguiente ingreso ya la reporta', async () => {
    const repetida = await autorizar({ acepta: true }, alumno.token);
    expect(repetida.status).toBe(200);
    expect(
      await fuente.getRepository(AuditLog).countBy({
        usuario: { id: alumno.id },
        accion: 'AUTORIZAR_TRATAMIENTO_DATOS',
      }),
    ).toBe(1);
    const sesion = await iniciar();
    expect(sesion.body.usuario.autorizoDatos).toBe(true);
  });
});
