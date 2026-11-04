import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginacionDto } from '../../compartido/paginacion.js';
import { EstadoEvaluacion } from '../entidades/estado-evaluacion.enum.js';

const limpiar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AsignarEvaluacionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'formularioId debe ser un identificador válido.' })
  formularioId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'docenteId debe ser un identificador válido.' })
  docenteId: string;
}

export class AsignacionMasivaDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'formularioId debe ser un identificador válido.' })
  formularioId: string;

  @ApiProperty({ type: [String], description: 'IDs de los docentes a evaluar.' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true, message: 'Cada docenteId debe ser un identificador válido.' })
  docenteIds: string[];
}

export class FiltrosEvaluacionesDto extends PaginacionDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  formularioId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  docenteId?: string;

  @ApiPropertyOptional({ enum: EstadoEvaluacion })
  @IsOptional()
  @IsEnum(EstadoEvaluacion)
  estado?: EstadoEvaluacion;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @MaxLength(100)
  busqueda?: string;
}

export class CambiarEstadoDto {
  @ApiProperty({ enum: EstadoEvaluacion })
  @IsEnum(EstadoEvaluacion)
  estado: EstadoEvaluacion;
}
