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
      // Same iframe-escape reasoning as AuthController.install() — a plain
      // server redirect can't break out of an iframe, and this route can
      // be hit from an embedded context (e.g. a stale link pointing at the
      // backend directly instead of the frontend application_url).
      res.set('Content-Type', 'text/html');
      return res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body>
<script>
  var target = ${JSON.stringify(`/api/v1/auth/install?shop=${shop}`)};
  if (window.top === window.self) {
    window.location.href = target;
  } else {
    window.top.location.href = target;
  }
</script>
</body></html>`);
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
