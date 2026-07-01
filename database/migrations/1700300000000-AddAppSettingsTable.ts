import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppSettingsTable1700300000000 implements MigrationInterface {
  name = 'AddAppSettingsTable1700300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`app_settings\` (
        \`id\`                        CHAR(36)     NOT NULL DEFAULT (UUID()),
        \`app_name\`                  VARCHAR(255) NOT NULL DEFAULT 'Custom File Upload Pro',
        \`support_email\`             VARCHAR(255) NOT NULL DEFAULT 'support@yourapp.com',
        \`max_free_storage_gb\`       INT          NOT NULL DEFAULT 1,
        \`default_trial_days\`        INT          NOT NULL DEFAULT 14,
        \`maintenance_mode\`          TINYINT(1)   NOT NULL DEFAULT 0,
        \`allow_new_registrations\`   TINYINT(1)   NOT NULL DEFAULT 1,
        \`created_at\`                DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`                DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                        ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Seed the single settings row if the table is empty.
    const existing = await queryRunner.query('SELECT id FROM `app_settings` LIMIT 1');
    if (!existing.length) {
      await queryRunner.query('INSERT INTO `app_settings` () VALUES ()');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `app_settings`');
  }
}
