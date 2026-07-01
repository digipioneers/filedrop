import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Merchant } from '../auth/entities/merchant.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { Plan } from '../plans/entities/plan.entity';
import { SaaSService } from './saas.service';
import { SaaSController } from './saas.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Merchant, Subscription, Plan])],
  providers: [SaaSService],
  controllers: [SaaSController],
  exports: [SaaSService],
})
export class SaaSModule {}
