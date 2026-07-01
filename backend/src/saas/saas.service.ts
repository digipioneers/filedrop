import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Merchant } from '../auth/entities/merchant.entity';
import { Subscription, SubscriptionStatus } from '../billing/entities/subscription.entity';
import { Plan } from '../plans/entities/plan.entity';

export interface TenantUsage {
  merchantId: string;
  shopDomain: string;
  planName: string;
  uploadsThisMonth: number;
  uploadsLimit: number;
  storageUsedBytes: number;
  storageLimit: number;
  maxFileSizeBytes: number;
  isWithinLimits: boolean;
  usagePercent: { uploads: number; storage: number };
}

@Injectable()
export class SaaSService {
  private readonly logger = new Logger(SaaSService.name);

  constructor(
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
  ) {}

  async getTenantUsage(merchantId: string): Promise<TenantUsage> {
    const merchant = await this.merchantRepo.findOne({ where: { id: merchantId } });
    if (!merchant) throw new Error(`Merchant ${merchantId} not found`);

    const plan = await this.getActivePlan(merchantId);
    const uploadsLimit = plan.uploadsPerMonth;
    const storageLimit = plan.storageBytes;

    const uploadsPercent = uploadsLimit === -1
      ? 0
      : Math.min(100, Math.round((merchant.monthlyUploads / uploadsLimit) * 100));
    const storagePercent = Math.min(100, Math.round((merchant.storageUsedBytes / storageLimit) * 100));

    return {
      merchantId,
      shopDomain: merchant.shopDomain,
      planName: plan.name,
      uploadsThisMonth: merchant.monthlyUploads,
      uploadsLimit,
      storageUsedBytes: merchant.storageUsedBytes,
      storageLimit,
      maxFileSizeBytes: plan.maxFileSizeBytes,
      isWithinLimits: uploadsPercent < 100 && storagePercent < 100,
      usagePercent: { uploads: uploadsPercent, storage: storagePercent },
    };
  }

  async enforceUploadLimit(merchantId: string, fileSizeBytes: number): Promise<void> {
    const usage = await this.getTenantUsage(merchantId);
    if (fileSizeBytes > usage.maxFileSizeBytes) {
      throw new Error(`File too large for your plan. Max: ${Math.round(usage.maxFileSizeBytes / 1048576)}MB`);
    }
    if (usage.uploadsLimit !== -1 && usage.uploadsThisMonth >= usage.uploadsLimit) {
      throw new Error(`Monthly upload limit (${usage.uploadsLimit}) reached. Upgrade your plan.`);
    }
    if (usage.usagePercent.storage >= 100) {
      throw new Error('Storage limit reached. Upgrade your plan.');
    }
  }

  async getTrialStatus(merchantId: string): Promise<{
    isOnTrial: boolean;
    daysRemaining: number;
    trialEndsAt: Date | null;
  }> {
    const sub = await this.subRepo.findOne({
      where: { merchantId, status: SubscriptionStatus.TRIAL },
      order: { createdAt: 'DESC' },
    });
    if (!sub?.trialEndsAt) return { isOnTrial: false, daysRemaining: 0, trialEndsAt: null };
    const daysRemaining = Math.max(
      0, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / 86_400_000),
    );
    return { isOnTrial: daysRemaining > 0, daysRemaining, trialEndsAt: sub.trialEndsAt };
  }

  private async getActivePlan(merchantId: string): Promise<Plan> {
    // Find active subscription
    const sub = await this.subRepo.findOne({
      where: [
        { merchantId, status: SubscriptionStatus.ACTIVE },
        { merchantId, status: SubscriptionStatus.TRIAL },
      ],
      order: { createdAt: 'DESC' },
    });

    if (sub?.planId) {
      const plan = await this.planRepo.findOne({ where: { id: sub.planId } });
      if (plan) return plan;
    }

    // Fallback to free plan
    const freePlan = await this.planRepo.findOne({ where: { name: 'free' as any } });
    return freePlan ?? {
      uploadsPerMonth: 100,
      storageBytes: 1_073_741_824,
      maxFileSizeBytes: 10_485_760,
      name: 'free',
    } as Plan;
  }
}
