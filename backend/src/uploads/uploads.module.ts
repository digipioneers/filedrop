import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { Upload } from './entities/upload.entity';
import { UploadField } from './entities/upload-field.entity';
import { UploadRule } from './entities/upload-rule.entity';
import { Merchant } from '../auth/entities/merchant.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { Plan } from '../plans/entities/plan.entity';
import { StorageModule } from '../storage/storage.module';
import { SecurityModule } from '../security/security.module';
import { PlanLimitGuard } from '../common/guards/plan-limit.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Upload, UploadField, UploadRule, Merchant, Subscription, Plan]),
    MulterModule.register({ limits: { fileSize: 2 * 1024 * 1024 * 1024 } }),
    StorageModule,
    SecurityModule,
  ],
  controllers: [UploadsController],
  providers: [UploadsService, PlanLimitGuard],
  exports: [UploadsService],
})
export class UploadsModule {}
