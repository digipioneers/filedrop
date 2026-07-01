import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';
import { Upload } from '../uploads/entities/upload.entity';
import { UploadField } from '../uploads/entities/upload-field.entity';
import { Merchant } from '../auth/entities/merchant.entity';
import { MerchantSettings } from '../settings/entities/merchant-settings.entity';
import { Plan } from '../plans/entities/plan.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { AppSettings } from '../admin/entities/app-settings.entity';
import { StorageModule } from '../storage/storage.module';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Upload, UploadField, Merchant, MerchantSettings, Plan, Subscription, AppSettings]),
    MulterModule.register({ limits: { fileSize: 2 * 1024 * 1024 * 1024 } }),
    StorageModule,
    SecurityModule,
  ],
  controllers: [StorefrontController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
