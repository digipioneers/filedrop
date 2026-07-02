import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { GdprController } from './gdpr.controller';
import { Merchant } from '../auth/entities/merchant.entity';
import { Upload } from '../uploads/entities/upload.entity';
import { MerchantSettings } from '../settings/entities/merchant-settings.entity';
import { Subscription } from '../billing/entities/subscription.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Merchant, Upload, MerchantSettings, Subscription]),
  ],
  controllers: [GdprController],
})
export class GdprModule {}
