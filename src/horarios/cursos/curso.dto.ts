import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginacionDto } from '../../compartido/paginacion.js';

const limpiar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CrearCursoDto {
  @ApiProperty({ example: 'Inglés A1 intensivo' })
  @Transform(limpiar)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'nivelIdiomaId debe ser un identificador válido.' })
  nivelIdiomaId: string;

  @ApiProperty({ example: 4, description: 'Horas por semana (1 a 40).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(40)
  intensidadHoraria: number;
}

export class ActualizarCursoDto extends PartialType(CrearCursoDto) {}

export class FiltrosCursosDto extends PaginacionDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  nivelIdiomaId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @MaxLength(100)
  busqueda?: string;
}
