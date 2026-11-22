import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Franjas por bloques de varios días y modalidad intensiva o regular por grupo, a partir de
 * los horarios de Cambridge Academy of Languages (RF-12, RF-14).
 *
 * La columna dia_semana pasa a ser la lista dias. Las franjas que ya existen se conservan
 * como franjas de un solo día; por eso no se usa la migración que genera TypeORM, que borra
 * la columna y crea otra vacía.
 */
export class FranjasPorBloques1794900000000 implements MigrationInterface {
  name = 'FranjasPorBloques1794900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "franja_horaria"
      ADD "dias" "public"."dia_semana" array
    `);
    await queryRunner.query(`
      UPDATE "franja_horaria" SET "dias" = ARRAY["dia_semana"]
    `);
    await queryRunner.query(`
      ALTER TABLE "franja_horaria" ALTER COLUMN "dias" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "franja_horaria" DROP CONSTRAINT "UQ_franja_dia_bloque"
    `);
    await queryRunner.query(`
      ALTER TABLE "franja_horaria" DROP COLUMN "dia_semana"
    `);
    await queryRunner.query(`
      ALTER TABLE "franja_horaria"
      ADD CONSTRAINT "CHK_043a34952935186f435e2a6fa1" CHECK (cardinality(dias) > 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "grupo" ADD "intensidad_horaria" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "grupo"
      ADD CONSTRAINT "CHK_dbaf5cb90914f7aa30892617f6"
      CHECK (intensidad_horaria IS NULL OR intensidad_horaria > 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "grupo" DROP CONSTRAINT "CHK_dbaf5cb90914f7aa30892617f6"
    `);
    await queryRunner.query(`
      ALTER TABLE "grupo" DROP COLUMN "intensidad_horaria"
    `);
    await queryRunner.query(`
      ALTER TABLE "franja_horaria" DROP CONSTRAINT "CHK_043a34952935186f435e2a6fa1"
    `);
    // Una franja de varios días se divide en una por día, numeradas en orden por día.
    await queryRunner.query(`
      ALTER TABLE "franja_horaria" ADD "dia_semana" "public"."dia_semana"
    `);
    await queryRunner.query(`
      INSERT INTO "franja_horaria" ("dias", "dia_semana", "hora_inicio", "hora_fin", "bloque")
      SELECT ARRAY[d], d, "hora_inicio", "hora_fin", "bloque"
      FROM "franja_horaria", unnest("dias"[2:]) AS d
      WHERE cardinality("dias") > 1
    `);
    await queryRunner.query(`
      UPDATE "franja_horaria" SET "dia_semana" = "dias"[1] WHERE "dia_semana" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "franja_horaria" f SET "bloque" = n.orden
      FROM (
        SELECT "id", row_number() OVER (
          PARTITION BY "dia_semana" ORDER BY "hora_inicio"
        ) AS orden
        FROM "franja_horaria"
      ) n
      WHERE f."id" = n."id"
    `);
    await queryRunner.query(`
      ALTER TABLE "franja_horaria" ALTER COLUMN "dia_semana" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "franja_horaria" DROP COLUMN "dias"
    `);
    await queryRunner.query(`
      ALTER TABLE "franja_horaria"
      ADD CONSTRAINT "UQ_franja_dia_bloque" UNIQUE ("dia_semana", "bloque")
    `);
  }
}
