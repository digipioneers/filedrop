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
import { UploadField } from '../uploads/entities/upload-field.entity';
import { MerchantSettings } from '../settings/entities/merchant-settings.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { Product } from '../products/entities/product.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { StorageService } from '../storage/storage.service';
import { MerchantCleanupService } from '../common/merchant-cleanup.service';

@ApiTags('GDPR')
@Controller('gdpr')
export class GdprController {
  private readonly logger = new Logger(GdprController.name);

  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(Upload)
    private readonly uploadRepo: Repository<Upload>,
    @InjectRepository(UploadField)
    private readonly fieldRepo: Repository<UploadField>,
    @InjectRepository(MerchantSettings)
    private readonly settingsRepo: Repository<MerchantSettings>,
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly storageService: StorageService,
    private readonly merchantCleanup: MerchantCleanupService,
    private readonly configService: ConfigService,
  ) {}

  /** Delete a batch of uploads' underlying files from object storage. Returns
   *  the total number of bytes freed (best-effort; a missing object is fine). */
  private async deleteUploadFiles(uploads: Upload[]): Promise<number> {
    let freedBytes = 0;
    for (const u of uploads) {
      if (u.s3Key) {
        await this.storageService
          .deleteFile(u.s3Key)
          .catch((e: any) =>
            this.logger.warn(`GDPR: could not delete file ${u.s3Key}: ${e?.message}`),
          );
      }
      freedBytes += Number(u.fileSizeBytes || 0);
    }
    return freedBytes;
  }

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
    this.logger.log(
      `data_request — shop: ${shopDomain}, customer: ${customer?.email || customer?.id}`,
    );

    // Compile the data we hold for this customer so the merchant can fulfil the
    // request. We store upload files + metadata keyed by customer email; gather
    // a non-sensitive summary and log it for the merchant/support to action.
    // (Shopify doesn't read this response body — the obligation is on the app
    // to make the data available, which starts with compiling it here.)
    const merchant = await this.merchantRepo.findOne({ where: { shopDomain } });
    let records: Array<Record<string, any>> = [];
    if (merchant && customer?.email) {
      const uploads = await this.uploadRepo.find({
        where: { merchantId: merchant.id, customerEmail: customer.email },
      });
      records = uploads.map((u) => ({
        id: u.id,
        fileName: u.originalFileName,
        sizeBytes: Number(u.fileSizeBytes || 0),
        mimeType: u.mimeType,
        orderId: u.shopifyOrderId,
        createdAt: u.createdAt,
      }));
    }
    this.logger.log(
      `data_request compiled ${records.length} record(s) for ${customer?.email} on ${shopDomain}: ${JSON.stringify(records)}`,
    );
    return { acknowledged: true, recordCount: records.length };
  }

  private async handleCustomerRedact(shopDomain: string, body: any) {
    const customer = body?.customer;
    this.logger.log(`customers/redact — shop: ${shopDomain}, customer: ${customer?.email}`);
    const merchant = await this.merchantRepo.findOne({ where: { shopDomain } });
    if (merchant && customer?.email) {
      const uploads = await this.uploadRepo.find({
        where: { merchantId: merchant.id, customerEmail: customer.email },
      });
      // Delete the actual files from object storage — deleting only the DB
      // rows would leave the personal data (the uploaded images) in the bucket.
      const freedBytes = await this.deleteUploadFiles(uploads);
      if (uploads.length) {
        await this.uploadRepo.delete({ merchantId: merchant.id, customerEmail: customer.email });
        // Keep the storage counter honest (deleting rows directly would
        // otherwise leave storageUsedBytes permanently inflated). Clamp at 0.
        if (freedBytes > 0) {
          await this.merchantRepo
            .createQueryBuilder()
            .update(Merchant)
            .set({ storageUsedBytes: () => `GREATEST(0, storage_used_bytes - ${Number(freedBytes)})` })
            .where('id = :id', { id: merchant.id })
            .execute();
        }
      }
      this.logger.log(
        `customers/redact complete — removed ${uploads.length} upload(s), freed ${freedBytes} bytes for ${customer.email}`,
      );
    }
    return { acknowledged: true };
  }

  private async handleShopRedact(shopDomain: string) {
    this.logger.log(`shop/redact — shop: ${shopDomain}`);
    // Same permanent deletion used on uninstall — one source of truth.
    const result = await this.merchantCleanup.purgeMerchantData(shopDomain);
    if (!result) return { acknowledged: true, note: 'shop not found — already deleted' };
    this.logger.log(
      `shop/redact complete — deleted ${result.deletedFiles} file(s) and all data for ${shopDomain}`,
    );
    return { acknowledged: true };
  }
}
