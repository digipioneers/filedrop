import { Injectable, Logger } from '@nestjs/common';
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

interface ShopifyTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

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

  async exchangeCodeForToken(shop: string, code: string): Promise<ShopifyTokenResponse> {
    const apiKey = this.configService.get('SHOPIFY_API_KEY');
    const apiSecret = this.configService.get('SHOPIFY_API_SECRET');

    // Shopify requires public apps to request expiring offline access
    // tokens (mandatory since 2026-04-01 for new apps; non-expiring
    // tokens are rejected outright by the Admin API with a 403). Passing
    // expiring: 1 here makes Shopify return access_token + refresh_token
    // + expires_in instead of a permanent token.
    const response = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      { client_id: apiKey, client_secret: apiSecret, code, expiring: 1 },
    );

    const { access_token, refresh_token, expires_in } = response.data;
    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      // expires_in is seconds from now; store a small safety margin so we
      // refresh a bit before Shopify actually invalidates it.
      expiresAt: new Date(Date.now() + (expires_in - 60) * 1000),
    };
  }

  /**
   * Exchange a refresh token for a new access token. Call this proactively
   * before tokenExpiresAt, or reactively on a 401 from the Admin API.
   */
  async refreshAccessToken(shop: string, refreshToken: string): Promise<ShopifyTokenResponse> {
    const apiKey = this.configService.get('SHOPIFY_API_KEY');
    const apiSecret = this.configService.get('SHOPIFY_API_SECRET');

    const response = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: apiKey,
        client_secret: apiSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      },
    );

    const { access_token, refresh_token, expires_in } = response.data;
    return {
      accessToken: access_token,
      // Shopify rotates the refresh token on every use; the old one is
      // invalidated, so we must persist the new one every time.
      refreshToken: refresh_token,
      expiresAt: new Date(Date.now() + (expires_in - 60) * 1000),
    };
  }

  /**
   * Fetch shop info from Shopify API.
   */
  async fetchShopInfo(shop: string, accessToken: string) {
    const response = await axios.get(
      `https://${shop}/admin/api/2026-07/shop.json`,
      { headers: { 'X-Shopify-Access-Token': accessToken } },
    );
    return response.data.shop;
  }

  /**
   * Install or update merchant after OAuth.
   * New shop signups are blocked when the super-admin has disabled
   * registrations; existing merchants can always reinstall/reconnect.
   */
  async installMerchant(shop: string, token: ShopifyTokenResponse): Promise<Merchant> {
    let merchant = await this.merchantRepo.findOne({ where: { shopDomain: shop } });
    const isNewMerchant = !merchant;

    const shopInfo = await this.fetchShopInfo(shop, token.accessToken);

    // Shopify marks development/partner stores with specific plan_name
    // values (confirmed via Shopify's own community answers: a standard
    // dev store shows plan_name "affiliate"; "partner_test" and "staff"
    // are related partner/test account types). Deliberately NOT including
    // "trial" here — that's a LIVE store on its normal Shopify trial
    // period, a genuine future paying customer, not a dev store; treating
    // it as one would incorrectly waive real billing.
    const devStorePlanNames = ['affiliate', 'partner_test', 'staff'];
    const isDevelopmentStore = devStorePlanNames.includes(shopInfo.plan_name);

    if (merchant) {
      merchant.accessToken = token.accessToken;
      merchant.refreshToken = token.refreshToken;
      merchant.tokenExpiresAt = token.expiresAt;
      merchant.shopName = shopInfo.name;
      merchant.shopEmail = shopInfo.email;
      merchant.shopCurrency = shopInfo.currency;
      merchant.shopPlanName = shopInfo.plan_name;
      merchant.isDevelopmentStore = isDevelopmentStore;
      merchant.isActive = true;
      merchant.uninstalledAt = null;
    } else {
      merchant = this.merchantRepo.create({
        shopDomain: shop,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        tokenExpiresAt: token.expiresAt,
        shopName: shopInfo.name,
        shopEmail: shopInfo.email,
        shopCurrency: shopInfo.currency,
        shopPlanName: shopInfo.plan_name,
        isDevelopmentStore: isDevelopmentStore,
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
   * Find merchant by shop domain (for session-token strategy — the token's
   * `dest` claim carries the shop domain, not our internal merchant id).
   */
  async findByShopDomain(shopDomain: string): Promise<Merchant | null> {
    return this.merchantRepo.findOne({ where: { shopDomain } });
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
