import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull, Between } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Upload } from '../uploads/entities/upload.entity';
import { Merchant } from '../auth/entities/merchant.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ProductsService } from '../products/products.service';
import { ShopifyTokenService } from '../shopify-token/shopify-token.service';
import { OrderFilesService } from '../orders/order-files.service';

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
    private readonly orderFilesService: OrderFilesService,
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

    // Create the order metafield definition up front so uploaded files show
    // on Shopify's native Order page as soon as the first order comes in,
    // rather than waiting on OrderFilesService to lazily create it on the
    // fly. Best-effort — attachUploadsToOrder() re-attempts this per shop
    // anyway if it didn't land here (e.g. merchant installed before this
    // existed).
    await this.orderFilesService.ensureOrderMetafieldDefinition(merchant.shopDomain, accessToken);
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
      { topic: 'app_subscriptions/update', address: `${appUrl}/api/v1/webhooks/app_subscriptions/update` },
      { topic: 'orders/create',          address: `${appUrl}/api/v1/webhooks/orders/create` },
      { topic: 'orders/updated',         address: `${appUrl}/api/v1/webhooks/orders/updated` },
      { topic: 'products/update',        address: `${appUrl}/api/v1/webhooks/products/update` },
      { topic: 'products/create',        address: `${appUrl}/api/v1/webhooks/products/create` },
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
          // Shopify allows only ONE REST webhook subscription per (app, topic) —
          // not per (app, topic, address). A 422 here means a subscription for
          // this topic already exists, possibly from an old deployment pointing
          // at a stale/dead URL (e.g. a previous Railway domain or ngrok
          // tunnel). Simply logging and moving on — the old behavior — leaves
          // that stale address in place forever, silently breaking webhook
          // delivery on every future redeploy that changes APP_URL. Instead,
          // look up the existing subscription and update it if the address
          // has drifted, so deploys self-heal instead of requiring a manual
          // GraphQL fix or app reinstall.
          await this.healRestWebhookAddress(merchant, webhook, accessToken);
        } else {
          this.logger.error(`❌ REST webhook failed ${webhook.topic}: ${err?.message}`);
        }
      }
    }
  }

  /**
   * Called after a 422 "already exists" on webhook creation. Fetches the
   * existing subscription for this topic and, if its address doesn't match
   * our current appUrl, PUTs an update so delivery resumes without any
   * manual intervention.
   */
  private async healRestWebhookAddress(
    merchant: Merchant,
    webhook: { topic: string; address: string },
    accessToken: string,
  ): Promise<void> {
    try {
      const listRes = await axios.get(
        `https://${merchant.shopDomain}/admin/api/2026-07/webhooks.json`,
        {
          params: { topic: webhook.topic },
          headers: { 'X-Shopify-Access-Token': accessToken },
          timeout: 10_000,
        },
      );
      const existing = listRes.data?.webhooks?.[0];
      if (!existing) {
        this.logger.warn(
          `⚠️  REST webhook for ${webhook.topic} reported "already exists" but none found on lookup (${merchant.shopDomain})`,
        );
        return;
      }
      if (existing.address === webhook.address) {
        this.logger.log(`⏭  REST webhook already exists and address is current: ${webhook.topic}`);
        return;
      }
      await axios.put(
        `https://${merchant.shopDomain}/admin/api/2026-07/webhooks/${existing.id}.json`,
        { webhook: { id: existing.id, address: webhook.address } },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
        },
      );
      this.logger.log(
        `🔧 REST webhook address updated for ${webhook.topic}: ${existing.address} → ${webhook.address}`,
      );
    } catch (err: any) {
      this.logger.error(`❌ REST webhook heal failed for ${webhook.topic}: ${err?.message}`);
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
      { topic: 'APP_SUBSCRIPTIONS_UPDATE', address: `${appUrl}/api/v1/webhooks/app_subscriptions/update` },
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
          // Same underlying issue as the REST path: one subscription per
          // (app, topic). Look up the existing one and update its callback
          // URL if it has drifted from our current appUrl, instead of
          // leaving a possibly-dead address in place indefinitely.
          await this.healGraphQLWebhookAddress(merchant, topic, address, accessToken);
        } else {
          this.logger.warn(`⚠️  GraphQL webhook errors for ${topic}: ${JSON.stringify(errors)}`);
        }
      } catch (err: any) {
        this.logger.error(`❌ GraphQL webhook failed ${topic}: ${err?.message}`);
      }
    }
  }

  /**
   * Called after webhookSubscriptionCreate reports "already exists" for a
   * topic. Queries the existing subscription's id + callbackUrl and, if it
   * doesn't match our current address, issues webhookSubscriptionUpdate.
   */
  private async healGraphQLWebhookAddress(
    merchant: Merchant,
    topic: string,
    address: string,
    accessToken: string,
  ): Promise<void> {
    const query = `
      {
        webhookSubscriptions(first: 5, topics: [${topic}]) {
          edges {
            node {
              id
              endpoint { ... on WebhookHttpEndpoint { callbackUrl } }
            }
          }
        }
      }
    `;
    try {
      const res = await axios.post(
        `https://${merchant.shopDomain}/admin/api/2026-07/graphql.json`,
        { query },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
        },
      );
      const node = res.data?.data?.webhookSubscriptions?.edges?.[0]?.node;
      if (!node) {
        this.logger.warn(
          `⚠️  GraphQL webhook for ${topic} reported "already exists" but none found on lookup (${merchant.shopDomain})`,
        );
        return;
      }
      if (node.endpoint?.callbackUrl === address) {
        this.logger.log(`⏭  GraphQL webhook already exists and address is current: ${topic}`);
        return;
      }
      const updateMutation = `
        mutation {
          webhookSubscriptionUpdate(
            id: "${node.id}"
            webhookSubscription: { callbackUrl: "${address}" }
          ) {
            userErrors { field message }
            webhookSubscription { id }
          }
        }
      `;
      const updateRes = await axios.post(
        `https://${merchant.shopDomain}/admin/api/2026-07/graphql.json`,
        { query: updateMutation },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
        },
      );
      const updateErrors = updateRes.data?.data?.webhookSubscriptionUpdate?.userErrors || [];
      if (updateErrors.length === 0) {
        this.logger.log(
          `🔧 GraphQL webhook address updated for ${topic}: ${node.endpoint?.callbackUrl} → ${address}`,
        );
      } else {
        this.logger.warn(`⚠️  GraphQL webhook update errors for ${topic}: ${JSON.stringify(updateErrors)}`);
      }
    } catch (err: any) {
      this.logger.error(`❌ GraphQL webhook heal failed for ${topic}: ${err?.message}`);
    }
  }

  /**
   * When an order is created: associate uploads, add timeline note, notify merchant.
   */
  async handleOrderCreate(shopDomain: string, order: any): Promise<void> {
    const merchant = await this.merchantRepo.findOne({ where: { shopDomain } });
    if (!merchant) {
      this.logger.warn(
        `orders/create webhook for shop "${shopDomain}" has no matching merchant record — was the app installed under a different shop domain string?`,
      );
      return;
    }

    const shopifyOrderId = String(order.id);
    const orderId = String(order.order_number ?? order.id);

    // Resolve which of this merchant's uploads belong to this order.
    //
    // This USED to match ONLY on order.cart_token, and that is exactly what
    // was breaking customised images. Shopify sends cart_token = null for a
    // large share of real orders — anything paid through an offsite/express
    // gateway (PayPal, Shop Pay, Apple/Google Pay) and many "Buy it now"
    // flows. When cart_token was null (or a provisional token that never
    // matched), the upload never received an orderId, so it disappeared from
    // Filedrop's Orders view AND never got pushed onto the native Shopify
    // order page.
    //
    // We now resolve uploads from the identifiers the theme widget already
    // attaches to every order (cart attribute `_cfup_upload_ids` → order
    // note_attributes, and the preview URL in each line item's properties),
    // and only fall back to cart_token last. See resolveUploadsForOrder().
    const { uploads, lineItemIdByUpload } = await this.resolveUploadsForOrder(
      merchant.id,
      order,
    );

    if (!uploads.length) {
      // Most orders legitimately have no upload. If this fires for an order
      // you KNOW had a customised file, inspect the logged identifiers below —
      // it means none of note_attributes / line-item properties / cart_token
      // pointed at a still-unlinked upload for this merchant.
      this.logger.log(
        `ℹ️  No Filedrop uploads resolved for order #${orderId} (${shopDomain}). ` +
          `cart_token=${order.cart_token ?? 'null'}; ` +
          `note_attributes=${JSON.stringify(order.note_attributes ?? [])}`,
      );
      return;
    }

    await this.uploadRepo.update(
      uploads.map((u) => u.id),
      {
        shopifyOrderId,
        orderId,
        customerEmail: order.email ?? null,
        customerId: order.customer?.id ? String(order.customer.id) : null,
      },
    );

    // Best-effort: record which specific line item each upload belongs to, so
    // the customised image can later be shown against the correct product line.
    for (const u of uploads) {
      const lineItemId = lineItemIdByUpload.get(u.id);
      if (lineItemId) {
        await this.uploadRepo.update(u.id, { lineItemId: String(lineItemId) });
      }
    }

    this.logger.log(
      `Associated ${uploads.length} upload(s) with order #${orderId} (${shopDomain})`,
    );

    // Add Shopify order timeline entry
    await this.addOrderTimelineNote(merchant, order.id, uploads.length);

    // In-app notification (fast, local DB write)
    await this.notificationsService.notifyUpload(merchant.id, {
      fileName: uploads.length > 1 ? `${uploads.length} files` : uploads[0].originalFileName,
      orderNumber: orderId,
      customerEmail: order.email,
    });

    // Push the actual files onto the Shopify order so the merchant can preview
    // and download them directly from the order page (native Metafields card).
    //
    // Deliberately NOT awaited: pushing bytes to Shopify Files and then waiting
    // for image processing to reach READY can take several seconds, which would
    // risk this webhook exceeding Shopify's response window and being retried.
    // The uploads are already linked above, so this safely completes in the
    // background. attachUploadsToOrder is best-effort and never throws.
    void this.orderFilesService
      .attachUploadsToOrder(merchant, shopifyOrderId, uploads)
      .catch((e) =>
        this.logger.error(`Background attachUploadsToOrder failed: ${e?.message}`),
      );
  }

  /**
   * Work out which of a merchant's uploads belong to a just-created order,
   * using the most reliable signals first and cart_token only as a fallback.
   *
   * Strategy order:
   *   1. Cart attribute `_cfup_upload_ids` — the widget writes this on every
   *      upload (persistUploadIds() in upload-widget.liquid). Cart attributes
   *      surface on the order as `note_attributes`, and unlike cart_token they
   *      survive offsite/express checkouts. Durable path.
   *   2. Line-item properties — the widget also writes the file's preview URL
   *      as `properties[Uploaded file]` on the product line. The upload id is
   *      embedded in that URL (/storefront/file/{id}). Parsing it resolves the
   *      upload AND tells us which line item it belongs to.
   *   3. cart_token — the original behaviour, kept as a last resort for the
   *      orders that actually do carry a matching token.
   *
   * Every candidate id is re-checked against the DB scoped to this merchant and
   * to uploads not yet linked to an order, so a stale/forged value in
   * note_attributes can never attach someone else's file to this order.
   */
  private async resolveUploadsForOrder(
    merchantId: string,
    order: any,
  ): Promise<{ uploads: Upload[]; lineItemIdByUpload: Map<string, string> }> {
    const lineItemIdByUpload = new Map<string, string>();
    const candidateIds = new Set<string>();

    // (1) note_attributes (from the `_cfup_upload_ids` cart attribute)
    for (const id of this.extractUploadIdsFromNoteAttributes(order)) {
      candidateIds.add(id);
    }

    // (2) line-item properties (preview URL contains the upload id)
    for (const { uploadId, lineItemId } of this.extractUploadRefsFromLineItems(order)) {
      candidateIds.add(uploadId);
      if (lineItemId) lineItemIdByUpload.set(uploadId, lineItemId);
    }

    let uploads: Upload[] = [];

    if (candidateIds.size) {
      uploads = await this.uploadRepo.find({
        where: {
          id: In([...candidateIds]),
          merchantId,
          orderId: IsNull(),
          deletedAt: IsNull(),
        },
      });
    }

    // (3) Fallback: cart_token, only if the reliable paths found nothing.
    if (!uploads.length && order.cart_token) {
      uploads = await this.uploadRepo.find({
        where: {
          merchantId,
          cartToken: String(order.cart_token).split('?')[0],
          orderId: IsNull(),
          deletedAt: IsNull(),
        },
      });
    }

    // (4) LAST-RESORT heuristic: link by product + time + (preferably) email.
    //
    // Some checkout paths strip EVERYTHING our widget attaches: "Buy it now",
    // Shop Pay and the other dynamic/express buttons send no line-item
    // properties and no cart attributes, and the order's cart_token won't match
    // the provisional token captured before checkout. In that case none of
    // (1)-(3) can fire, and the customised image would silently never link —
    // which is exactly the empty-metafield / missing-from-Orders symptom.
    //
    // The upload row already stores productId, variantId, customerEmail and
    // createdAt, and the order gives us the same facts, so we can still match:
    // the most recent still-unlinked upload(s) for THIS merchant, for a product
    // that's actually in THIS order, created shortly before it. We prefer an
    // email match and only fall back to product+time when the upload carries no
    // email (the common case, since shoppers upload before entering one).
    if (!uploads.length) {
      uploads = await this.resolveUploadsByHeuristic(merchantId, order);
      if (uploads.length) {
        this.logger.warn(
          `⚠️  Linked ${uploads.length} upload(s) to order ${order.id} via LAST-RESORT ` +
            `product/time heuristic (no cart_token / properties / note_attributes matched). ` +
            `This is expected for Buy-it-now / Shop Pay checkouts.`,
        );
      }
    }

    return { uploads, lineItemIdByUpload };
  }

  /**
   * Heuristic matcher — see caller. Deliberately conservative:
   *   • same merchant, not yet linked to any order, not deleted
   *   • productId is one of the products actually on this order
   *   • createdAt within a window ending at the order time (never after it)
   *   • if the upload has a customerEmail, it must equal the order's email
   * Returns at most one upload per matching product line (the newest), so a
   * single order can't vacuum up every unrelated upload for a popular product.
   */
  private async resolveUploadsByHeuristic(
    merchantId: string,
    order: any,
  ): Promise<Upload[]> {
    const lineItems: any[] = Array.isArray(order?.line_items) ? order.line_items : [];
    const productIds = Array.from(
      new Set(
        lineItems
          .map((li) => (li?.product_id != null ? String(li.product_id) : null))
          .filter((v): v is string => !!v),
      ),
    );
    if (!productIds.length) return [];

    // Window: from HEURISTIC_WINDOW_HOURS before the order, up to the order
    // time plus a small buffer for clock skew. Never match uploads created
    // after the order was placed.
    const HEURISTIC_WINDOW_HOURS = 12;
    const orderTime = order?.created_at ? new Date(order.created_at) : new Date();
    const windowStart = new Date(orderTime.getTime() - HEURISTIC_WINDOW_HOURS * 3600_000);
    const windowEnd = new Date(orderTime.getTime() + 10 * 60_000);

    const candidates = await this.uploadRepo.find({
      where: {
        merchantId,
        productId: In(productIds),
        orderId: IsNull(),
        deletedAt: IsNull(),
        createdAt: Between(windowStart, windowEnd),
      },
      order: { createdAt: 'DESC' },
    });
    if (!candidates.length) return [];

    const orderEmail = (order?.email || '').trim().toLowerCase();

    // Keep the newest still-unlinked upload per product, honouring the email
    // constraint when the upload actually has one.
    const pickedByProduct = new Map<string, Upload>();
    for (const u of candidates) {
      if (!u.productId || pickedByProduct.has(u.productId)) continue;
      if (u.customerEmail && orderEmail && u.customerEmail.trim().toLowerCase() !== orderEmail) {
        continue; // email present on both and they disagree → not this shopper
      }
      pickedByProduct.set(u.productId, u);
    }

    return [...pickedByProduct.values()];
  }

  /** Pull upload ids out of the `_cfup_upload_ids` order note attribute. */
  private extractUploadIdsFromNoteAttributes(order: any): string[] {
    const attrs: Array<{ name?: string; value?: string }> = Array.isArray(
      order?.note_attributes,
    )
      ? order.note_attributes
      : [];
    const entry = attrs.find((a) => a?.name === '_cfup_upload_ids');
    if (!entry?.value) return [];
    return String(entry.value)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  /**
   * Pull { uploadId, lineItemId } pairs out of the order's line-item
   * properties. The widget stores the file's preview URL, which contains the
   * upload id as /storefront/file/{uuid}. Also tolerates a bare uuid value.
   */
  private extractUploadRefsFromLineItems(
    order: any,
  ): Array<{ uploadId: string; lineItemId?: string }> {
    const refs: Array<{ uploadId: string; lineItemId?: string }> = [];
    const uuidRe =
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const lineItems: any[] = Array.isArray(order?.line_items)
      ? order.line_items
      : [];

    const uuidReGlobal = new RegExp(uuidRe.source, 'gi');

    for (const li of lineItems) {
      const props: any[] = Array.isArray(li?.properties) ? li.properties : [];
      const lineItemId = li?.id ? String(li.id) : undefined;
      for (const p of props) {
        const value = typeof p?.value === 'string' ? p.value : '';
        if (!value) continue;
        // A single value may carry one upload id (preview URL) or several
        // (a combined "_Filedrop Upload IDs" property), so collect them all.
        const matches = value.match(uuidReGlobal);
        if (!matches) continue;
        for (const m of matches) {
          refs.push({ uploadId: m.toLowerCase(), lineItemId });
        }
      }
    }
    return refs;
  }

  async handleOrderUpdate(shopDomain: string, order: any): Promise<void> {
    const merchant = await this.merchantRepo.findOne({ where: { shopDomain } });
    if (!merchant) return;

    // Recovery: if this order has linked Filedrop uploads but its file card is
    // still empty (e.g. the original push happened before the file finished
    // processing, or hit a transient error), re-attach them now. Guarded by an
    // emptiness check inside attachUploadsIfMissing so orders that are already
    // fine are left untouched and no duplicate files are created.
    const shopifyOrderId = String(order.id);
    const uploads = await this.uploadRepo.find({
      where: { merchantId: merchant.id, shopifyOrderId, deletedAt: IsNull() },
    });
    if (uploads.length) {
      void this.orderFilesService
        .attachUploadsIfMissing(merchant, shopifyOrderId, uploads)
        .catch((e) =>
          this.logger.error(`orders/updated re-attach failed: ${e?.message}`),
        );
    }

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
