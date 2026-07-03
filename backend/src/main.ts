import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { WebhooksService } from './webhooks/webhooks.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Merchant } from './auth/entities/merchant.entity';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: ['error', 'warn', 'log'],
  });

  app.use((req: any, res: any, next: any) => {
    // Required for Shopify embedded apps - allow Shopify admin to load this in an iframe
    res.removeHeader('X-Frame-Options');
    res.setHeader(
      'Content-Security-Policy',
      "frame-ancestors https://*.myshopify.com https://admin.shopify.com"
    );
    next();
  });

  app.setGlobalPrefix('api/v1', { exclude: ['/'] });

  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type', 'Authorization',
      'X-Shopify-Shop-Domain', 'X-Shopify-Hmac-Sha256',
      'X-Admin-Key', 'x-admin-key',
    ],
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 Filedrop API listening on port ${port}`);
  logger.log(`   Health: http://localhost:${port}/api/v1/health`);

  // Register webhooks for ALL active merchants on startup.
  // This ensures GDPR compliance webhooks are always registered,
  // even for merchants who installed before this feature was added,
  // without requiring any manual console commands.
  setTimeout(async () => {
    try {
      const webhooksService = app.get(WebhooksService);
      const merchantRepo = app.get(getRepositoryToken(Merchant));
      const merchants = await merchantRepo.find({ where: { isActive: true } });
      logger.log(`📡 Registering webhooks for ${merchants.length} active merchant(s)...`);
      for (const merchant of merchants) {
        await webhooksService.registerWebhooksForMerchant(merchant);
      }
      logger.log('✅ Webhook registration complete');
    } catch (err: any) {
      logger.error(`Startup webhook registration failed: ${err?.message}`);
    }
  }, 5000); // 5 second delay to let app fully initialize
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
