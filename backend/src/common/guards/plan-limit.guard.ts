import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Merchant } from '../../auth/entities/merchant.entity';
import { Subscription, SubscriptionStatus } from '../../billing/entities/subscription.entity';
import { Plan } from '../../plans/entities/plan.entity';

@Injectable()
export class PlanLimitGuard implements CanActivate {
  constructor(
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const merchant: Merchant = request.user;
    if (!merchant) return true;

    // Find active subscription
    const sub = await this.subRepo.findOne({
      where: [
        { merchantId: merchant.id, status: SubscriptionStatus.ACTIVE },
        { merchantId: merchant.id, status: SubscriptionStatus.TRIAL },
      ],
      order: { createdAt: 'DESC' },
    });

    // Get the plan separately (no relation on entity)
    const plan = sub?.planId
      ? await this.planRepo.findOne({ where: { id: sub.planId } })
      : await this.planRepo.findOne({ where: { name: 'free' as any } });

    if (!plan) return true;

    if (plan.uploadsPerMonth !== -1 && merchant.monthlyUploads >= plan.uploadsPerMonth) {
      throw new ForbiddenException('Monthly upload limit reached. Please upgrade your plan.');
    }

    if (merchant.storageUsedBytes >= plan.storageBytes) {
      throw new ForbiddenException('Storage limit reached. Please upgrade your plan.');
    }

    return true;
  }
}
