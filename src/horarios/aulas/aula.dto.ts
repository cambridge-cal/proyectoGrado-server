import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PaginacionDto } from '../../compartido/paginacion.js';
import { TipoAula } from '../entidades/enums.js';

const aBooleano = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class CrearAulaDto {
  @ApiProperty({ example: 'A101' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9-]{1,30}$/, {
    message: 'El código usa letras, números y guiones.',
  })
  codigo: string;

  @ApiProperty({ example: 25 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  capacidad: number;

  @ApiProperty({ enum: TipoAula, enumName: 'TipoAula' })
  @IsEnum(TipoAula, { message: 'El tipo debe ser SALON, LAB o VIRTUAL.' })
  tipo: TipoAula;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

export class ActualizarAulaDto extends PartialType(CrearAulaDto) {}

export class FiltrosAulasDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: TipoAula, enumName: 'TipoAula' })
  @IsOptional()
  @IsEnum(TipoAula)
  tipo?: TipoAula;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  activa?: boolean;
}
