#!/usr/bin/env node
/**
 * register-webhooks.js
 * Registers all required Shopify webhooks for a given shop.
 * Run after deployment: node scripts/register-webhooks.js --shop=mystore.myshopify.com
 *
 * Or called automatically from AuthService on app install.
 */

const https = require('https');

const APP_URL = process.env.APP_URL || 'https://your-app.com';
const SHOPIFY_API_VERSION = '2024-01';

const WEBHOOKS = [
  { topic: 'app/uninstalled',      address: `${APP_URL}/webhooks/app/uninstalled` },
  { topic: 'orders/create',        address: `${APP_URL}/webhooks/orders/create` },
  { topic: 'orders/updated',       address: `${APP_URL}/webhooks/orders/updated` },
  { topic: 'products/update',      address: `${APP_URL}/webhooks/products/update` },
  // GDPR mandatory
  { topic: 'customers/data_request', address: `${APP_URL}/gdpr/customers/data_request` },
  { topic: 'customers/redact',       address: `${APP_URL}/gdpr/customers/redact` },
  { topic: 'shop/redact',            address: `${APP_URL}/gdpr/shop/redact` },
];

async function registerWebhooks(shop, accessToken) {
  const results = [];

  for (const webhook of WEBHOOKS) {
    try {
      const body = JSON.stringify({
        webhook: {
          topic: webhook.topic,
          address: webhook.address,
          format: 'json',
        },
      });

      const result = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: shop,
          path: `/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken,
            'Content-Length': Buffer.byteLength(body),
          },
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            const json = JSON.parse(data);
            if (res.statusCode === 201) {
              resolve({ topic: webhook.topic, status: 'registered', id: json.webhook?.id });
            } else if (res.statusCode === 422 && data.includes('already')) {
              resolve({ topic: webhook.topic, status: 'already_exists' });
            } else {
              resolve({ topic: webhook.topic, status: 'failed', error: data });
            }
          });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
      });

      results.push(result);
      console.log(`  ${result.status === 'registered' ? '✅' : result.status === 'already_exists' ? '⏭' : '❌'} ${webhook.topic}: ${result.status}`);
    } catch (err) {
      results.push({ topic: webhook.topic, status: 'error', error: err.message });
      console.error(`  ❌ ${webhook.topic}: ${err.message}`);
    }
  }

  return results;
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const shop = args.find(a => a.startsWith('--shop='))?.split('=')[1];
  const token = args.find(a => a.startsWith('--token='))?.split('=')[1];

  if (!shop || !token) {
    console.error('Usage: node scripts/register-webhooks.js --shop=mystore.myshopify.com --token=shpat_xxx');
    process.exit(1);
  }

  console.log(`\nRegistering webhooks for ${shop}...\n`);
  registerWebhooks(shop, token).then(() => {
    console.log('\nDone.');
  });
}

module.exports = { registerWebhooks, WEBHOOKS };
