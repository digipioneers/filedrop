import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

/**
 * Shopify session token claims.
 * https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens
 *
 * - iss: issuer, e.g. "https://{shop}.myshopify.com/admin"
 * - dest: shop origin, e.g. "https://{shop}.myshopify.com"
 * - aud: our app's client_id (API key)
 * - sub: the Shopify user id (numeric string) who is currently using the app
 * - exp/nbf/iat: standard JWT timing claims (session tokens live 1 minute)
 * - jti/sid: unique token / session identifiers
 */
export interface ShopifySessionTokenPayload {
  iss: string;
  dest: string;
  aud: string;
  sub: string;
  exp: number;
  nbf: number;
  iat: number;
  jti: string;
  sid: string;
}

/**
 * Validates the Shopify session token that App Bridge attaches as a Bearer
 * token on every request from the embedded frontend. This REPLACES the old
 * self-issued JWT — Shopify's app review requires session-token auth for
 * embedded apps, and a non-expiring custom token passed via URL params is
 * exactly the anti-pattern the "Using session tokens for user authentication"
 * automated check flags.
 *
 * Kept registered as the 'jwt' strategy (same name as before) so every
 * existing @UseGuards(JwtAuthGuard) controller keeps working unchanged —
 * only the verification logic and the resulting req.user lookup changed.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    const apiKey = configService.get<string>('SHOPIFY_API_KEY');
    const apiSecret = configService.get<string>('SHOPIFY_API_SECRET');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: apiSecret,
      algorithms: ['HS256'],
      audience: apiKey,
    });
  }

  async validate(payload: ShopifySessionTokenPayload) {
    // dest looks like "https://my-shop.myshopify.com" — extract the shop domain.
    const shopDomain = (payload.dest || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!shopDomain || !shopDomain.endsWith('.myshopify.com')) {
      throw new UnauthorizedException('Invalid session token: bad dest claim');
    }

    const merchant = await this.authService.findByShopDomain(shopDomain);
    if (!merchant || !merchant.isActive) {
      throw new UnauthorizedException('Merchant account not found or inactive');
    }

    return merchant;
  }
}
