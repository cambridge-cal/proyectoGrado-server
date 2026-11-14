import {
  Body,
  Controller,
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
import { Rol } from '../../seguridad/entidades/index.js';
import { AlertasService } from './alertas.service.js';
import {
  FiltrosAlertasDto,
  MarcarAlertaDto,
  MisResultadosDto,
  PeriodoKddDto,
} from './kdd.dto.js';
import { KddService } from './kdd.service.js';

/** Pipeline KDD y consulta de resultados (RF-39, RF-41, RF-42, RF-43). */
@ApiTags('KDD')
@ApiBearerAuth()
@Controller('kdd')
export class KddController {
  constructor(private readonly kdd: KddService) {}

  @Post('ejecutar')
  @Roles(Rol.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Ejecuta o reejecuta el pipeline KDD del período y genera las alertas (RF-39, RF-40)',
  })
  ejecutar(
    @Body() dto: PeriodoKddDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.kdd.ejecutarPeriodo(dto.periodoId, actorDe(u, r));
  }

  @Get('resultados')
  @Roles(Rol.ADMIN)
  @ApiOperation({
    summary:
      'Puntaje global y por dimensión de cada docente del período (RF-41)',
  })
  resultados(@Query() filtros: PeriodoKddDto) {
    return this.kdd.resultados(filtros.periodoId);
  }

  @Get('mis-periodos')
  @Roles(Rol.DOCENTE)
  @ApiOperation({
    summary:
      'Períodos que el docente puede elegir en su dashboard de resultados (RF-43)',
  })
  misPeriodos(@UsuarioActual() u: PayloadAccess, @Req() r: Request) {
    return this.kdd.misPeriodos(actorDe(u, r));
  }

  @Get('mis-resultados')
  @Roles(Rol.DOCENTE)
  @ApiOperation({
    summary:
      'Resultados y comentarios anónimos del docente autenticado, por período (RF-42, RF-43)',
  })
  misResultados(
    @Query() filtros: MisResultadosDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.kdd.misResultados(actorDe(u, r), filtros.periodoId);
  }
}

/** Alertas generadas por el KDD (RF-44). Solo el Administrador. */
@ApiTags('KDD')
@ApiBearerAuth()
@Roles(Rol.ADMIN)
@Controller('alertas')
export class AlertasController {
  constructor(private readonly alertas: AlertasService) {}

  @Get()
  @ApiOperation({ summary: 'Lista y filtra las alertas (RF-44)' })
  listar(@Query() filtros: FiltrosAlertasDto) {
    return this.alertas.listar(filtros);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Marca una alerta como leída (RF-44)' })
  marcarLeida(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: MarcarAlertaDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.alertas.marcarLeida(id, actorDe(u, r));
  }
}
