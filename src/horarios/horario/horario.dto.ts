import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { PaginacionDto } from '../../compartido/paginacion.js';
import { TipoAula } from '../entidades/enums.js';

/** Solicitud de generación (RF-17) con restricciones voluntarias (RF-19). */
export class GenerarHorarioDto {
  @ApiPropertyOptional({
    description: 'Período del horario. Si se omite, se usa el período activo.',
  })
  @IsOptional()
  @IsUUID()
  periodoId?: string;

  @ApiPropertyOptional({
    enum: TipoAula,
    isArray: true,
    description: 'Tipos de aula que no se usarán en esta generación (RF-19).',
    example: [TipoAula.VIRTUAL],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(2, { message: 'Debe quedar al menos un tipo de aula.' })
  @IsEnum(TipoAula, { each: true })
  tiposAulaExcluidos?: TipoAula[];
}

/** Filtros del listado de horarios (RF-20). */
export class FiltrosHorariosDto extends PaginacionDto {
  @ApiPropertyOptional({
    type: Boolean,
    description: 'true: historial archivado; false: horarios activos.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  archivado?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  periodoId?: string;
}

/** Período sobre el que se archiva o se borra el historial (RF-22, RF-23). */
export class PeriodoHorariosDto {
  @ApiPropertyOptional({
    description: 'Si se omite, se usa el período activo.',
  })
  @IsOptional()
  @IsUUID()
  periodoId?: string;
}
