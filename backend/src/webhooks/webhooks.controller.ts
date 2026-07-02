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

  private verifyWebhook(req: any, hmacHeader: string): void {
    if (!req.rawBody) throw new BadRequestException('No raw body');
    if (!hmacHeader) throw new BadRequestException('Missing HMAC header');
    const secret = this.configService.get<string>('SHOPIFY_API_SECRET');
    const computed = crypto.createHmac('sha256', secret).update(req.rawBody).digest('base64');
    const hmacBuf = Buffer.from(hmacHeader);
    const computedBuf = Buffer.from(computed);
    if (hmacBuf.length !== computedBuf.length || !crypto.timingSafeEqual(computedBuf, hmacBuf)) {
      throw new BadRequestException('Invalid webhook HMAC');
    }
  }

  @Post('app/uninstalled')
  @HttpCode(200)
  async appUninstalled(
    @Req() req: any,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Headers('x-shopify-shop-domain') shop: string,
    @Body() body: any,
  ) {
    this.verifyWebhook(req, hmac);
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
    this.verifyWebhook(req, hmac);
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
    this.verifyWebhook(req, hmac);
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
    this.verifyWebhook(req, hmac);
    await this.webhooksService.handleProductUpdate(shop, body);
    return { ok: true };
  }
}
