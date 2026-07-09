import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Upload } from '../uploads/entities/upload.entity';
import { Merchant } from '../auth/entities/merchant.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ProductsService } from '../products/products.service';
import { ShopifyTokenService } from '../shopify-token/shopify-token.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(Upload)
    private readonly uploadRepo: Repository<Upload>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    private readonly notificationsService: NotificationsService,
    private readonly productsService: ProductsService,
    private readonly configService: ConfigService,
    private readonly shopifyTokenService: ShopifyTokenService,
  ) {}

  /**
   * Register all required webhooks for a merchant immediately after install.
   * This is the ONLY reliable way to pass Shopify's automated compliance checks
   * without running `shopify app deploy` from the CLI.
   * Called automatically from AuthService.installMerchant().
   */
  async registerWebhooksForMerchant(merchant: Merchant): Promise<void> {
    const appUrl = this.configService.get<string>('APP_URL');
    if (!appUrl) {
      this.logger.error('APP_URL environment variable is not set — cannot register webhooks');
      return;
    }

    const accessToken = await this.shopifyTokenService.getValidAccessToken(merchant);

    // Register via both REST (per-merchant) and GraphQL (app-level subscriptions)
    await this.registerViaRest(merchant, appUrl, accessToken);
    await this.registerViaGraphQL(merchant, appUrl, accessToken);
  }

  private async registerViaRest(merchant: Merchant, appUrl: string, accessToken: string): Promise<void> {
    // NOTE: customers/data_request, customers/redact, and shop/redact are
    // deliberately NOT included here. Shopify's compliance webhook topics
    // can only be declared via shopify.app.toml + `shopify app deploy` —
    // the REST Webhooks API 404s on them at runtime (confirmed in
    // production logs), and this was previously producing a misleading
    // ERROR log on every single install even though the compliance
    // webhooks were already correctly registered via the app config.
    // See shopify.app.toml's `[[webhooks.subscriptions]] compliance_topics`.
    const webhooks = [
      { topic: 'app/uninstalled',        address: `${appUrl}/api/v1/webhooks/app/uninstalled` },
      { topic: 'orders/create',          address: `${appUrl}/api/v1/webhooks/orders/create` },
      { topic: 'orders/updated',         address: `${appUrl}/api/v1/webhooks/orders/updated` },
      { topic: 'products/update',        address: `${appUrl}/api/v1/webhooks/products/update` },
    ];

    for (const webhook of webhooks) {
      try {
        const res = await axios.post(
          `https://${merchant.shopDomain}/admin/api/2026-07/webhooks.json`,
          { webhook: { topic: webhook.topic, address: webhook.address, format: 'json' } },
          {
            headers: {
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json',
            },
            timeout: 10_000,
          },
        );
        if (res.status === 201) {
          this.logger.log(`✅ REST webhook registered: ${webhook.topic}`);
        }
      } catch (err: any) {
        if (err?.response?.status === 422) {
          this.logger.log(`⏭  REST webhook already exists: ${webhook.topic}`);
        } else {
          this.logger.error(`❌ REST webhook failed ${webhook.topic}: ${err?.message}`);
        }
      }
    }
  }

  /**
   * Register webhooks via GraphQL webhookSubscriptionCreate mutation.
   * Only covers topics that are actually valid for this mutation — the
   * three compliance topics are NOT valid WebhookSubscriptionTopic enum
   * values (confirmed: Shopify rejects them with "invalid value" errors)
   * and, same as the REST method above, are only registerable via
   * shopify.app.toml + `shopify app deploy`.
   */
  private async registerViaGraphQL(merchant: Merchant, appUrl: string, accessToken: string): Promise<void> {
    const topics = [
      { topic: 'APP_UNINSTALLED',        address: `${appUrl}/api/v1/webhooks/app/uninstalled` },
      { topic: 'ORDERS_CREATE',          address: `${appUrl}/api/v1/webhooks/orders/create` },
    ];

    for (const { topic, address } of topics) {
      const mutation = `
        mutation {
          webhookSubscriptionCreate(
            topic: ${topic}
            webhookSubscription: {
              format: JSON
              callbackUrl: "${address}"
            }
          ) {
            userErrors { field message }
            webhookSubscription { id }
          }
        }
      `;
      try {
        const res = await axios.post(
          `https://${merchant.shopDomain}/admin/api/2026-07/graphql.json`,
          { query: mutation },
          {
            headers: {
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json',
            },
            timeout: 10_000,
          },
        );
        const result = res.data?.data?.webhookSubscriptionCreate;
        const errors = result?.userErrors || [];
        const alreadyExists = errors.some((e: any) =>
          e.message?.toLowerCase().includes('already') || e.message?.toLowerCase().includes('taken')
        );
        if (errors.length === 0) {
          this.logger.log(`✅ GraphQL webhook registered: ${topic}`);
        } else if (alreadyExists) {
          this.logger.log(`⏭  GraphQL webhook already exists: ${topic}`);
        } else {
          this.logger.warn(`⚠️  GraphQL webhook errors for ${topic}: ${JSON.stringify(errors)}`);
        }
      } catch (err: any) {
        this.logger.error(`❌ GraphQL webhook failed ${topic}: ${err?.message}`);
      }
    }
  }

  /**
   * When an order is created: associate uploads, add timeline note, notify merchant.
   */
  async handleOrderCreate(shopDomain: string, order: any): Promise<void> {
    const merchant = await this.merchantRepo.findOne({ where: { shopDomain } });
    if (!merchant) return;

    const cartToken = order.cart_token;
    const shopifyOrderId = String(order.id);
    const orderId = String(order.order_number ?? order.id);

    if (!cartToken) return;

    const uploads = await this.uploadRepo.find({
      where: { merchantId: merchant.id, cartToken },
    });

    if (!uploads.length) return;

    await this.uploadRepo.update(
      uploads.map((u) => u.id),
      {
        shopifyOrderId,
        orderId,
        customerEmail: order.email ?? null,
        customerId: order.customer?.id ? String(order.customer.id) : null,
      },
    );

    this.logger.log(
      `Associated ${uploads.length} uploads with order #${orderId} (${shopDomain})`,
    );

    // Add Shopify order timeline entry
    await this.addOrderTimelineNote(merchant, order.id, uploads.length);

    // In-app notification
    await this.notificationsService.notifyUpload(merchant.id, {
      fileName: uploads.length > 1 ? `${uploads.length} files` : uploads[0].originalFileName,
      orderNumber: orderId,
      customerEmail: order.email,
    });
  }

  async handleOrderUpdate(shopDomain: string, order: any): Promise<void> {
    this.logger.log(`Order updated: ${order.id} on ${shopDomain}`);
  }

  async handleProductUpdate(shopDomain: string, product: any): Promise<void> {
    const merchant = await this.merchantRepo.findOne({ where: { shopDomain } });
    if (!merchant) return;
    await this.productsService.handleProductUpdate(merchant.id, product);
    this.logger.log(`Product cache updated: ${product.id} on ${shopDomain}`);
  }

  // ─── Shopify Order Timeline ─────────────────────────────────────────────────

  private async addOrderTimelineNote(
    merchant: Merchant,
    shopifyOrderId: string,
    uploadCount: number,
  ): Promise<void> {
    try {
      const accessToken = await this.shopifyTokenService.getValidAccessToken(merchant);
      const note = `Customer uploaded ${uploadCount} file${uploadCount > 1 ? 's' : ''} via Filedrop.`;
      await axios.post(
        `https://${merchant.shopDomain}/admin/api/2026-07/orders/${shopifyOrderId}/metafields.json`,
        {
          metafield: {
            namespace: 'custom_file_upload_pro',
            key: 'upload_note',
            value: note,
            type: 'single_line_text_field',
          },
        },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
        },
      );

      // Also write to order notes via order update
      const orderRes = await axios.get(
        `https://${merchant.shopDomain}/admin/api/2026-07/orders/${shopifyOrderId}.json?fields=note`,
        { headers: { 'X-Shopify-Access-Token': accessToken } },
      );
      const existingNote = orderRes.data?.order?.note ?? '';
      const updatedNote = existingNote
        ? `${existingNote}\n${note}`
        : note;

      await axios.put(
        `https://${merchant.shopDomain}/admin/api/2026-07/orders/${shopifyOrderId}.json`,
        { order: { id: shopifyOrderId, note: updatedNote } },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`Order timeline note added for order ${shopifyOrderId}`);
    } catch (err) {
      this.logger.error(`Failed to add order timeline note: ${err.message}`);
    }
  }
}
