import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { Upload } from '../uploads/entities/upload.entity';
import { UploadField } from '../uploads/entities/upload-field.entity';
import { Merchant } from '../auth/entities/merchant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Upload, UploadField, Merchant])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
