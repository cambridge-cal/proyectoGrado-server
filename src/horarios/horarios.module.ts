import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeguridadModule } from '../seguridad/seguridad.module.js';
import { AulasController } from './aulas/aulas.controller.js';
import { AulasService } from './aulas/aulas.service.js';
import { CursosController } from './cursos/cursos.controller.js';
import { CursosService } from './cursos/cursos.service.js';
import { DocentesController } from './docentes/docentes.controller.js';
import { DocentesService } from './docentes/docentes.service.js';
import { ENTIDADES_HORARIOS } from './entidades/index.js';
import { FranjasController } from './franjas/franjas.controller.js';
import { FranjasService } from './franjas/franjas.service.js';
import { GruposController } from './grupos/grupos.controller.js';
import { GruposService } from './grupos/grupos.service.js';
import { CLIENTE_GEMINI, GeminiApi } from './gemini/cliente-gemini.js';
import { ValidacionSemanticaService } from './gemini/validacion-semantica.service.js';
import { HorariosController } from './horario/horarios.controller.js';
import { HorariosService } from './horario/horarios.service.js';
import { MotorService } from './motor/motor.service.js';
import { NivelesController } from './niveles/niveles.controller.js';
import { NivelesService } from './niveles/niveles.service.js';
import { PeriodosController } from './periodos/periodos.controller.js';
import { PeriodosService } from './periodos/periodos.service.js';

/** Módulo de Horarios: Datos académicos base, motor de IA (AG + Búsqueda Tabú + validación con Gemini) e inscripción a grupos (RF-09 a RF-27). */
@Module({
  imports: [TypeOrmModule.forFeature(ENTIDADES_HORARIOS), SeguridadModule],
  controllers: [
    PeriodosController,
    NivelesController,
    CursosController,
    GruposController,
    AulasController,
    FranjasController,
    DocentesController,
    HorariosController,
  ],
  providers: [
    PeriodosService,
    NivelesService,
    CursosService,
    GruposService,
    AulasService,
    FranjasService,
    DocentesService,
    MotorService,
    ValidacionSemanticaService,
    HorariosService,
    { provide: CLIENTE_GEMINI, useClass: GeminiApi },
  ],
  exports: [PeriodosService, MotorService, ValidacionSemanticaService],
})
export class HorariosModule {}
