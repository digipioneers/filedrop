import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from '../plans/entities/plan.entity';
import { Merchant } from '../auth/entities/merchant.entity';
import { Upload } from '../uploads/entities/upload.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { AppSettings } from './entities/app-settings.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [TypeOrmModule.forFeature([Plan, Merchant, Upload, Subscription, AppSettings])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
