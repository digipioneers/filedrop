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
import { Subscription, SubscriptionStatus } from '../billing/entities/subscription.entity';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly configService: ConfigService,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
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
    const merchant = await this.merchantRepo.findOne({ where: { shopDomain: shop } });
    await this.merchantRepo.update({ shopDomain: shop }, { isActive: false, uninstalledAt: new Date() });
    if (merchant) {
      // Shopify itself automatically cancels any active app subscription
      // charge when the app is uninstalled — this just brings our own
      // record in line with that, so a future reinstall starts from the
      // free plan by default instead of showing a paid plan Shopify isn't
      // actually charging for anymore.
      const result = await this.subRepo.update(
        { merchantId: merchant.id, status: SubscriptionStatus.ACTIVE },
        { status: SubscriptionStatus.CANCELLED },
      );
      if (result.affected) {
        this.logger.log(`Cancelled ${result.affected} active subscription(s) for ${shop} on uninstall`);
      }
    }
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // app_subscriptions/update
  //
  // The authoritative signal for a subscription changing state OUTSIDE the
  // app's own UI: a merchant cancelling from Shopify admin → Settings →
  // Billing, a recurring charge failing (active → frozen), an expiry, or the
  // merchant approving/declining on the confirmation screen.
  //
  // Without this handler the app only learns about subscription state when the
  // merchant reopens the billing page, so a cancellation made on Shopify's
  // side leaves paid features unlocked indefinitely. Shopify's billing review
  // checks specifically for this topic — it's the piece that was missing.
  //
  // Whatever Shopify reports here, we make our local `subscriptions` table
  // match it.
  // ---------------------------------------------------------------------------
  @Post('app_subscriptions/update')
  @HttpCode(200)
  async appSubscriptionsUpdate(
    @Req() req: any,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Headers('x-shopify-shop-domain') shop: string,
    @Body() body: any,
  ) {
    // Verify first — an unverified billing webhook must never mutate state.
    this.verifyWebhook(req, hmac, 'app_subscriptions/update', shop);

    const sub = body?.app_subscription;
    if (!sub?.admin_graphql_api_id) {
      this.logger.warn(`app_subscriptions/update for ${shop} had no subscription payload`);
      return { ok: true };
    }

    const shopifyChargeId: string = sub.admin_graphql_api_id;
    const shopifyStatus: string = String(sub.status ?? '').toUpperCase();
    this.logger.log(
      `app_subscriptions/update for ${shop}: ${sub.name} -> ${shopifyStatus}`,
    );

    const merchant = await this.merchantRepo.findOne({ where: { shopDomain: shop } });
    if (!merchant) {
      // No merchant row (e.g. already fully uninstalled). Ack so Shopify
      // doesn't retry forever.
      return { ok: true };
    }

    if (shopifyStatus === 'ACTIVE') {
      // Promote the row we created for this charge. Match on the Shopify
      // charge id so we never promote the wrong plan.
      const existing = await this.subRepo.findOne({
        where: { merchantId: merchant.id, shopifyChargeId },
      });

      if (existing) {
        // Demote any other active row first, so the merchant never ends up
        // with two active subscriptions at once.
        await this.subRepo.update(
          { merchantId: merchant.id, status: SubscriptionStatus.ACTIVE },
          { status: SubscriptionStatus.CANCELLED },
        );
        await this.subRepo.update(existing.id, {
          status: SubscriptionStatus.ACTIVE,
          shopifyChargeStatus: shopifyStatus,
          currentPeriodEnd: sub.current_period_end
            ? new Date(sub.current_period_end)
            : existing.currentPeriodEnd,
        });
        this.logger.log(`Subscription ${shopifyChargeId} for ${shop} is now ACTIVE.`);
      }
      return { ok: true };
    }

    // Anything NOT active — CANCELLED, DECLINED, EXPIRED, FROZEN — must not keep
    // granting a paid plan. Only touch the row for THIS charge, so a declined
    // upgrade can't cancel a still-valid existing plan.
    const affectedRow = await this.subRepo.findOne({
      where: { merchantId: merchant.id, shopifyChargeId },
    });

    if (affectedRow && affectedRow.status === SubscriptionStatus.ACTIVE) {
      await this.subRepo.update(affectedRow.id, {
        status: SubscriptionStatus.CANCELLED,
        shopifyChargeStatus: shopifyStatus,
        cancelledAt: new Date(),
      });
      this.logger.log(
        `Subscription ${shopifyChargeId} for ${shop} moved to ${shopifyStatus}; merchant reverts to free.`,
      );
    } else if (affectedRow) {
      // Pending/other → just record Shopify's status, don't grant anything.
      await this.subRepo.update(affectedRow.id, {
        shopifyChargeStatus: shopifyStatus,
      });
    }

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
