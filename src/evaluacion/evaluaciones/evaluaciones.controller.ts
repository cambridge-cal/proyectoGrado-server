import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { actorDe } from '../../compartido/actor.js';
import type { PayloadAccess } from '../../seguridad/autenticacion/tokens.js';
import {
  Roles,
  UsuarioActual,
} from '../../seguridad/autorizacion/decoradores.js';
import { Rol } from '../../seguridad/entidades/rol.enum.js';
import {
  AsignacionMasivaDto,
  AsignarEvaluacionDto,
  CambiarEstadoDto,
  FiltrosEvaluacionesDto,
} from './evaluacion.dto.js';
import { EvaluacionesService } from './evaluaciones.service.js';

/** Asignación de evaluaciones docentes (RF-31, RF-32). Solo el Administrador. */
@ApiTags('Evaluación')
@ApiBearerAuth()
@Roles(Rol.ADMIN)
@Controller('evaluaciones')
export class EvaluacionesController {
  constructor(private readonly servicio: EvaluacionesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista paginada de evaluaciones' })
  listar(@Query() filtros: FiltrosEvaluacionesDto) {
    return this.servicio.listar(filtros);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una evaluación' })
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicio.obtener(id);
  }

  @Post()
  @ApiOperation({ summary: 'Asignar evaluación a un docente (RF-31)' })
  asignar(
    @Body() datos: AsignarEvaluacionDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.servicio.asignar(datos, actorDe(u, r));
  }

  @Post('masiva')
  @ApiOperation({ summary: 'Asignación masiva: una evaluación por docente (RF-32)' })
  asignarMasivo(
    @Body() datos: AsignacionMasivaDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.servicio.asignarMasivo(datos, actorDe(u, r));
  }

  @Patch(':id/estado')
  @ApiOperation({ summary: 'Cambiar estado de una evaluación' })
  cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: CambiarEstadoDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.servicio.cambiarEstado(id, datos, actorDe(u, r));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar evaluación' })
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    await this.servicio.eliminar(id, actorDe(u, r));
  }
}
