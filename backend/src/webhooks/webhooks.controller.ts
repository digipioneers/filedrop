import {
  Controller, Post, Headers, Body, Req,
  BadRequestException, Logger, HttpCode,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly webhooksService: WebhooksService,
  ) {}

  private verifyWebhook(req: any, hmacHeader: string): void {
    if (!req.rawBody) throw new BadRequestException('No raw body');
    if (!hmacHeader) throw new BadRequestException('Missing HMAC header');
    const valid = this.authService.validateWebhookHmac(req.rawBody, hmacHeader);
    if (!valid) throw new BadRequestException('Invalid webhook HMAC');
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
    await this.authService.uninstallMerchant(shop);
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
