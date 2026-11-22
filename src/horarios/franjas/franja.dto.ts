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
  @ApiProperty({
    enum: DiaSemana,
    enumName: 'DiaSemana',
    isArray: true,
    example: ['MAR', 'MIE', 'JUE'],
    description:
      'Días en que se repite la franja con la misma hora, por ejemplo martes a jueves.',
  })
  @IsArray({ message: 'Indica los días de la franja.' })
  @ArrayMinSize(1, { message: 'La franja necesita al menos un día.' })
  @ArrayUnique({ message: 'Hay días repetidos en la franja.' })
  @IsEnum(DiaSemana, {
    each: true,
    message: 'Cada día debe ser LUN, MAR, MIE, JUE, VIE o SAB.',
  })
  dias: DiaSemana[];

  @ApiProperty({ example: '08:00' })
  @Matches(HORA, { message: MENSAJE_HORA })
  horaInicio: string;

  @ApiProperty({ example: '10:00' })
  @Matches(HORA, { message: MENSAJE_HORA })
  horaFin: string;

  @ApiProperty({
    example: 1,
    description: 'Número para ordenar la franja en las vistas.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  bloque: number;
}

export class ActualizarFranjaDto extends PartialType(CrearFranjaDto) {}

export class FiltrosFranjasDto extends PaginacionDto {
  @ApiPropertyOptional({
    enum: DiaSemana,
    enumName: 'DiaSemana',
    description: 'Solo las franjas que incluyen este día.',
  })
  @IsOptional()
  @IsEnum(DiaSemana)
  dia?: DiaSemana;
}

/** Crea de una vez franjas de un solo día, de la misma duración, para varios días. */
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
