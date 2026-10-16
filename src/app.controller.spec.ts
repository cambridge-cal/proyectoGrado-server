import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const modulo: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = modulo.get<AppController>(AppController);
  });

  it('responde que el servidor está en funcionamiento', () => {
    expect(appController.verificarSalud()).toEqual({ estado: 'ok' });
  });
});
