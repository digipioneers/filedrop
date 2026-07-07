import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerPositioningToUploadFields1700600000000 implements MigrationInterface {
  name = 'AddCustomerPositioningToUploadFields1700600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Upgrades the fixed-placement preview (merchant sets one static overlay
    // rect) into an interactive designer: when true, the customer can drag,
    // resize, and rotate their uploaded image on the mockup, and add their
    // own text on top — matching the level of customizer the client pointed
    // to (jinglewear.com.au's "Customize Jumper" tool: image + text,
    // customer-positioned).
    await queryRunner.query(`
      ALTER TABLE \`upload_fields\`
        ADD COLUMN \`allow_customer_positioning\` TINYINT(1) NOT NULL DEFAULT 0 AFTER \`preview_placement\`,
        ADD COLUMN \`allow_customer_text\` TINYINT(1) NOT NULL DEFAULT 0 AFTER \`allow_customer_positioning\`;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`upload_fields\`
        DROP COLUMN \`allow_customer_positioning\`,
        DROP COLUMN \`allow_customer_text\`;
    `);
  }
}
