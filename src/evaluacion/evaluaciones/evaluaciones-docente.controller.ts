import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { actorDe } from '../../compartido/actor.js';
import type { PayloadAccess } from '../../seguridad/autenticacion/tokens.js';
import {
  Roles,
  UsuarioActual,
} from '../../seguridad/autorizacion/decoradores.js';
import { Rol } from '../../seguridad/entidades/index.js';
import { EvaluacionesService } from './evaluaciones.service.js';

/** Historial de evaluaciones del docente autenticado (RF-37). */
@ApiTags('Evaluación')
@ApiBearerAuth()
@Roles(Rol.DOCENTE)
@Controller('docentes/yo/evaluaciones')
export class EvaluacionesDocenteController {
  constructor(private readonly servicio: EvaluacionesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Evaluaciones del docente con su estado y cuántos estudiantes respondieron (RF-37)',
  })
  listar(@UsuarioActual() u: PayloadAccess, @Req() r: Request) {
    return this.servicio.delDocente(actorDe(u, r));
  }
}
