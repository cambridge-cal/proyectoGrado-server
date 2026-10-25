import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginacionDto } from '../../compartido/paginacion.js';

const limpiar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CrearPeriodoDto {
  @ApiProperty({ example: '2026-2' })
  @Transform(limpiar)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nombre: string;

  @ApiProperty({ example: '2026-07-27' })
  @IsDateString({}, { message: 'fechaInicio debe ser una fecha AAAA-MM-DD.' })
  fechaInicio: string;

  @ApiProperty({ example: '2026-12-11' })
  @IsDateString({}, { message: 'fechaFin debe ser una fecha AAAA-MM-DD.' })
  fechaFin: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Al activarlo se desactiva el período activo anterior.',
  })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class ActualizarPeriodoDto extends PartialType(CrearPeriodoDto) {}

export class FiltrosPeriodosDto extends PaginacionDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  activo?: boolean;
}
