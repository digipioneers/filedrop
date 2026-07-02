import {
  Controller, Post, Headers, Body, Req,
  HttpCode, HttpStatus, Logger, UnauthorizedException,
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
   * Verify Shopify webhook HMAC signature.
   * Shopify signs every webhook with HMAC-SHA256 using the app's API secret.
   * Rejecting requests without a valid signature is a mandatory App Store requirement.
   */
  private verifyHmac(req: any, hmacHeader: string): void {
    if (!hmacHeader) {
      throw new UnauthorizedException('Missing X-Shopify-Hmac-Sha256 header');
    }
    const rawBody: Buffer = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('No raw body available for HMAC verification');
    }
    const secret = this.configService.get<string>('SHOPIFY_API_SECRET');
    if (!secret) {
      this.logger.error('SHOPIFY_API_SECRET is not configured');
      throw new UnauthorizedException('Server misconfiguration');
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
      this.logger.warn('GDPR webhook HMAC verification failed');
      throw new UnauthorizedException('Invalid HMAC signature');
    }
  }

  /**
   * customers/data_request
   * Shopify calls this when a customer requests their data.
   * We must respond 200 within 48 hours and send the data to the customer.
   * For now we acknowledge receipt and log — a real implementation would
   * email the merchant with the customer's upload records.
   */
  @Post('customers/data_request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Customer data request (GDPR) — Shopify mandatory webhook' })
  async customerDataRequest(
    @Req() req: any,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Body() body: any,
  ) {
    this.verifyHmac(req, hmac);
    const { shop_domain, customer } = body;
    this.logger.log(
      `GDPR data_request — shop: ${shop_domain}, customer: ${customer?.email || customer?.id}`,
    );
    // TODO: email the merchant at shop_domain with all upload records for this customer
    return { acknowledged: true };
  }

  /**
   * customers/redact
   * Shopify calls this 10 days after a customer requests deletion.
   * We must delete all personal data we hold for this customer.
   */
  @Post('customers/redact')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Customer data redaction (GDPR) — Shopify mandatory webhook' })
  async customerRedact(
    @Req() req: any,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Body() body: any,
  ) {
    this.verifyHmac(req, hmac);
    const { shop_domain, customer } = body;
    this.logger.log(
      `GDPR customers/redact — shop: ${shop_domain}, customer: ${customer?.email || customer?.id}`,
    );

    const merchant = await this.merchantRepo.findOne({ where: { shopDomain: shop_domain } });
    if (merchant && customer?.email) {
      await this.uploadRepo.delete({
        merchantId: merchant.id,
        customerEmail: customer.email,
      });
    }

    return { acknowledged: true };
  }

  /**
   * shop/redact
   * Shopify calls this 48 hours after a merchant uninstalls the app.
   * We must delete ALL data we hold for this shop.
   */
  @Post('shop/redact')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Shop data redaction (GDPR) — Shopify mandatory webhook' })
  async shopRedact(
    @Req() req: any,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Body() body: any,
  ) {
    this.verifyHmac(req, hmac);
    const { shop_domain } = body;
    this.logger.log(`GDPR shop/redact — shop: ${shop_domain}`);

    const merchant = await this.merchantRepo.findOne({ where: { shopDomain: shop_domain } });
    if (!merchant) {
      return { acknowledged: true, note: 'shop not found — already deleted' };
    }

    // Delete in dependency order to respect foreign-key constraints
    await this.uploadRepo.delete({ merchantId: merchant.id });
    await this.settingsRepo.delete({ merchantId: merchant.id });
    await this.subRepo.delete({ merchantId: merchant.id });
    await this.merchantRepo.delete({ id: merchant.id });

    this.logger.log(`GDPR shop/redact — deleted all data for ${shop_domain}`);
    return { acknowledged: true };
  }
}
