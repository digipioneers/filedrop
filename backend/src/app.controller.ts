import { Controller, Get, Query, Res, All } from '@nestjs/common';

/**
 * Root controller — handles Shopify's initial app load request.
 *
 * When a merchant installs the app, Shopify loads APP_URL with:
 *   GET /?hmac=...&shop=...&timestamp=...
 * OR
 *   GET /?embedded=1&hmac=...&host=...&shop=...
 *
 * This controller catches both patterns and redirects to the correct
 * OAuth install endpoint at /api/v1/auth/install?shop=...
 */
@Controller()
export class AppController {
  @Get()
  root(@Query() query: Record<string, string>, @Res() res: any) {
    const shop = query.shop;

    if (shop) {
      // Shopify is loading the app — redirect to OAuth install
      return res.redirect(`/api/v1/auth/install?shop=${shop}`);
    }

    // No shop param — return basic info
    return res.json({
      name: 'Custom File Upload Pro',
      status: 'running',
      api: '/api/v1',
      health: '/api/v1/health',
    });
  }
}
