import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Merchant } from '../auth/entities/merchant.entity';

/**
 * Since the OAuth token-exchange fix (requesting `expiring: 1`), every
 * merchant's Shopify access token now expires after ~60 minutes and must be
 * refreshed using its refresh token. Any service calling the Shopify Admin
 * API MUST go through getValidAccessToken() instead of reading
 * merchant.accessToken directly — otherwise any call made more than an hour
 * after install/last-refresh will 401.
 *
 * This lives in its own module (rather than inside AuthService) specifically
 * to avoid a circular dependency: AuthService already depends on
 * BillingService and WebhooksService, so those services can't depend back
 * on AuthService. This service only depends on the Merchant repository, so
 * Auth, Billing, Webhooks, and Products can all safely depend on it.
 */
@Injectable()
export class ShopifyTokenService {
  private readonly logger = new Logger(ShopifyTokenService.name);

  constructor(
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Returns a Shopify access token guaranteed to be valid for at least the
   * next 5 minutes, refreshing and persisting a new one first if needed.
   */
  async getValidAccessToken(merchant: Merchant): Promise<string> {
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

    // No expiry recorded (e.g. a merchant installed before this migration
    // ran, or a non-expiring legacy token) — nothing to refresh against,
    // just use what's stored and let Shopify's own 401 be the signal.
    if (!merchant.tokenExpiresAt || !merchant.refreshToken) {
      return merchant.accessToken;
    }

    if (merchant.tokenExpiresAt > fiveMinutesFromNow) {
      return merchant.accessToken;
    }

    this.logger.log(`Access token expired/expiring soon for shop=${merchant.shopDomain}, refreshing...`);

    const apiKey = this.configService.get('SHOPIFY_API_KEY');
    const apiSecret = this.configService.get('SHOPIFY_API_SECRET');

    const response = await axios.post(
      `https://${merchant.shopDomain}/admin/oauth/access_token`,
      {
        client_id: apiKey,
        client_secret: apiSecret,
        grant_type: 'refresh_token',
        refresh_token: merchant.refreshToken,
      },
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const newExpiresAt = new Date(Date.now() + (expires_in - 60) * 1000);

    await this.merchantRepo.update(merchant.id, {
      accessToken: access_token,
      // Shopify rotates the refresh token on every use — the old one is
      // invalidated, so the new one MUST be persisted every time.
      refreshToken: refresh_token,
      tokenExpiresAt: newExpiresAt,
    });

    // Keep the in-memory object in sync too, in case the caller reuses it
    // after this call without re-fetching from the DB.
    merchant.accessToken = access_token;
    merchant.refreshToken = refresh_token;
    merchant.tokenExpiresAt = newExpiresAt;

    this.logger.log(`Refreshed access token for shop=${merchant.shopDomain}, valid until ${newExpiresAt.toISOString()}`);

    return access_token;
  }
}
