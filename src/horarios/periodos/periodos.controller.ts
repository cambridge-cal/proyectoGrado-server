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
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOperation,
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
  ActualizarPeriodoDto,
  CrearPeriodoDto,
  FiltrosPeriodosDto,
} from './periodo.dto.js';
import { PeriodosService } from './periodos.service.js';

/** Períodos académicos (RF-09). Solo el Administrador. */
@ApiTags('Configuración académica')
@ApiBearerAuth()
@Roles(Rol.ADMIN)
@Controller('periodos')
export class PeriodosController {
  constructor(private readonly periodos: PeriodosService) {}

  @Get()
  @ApiOperation({ summary: 'Lista paginada de períodos académicos' })
  listar(@Query() filtros: FiltrosPeriodosDto) {
    return this.periodos.listar(filtros);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.periodos.obtener(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Crea un período; si llega activo, desactiva el anterior',
  })
  @ApiConflictResponse({ description: 'Nombre repetido.' })
  crear(
    @Body() datos: CrearPeriodoDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.periodos.crear(datos, actorDe(u, r));
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: ActualizarPeriodoDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.periodos.actualizar(id, datos, actorDe(u, r));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiConflictResponse({ description: 'El período está en uso.' })
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    await this.periodos.eliminar(id, actorDe(u, r));
  }
}
