import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { databaseConfig } from './common/config/database.config';

import { AuthModule } from './auth/auth.module';
import { UploadsModule } from './uploads/uploads.module';
import { StorageModule } from './storage/storage.module';
import { SecurityModule } from './security/security.module';
import { BillingModule } from './billing/billing.module';
import { PlansModule } from './plans/plans.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { OrdersModule } from './orders/orders.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { SettingsModule } from './settings/settings.module';
import { HealthModule } from './health/health.module';
import { TasksModule } from './tasks/tasks.module';
import { GdprModule } from './gdpr/gdpr.module';
import { EmailModule } from './email/email.module';
import { StorefrontModule } from './storefront/storefront.module';
import { ProductsModule } from './products/products.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SaaSModule } from './saas/saas.module';
import { AdminModule } from './admin/admin.module';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: databaseConfig,
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 10000, limit: 60 },
      { name: 'long', ttl: 60000, limit: 100 },
    ]),
    ScheduleModule.forRoot(),
    EmailModule,
    AuthModule,
    StorageModule,
    SecurityModule,
    UploadsModule,
    StorefrontModule,
    BillingModule,
    PlansModule,
    DashboardModule,
    OrdersModule,
    WebhooksModule,
    SettingsModule,
    HealthModule,
    TasksModule,
    GdprModule,
    ProductsModule,
    AnalyticsModule,
    NotificationsModule,
    SaaSModule,
    AdminModule,
  ],
})
export class AppModule {}
