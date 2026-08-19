import { ConfigService } from '@nestjs/config';

function parseMysqlUrl(url: string): Record<string, any> {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: parseInt(u.port || '3306', 10),
      username: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ''),
    };
  } catch {
    return {};
  }
}

export const databaseConfig = (config: ConfigService): any => {
  const mysqlUrl =
    config.get<string>('MYSQL_URL') ||
    config.get<string>('DATABASE_URL') ||
    config.get<string>('MYSQLURL');

  const fromUrl = mysqlUrl ? parseMysqlUrl(mysqlUrl) : {};

  return {
    type: 'mysql',
    host:     fromUrl.host     || config.get('DB_HOST',     'localhost'),
    port:     fromUrl.port     || parseInt(config.get('DB_PORT', '3306'), 10),
    username: fromUrl.username || config.get('DB_USER',     'cfup'),
    password: fromUrl.password || config.get('DB_PASSWORD', 'cfup_password'),
    database: fromUrl.database || config.get('DB_NAME',     'cfup'),
    autoLoadEntities: true,
    // Schema auto-sync. TypeORM's synchronize rewrites the live schema to match
    // the entities on every boot — convenient early on, but in production it can
    // silently ALTER or DROP columns and lose data as entities evolve. It is now
    // OFF by default and only enabled when DB_SYNCHRONIZE=true. On a brand-new
    // database, set DB_SYNCHRONIZE=true for the first boot to create the tables,
    // then unset it. (An existing database already has its tables, so leaving it
    // off is safe and is the correct production setting.)
    synchronize: config.get('DB_SYNCHRONIZE', 'false') === 'true',
    logging: false,
    charset: 'utf8mb4',
    timezone: 'Z',
    // Without this, MySQL DATE()/DATETIME results come back as native JS
    // Date objects rather than plain 'YYYY-MM-DD' strings. That silently
    // breaks every chart that zero-fills a date range by matching DB rows
    // against generated string keys (a Date object never strictly-equals
    // a string, so every lookup falls through to its default of 0 even
    // when real matching data exists) — this was the root cause of charts
    // like "Daily uploads" appearing completely flat despite real
    // activity, and of X-axis labels showing full ISO timestamps like
    // "2026-07-16T00:00:00.000Z" instead of a clean date.
    dateStrings: true,
    retryAttempts: 20,
    retryDelay: 3000,
    extra: { connectionLimit: 10, connectTimeout: 30000 },
  };
};
