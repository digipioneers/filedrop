#!/usr/bin/env node
/**
 * Filedrop — Interactive Setup Wizard
 * Run: node scripts/setup.js
 * Writes backend/.env with all required values. No AWS needed.
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, def = '') => new Promise(r => {
  rl.question(`${q}${def ? ` [${def}]` : ''}: `, a => r(a.trim() || def));
});
const choose = async (q, opts) => {
  console.log(`\n${q}`);
  opts.forEach((o, i) => console.log(`  ${i + 1}. ${o}`));
  const ans = await ask('Choose (number)', '1');
  return parseInt(ans) - 1;
};

async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   Filedrop — Setup Wizard          ║');
  console.log('║   No AWS required!                               ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
  console.log('You need:');
  console.log('  1. Shopify Partner account (partners.shopify.com) — FREE');
  console.log('  2. A server with Docker (or use the bundled MinIO)');
  console.log('  3. A domain name\n');

  // App
  console.log('━━━ App ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const appUrl = await ask('Your app URL (e.g. https://your-domain.com)');
  const domain = appUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Shopify
  console.log('\n━━━ Shopify ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Get API key from: partners.shopify.com → Apps → Your App → API credentials');
  const shopifyKey = await ask('Shopify API Key');
  const shopifySecret = await ask('Shopify API Secret');

  // Database
  console.log('\n━━━ Database ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const dbPass = await ask('DB Password (choose a strong password)');
  const dbRootPass = await ask('DB Root Password (different from above)');

  // JWT
  const jwtSecret = crypto.randomBytes(64).toString('hex');
  console.log('\n━━━ Security ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  JWT Secret auto-generated ✓`);

  // Storage
  const storageChoice = await choose(
    '━━━ File Storage (where uploaded files are saved) ━━━━',
    [
      'MinIO — self-hosted, bundled in Docker (FREE, recommended)',
      'Cloudflare R2 — FREE 10GB, no egress fees, no AWS',
      'AWS S3 — if you already have AWS',
    ]
  );

  let storageEnv = '';
  if (storageChoice === 0) {
    const minioPass = await ask('MinIO Password', 'cfup_minio_secret_' + crypto.randomBytes(4).toString('hex'));
    storageEnv = `STORAGE_PROVIDER=minio\nMINIO_ENDPOINT=http://minio:9000\nMINIO_ROOT_USER=cfup_minio\nMINIO_ROOT_PASSWORD=${minioPass}\nMINIO_BUCKET=cfup-uploads`;
  } else if (storageChoice === 1) {
    console.log('\n  → Get from: dash.cloudflare.com → R2 → Manage R2 API Tokens');
    const accountId = await ask('Cloudflare Account ID');
    const r2Key = await ask('R2 Access Key ID');
    const r2Secret = await ask('R2 Secret Access Key');
    const r2Bucket = await ask('R2 Bucket Name', 'cfup-uploads');
    storageEnv = `STORAGE_PROVIDER=r2\nR2_ACCOUNT_ID=${accountId}\nR2_ACCESS_KEY_ID=${r2Key}\nR2_SECRET_ACCESS_KEY=${r2Secret}\nR2_BUCKET=${r2Bucket}`;
  } else {
    const awsKey = await ask('AWS Access Key ID');
    const awsSecret = await ask('AWS Secret Access Key');
    const awsBucket = await ask('S3 Bucket Name', 'cfup-uploads-prod');
    const awsRegion = await ask('AWS Region', 'us-east-1');
    storageEnv = `STORAGE_PROVIDER=s3\nAWS_ACCESS_KEY_ID=${awsKey}\nAWS_SECRET_ACCESS_KEY=${awsSecret}\nAWS_S3_BUCKET=${awsBucket}\nAWS_REGION=${awsRegion}`;
  }

  // Email
  const emailChoice = await choose(
    '━━━ Email (for upload notifications) ━━━━━━━━━━━━━━━━',
    [
      'Resend (3,000 emails/month FREE) — https://resend.com',
      'Brevo (300 emails/day FREE) — https://brevo.com',
      'SendGrid (100 emails/day FREE) — https://sendgrid.com',
      'Gmail (personal use, 500/day)',
      'Skip for now (no email notifications)',
    ]
  );

  const emailConfigs = [
    { host: 'smtp.resend.com',      port: '465', userHint: 'resend',          passHint: 'API key from resend.com' },
    { host: 'smtp-relay.brevo.com', port: '587', userHint: 'your@email.com',  passHint: 'SMTP key from brevo.com account' },
    { host: 'smtp.sendgrid.net',    port: '587', userHint: 'apikey',          passHint: 'SG.your_sendgrid_key' },
    { host: 'smtp.gmail.com',       port: '587', userHint: 'your@gmail.com',  passHint: 'Gmail App Password (not your login password)' },
  ];

  let smtpEnv = '';
  const fromEmail = await ask('From email address', `noreply@${domain}`);
  if (emailChoice < 4) {
    const ec = emailConfigs[emailChoice];
    console.log(`  SMTP Host: ${ec.host} | Port: ${ec.port}`);
    const user = await ask(`  Username (${ec.userHint})`, ec.userHint);
    const pass = await ask(`  Password/Key (${ec.passHint})`);
    smtpEnv = `SMTP_HOST=${ec.host}\nSMTP_PORT=${ec.port}\nSMTP_USER=${user}\nSMTP_PASS=${pass}`;
  } else {
    smtpEnv = `SMTP_HOST=\nSMTP_PORT=587\nSMTP_USER=\nSMTP_PASS=`;
  }

  // Write .env.prod
  const env = `# Filedrop — Production Config
# Generated ${new Date().toISOString()}

NODE_ENV=production
PORT=3000
APP_URL=${appUrl}
APP_DOMAIN=${domain}

SHOPIFY_API_KEY=${shopifyKey}
SHOPIFY_API_SECRET=${shopifySecret}
SHOPIFY_SCOPES=read_products,write_products,read_orders,write_orders,read_customers,write_script_tags,read_themes,write_themes

DB_HOST=mysql
DB_PORT=3306
DB_USERNAME=cfup_user
DB_PASSWORD=${dbPass}
DB_DATABASE=cfup_db
DB_ROOT_PASSWORD=${dbRootPass}
DB_SSL=false

JWT_SECRET=${jwtSecret}
JWT_EXPIRES_IN=24h

${storageEnv}

REDIS_URL=redis://:cfup_redis_pass@redis:6379
REDIS_PASSWORD=cfup_redis_pass

CLAMAV_HOST=clamav
CLAMAV_PORT=3310

${smtpEnv}
EMAIL_FROM=${fromEmail}

BILLING_RETURN_URL=${appUrl}/billing/activate
LOG_LEVEL=info
`;

  const envPath = path.join(__dirname, '..', '.env.prod');
  fs.writeFileSync(envPath, env);

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   ✅ Setup complete!                              ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\n📄 Written to: .env.prod`);
  console.log('\nNext step — deploy:');
  console.log('  sudo bash deploy/deploy.sh\n');

  rl.close();
}

main().catch(err => { console.error(err.message); process.exit(1); });
