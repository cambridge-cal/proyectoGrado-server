import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Parámetros de paginación de los listados (RNF-29). */
export class PaginacionDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size: number = 20;
}

/** Respuesta paginada estándar (RNF-29). */
export interface Pagina<T> {
  datos: T[];
  total: number;
  page: number;
  size: number;
}

export function desplazamiento({ page, size }: PaginacionDto): {
  skip: number;
  take: number;
} {
  return { skip: (page - 1) * size, take: size };
}
