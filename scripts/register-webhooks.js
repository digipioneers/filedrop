#!/usr/bin/env node
/**
 * register-webhooks.js
 * Registers all required Shopify webhooks via REST API.
 * No Shopify CLI needed — just run once after deployment.
 *
 * Usage:
 *   node scripts/register-webhooks.js \
 *     --shop=filedrop-practice.myshopify.com \
 *     --token=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *
 * Get your access token from:
 *   Railway backend logs on first install, OR
 *   Your database: SELECT access_token FROM merchants WHERE shop_domain = 'yourshop.myshopify.com'
 */

const https = require('https');

const APP_URL = process.env.APP_URL || 'https://filedrop-production-28dd.up.railway.app';
const SHOPIFY_API_VERSION = '2024-01';

const WEBHOOKS = [
  // Core app webhooks
  { topic: 'app/uninstalled',   address: `${APP_URL}/api/v1/webhooks/app/uninstalled` },
  { topic: 'orders/create',     address: `${APP_URL}/api/v1/webhooks/orders/create` },
  { topic: 'orders/updated',    address: `${APP_URL}/api/v1/webhooks/orders/updated` },
  { topic: 'products/update',   address: `${APP_URL}/api/v1/webhooks/products/update` },
  // GDPR mandatory compliance webhooks (required for App Store)
  { topic: 'customers/data_request', address: `${APP_URL}/api/v1/gdpr/webhooks` },
  { topic: 'customers/redact',       address: `${APP_URL}/api/v1/gdpr/webhooks` },
  { topic: 'shop/redact',            address: `${APP_URL}/api/v1/gdpr/webhooks` },
];

function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function listExistingWebhooks(shop, token) {
  const res = await makeRequest({
    hostname: shop,
    path: `/admin/api/${SHOPIFY_API_VERSION}/webhooks.json?limit=250`,
    method: 'GET',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
  });
  return res.body?.webhooks || [];
}

async function deleteWebhook(shop, token, id) {
  await makeRequest({
    hostname: shop,
    path: `/admin/api/${SHOPIFY_API_VERSION}/webhooks/${id}.json`,
    method: 'DELETE',
    headers: { 'X-Shopify-Access-Token': token },
  });
}

async function registerWebhooks(shop, token) {
  console.log(`\n🔍 Checking existing webhooks on ${shop}...\n`);
  const existing = await listExistingWebhooks(shop, token);

  // Delete stale webhooks pointing to wrong URLs (old missing /api/v1/ prefix)
  for (const wh of existing) {
    const isStale = !wh.address.includes('/api/v1/');
    if (isStale) {
      console.log(`  🗑  Removing stale webhook: ${wh.topic} → ${wh.address}`);
      await deleteWebhook(shop, token, wh.id);
    }
  }

  console.log(`\n📡 Registering webhooks...\n`);
  const results = [];

  for (const webhook of WEBHOOKS) {
    // Check if already correctly registered
    const alreadyExists = existing.find(
      w => w.topic === webhook.topic && w.address === webhook.address
    );
    if (alreadyExists) {
      console.log(`  ⏭  ${webhook.topic}: already registered correctly`);
      results.push({ topic: webhook.topic, status: 'already_exists' });
      continue;
    }

    const body = JSON.stringify({
      webhook: { topic: webhook.topic, address: webhook.address, format: 'json' },
    });

    const res = await makeRequest({
      hostname: shop,
      path: `/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
        'Content-Length': Buffer.byteLength(body),
      },
    }, body);

    if (res.status === 201) {
      console.log(`  ✅ ${webhook.topic}: registered (id: ${res.body.webhook?.id})`);
      results.push({ topic: webhook.topic, status: 'registered', id: res.body.webhook?.id });
    } else if (res.status === 422) {
      console.log(`  ⏭  ${webhook.topic}: already exists on Shopify`);
      results.push({ topic: webhook.topic, status: 'already_exists' });
    } else {
      const err = JSON.stringify(res.body);
      console.error(`  ❌ ${webhook.topic}: FAILED (${res.status}) — ${err}`);
      results.push({ topic: webhook.topic, status: 'failed', error: err });
    }
  }

  const failed = results.filter(r => r.status === 'failed');
  console.log(`\n${failed.length === 0 ? '✅ All webhooks registered successfully!' : `❌ ${failed.length} webhook(s) failed — check errors above`}`);
  return results;
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const shop = args.find(a => a.startsWith('--shop='))?.split('=')[1];
  const token = args.find(a => a.startsWith('--token='))?.split('=')[1];

  if (!shop || !token) {
    console.error('\nUsage:\n  node scripts/register-webhooks.js --shop=mystore.myshopify.com --token=shpat_xxx\n');
    console.error('Get your token from Railway DB:\n  SELECT access_token FROM merchants WHERE shop_domain = \'mystore.myshopify.com\';\n');
    process.exit(1);
  }

  registerWebhooks(shop, token).catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

module.exports = { registerWebhooks, WEBHOOKS };
