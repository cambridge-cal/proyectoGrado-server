import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean } from 'class-validator';

/** Aceptación expresa del aviso de privacidad (Ley 1581 de 2012, art. 9). */
export class AutorizarDatosDto {
  @ApiProperty({
    example: true,
    description: 'Debe ser true: la autorización es expresa.',
  })
  @IsBoolean()
  @Equals(true, {
    message:
      'Para usar el sistema debes autorizar el tratamiento de tus datos personales.',
  })
  acepta: boolean;
}
