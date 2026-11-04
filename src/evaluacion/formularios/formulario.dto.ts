import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginacionDto } from '../../compartido/paginacion.js';

const limpiar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CrearPreguntaDto {
  @ApiProperty({ example: '¿El docente explica con claridad los temas?' })
  @Transform(limpiar)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  texto: string;

  @ApiProperty({ example: 1, description: 'Orden dentro de la dimensión.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  orden: number;
}

export class CrearDimensionDto {
  @ApiProperty({ example: 'Metodología' })
  @Transform(limpiar)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre: string;

  @ApiProperty({ example: 1, description: 'Orden dentro del formulario.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  orden: number;

  @ApiProperty({ type: [CrearPreguntaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrearPreguntaDto)
  preguntas: CrearPreguntaDto[];
}

export class CrearFormularioDto {
  @ApiProperty({ example: 'Evaluación docente 2026-II' })
  @Transform(limpiar)
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  nombre: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'periodoAcademicoId debe ser un identificador válido.' })
  periodoAcademicoId: string;

  @ApiProperty({ type: [CrearDimensionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrearDimensionDto)
  dimensiones: CrearDimensionDto[];
}

export class ActualizarFormularioDto extends PartialType(CrearFormularioDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class FiltrosFormulariosDto extends PaginacionDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  periodoAcademicoId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @MaxLength(100)
  busqueda?: string;
}
