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
  ActualizarFranjaDto,
  CrearFranjaDto,
  FiltrosFranjasDto,
  LoteFranjasDto,
} from './franja.dto.js';
import { FranjasService } from './franjas.service.js';

/** Franjas horarias (RF-14). El Docente puede consultarlas para registrar su disponibilidad (RF-16). */
@ApiTags('Configuración académica')
@ApiBearerAuth()
@Roles(Rol.ADMIN)
@Controller('franjas-horarias')
export class FranjasController {
  constructor(private readonly servicio: FranjasService) {}

  @Get()
  @Roles(Rol.ADMIN, Rol.DOCENTE)
  @ApiOperation({ summary: 'Lista paginada de franjas horarias' })
  listar(@Query() filtros: FiltrosFranjasDto) {
    return this.servicio.listar(filtros);
  }

  @Get(':id')
  @Roles(Rol.ADMIN, Rol.DOCENTE)
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicio.obtener(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Crea un período; si llega activo, desactiva el anterior',
  })
  @ApiConflictResponse({ description: 'Dato único repetido.' })
  crear(
    @Body() datos: CrearFranjaDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.servicio.crear(datos, actorDe(u, r));
  }

  @Post('lote')
  @ApiOperation({
    summary: 'Crea las franjas de varios días con una duración fija',
  })
  crearLote(
    @Body() datos: LoteFranjasDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.servicio.crearLote(datos, actorDe(u, r));
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: ActualizarFranjaDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.servicio.actualizar(id, datos, actorDe(u, r));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiConflictResponse({ description: 'La franja está en uso.' })
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    await this.servicio.eliminar(id, actorDe(u, r));
  }
}
