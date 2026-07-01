import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Plans
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`plans\` (
        \`id\`                  VARCHAR(36)     NOT NULL DEFAULT (UUID()),
        \`name\`                ENUM('free','starter','pro') NOT NULL,
        \`display_name\`        VARCHAR(100)    NOT NULL,
        \`monthly_price\`       DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
        \`uploads_per_month\`   INT             NOT NULL DEFAULT 100,
        \`storage_bytes\`       BIGINT UNSIGNED NOT NULL,
        \`max_file_size_bytes\` BIGINT UNSIGNED NOT NULL,
        \`features\`            JSON            NOT NULL,
        \`is_active\`           TINYINT(1)      NOT NULL DEFAULT 1,
        \`sort_order\`          INT             NOT NULL DEFAULT 0,
        \`created_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_plans_name\` (\`name\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Merchants
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`merchants\` (
        \`id\`                  VARCHAR(36)     NOT NULL DEFAULT (UUID()),
        \`shop_domain\`         VARCHAR(255)    NOT NULL,
        \`access_token\`        VARCHAR(500)    NOT NULL,
        \`shop_name\`           VARCHAR(255)    NULL,
        \`shop_email\`          VARCHAR(255)    NULL,
        \`shop_currency\`       VARCHAR(10)     NULL DEFAULT 'USD',
        \`shop_timezone\`       VARCHAR(100)    NULL DEFAULT 'UTC',
        \`language\`            VARCHAR(10)     NOT NULL DEFAULT 'en',
        \`storage_used_bytes\`  BIGINT UNSIGNED NOT NULL DEFAULT 0,
        \`total_uploads\`       INT UNSIGNED    NOT NULL DEFAULT 0,
        \`monthly_uploads\`     INT UNSIGNED    NOT NULL DEFAULT 0,
        \`is_active\`           TINYINT(1)      NOT NULL DEFAULT 1,
        \`installed_at\`        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`uninstalled_at\`      DATETIME(3)     NULL,
        \`created_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_merchants_shop_domain\` (\`shop_domain\`),
        KEY \`idx_merchants_is_active\` (\`is_active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Subscriptions
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`subscriptions\` (
        \`id\`                    VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        \`merchant_id\`           VARCHAR(36)   NOT NULL,
        \`plan_id\`               VARCHAR(36)   NOT NULL,
        \`status\`                ENUM('active','pending','cancelled','expired','trial') NOT NULL DEFAULT 'trial',
        \`shopify_charge_id\`     VARCHAR(255)  NULL,
        \`shopify_charge_status\` VARCHAR(100)  NULL,
        \`trial_starts_at\`       DATETIME(3)   NULL,
        \`trial_ends_at\`         DATETIME(3)   NULL,
        \`current_period_start\`  DATETIME(3)   NULL,
        \`current_period_end\`    DATETIME(3)   NULL,
        \`cancel_at_period_end\`  TINYINT(1)    NOT NULL DEFAULT 0,
        \`cancelled_at\`          DATETIME(3)   NULL,
        \`created_at\`            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_subscriptions_merchant_id\` (\`merchant_id\`),
        KEY \`idx_subscriptions_status\` (\`status\`),
        CONSTRAINT \`fk_subscriptions_merchant\` FOREIGN KEY (\`merchant_id\`) REFERENCES \`merchants\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_subscriptions_plan\` FOREIGN KEY (\`plan_id\`) REFERENCES \`plans\` (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Merchant Settings
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`merchant_settings\` (
        \`id\`                        VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        \`merchant_id\`               VARCHAR(36)   NOT NULL,
        \`button_color\`              VARCHAR(20)   NOT NULL DEFAULT '#008060',
        \`button_text\`               VARCHAR(100)  NOT NULL DEFAULT 'Upload File',
        \`button_border_radius\`      INT           NOT NULL DEFAULT 4,
        \`language\`                  VARCHAR(10)   NOT NULL DEFAULT 'en',
        \`custom_messages\`           JSON          NOT NULL,
        \`notify_merchant_on_upload\` TINYINT(1)    NOT NULL DEFAULT 1,
        \`notification_email\`        VARCHAR(255)  NULL,
        \`notify_customer_on_upload\` TINYINT(1)    NOT NULL DEFAULT 0,
        \`signed_url_expiry_seconds\` INT           NOT NULL DEFAULT 3600,
        \`created_at\`                DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`                DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_merchant_settings_merchant_id\` (\`merchant_id\`),
        CONSTRAINT \`fk_merchant_settings_merchant\` FOREIGN KEY (\`merchant_id\`) REFERENCES \`merchants\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Upload Fields
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`upload_fields\` (
        \`id\`                    VARCHAR(36)   NOT NULL DEFAULT (UUID()),
        \`merchant_id\`           VARCHAR(36)   NOT NULL,
        \`field_type\`            ENUM('image','pdf','video','zip','document','custom') NOT NULL DEFAULT 'image',
        \`assignment_type\`       ENUM('product','variant','collection','tag','store') NOT NULL DEFAULT 'store',
        \`assignment_ids\`        JSON          NOT NULL,
        \`label\`                 VARCHAR(255)  NOT NULL DEFAULT 'Upload File',
        \`description\`           TEXT          NULL,
        \`placeholder\`           VARCHAR(500)  NULL,
        \`help_text\`             VARCHAR(1000) NULL,
        \`is_required\`           TINYINT(1)    NOT NULL DEFAULT 0,
        \`button_text\`           VARCHAR(100)  NOT NULL DEFAULT 'Choose File',
        \`max_file_size_mb\`      DECIMAL(10,2) NOT NULL DEFAULT 10.00,
        \`min_file_size_mb\`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        \`max_files\`             INT           NOT NULL DEFAULT 1,
        \`allowed_extensions\`    JSON          NOT NULL,
        \`min_width\`             INT           NULL,
        \`max_width\`             INT           NULL,
        \`min_height\`            INT           NULL,
        \`max_height\`            INT           NULL,
        \`required_aspect_ratio\` VARCHAR(20)   NULL,
        \`min_resolution_dpi\`    INT           NULL,
        \`enable_cropping\`       TINYINT(1)    NOT NULL DEFAULT 0,
        \`enable_rotation\`       TINYINT(1)    NOT NULL DEFAULT 0,
        \`conditional_rules\`     JSON          NULL,
        \`is_active\`             TINYINT(1)    NOT NULL DEFAULT 1,
        \`sort_order\`            INT           NOT NULL DEFAULT 0,
        \`created_at\`            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_upload_fields_merchant_active\` (\`merchant_id\`, \`is_active\`),
        CONSTRAINT \`fk_upload_fields_merchant\` FOREIGN KEY (\`merchant_id\`) REFERENCES \`merchants\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Upload Rules
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`upload_rules\` (
        \`id\`              VARCHAR(36) NOT NULL DEFAULT (UUID()),
        \`upload_field_id\` VARCHAR(36) NOT NULL,
        \`merchant_id\`     VARCHAR(36) NOT NULL,
        \`condition\`       ENUM('product_tag','variant_title','product_id','collection_id','customer_tag') NOT NULL,
        \`operator\`        ENUM('equals','not_equals','contains','not_contains') NOT NULL DEFAULT 'equals',
        \`value\`           VARCHAR(500) NOT NULL,
        \`action\`          ENUM('show','hide','require') NOT NULL DEFAULT 'show',
        \`sort_order\`      INT          NOT NULL DEFAULT 0,
        \`created_at\`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_upload_rules_field_id\` (\`upload_field_id\`),
        CONSTRAINT \`fk_upload_rules_field\` FOREIGN KEY (\`upload_field_id\`) REFERENCES \`upload_fields\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_upload_rules_merchant\` FOREIGN KEY (\`merchant_id\`) REFERENCES \`merchants\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Uploads
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`uploads\` (
        \`id\`                  VARCHAR(36)     NOT NULL DEFAULT (UUID()),
        \`merchant_id\`         VARCHAR(36)     NOT NULL,
        \`upload_field_id\`     VARCHAR(36)     NULL,
        \`original_file_name\`  VARCHAR(500)    NOT NULL,
        \`sanitized_file_name\` VARCHAR(500)    NOT NULL,
        \`s3_key\`              VARCHAR(1000)   NOT NULL,
        \`s3_bucket\`           VARCHAR(255)    NOT NULL,
        \`mime_type\`           VARCHAR(255)    NOT NULL,
        \`file_extension\`      VARCHAR(50)     NOT NULL,
        \`file_size_bytes\`     BIGINT UNSIGNED NOT NULL,
        \`image_width\`         INT             NULL,
        \`image_height\`        INT             NULL,
        \`status\`              ENUM('pending','scanning','clean','infected','failed') NOT NULL DEFAULT 'pending',
        \`virus_scan_result\`   VARCHAR(500)    NULL,
        \`cart_token\`          VARCHAR(500)    NULL,
        \`order_id\`            VARCHAR(255)    NULL,
        \`shopify_order_id\`    VARCHAR(255)    NULL,
        \`line_item_id\`        VARCHAR(255)    NULL,
        \`product_id\`          VARCHAR(255)    NULL,
        \`variant_id\`          VARCHAR(255)    NULL,
        \`customer_email\`      VARCHAR(255)    NULL,
        \`customer_id\`         VARCHAR(255)    NULL,
        \`download_count\`      INT UNSIGNED    NOT NULL DEFAULT 0,
        \`deleted_at\`          DATETIME(3)     NULL,
        \`created_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`idx_uploads_merchant_order\` (\`merchant_id\`, \`order_id\`),
        KEY \`idx_uploads_merchant_status\` (\`merchant_id\`, \`status\`),
        KEY \`idx_uploads_merchant_created\` (\`merchant_id\`, \`created_at\`),
        KEY \`idx_uploads_cart_token\` (\`cart_token\`),
        CONSTRAINT \`fk_uploads_merchant\` FOREIGN KEY (\`merchant_id\`) REFERENCES \`merchants\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_uploads_field\` FOREIGN KEY (\`upload_field_id\`) REFERENCES \`upload_fields\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`uploads\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`upload_rules\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`upload_fields\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`merchant_settings\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`subscriptions\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`merchants\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`plans\``);
  }
}
