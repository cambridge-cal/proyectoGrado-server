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
  ActualizarFormularioDto,
  CrearFormularioDto,
  FiltrosFormulariosDto,
} from './formulario.dto.js';
import { FormulariosService } from './formularios.service.js';

/** Formularios de evaluación docente (RF-28, RF-29, RF-30). Solo el Administrador. */
@ApiTags('Evaluación')
@ApiBearerAuth()
@Roles(Rol.ADMIN)
@Controller('formularios')
export class FormulariosController {
  constructor(private readonly servicio: FormulariosService) {}

  @Get()
  @ApiOperation({ summary: 'Lista paginada de formularios' })
  listar(@Query() filtros: FiltrosFormulariosDto) {
    return this.servicio.listar(filtros);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un formulario con dimensiones y preguntas' })
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicio.obtener(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear formulario con dimensiones y preguntas' })
  crear(
    @Body() datos: CrearFormularioDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.servicio.crear(datos, actorDe(u, r));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar formulario' })
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: ActualizarFormularioDto,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    return this.servicio.actualizar(id, datos, actorDe(u, r));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar formulario' })
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioActual() u: PayloadAccess,
    @Req() r: Request,
  ) {
    await this.servicio.eliminar(id, actorDe(u, r));
  }
}
