import {
  Controller, Post, Headers, Body, Req,
  HttpCode, HttpStatus, Logger, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Merchant } from '../auth/entities/merchant.entity';
import { Upload } from '../uploads/entities/upload.entity';
import { MerchantSettings } from '../settings/entities/merchant-settings.entity';
import { Subscription } from '../billing/entities/subscription.entity';

@ApiTags('GDPR')
@Controller('gdpr')
export class GdprController {
  private readonly logger = new Logger(GdprController.name);

  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(Upload)
    private readonly uploadRepo: Repository<Upload>,
    @InjectRepository(MerchantSettings)
    private readonly settingsRepo: Repository<MerchantSettings>,
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Verify Shopify webhook HMAC.
   * MUST throw 400 (not 401) — Shopify's automated checker specifically
   * tests for HTTP 400 on invalid signatures.
   */
  private verifyHmac(req: any, hmacHeader: string): void {
    if (!hmacHeader) {
      throw new BadRequestException('Missing X-Shopify-Hmac-Sha256 header');
    }
    const rawBody: Buffer = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('No raw body for HMAC verification');
    }
    const secret = this.configService.get<string>('SHOPIFY_API_SECRET');
    if (!secret) {
      this.logger.error('SHOPIFY_API_SECRET is not configured');
      throw new BadRequestException('Server misconfiguration');
    }
    const computed = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64');

    const hmacBuf = Buffer.from(hmacHeader);
    const computedBuf = Buffer.from(computed);

    if (
      hmacBuf.length !== computedBuf.length ||
      !crypto.timingSafeEqual(computedBuf, hmacBuf)
    ) {
      this.logger.warn('GDPR HMAC verification failed');
      throw new BadRequestException('Invalid HMAC signature');
    }
  }

  /**
   * Unified GDPR compliance webhook endpoint.
   * All three mandatory topics route here — Shopify sends
   * X-Shopify-Topic header to identify which action is needed.
   * Registered in shopify.app.toml via compliance_topics.
   */
  @Post('webhooks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unified GDPR compliance webhook (mandatory)' })
  async handleGdprWebhook(
    @Req() req: any,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Headers('x-shopify-topic') topic: string,
    @Headers('x-shopify-shop-domain') shopDomain: string,
    @Body() body: any,
  ) {
    this.verifyHmac(req, hmac);

    this.logger.log(`GDPR webhook received — topic: ${topic}, shop: ${shopDomain}`);

    switch (topic) {
      case 'customers/data_request':
        return this.handleCustomerDataRequest(shopDomain, body);
      case 'customers/redact':
        return this.handleCustomerRedact(shopDomain, body);
      case 'shop/redact':
        return this.handleShopRedact(shopDomain);
      default:
        this.logger.warn(`Unknown GDPR topic: ${topic}`);
        return { acknowledged: true };
    }
  }

  /**
   * Keep individual endpoints too so existing webhook registrations
   * (pre-toml) still work and don't break.
   */
  @Post('customers/data_request')
  @HttpCode(HttpStatus.OK)
  async customerDataRequest(
    @Req() req: any,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Headers('x-shopify-shop-domain') shopDomain: string,
    @Body() body: any,
  ) {
    this.verifyHmac(req, hmac);
    return this.handleCustomerDataRequest(shopDomain, body);
  }

  @Post('customers/redact')
  @HttpCode(HttpStatus.OK)
  async customerRedact(
    @Req() req: any,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Headers('x-shopify-shop-domain') shopDomain: string,
    @Body() body: any,
  ) {
    this.verifyHmac(req, hmac);
    return this.handleCustomerRedact(shopDomain, body);
  }

  @Post('shop/redact')
  @HttpCode(HttpStatus.OK)
  async shopRedact(
    @Req() req: any,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Headers('x-shopify-shop-domain') shopDomain: string,
    @Body() body: any,
  ) {
    this.verifyHmac(req, hmac);
    return this.handleShopRedact(shopDomain);
  }

  // ── Private handlers ──────────────────────────────────────────────────────

  private async handleCustomerDataRequest(shopDomain: string, body: any) {
    const customer = body?.customer;
    this.logger.log(`data_request — shop: ${shopDomain}, customer: ${customer?.email || customer?.id}`);
    // TODO: email merchant with customer's upload records
    return { acknowledged: true };
  }

  private async handleCustomerRedact(shopDomain: string, body: any) {
    const customer = body?.customer;
    this.logger.log(`customers/redact — shop: ${shopDomain}, customer: ${customer?.email}`);
    const merchant = await this.merchantRepo.findOne({ where: { shopDomain } });
    if (merchant && customer?.email) {
      await this.uploadRepo.delete({ merchantId: merchant.id, customerEmail: customer.email });
    }
    return { acknowledged: true };
  }

  private async handleShopRedact(shopDomain: string) {
    this.logger.log(`shop/redact — shop: ${shopDomain}`);
    const merchant = await this.merchantRepo.findOne({ where: { shopDomain } });
    if (!merchant) return { acknowledged: true, note: 'shop not found — already deleted' };

    await this.uploadRepo.delete({ merchantId: merchant.id });
    await this.settingsRepo.delete({ merchantId: merchant.id });
    await this.subRepo.delete({ merchantId: merchant.id });
    await this.merchantRepo.delete({ id: merchant.id });
    this.logger.log(`shop/redact complete — deleted all data for ${shopDomain}`);
    return { acknowledged: true };
  }
}
