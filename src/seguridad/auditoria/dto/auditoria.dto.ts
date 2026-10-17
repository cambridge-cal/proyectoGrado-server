import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginacionDto } from '../../../compartido/paginacion.js';
import { Rol } from '../../entidades/rol.enum.js';
import {
  MODULOS_AUDITORIA,
  type ModuloAuditoria,
} from '../auditoria.service.js';

/** Filtros de GET /audit-log (RF-08, RNF-29). */
export class FiltrosAuditoriaDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: MODULOS_AUDITORIA })
  @IsOptional()
  @IsIn(MODULOS_AUDITORIA)
  modulo?: ModuloAuditoria;

  @ApiPropertyOptional({ example: 'LOGIN' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(60)
  accion?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  usuarioId?: string;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'Desde esta fecha (incluida).',
  })
  @IsOptional()
  @IsDateString({}, { message: 'desde debe ser una fecha AAAA-MM-DD.' })
  desde?: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description: 'Hasta esta fecha (incluida).',
  })
  @IsOptional()
  @IsDateString({}, { message: 'hasta debe ser una fecha AAAA-MM-DD.' })
  hasta?: string;
}

export class UsuarioAuditadoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() nombre: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: Rol, enumName: 'Rol' }) rol: Rol;
}

export class RegistroAuditoriaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() fechaHora: Date;
  @ApiProperty({ enum: MODULOS_AUDITORIA }) modulo: string;
  @ApiProperty() accion: string;
  @ApiPropertyOptional({ nullable: true }) detalle: string | null;
  @ApiPropertyOptional({ nullable: true }) ip: string | null;
  @ApiProperty({ type: UsuarioAuditadoDto }) usuario: UsuarioAuditadoDto;
}

export class PaginaAuditoriaDto {
  @ApiProperty({ type: [RegistroAuditoriaDto] }) datos: RegistroAuditoriaDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() size: number;
}

export class OpcionesAuditoriaDto {
  @ApiProperty({ enum: MODULOS_AUDITORIA, isArray: true }) modulos: string[];
  @ApiProperty({
    type: [String],
    description: 'Acciones que ya aparecen en el registro.',
  })
  acciones: string[];
}
