import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
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
  FiltrosHorariosDto,
  GenerarHorarioDto,
  PeriodoHorariosDto,
} from './horario.dto.js';
import { HorariosService } from './horarios.service.js';

/** Horarios generados por el motor de IA (RF-17 a RF-24). */
@ApiTags('Horarios')
@ApiBearerAuth()
@Controller('horarios')
export class HorariosController {
  constructor(private readonly horarios: HorariosService) {}

  @Post('generar')
  @Roles(Rol.ADMIN)
  @ApiOperation({
    summary:
      'Genera un horario con el motor de IA (AG + Búsqueda Tabú) y lo valida con Gemini',
    description:
      'Usa el período activo si no se indica otro. Los tipos de aula excluidos no se usan en esta generación (RF-19). Si Gemini no está configurado, falla o rechaza la propuesta, el horario se guarda con validadoGemini = false (RNF-18).',
  })
  @ApiCreatedResponse({ description: 'Horario generado y guardado.' })
  @ApiUnprocessableEntityResponse({
    description:
      'Faltan datos para generar, o el motor no encontró un horario factible; incluye las restricciones no satisfechas.',
  })
  generar(
    @Body() dto: GenerarHorarioDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.horarios.generar(dto, actorDe(u, r));
  }

  @Get()
  @ApiOperation({
    summary:
      'Lista paginada de horarios generados (cualquier usuario autenticado)',
  })
  listar(@Query() filtros: FiltrosHorariosDto) {
    return this.horarios.listar(filtros);
  }

  @Get('actual')
  @ApiOperation({
    summary:
      'Horario activo del período en curso; el docente recibe solo sus clases (RF-21, RF-25)',
  })
  @ApiNotFoundResponse({ description: 'Todavía no hay un horario activo.' })
  actual(@UsuarioActual() u: PayloadAccess, @Req() r: Request) {
    return this.horarios.actual(actorDe(u, r));
  }

  @Post('archivar')
  @Roles(Rol.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Archiva todos los horarios activos del período (RF-22)',
  })
  archivar(
    @Body() dto: PeriodoHorariosDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.horarios.archivar(dto, actorDe(u, r));
  }

  @Delete('archivados')
  @Roles(Rol.ADMIN)
  @ApiOperation({
    summary: 'Elimina de forma permanente el historial archivado (RF-23)',
  })
  eliminarArchivados(
    @Query() dto: PeriodoHorariosDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.horarios.eliminarArchivados(dto, actorDe(u, r));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de un horario con todas sus asignaciones (RF-21)',
  })
  @ApiNotFoundResponse({ description: 'El horario no existe.' })
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.horarios.obtener(id);
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Elimina un horario; las inscripciones de los estudiantes no cambian (RF-24)',
  })
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    await this.horarios.eliminar(id, actorDe(u, r));
  }
}
