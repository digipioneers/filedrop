import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ShopifyTokenModule } from '../shopify-token/shopify-token.module';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { Subscription } from './entities/subscription.entity';
import { Merchant } from '../auth/entities/merchant.entity';
import { Plan } from '../plans/entities/plan.entity';
import { AppSettings } from '../admin/entities/app-settings.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription, Merchant, Plan, AppSettings]), HttpModule, ShopifyTokenModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
