import { Injectable, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';
import { Merchant } from './entities/merchant.entity';
import { AppSettings } from '../admin/entities/app-settings.entity';
import { BillingService } from '../billing/billing.service';
import { WebhooksService } from '../webhooks/webhooks.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(AppSettings)
    private readonly appSettingsRepo: Repository<AppSettings>,
    private readonly billingService: BillingService,
    private readonly webhooksService: WebhooksService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate the Shopify OAuth authorization URL.
   */
  generateAuthUrl(shop: string, state: string): string {
    const apiKey = this.configService.get('SHOPIFY_API_KEY');
    const scopes = this.configService.get('SHOPIFY_SCOPES');
    const redirectUri = `${this.configService.get('APP_URL')}/api/v1/auth/callback`;

    return (
      `https://${shop}/admin/oauth/authorize?` +
      `client_id=${apiKey}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`
    );
  }

  /**
   * Validate Shopify HMAC signature on OAuth callback.
   */
  validateHmac(query: Record<string, string>): boolean {
    const { hmac, ...rest } = query;
    if (!hmac) return false;

    const apiSecret = this.configService.get('SHOPIFY_API_SECRET');
    const message = Object.keys(rest)
      .sort()
      .map((k) => `${k}=${rest[k]}`)
      .join('&');

    const computed = crypto
      .createHmac('sha256', apiSecret)
      .update(message)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmac));
  }

  /**
   * Validate Shopify webhook HMAC.
   */
  validateWebhookHmac(rawBody: Buffer, hmacHeader: string): boolean {
    const apiSecret = this.configService.get('SHOPIFY_API_SECRET');
    const computed = crypto
      .createHmac('sha256', apiSecret)
      .update(rawBody)
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(hmacHeader),
    );
  }

  /**
   * Exchange OAuth code for permanent access token.
   */
  async exchangeCodeForToken(shop: string, code: string): Promise<string> {
    const apiKey = this.configService.get('SHOPIFY_API_KEY');
    const apiSecret = this.configService.get('SHOPIFY_API_SECRET');

    const response = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      { client_id: apiKey, client_secret: apiSecret, code },
    );

    return response.data.access_token;
  }

  /**
   * Fetch shop info from Shopify API.
   */
  async fetchShopInfo(shop: string, accessToken: string) {
    const response = await axios.get(
      `https://${shop}/admin/api/2024-01/shop.json`,
      { headers: { 'X-Shopify-Access-Token': accessToken } },
    );
    return response.data.shop;
  }

  /**
   * Install or update merchant after OAuth.
   * New shop signups are blocked when the super-admin has disabled
   * registrations; existing merchants can always reinstall/reconnect.
   */
  async installMerchant(shop: string, accessToken: string): Promise<Merchant> {
    let merchant = await this.merchantRepo.findOne({ where: { shopDomain: shop } });
    const isNewMerchant = !merchant;

    if (isNewMerchant) {
      const appSettings = await this.appSettingsRepo.findOne({ where: {} });
      if (appSettings && appSettings.allowNewRegistrations === false) {
        this.logger.warn(`Blocked new registration (registrations disabled): ${shop}`);
        throw new ForbiddenException(
          'New installations are temporarily disabled. Please try again later.',
        );
      }
    }

    const shopInfo = await this.fetchShopInfo(shop, accessToken);

    if (merchant) {
      merchant.accessToken = accessToken;
      merchant.shopName = shopInfo.name;
      merchant.shopEmail = shopInfo.email;
      merchant.shopCurrency = shopInfo.currency;
      merchant.isActive = true;
      merchant.uninstalledAt = null;
    } else {
      merchant = this.merchantRepo.create({
        shopDomain: shop,
        accessToken,
        shopName: shopInfo.name,
        shopEmail: shopInfo.email,
        shopCurrency: shopInfo.currency,
        installedAt: new Date(),
        isActive: true,
      });
    }

    const saved = await this.merchantRepo.save(merchant);
    this.logger.log(`Merchant installed/updated: ${shop}`);

    // Give every brand-new merchant an explicit Free-plan subscription row
    // right away, instead of relying on other services' "no row = free" fallback.
    if (isNewMerchant) {
      try {
        await this.billingService.activateFreePlan(saved.id);
      } catch (err: any) {
        this.logger.error(`Failed to activate default Free plan for ${shop}: ${err?.message}`);
      }
    }

    // Register all required webhooks including GDPR compliance webhooks
    // every time a merchant installs or reinstalls. This is what makes
    // Shopify's automated checks pass — they verify Shopify's webhook
    // registry, not just our endpoint code.
    try {
      await this.webhooksService.registerWebhooksForMerchant(saved);
    } catch (err: any) {
      this.logger.error(`Failed to register webhooks for ${shop}: ${err?.message}`);
    }

    return saved;
  }

  /**
   * Sign a JWT for the merchant session.
   */
  signToken(merchant: Merchant): string {
    return this.jwtService.sign({
      sub: merchant.id,
      shop: merchant.shopDomain,
    });
  }

  /**
   * Find merchant by ID (for JWT strategy).
   */
  async findById(id: string): Promise<Merchant | null> {
    return this.merchantRepo.findOne({ where: { id } });
  }

  /**
   * Mark merchant as uninstalled.
   */
  async uninstallMerchant(shopDomain: string): Promise<void> {
    await this.merchantRepo.update(
      { shopDomain },
      { isActive: false, uninstalledAt: new Date(), accessToken: '' },
    );
    this.logger.warn(`Merchant uninstalled: ${shopDomain}`);
  }
}
