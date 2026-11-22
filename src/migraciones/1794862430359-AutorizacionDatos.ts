import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Autorización de tratamiento de datos personales en el primer ingreso (TKT-043, Ley 1581 de 2012). */
export class AutorizacionDatos1794862430359 implements MigrationInterface {
  name = 'AutorizacionDatos1794862430359';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "usuario"
            ADD "autorizacion_datos_en" TIMESTAMP WITH TIME ZONE
        `);
    await queryRunner.query(`
            ALTER TABLE "usuario"
            ADD "version_aviso_privacidad" character varying(20)
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "usuario" DROP COLUMN "version_aviso_privacidad"
        `);
    await queryRunner.query(`
            ALTER TABLE "usuario" DROP COLUMN "autorizacion_datos_en"
        `);
  }
}
