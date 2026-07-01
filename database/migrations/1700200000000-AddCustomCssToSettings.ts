import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomCssToSettings1700200000000 implements MigrationInterface {
  name = 'AddCustomCssToSettings1700200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`merchant_settings\`
        ADD COLUMN IF NOT EXISTS \`custom_css\` TEXT NULL AFTER \`signed_url_expiry_seconds\`;
    `).catch(() => { /* column may already exist */ });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`merchant_settings\` DROP COLUMN IF EXISTS \`custom_css\`
    `).catch(() => {});
  }
}
