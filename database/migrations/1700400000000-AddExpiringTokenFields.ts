import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpiringTokenFields1700400000000 implements MigrationInterface {
  name = 'AddExpiringTokenFields1700400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Shopify requires public apps to use expiring offline access tokens
    // (mandatory since 2026-04-01 for new apps). Exchanging the OAuth code
    // now returns access_token + refresh_token + expires_in instead of a
    // permanent token, so we need somewhere to store the refresh token and
    // the access token's expiry so we can proactively refresh it.
    await queryRunner.query(`
      ALTER TABLE \`merchants\`
        ADD COLUMN \`refresh_token\` VARCHAR(500) NULL AFTER \`access_token\`,
        ADD COLUMN \`token_expires_at\` DATETIME(6) NULL AFTER \`refresh_token\`;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`merchants\`
        DROP COLUMN \`refresh_token\`,
        DROP COLUMN \`token_expires_at\`;
    `);
  }
}
