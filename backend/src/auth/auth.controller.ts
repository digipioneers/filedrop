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
    res.redirect(authUrl);
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

    // Validate state to prevent CSRF
    const storedState = this.stateStore.get(state);
    if (!storedState || storedState.shop !== shop || storedState.expiresAt < Date.now()) {
      throw new BadRequestException('Invalid state parameter');
    }
    this.stateStore.delete(state);

    // Validate HMAC
    if (!this.authService.validateHmac(query)) {
      throw new BadRequestException('Invalid HMAC signature');
    }

    // Exchange code for access token
    const accessToken = await this.authService.exchangeCodeForToken(shop, code);

    // Install/update merchant
    let merchant;
    try {
      merchant = await this.authService.installMerchant(shop, accessToken);
    } catch (err: any) {
      if (err?.status === 403 || err?.response?.statusCode === 403) {
        const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5173');
        return res.redirect(`${frontendUrl}/install-disabled`);
      }
      throw err;
    }

    // Generate JWT
    const token = this.authService.signToken(merchant);

    const appUrl = this.configService.get('APP_URL');
    // Redirect to embedded app with token
    // Store token in cookie and redirect to frontend
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5173');
    res.redirect(`${frontendUrl}/app?token=${token}&shop=${shop}`);
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
