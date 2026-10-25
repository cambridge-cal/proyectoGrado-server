import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeguridadModule } from '../seguridad/seguridad.module.js';
import { AulasController } from './aulas/aulas.controller.js';
import { AulasService } from './aulas/aulas.service.js';
import { CursosController } from './cursos/cursos.controller.js';
import { CursosService } from './cursos/cursos.service.js';
import { ENTIDADES_HORARIOS } from './entidades/index.js';
import { FranjasController } from './franjas/franjas.controller.js';
import { FranjasService } from './franjas/franjas.service.js';
import { GruposController } from './grupos/grupos.controller.js';
import { GruposService } from './grupos/grupos.service.js';
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
  ],
  providers: [
    PeriodosService,
    NivelesService,
    CursosService,
    GruposService,
    AulasService,
    FranjasService,
  ],
  exports: [PeriodosService],
})
export class HorariosModule {}
