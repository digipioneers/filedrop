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
        name: PlanName.FREE,
        displayName: 'Free',
        monthlyPrice: 0,
        uploadsPerMonth: 100,
        storageBytes: 1073741824,
        maxFileSizeBytes: 10485760,
        features: { imageEditor: false, conditionalLogic: false, emailNotifications: false },
        isActive: true,
        sortOrder: 1,
      },
      {
        name: PlanName.STARTER,
        displayName: 'Starter',
        monthlyPrice: 9.99,
        uploadsPerMonth: 1000,
        storageBytes: 10737418240,
        maxFileSizeBytes: 104857600,
        features: { imageEditor: true, conditionalLogic: true, emailNotifications: true },
        isActive: true,
        sortOrder: 2,
      },
      {
        name: PlanName.PRO,
        displayName: 'Pro',
        monthlyPrice: 29.99,
        uploadsPerMonth: -1,
        storageBytes: 107374182400,
        maxFileSizeBytes: 2147483648,
        features: { imageEditor: true, conditionalLogic: true, emailNotifications: true, customBranding: true, prioritySupport: true },
        isActive: true,
        sortOrder: 3,
      },
    ];

    for (const p of plans) {
      const exists = await this.planRepo.findOne({ where: { name: p.name } });
      if (!exists) {
        await this.planRepo.save(this.planRepo.create(p));
        this.logger.log(`Seeded plan: ${p.name}`);
      }
    }
  }
}
