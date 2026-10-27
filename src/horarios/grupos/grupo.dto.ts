import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginacionDto } from '../../compartido/paginacion.js';
import { Jornada } from '../entidades/enums.js';

export class CrearGrupoDto {
  @ApiProperty({ example: 'ING-A1-01' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9-]{2,30}$/, {
    message: 'El código usa letras, números y guiones (2 a 30).',
  })
  codigo: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'cursoId debe ser un identificador válido.' })
  cursoId: string;

  @ApiProperty({ example: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  cupoMaximo: number;

  @ApiProperty({ enum: Jornada, enumName: 'Jornada' })
  @IsEnum(Jornada, { message: 'La jornada debe ser MAÑANA, TARDE o NOCHE.' })
  jornada: Jornada;
}

export class ActualizarGrupoDto extends PartialType(CrearGrupoDto) {}

export class FiltrosGruposDto extends PaginacionDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  cursoId?: string;

  @ApiPropertyOptional({ enum: Jornada, enumName: 'Jornada' })
  @IsOptional()
  @IsEnum(Jornada)
  jornada?: Jornada;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  busqueda?: string;
}
