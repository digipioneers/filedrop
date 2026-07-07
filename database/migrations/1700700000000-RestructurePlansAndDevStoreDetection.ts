import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestructurePlansAndDevStoreDetection1700700000000 implements MigrationInterface {
  name = 'RestructurePlansAndDevStoreDetection1700700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Widen the plans.name enum to add the new 'advanced' tier. The existing
    // 'free' and 'starter' internal enum values are kept as-is (renaming them
    // would touch every PlanName.FREE/STARTER reference across auth, billing,
    // storefront, and the plan-limit guard) — only their display_name,
    // pricing, and features change. 'free' is now presented to merchants as
    // "Development" and 'starter' as "Basic".
    await queryRunner.query(`
      ALTER TABLE \`plans\`
        MODIFY COLUMN \`name\` ENUM('free', 'starter', 'pro', 'advanced') NOT NULL;
    `);

    // Lets the app detect Shopify development/test stores at install time,
    // so they can be auto-placed on the free "Development" tier and so
    // billing charges for them are automatically marked as test charges
    // (Shopify rejects real charges against dev stores regardless, but this
    // lets merchants actually test the Basic/Pro/Advanced upgrade flow).
    await queryRunner.query(`
      ALTER TABLE \`merchants\`
        ADD COLUMN \`shop_plan_name\` VARCHAR(100) NULL AFTER \`shop_currency\`,
        ADD COLUMN \`is_development_store\` TINYINT(1) NOT NULL DEFAULT 0 AFTER \`shop_plan_name\`;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`merchants\`
        DROP COLUMN \`shop_plan_name\`,
        DROP COLUMN \`is_development_store\`;
    `);
    await queryRunner.query(`
      ALTER TABLE \`plans\`
        MODIFY COLUMN \`name\` ENUM('free', 'starter', 'pro') NOT NULL;
    `);
  }
}
