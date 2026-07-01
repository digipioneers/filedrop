import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Upload } from '../uploads/entities/upload.entity';
import { Merchant } from '../auth/entities/merchant.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ProductsService } from '../products/products.service';

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
  ) {}

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
      const note = `Customer uploaded ${uploadCount} file${uploadCount > 1 ? 's' : ''} via Custom File Upload Pro.`;
      await axios.post(
        `https://${merchant.shopDomain}/admin/api/2024-01/orders/${shopifyOrderId}/metafields.json`,
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
            'X-Shopify-Access-Token': merchant.accessToken,
            'Content-Type': 'application/json',
          },
        },
      );

      // Also write to order notes via order update
      const orderRes = await axios.get(
        `https://${merchant.shopDomain}/admin/api/2024-01/orders/${shopifyOrderId}.json?fields=note`,
        { headers: { 'X-Shopify-Access-Token': merchant.accessToken } },
      );
      const existingNote = orderRes.data?.order?.note ?? '';
      const updatedNote = existingNote
        ? `${existingNote}\n${note}`
        : note;

      await axios.put(
        `https://${merchant.shopDomain}/admin/api/2024-01/orders/${shopifyOrderId}.json`,
        { order: { id: shopifyOrderId, note: updatedNote } },
        {
          headers: {
            'X-Shopify-Access-Token': merchant.accessToken,
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
