import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { actorDe } from '../../compartido/actor.js';
import type { PayloadAccess } from '../../seguridad/autenticacion/tokens.js';
import {
  Roles,
  UsuarioActual,
} from '../../seguridad/autorizacion/decoradores.js';
import { Rol } from '../../seguridad/entidades/rol.enum.js';
import {
  BajaGrupoDto,
  FiltrosInscripcionesDto,
  UnirseGrupoDto,
} from './inscripcion.dto.js';
import { InscripcionesService } from './inscripciones.service.js';

const PARAM_ESTUDIANTE = {
  name: 'id',
  description: 'Id del estudiante, o "yo" para el estudiante autenticado.',
  example: 'yo',
};

/** Inscripción y baja en grupos (RF-26, RF-27, Figura 6.17). Solo el propio estudiante. */
@ApiTags('Inscripciones')
@ApiBearerAuth()
@Roles(Rol.ESTUDIANTE)
@Controller('estudiantes')
export class InscripcionesController {
  constructor(private readonly inscripciones: InscripcionesService) {}

  @Get(':id/grupos')
  @ApiParam(PARAM_ESTUDIANTE)
  @ApiOperation({
    summary: 'Grupos del estudiante; con historial=true incluye las bajas',
  })
  async listar(
    @Param('id') id: string,
    @Query() filtros: FiltrosInscripcionesDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    const estudianteId = await this.inscripciones.estudianteDe(
      actorDe(u, r),
      id,
    );
    return this.inscripciones.listar(estudianteId, filtros);
  }

  @Post(':id/unirse')
  @ApiParam(PARAM_ESTUDIANTE)
  @ApiOperation({
    summary: 'Inscribe al estudiante con el código de acceso del grupo (RF-26)',
  })
  @ApiNotFoundResponse({ description: 'Código de acceso incorrecto.' })
  @ApiConflictResponse({
    description: 'Grupo sin cupo o ya tiene un grupo activo del mismo idioma.',
  })
  async unirse(
    @Param('id') id: string,
    @Body() dto: UnirseGrupoDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    const actor = actorDe(u, r);
    const estudianteId = await this.inscripciones.estudianteDe(actor, id);
    return this.inscripciones.unirse(estudianteId, dto, actor);
  }

  @Patch(':id/grupos/:grupoId')
  @ApiParam(PARAM_ESTUDIANTE)
  @ApiOperation({
    summary:
      'Da de baja al estudiante del grupo; la inscripción queda en el historial (RF-27)',
  })
  async darDeBaja(
    @Param('id') id: string,
    @Param('grupoId', ParseUUIDPipe) grupoId: string,
    @Body() _dto: BajaGrupoDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    const actor = actorDe(u, r);
    const estudianteId = await this.inscripciones.estudianteDe(actor, id);
    return this.inscripciones.darDeBaja(estudianteId, grupoId, actor);
  }
}
