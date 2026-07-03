import {
  Controller, Get, Query, Res, BadRequestException, Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly stateStore = new Map<string, { shop: string; expiresAt: number }>();

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * GET /api/v1/auth/install
   * Initiates Shopify OAuth flow.
   * Called when merchant clicks "Install" from App Store.
   */
  @Get('install')
  install(@Query('shop') shop: string, @Res() res: any) {
    if (!shop || !shop.endsWith('.myshopify.com')) {
      throw new BadRequestException('Invalid shop parameter');
    }

    const state = uuidv4();
    // Store state with 10-minute TTL to prevent CSRF
    this.stateStore.set(state, { shop, expiresAt: Date.now() + 10 * 60 * 1000 });

    const authUrl = this.authService.generateAuthUrl(shop, state);

    // A plain HTTP 3xx redirect executes inside whatever browsing context
    // made this request. If this endpoint is ever hit from inside an
    // iframe (embedded app context), a server-side redirect to Shopify's
    // OAuth screen can't escape that iframe — and Shopify's OAuth screen
    // explicitly refuses to render inside any iframe, which surfaces to
    // the merchant as "admin.shopify.com refused to connect". A tiny
    // HTML page with a JS top-level redirect always escapes correctly,
    // whether we're framed or not.
    res.set('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body>
<script>
  var target = ${JSON.stringify(authUrl)};
  if (window.top === window.self) {
    window.location.href = target;
  } else {
    window.top.location.href = target;
  }
</script>
</body></html>`);
  }

  /**
   * GET /api/v1/auth/callback
   * Shopify redirects here after merchant grants permissions.
   */
  @Get('callback')
  async callback(
    @Query() query: Record<string, string>,
    @Res() res: any,
  ) {
    const { shop, code, state, hmac } = query;
    this.logger.log(`[callback] received: shop=${shop} state=${state} hasCode=${!!code} hasHmac=${!!hmac}`);

    // Validate state to prevent CSRF
    const storedState = this.stateStore.get(state);
    if (!storedState || storedState.shop !== shop || storedState.expiresAt < Date.now()) {
      this.logger.warn(`[callback] invalid state: found=${!!storedState} shopMatch=${storedState?.shop === shop} expired=${storedState ? storedState.expiresAt < Date.now() : 'n/a'}`);
      throw new BadRequestException('Invalid state parameter');
    }
    this.stateStore.delete(state);

    // Validate HMAC
    if (!this.authService.validateHmac(query)) {
      this.logger.warn(`[callback] HMAC validation failed for shop=${shop}`);
      throw new BadRequestException('Invalid HMAC signature');
    }
    this.logger.log(`[callback] HMAC valid, exchanging code for token: shop=${shop}`);

    // Exchange code for access token (expiring offline token: access + refresh + expiry)
    const shopifyToken = await this.authService.exchangeCodeForToken(shop, code);
    this.logger.log(`[callback] got access token (len=${shopifyToken.accessToken?.length ?? 0}, hasRefreshToken=${!!shopifyToken.refreshToken}), calling installMerchant: shop=${shop}`);

    // Install/update merchant
    let merchant;
    try {
      merchant = await this.authService.installMerchant(shop, shopifyToken);
      this.logger.log(`[callback] installMerchant succeeded: shop=${shop} merchantId=${merchant?.id}`);
    } catch (err: any) {
      const statusCode = typeof err?.getStatus === 'function' ? err.getStatus() : (err?.status || err?.statusCode);
      this.logger.error(
        `[callback] installMerchant THREW: shop=${shop} name=${err?.name} message=${err?.message} ` +
        `resolvedStatusCode=${statusCode} axiosResponseStatus=${err?.response?.status} axiosResponseData=${JSON.stringify(err?.response?.data)}`,
        err?.stack,
      );
      if (statusCode === 403) {
        this.logger.warn(`[callback] treating as 403 -> redirecting to /install-disabled: shop=${shop}`);
        const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5173');
        return res.redirect(`${frontendUrl}/install-disabled`);
      }
      throw err;
    }

    // Redirect to the app inside Shopify Admin. Shopify loads it in an
    // iframe with the `host` param automatically (embedded = true in
    // shopify.app.toml); App Bridge then takes over and the frontend
    // authenticates every backend request with a session token — no
    // custom token needs to be minted or passed through the URL here.
    const apiKey = this.configService.get('SHOPIFY_API_KEY');
    res.redirect(`https://${shop}/admin/apps/${apiKey}`);
  }

  /**
   * GET /api/v1/auth/verify
   * Verify JWT token validity.
   */
  @Get('verify')
  verify() {
    return { valid: true };
  }
}
