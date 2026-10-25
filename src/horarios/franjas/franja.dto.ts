import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PaginacionDto } from '../../compartido/paginacion.js';
import { DiaSemana } from '../entidades/enums.js';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const MENSAJE_HORA = 'La hora debe tener el formato HH:mm (24 horas).';

export class CrearFranjaDto {
  @ApiProperty({ enum: DiaSemana, enumName: 'DiaSemana' })
  @IsEnum(DiaSemana, {
    message: 'El día debe ser LUN, MAR, MIE, JUE, VIE o SAB.',
  })
  diaSemana: DiaSemana;

  @ApiProperty({ example: '08:00' })
  @Matches(HORA, { message: MENSAJE_HORA })
  horaInicio: string;

  @ApiProperty({ example: '10:00' })
  @Matches(HORA, { message: MENSAJE_HORA })
  horaFin: string;

  @ApiProperty({ example: 1, description: 'Número del bloque dentro del día.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  bloque: number;
}

export class ActualizarFranjaDto extends PartialType(CrearFranjaDto) {}

export class FiltrosFranjasDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: DiaSemana, enumName: 'DiaSemana' })
  @IsOptional()
  @IsEnum(DiaSemana)
  diaSemana?: DiaSemana;
}

/** Crea de una vez las franjas de varios días con la misma duración. */
export class LoteFranjasDto {
  @ApiProperty({
    enum: DiaSemana,
    isArray: true,
    example: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(DiaSemana, { each: true })
  dias: DiaSemana[];

  @ApiProperty({ example: '07:00' })
  @Matches(HORA, { message: MENSAJE_HORA })
  desde: string;

  @ApiProperty({ example: '21:00' })
  @Matches(HORA, { message: MENSAJE_HORA })
  hasta: string;

  @ApiProperty({
    example: 120,
    description: 'Duración de cada franja en minutos.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(240)
  duracionMinutos: number;

  @ApiPropertyOptional({
    default: 1,
    description: 'Número del primer bloque de cada día.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  bloqueInicial?: number;
}
