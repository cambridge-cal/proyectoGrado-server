import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

// Requiere la base de datos de docker compose en ejecución y un archivo .env.
describe('Sistema (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  it('GET /api/salud', () => {
    return request(app.getHttpServer())
      .get('/api/salud')
      .expect(200)
      .expect({ estado: 'ok' });
  });

  afterEach(async () => {
    await app.close();
  });
});
