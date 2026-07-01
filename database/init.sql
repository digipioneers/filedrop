-- ============================================
-- Custom File Upload Pro — Database Init
-- MySQL 8.0
-- ============================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET foreign_key_checks = 0;
SET sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO';

-- ============================================
-- PLANS
-- ============================================
CREATE TABLE IF NOT EXISTS `plans` (
  `id`                  VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  `name`                ENUM('free','starter','pro') NOT NULL,
  `display_name`        VARCHAR(100)    NOT NULL,
  `monthly_price`       DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  `uploads_per_month`   INT             NOT NULL DEFAULT 100 COMMENT '-1 = unlimited',
  `storage_bytes`       BIGINT UNSIGNED NOT NULL,
  `max_file_size_bytes` BIGINT UNSIGNED NOT NULL,
  `features`            JSON            NOT NULL DEFAULT (JSON_OBJECT()),
  `is_active`           TINYINT(1)      NOT NULL DEFAULT 1,
  `sort_order`          INT             NOT NULL DEFAULT 0,
  `created_at`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_plans_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- MERCHANTS
-- ============================================
CREATE TABLE IF NOT EXISTS `merchants` (
  `id`                  VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  `shop_domain`         VARCHAR(255)    NOT NULL,
  `access_token`        VARCHAR(500)    NOT NULL,
  `shop_name`           VARCHAR(255)    NULL,
  `shop_email`          VARCHAR(255)    NULL,
  `shop_currency`       VARCHAR(10)     NULL DEFAULT 'USD',
  `shop_timezone`       VARCHAR(100)    NULL DEFAULT 'UTC',
  `language`            VARCHAR(10)     NOT NULL DEFAULT 'en',
  `storage_used_bytes`  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `total_uploads`       INT UNSIGNED    NOT NULL DEFAULT 0,
  `monthly_uploads`     INT UNSIGNED    NOT NULL DEFAULT 0,
  `is_active`           TINYINT(1)      NOT NULL DEFAULT 1,
  `installed_at`        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `uninstalled_at`      DATETIME(3)     NULL,
  `created_at`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_merchants_shop_domain` (`shop_domain`),
  KEY `idx_merchants_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- SUBSCRIPTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id`                    VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  `merchant_id`           VARCHAR(36)   NOT NULL,
  `plan_id`               VARCHAR(36)   NOT NULL,
  `status`                ENUM('active','pending','cancelled','expired','trial') NOT NULL DEFAULT 'trial',
  `shopify_charge_id`     VARCHAR(255)  NULL,
  `shopify_charge_status` VARCHAR(100)  NULL,
  `trial_starts_at`       DATETIME(3)   NULL,
  `trial_ends_at`         DATETIME(3)   NULL,
  `current_period_start`  DATETIME(3)   NULL,
  `current_period_end`    DATETIME(3)   NULL,
  `cancel_at_period_end`  TINYINT(1)    NOT NULL DEFAULT 0,
  `cancelled_at`          DATETIME(3)   NULL,
  `created_at`            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_subscriptions_merchant_id` (`merchant_id`),
  KEY `idx_subscriptions_status` (`status`),
  KEY `idx_subscriptions_shopify_charge_id` (`shopify_charge_id`),
  CONSTRAINT `fk_subscriptions_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_subscriptions_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- MERCHANT SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS `merchant_settings` (
  `id`                        VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  `merchant_id`               VARCHAR(36)   NOT NULL,
  `button_color`              VARCHAR(20)   NOT NULL DEFAULT '#008060',
  `button_text`               VARCHAR(100)  NOT NULL DEFAULT 'Upload File',
  `button_border_radius`      INT           NOT NULL DEFAULT 4,
  `language`                  VARCHAR(10)   NOT NULL DEFAULT 'en',
  `custom_messages`           JSON          NOT NULL DEFAULT (JSON_OBJECT()),
  `notify_merchant_on_upload` TINYINT(1)    NOT NULL DEFAULT 1,
  `notification_email`        VARCHAR(255)  NULL,
  `notify_customer_on_upload` TINYINT(1)    NOT NULL DEFAULT 0,
  `signed_url_expiry_seconds` INT           NOT NULL DEFAULT 3600,
  `custom_css`                TEXT          NULL,
  `created_at`                DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`                DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_merchant_settings_merchant_id` (`merchant_id`),
  CONSTRAINT `fk_merchant_settings_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- UPLOAD FIELDS
-- ============================================
CREATE TABLE IF NOT EXISTS `upload_fields` (
  `id`                    VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  `merchant_id`           VARCHAR(36)   NOT NULL,
  `field_type`            ENUM('image','pdf','video','zip','document','custom') NOT NULL DEFAULT 'image',
  `assignment_type`       ENUM('product','variant','collection','tag','store') NOT NULL DEFAULT 'store',
  `assignment_ids`        JSON          NOT NULL DEFAULT (JSON_ARRAY()),
  `label`                 VARCHAR(255)  NOT NULL DEFAULT 'Upload File',
  `description`           TEXT          NULL,
  `placeholder`           VARCHAR(500)  NULL,
  `help_text`             VARCHAR(1000) NULL,
  `is_required`           TINYINT(1)    NOT NULL DEFAULT 0,
  `button_text`           VARCHAR(100)  NOT NULL DEFAULT 'Choose File',
  `max_file_size_mb`      DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  `min_file_size_mb`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `max_files`             INT           NOT NULL DEFAULT 1,
  `allowed_extensions`    JSON          NOT NULL DEFAULT (JSON_ARRAY()),
  `min_width`             INT           NULL,
  `max_width`             INT           NULL,
  `min_height`            INT           NULL,
  `max_height`            INT           NULL,
  `required_aspect_ratio` VARCHAR(20)   NULL COMMENT 'e.g. 16:9',
  `min_resolution_dpi`    INT           NULL,
  `enable_cropping`       TINYINT(1)    NOT NULL DEFAULT 0,
  `enable_rotation`       TINYINT(1)    NOT NULL DEFAULT 0,
  `conditional_rules`     JSON          NULL,
  `is_active`             TINYINT(1)    NOT NULL DEFAULT 1,
  `sort_order`            INT           NOT NULL DEFAULT 0,
  `created_at`            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_upload_fields_merchant_active` (`merchant_id`, `is_active`),
  KEY `idx_upload_fields_assignment` (`assignment_type`),
  CONSTRAINT `fk_upload_fields_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- UPLOAD RULES
-- ============================================
CREATE TABLE IF NOT EXISTS `upload_rules` (
  `id`              VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `upload_field_id` VARCHAR(36) NOT NULL,
  `merchant_id`     VARCHAR(36) NOT NULL,
  `condition`       ENUM('product_tag','variant_title','product_id','collection_id','customer_tag') NOT NULL,
  `operator`        ENUM('equals','not_equals','contains','not_contains') NOT NULL DEFAULT 'equals',
  `value`           VARCHAR(500) NOT NULL,
  `action`          ENUM('show','hide','require') NOT NULL DEFAULT 'show',
  `sort_order`      INT          NOT NULL DEFAULT 0,
  `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_upload_rules_field_id` (`upload_field_id`),
  KEY `idx_upload_rules_merchant_id` (`merchant_id`),
  CONSTRAINT `fk_upload_rules_field` FOREIGN KEY (`upload_field_id`) REFERENCES `upload_fields` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_upload_rules_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- UPLOADS
-- ============================================
CREATE TABLE IF NOT EXISTS `uploads` (
  `id`                  VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  `merchant_id`         VARCHAR(36)   NOT NULL,
  `upload_field_id`     VARCHAR(36)   NULL,
  `original_file_name`  VARCHAR(500)  NOT NULL,
  `sanitized_file_name` VARCHAR(500)  NOT NULL,
  `s3_key`              VARCHAR(1000) NOT NULL,
  `s3_bucket`           VARCHAR(255)  NOT NULL,
  `mime_type`           VARCHAR(255)  NOT NULL,
  `file_extension`      VARCHAR(50)   NOT NULL,
  `file_size_bytes`     BIGINT UNSIGNED NOT NULL,
  `image_width`         INT           NULL,
  `image_height`        INT           NULL,
  `status`              ENUM('pending','scanning','clean','infected','failed') NOT NULL DEFAULT 'pending',
  `virus_scan_result`   VARCHAR(500)  NULL,
  `cart_token`          VARCHAR(500)  NULL,
  `order_id`            VARCHAR(255)  NULL,
  `shopify_order_id`    VARCHAR(255)  NULL,
  `line_item_id`        VARCHAR(255)  NULL,
  `product_id`          VARCHAR(255)  NULL,
  `variant_id`          VARCHAR(255)  NULL,
  `customer_email`      VARCHAR(255)  NULL,
  `customer_id`         VARCHAR(255)  NULL,
  `download_count`      INT UNSIGNED  NOT NULL DEFAULT 0,
  `deleted_at`          DATETIME(3)   NULL,
  `created_at`          DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`          DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_uploads_merchant_order` (`merchant_id`, `order_id`),
  KEY `idx_uploads_merchant_status` (`merchant_id`, `status`),
  KEY `idx_uploads_merchant_created` (`merchant_id`, `created_at`),
  KEY `idx_uploads_cart_token` (`cart_token`),
  KEY `idx_uploads_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_uploads_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_uploads_field` FOREIGN KEY (`upload_field_id`) REFERENCES `upload_fields` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- SEED DATA: PLANS
-- ============================================
INSERT IGNORE INTO `plans` (`id`, `name`, `display_name`, `monthly_price`, `uploads_per_month`, `storage_bytes`, `max_file_size_bytes`, `features`, `sort_order`) VALUES
(UUID(), 'free',    'Free',    0.00,  100,   1073741824,    10485760,    '{"imageEditor":false,"conditionalLogic":false,"multipleFiles":true,"emailNotifications":false,"customBranding":false,"prioritySupport":false,"apiAccess":false}', 1),
(UUID(), 'starter', 'Starter', 9.99,  1000,  10737418240,   104857600,   '{"imageEditor":true,"conditionalLogic":true,"multipleFiles":true,"emailNotifications":true,"customBranding":false,"prioritySupport":false,"apiAccess":false}', 2),
(UUID(), 'pro',     'Pro',     29.99, -1,    107374182400,  2147483648,  '{"imageEditor":true,"conditionalLogic":true,"multipleFiles":true,"emailNotifications":true,"customBranding":true,"prioritySupport":true,"apiAccess":true}', 3);

-- Re-enable foreign key checks
SET foreign_key_checks = 1;

-- ─── Products (Shopify sync cache) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id                   CHAR(36)     NOT NULL DEFAULT (UUID()),
  merchant_id          CHAR(36)     NOT NULL,
  shopify_product_id   VARCHAR(255) NOT NULL,
  title                VARCHAR(500) NOT NULL,
  handle               VARCHAR(255),
  product_type         VARCHAR(255),
  tags                 JSON,
  variants             JSON,
  collections          JSON,
  image_url            VARCHAR(1000),
  is_active            TINYINT(1)   NOT NULL DEFAULT 1,
  created_at           DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at           DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_merchant_product (merchant_id, shopify_product_id),
  INDEX idx_products_merchant (merchant_id),
  INDEX idx_products_title (merchant_id, title(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Notifications ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id           CHAR(36)                                          NOT NULL DEFAULT (UUID()),
  merchant_id  CHAR(36)                                         NOT NULL,
  type         ENUM('upload','security','billing','system')     NOT NULL,
  title        VARCHAR(255)                                     NOT NULL,
  message      TEXT                                             NOT NULL,
  metadata     JSON,
  status       ENUM('unread','read')                            NOT NULL DEFAULT 'unread',
  read_at      DATETIME,
  created_at   DATETIME(6)                                      NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  INDEX idx_notifications_merchant_status (merchant_id, status),
  INDEX idx_notifications_created (merchant_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── App Settings (global, super-admin singleton) ────────────────────────────

CREATE TABLE IF NOT EXISTS app_settings (
  id                       CHAR(36)     NOT NULL DEFAULT (UUID()),
  app_name                 VARCHAR(255) NOT NULL DEFAULT 'Custom File Upload Pro',
  support_email            VARCHAR(255) NOT NULL DEFAULT 'support@yourapp.com',
  max_free_storage_gb      INT          NOT NULL DEFAULT 1,
  default_trial_days       INT          NOT NULL DEFAULT 14,
  maintenance_mode         TINYINT(1)   NOT NULL DEFAULT 0,
  allow_new_registrations  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at               DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at               DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                             ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO app_settings (id)
SELECT UUID() WHERE NOT EXISTS (SELECT 1 FROM app_settings);
