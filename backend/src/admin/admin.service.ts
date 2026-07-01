import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from '../plans/entities/plan.entity';
import { Merchant } from '../auth/entities/merchant.entity';
import { Upload } from '../uploads/entities/upload.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { AppSettings } from './entities/app-settings.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(Upload) private readonly uploadRepo: Repository<Upload>,
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(AppSettings) private readonly appSettingsRepo: Repository<AppSettings>,
  ) {}

  // ── Plans ────────────────────────────────────────────────────────────────

  async getPlans() {
    return await this.planRepo.find({ order: { sortOrder: 'ASC' } });
  }

  async updatePlan(id: string, dto: {
    displayName?: string;
    monthlyPrice?: number;
    uploadsPerMonth?: number;
    storageBytes?: number;
    maxFileSizeBytes?: number;
    features?: any;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');

    // Only update provided fields
    if (dto.displayName  !== undefined) plan.displayName     = dto.displayName;
    if (dto.monthlyPrice !== undefined) plan.monthlyPrice    = dto.monthlyPrice;
    if (dto.uploadsPerMonth !== undefined) plan.uploadsPerMonth = dto.uploadsPerMonth;
    if (dto.storageBytes !== undefined) plan.storageBytes    = dto.storageBytes;
    if (dto.maxFileSizeBytes !== undefined) plan.maxFileSizeBytes = dto.maxFileSizeBytes;
    if (dto.features     !== undefined) plan.features        = dto.features;
    if (dto.isActive     !== undefined) plan.isActive        = dto.isActive;
    if (dto.sortOrder    !== undefined) plan.sortOrder       = dto.sortOrder;

    const saved = await this.planRepo.save(plan);
    return saved;
  }

  // ── Merchants ────────────────────────────────────────────────────────────

  async getMerchants() {
    const merchants = await this.merchantRepo.find({
      order: { createdAt: 'DESC' },
    });

    // Attach subscription info for each merchant
    const result = await Promise.all(
      merchants.map(async (m) => {
        const sub = await this.subRepo.findOne({
          where: { merchantId: m.id },
          order: { createdAt: 'DESC' },
        });
        return {
          ...m,
          accessToken: '***hidden***',
          subscription: sub ? { status: sub.status, planId: sub.planId } : null,
        };
      }),
    );

    return result;
  }

  async getMerchant(id: string) {
    const merchant = await this.merchantRepo.findOne({ where: { id } });
    if (!merchant) throw new NotFoundException('Merchant not found');

    const subscriptions = await this.subRepo.find({
      where: { merchantId: id },
      order: { createdAt: 'DESC' },
    });

    const uploadCount = await this.uploadRepo.count({ where: { merchantId: id } });

    return {
      data: {
        ...merchant,
        accessToken: '***hidden***',
        subscriptions,
        uploadCount,
      },
    };
  }

  async deleteMerchant(id: string) {
    const merchant = await this.merchantRepo.findOne({ where: { id } });
    if (!merchant) throw new NotFoundException('Merchant not found');
    await this.merchantRepo.remove(merchant);
  }

  // ── Platform metrics ─────────────────────────────────────────────────────

  async getMetrics() {
    const [totalMerchants, activeMerchants, totalUploads] = await Promise.all([
      this.merchantRepo.count(),
      this.merchantRepo.count({ where: { isActive: true } }),
      this.uploadRepo.count(),
    ]);

    const storageResult = await this.merchantRepo
      .createQueryBuilder('m')
      .select('SUM(m.storageUsedBytes)', 'total')
      .getRawOne();

    const planBreakdown = await this.subRepo
      .createQueryBuilder('s')
      .select('s.planId', 'planId')
      .addSelect('COUNT(*)', 'count')
      .where("s.status IN ('active', 'trial')")
      .groupBy('s.planId')
      .getRawMany();

    const recentMerchants = await this.merchantRepo.find({
      order: { createdAt: 'DESC' },
      take: 5,
    });

    return {
      data: {
        totalMerchants,
        activeMerchants,
        inactiveMerchants: totalMerchants - activeMerchants,
        totalUploads,
        totalStorageBytes: Number(storageResult?.total ?? 0),
        planBreakdown,
        recentMerchants: recentMerchants.map(m => ({
          ...m,
          accessToken: '***hidden***',
        })),
      },
    };
  }

  async getAllUploads() {
    const uploads = await this.uploadRepo.find({
      where: { deletedAt: null },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return uploads;
  }

  // ── App settings ─────────────────────────────────────────────────────────
  // Persisted as a singleton row in `app_settings` (was previously an
  // in-memory class field, which meant saved values were lost on every
  // restart/redeploy and never shared across multiple backend instances).

  async getAppSettings() {
    return this.getOrCreateAppSettingsRow();
  }

  async updateAppSettings(settings: Partial<AppSettings>) {
    const row = await this.getOrCreateAppSettingsRow();
    Object.assign(row, settings);
    return this.appSettingsRepo.save(row);
  }

  private async getOrCreateAppSettingsRow(): Promise<AppSettings> {
    let row = await this.appSettingsRepo.findOne({ where: {} });
    if (!row) {
      row = this.appSettingsRepo.create({});
      row = await this.appSettingsRepo.save(row);
    }
    return row;
  }
}
