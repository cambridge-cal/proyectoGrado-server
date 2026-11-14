import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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

export class RespuestaPreguntaDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'preguntaId debe ser un identificador válido.' })
  preguntaId: string;

  @ApiProperty({ example: 4, minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt({ message: 'Cada respuesta es un número entero de 1 a 5.' })
  @Min(1, { message: 'Cada respuesta es un número entero de 1 a 5.' })
  @Max(5, { message: 'Cada respuesta es un número entero de 1 a 5.' })
  valor: number;
}

/** RF-34 y RF-35: una respuesta por pregunta y un comentario anónimo opcional. */
export class ResponderEvaluacionDto {
  @ApiProperty({ type: [RespuestaPreguntaDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debes responder las preguntas del formulario.' })
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RespuestaPreguntaDto)
  respuestas: RespuestaPreguntaDto[];

  @ApiPropertyOptional({
    description: 'Comentario anónimo; si se escribe, mínimo 30 caracteres.',
  })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const limpio = value.trim();
    return limpio === '' ? undefined : limpio;
  })
  @IsOptional()
  @IsString()
  @MinLength(30, {
    message: 'El comentario debe tener al menos 30 caracteres.',
  })
  @MaxLength(1000, {
    message: 'El comentario puede tener máximo 1000 caracteres.',
  })
  comentario?: string;
}
