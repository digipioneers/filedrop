import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductsAndNotifications1700100000000 implements MigrationInterface {
  name = 'AddProductsAndNotifications1700100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Products cache table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`products\` (
        \`id\`                 CHAR(36)     NOT NULL DEFAULT (UUID()),
        \`merchant_id\`        CHAR(36)     NOT NULL,
        \`shopify_product_id\` VARCHAR(255) NOT NULL,
        \`title\`              VARCHAR(500) NOT NULL,
        \`handle\`             VARCHAR(255),
        \`product_type\`       VARCHAR(255),
        \`tags\`               JSON,
        \`variants\`           JSON,
        \`collections\`        JSON,
        \`image_url\`          VARCHAR(1000),
        \`is_active\`          TINYINT(1)   NOT NULL DEFAULT 1,
        \`created_at\`         DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`         DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_merchant_product\` (\`merchant_id\`, \`shopify_product_id\`),
        INDEX \`idx_products_merchant\` (\`merchant_id\`),
        INDEX \`idx_products_title\` (\`merchant_id\`, \`title\`(100))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Notifications table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`notifications\` (
        \`id\`          CHAR(36)                                            NOT NULL DEFAULT (UUID()),
        \`merchant_id\` CHAR(36)                                            NOT NULL,
        \`type\`        ENUM('upload','security','billing','system')        NOT NULL,
        \`title\`       VARCHAR(255)                                        NOT NULL,
        \`message\`     TEXT                                                NOT NULL,
        \`metadata\`    JSON,
        \`status\`      ENUM('unread','read')                               NOT NULL DEFAULT 'unread',
        \`read_at\`     DATETIME,
        \`created_at\`  DATETIME(6)                                         NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_notifications_merchant_status\` (\`merchant_id\`, \`status\`),
        INDEX \`idx_notifications_created\` (\`merchant_id\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Add scanned_at column to uploads if missing
    await queryRunner.query(`
      ALTER TABLE \`uploads\`
        ADD COLUMN IF NOT EXISTS \`scanned_at\` DATETIME NULL AFTER \`scan_result\`;
    `).catch(() => { /* column may already exist */ });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `notifications`');
    await queryRunner.query('DROP TABLE IF EXISTS `products`');
    await queryRunner.query(`
      ALTER TABLE \`uploads\` DROP COLUMN IF EXISTS \`scanned_at\`
    `).catch(() => {});
  }
}
