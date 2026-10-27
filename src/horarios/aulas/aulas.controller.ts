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
  ActualizarAulaDto,
  CrearAulaDto,
  FiltrosAulasDto,
} from './aula.dto.js';
import { AulasService } from './aulas.service.js';

/** Aulas (RF-13). Solo el Administrador. */
@ApiTags('Configuración académica')
@ApiBearerAuth()
@Roles(Rol.ADMIN)
@Controller('aulas')
export class AulasController {
  constructor(private readonly servicio: AulasService) {}

  @Get()
  @ApiOperation({ summary: 'Lista paginada de aulas' })
  listar(@Query() filtros: FiltrosAulasDto) {
    return this.servicio.listar(filtros);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicio.obtener(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Crea un período; si llega activo, desactiva el anterior',
  })
  @ApiConflictResponse({ description: 'Dato único repetido.' })
  crear(
    @Body() datos: CrearAulaDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.servicio.crear(datos, actorDe(u, r));
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: ActualizarAulaDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.servicio.actualizar(id, datos, actorDe(u, r));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiConflictResponse({ description: 'El aula está en uso.' })
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    await this.servicio.eliminar(id, actorDe(u, r));
  }
}
