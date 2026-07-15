import {
  Controller, Post, Headers, Body, Req,
  BadRequestException, Logger, HttpCode,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { WebhooksService } from './webhooks.service';
import { Merchant } from '../auth/entities/merchant.entity';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly configService: ConfigService,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
  ) {}

  private verifyWebhook(req: any, hmacHeader: string, topic: string, shop: string): void {
    this.logger.log(`📥 Webhook received: ${topic} from ${shop || 'unknown shop'}`);
    if (!req.rawBody) {
      this.logger.error(`❌ Webhook ${topic} rejected: no raw body (check main.ts rawBody:true / body-parser setup)`);
      throw new BadRequestException('No raw body');
    }
    if (!hmacHeader) {
      this.logger.error(`❌ Webhook ${topic} rejected: missing X-Shopify-Hmac-Sha256 header`);
      throw new BadRequestException('Missing HMAC header');
    }
    const secret = this.configService.get<string>('SHOPIFY_API_SECRET');
    if (!secret) {
      this.logger.error(`❌ Webhook ${topic} rejected: SHOPIFY_API_SECRET is not set on this deployment`);
      throw new BadRequestException('Server misconfiguration');
    }
    const computed = crypto.createHmac('sha256', secret).update(req.rawBody).digest('base64');
    const hmacBuf = Buffer.from(hmacHeader);
    const computedBuf = Buffer.from(computed);
    if (hmacBuf.length !== computedBuf.length || !crypto.timingSafeEqual(computedBuf, hmacBuf)) {
      // Do NOT log the actual secret or computed/received HMAC values —
      // that would leak signing-key-derived material into logs. Logging
      // that a mismatch occurred is enough to diagnose a wrong/rotated
      // SHOPIFY_API_SECRET without exposing anything sensitive.
      this.logger.error(
        `❌ Webhook ${topic} rejected: HMAC mismatch — SHOPIFY_API_SECRET on this deployment likely doesn't match the app's current client secret in the Partner Dashboard.`,
      );
      throw new BadRequestException('Invalid webhook HMAC');
    }
    this.logger.log(`✅ Webhook ${topic} HMAC verified for ${shop}`);
  }

  @Post('app/uninstalled')
  @HttpCode(200)
  async appUninstalled(
    @Req() req: any,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Headers('x-shopify-shop-domain') shop: string,
    @Body() body: any,
  ) {
    this.verifyWebhook(req, hmac, 'app/uninstalled', shop);
    this.logger.log(`App uninstalled for shop: ${shop}`);
    await this.merchantRepo.update({ shopDomain: shop }, { isActive: false, uninstalledAt: new Date() });
    return { ok: true };
  }

  @Post('orders/create')
  @HttpCode(200)
  async ordersCreate(
    @Req() req: any,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Headers('x-shopify-shop-domain') shop: string,
    @Body() body: any,
  ) {
    this.verifyWebhook(req, hmac, 'orders/create', shop);
    await this.webhooksService.handleOrderCreate(shop, body);
    return { ok: true };
  }

  @Post('orders/updated')
  @HttpCode(200)
  async ordersUpdated(
    @Req() req: any,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Headers('x-shopify-shop-domain') shop: string,
    @Body() body: any,
  ) {
    this.verifyWebhook(req, hmac, 'orders/updated', shop);
    await this.webhooksService.handleOrderUpdate(shop, body);
    return { ok: true };
  }

  @Post('products/update')
  @HttpCode(200)
  async productsUpdate(
    @Req() req: any,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Headers('x-shopify-shop-domain') shop: string,
    @Body() body: any,
  ) {
    this.verifyWebhook(req, hmac, 'products/update', shop);
    await this.webhooksService.handleProductUpdate(shop, body);
    return { ok: true };
  }
}
