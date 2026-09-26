import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan, PlanName } from './entities/plan.entity';

@Injectable()
export class PlansSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlansSeeder.name);

  constructor(
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
  ) {}

  async onApplicationBootstrap() {
    await this.seed();
  }

  async seed() {
    const plans = [
      {
        // Internal enum value stays 'free' (referenced throughout auth,
        // billing, and the plan-limit guard as the no-subscription
        // fallback) — displayed to merchants as "Development".
        name: PlanName.FREE,
        displayName: 'Development',
        isDefault: true, // the fallback/default plan assigned on install
        monthlyPrice: 0,
        uploadsPerMonth: 250,
        storageBytes: 2147483648,       // 2 GB
        maxFileSizeBytes: 52428800,     // 50 MB
        features: {
          imageEditor: true,
          conditionalLogic: true,
          emailNotifications: true,
          productPreview: true,
          customerPositioning: true,
          customBranding: false,
          prioritySupport: false,
        },
        isActive: true,
        sortOrder: 1,
      },
      {
        // Internal enum value stays 'starter' — displayed as "Basic".
        name: PlanName.STARTER,
        displayName: 'Basic',
        monthlyPrice: 7.99,
        uploadsPerMonth: 500,
        storageBytes: 5368709120,       // 5 GB
        maxFileSizeBytes: 26214400,     // 25 MB
        features: {
          imageEditor: false,
          conditionalLogic: false,
          emailNotifications: true,
          productPreview: false,
          customerPositioning: false,
          customBranding: false,
          prioritySupport: false,
        },
        isActive: true,
        sortOrder: 2,
      },
      {
        name: PlanName.PRO,
        displayName: 'Pro',
        monthlyPrice: 14.99,
        uploadsPerMonth: 2000,
        storageBytes: 21474836480,      // 20 GB
        maxFileSizeBytes: 104857600,    // 100 MB
        features: {
          imageEditor: true,
          conditionalLogic: true,
          emailNotifications: true,
          productPreview: true,
          customerPositioning: true,
          customBranding: false,
          prioritySupport: false,
        },
        isActive: true,
        sortOrder: 3,
      },
      {
        name: PlanName.ADVANCED,
        displayName: 'Advanced',
        monthlyPrice: 29.99,
        uploadsPerMonth: -1,            // unlimited
        storageBytes: 107374182400,     // 100 GB
        maxFileSizeBytes: 2147483648,   // 2 GB
        features: {
          imageEditor: true,
          conditionalLogic: true,
          emailNotifications: true,
          productPreview: true,
          customerPositioning: true,
          customBranding: true,
          prioritySupport: true,
        },
        isActive: true,
        sortOrder: 4,
      },
    ];

    for (const p of plans) {
      const existing = await this.planRepo.findOne({ where: { name: p.name } });
      if (!existing) {
        await this.planRepo.save(this.planRepo.create(p));
        this.logger.log(`Seeded new plan: ${p.name}`);
      } else {
        // Leave existing plans untouched. Their pricing, limits and features are
        // now managed from the super-admin Plans page, so overwriting them on
        // every boot would silently wipe those edits. Only brand-new plans
        // (missing from the DB) are seeded with these defaults.
        this.logger.log(`Plan already exists, leaving admin-managed values intact: ${p.name}`);
      }
    }
  }
}
