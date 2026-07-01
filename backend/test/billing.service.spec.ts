import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { BillingService } from '../src/billing/billing.service';
import { Subscription, SubscriptionStatus } from '../src/billing/entities/subscription.entity';
import { Plan, PlanName } from '../src/plans/entities/plan.entity';
import { Merchant } from '../src/auth/entities/merchant.entity';
import { createMock } from '@golevelup/ts-jest';
import { Repository } from 'typeorm';

describe('BillingService', () => {
  let service: BillingService;
  let subRepo: jest.Mocked<Repository<Subscription>>;
  let planRepo: jest.Mocked<Repository<Plan>>;
  let merchantRepo: jest.Mocked<Repository<Merchant>>;

  const mockFreePlan: Partial<Plan> = {
    id: 'plan-free',
    name: PlanName.FREE,
    displayName: 'Free',
    monthlyPrice: 0,
    uploadsPerMonth: 100,
    storageBytes: 1_073_741_824,
    maxFileSizeBytes: 10_485_760,
    features: ['100 uploads/month', '1 GB storage'],
    isActive: true,
    sortOrder: 0,
  };

  const mockProPlan: Partial<Plan> = {
    id: 'plan-pro',
    name: PlanName.PRO,
    displayName: 'Pro',
    monthlyPrice: 29,
    uploadsPerMonth: -1,
    storageBytes: 107_374_182_400,
    maxFileSizeBytes: 2_147_483_648,
    features: ['Unlimited uploads', '100 GB storage'],
    isActive: true,
    sortOrder: 2,
  };

  const mockMerchant: Partial<Merchant> = {
    id: 'merchant-1',
    shopDomain: 'test.myshopify.com',
    accessToken: 'test-token',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: getRepositoryToken(Subscription), useValue: createMock<Repository<Subscription>>() },
        { provide: getRepositoryToken(Plan), useValue: createMock<Repository<Plan>>() },
        { provide: getRepositoryToken(Merchant), useValue: createMock<Repository<Merchant>>() },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    subRepo = module.get(getRepositoryToken(Subscription));
    planRepo = module.get(getRepositoryToken(Plan));
    merchantRepo = module.get(getRepositoryToken(Merchant));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllPlans', () => {
    it('should return all active plans', async () => {
      planRepo.find.mockResolvedValue([mockFreePlan, mockProPlan] as Plan[]);
      const plans = await service.getAllPlans();
      expect(plans).toHaveLength(2);
      expect(planRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });

  describe('getCurrentPlan', () => {
    it('should return free plan when no subscription exists', async () => {
      subRepo.findOne.mockResolvedValue(null);
      planRepo.findOne.mockResolvedValue(mockFreePlan as Plan);

      const result = await service.getCurrentPlan('merchant-1');
      expect(result.subscription).toBeNull();
      expect(result.plan.name).toBe(PlanName.FREE);
    });

    it('should return active subscription plan', async () => {
      const mockSub: Partial<Subscription> = {
        id: 'sub-1',
        merchantId: 'merchant-1',
        planId: 'plan-pro',
        status: SubscriptionStatus.ACTIVE,
      };
      subRepo.findOne.mockResolvedValue(mockSub as Subscription);
      planRepo.findOne.mockResolvedValue(mockProPlan as Plan);

      const result = await service.getCurrentPlan('merchant-1');
      expect(result.subscription?.status).toBe(SubscriptionStatus.ACTIVE);
      expect(result.plan.name).toBe(PlanName.PRO);
    });
  });

  describe('activateFreePlan', () => {
    it('should create a free plan subscription with 14-day trial', async () => {
      planRepo.findOne.mockResolvedValue(mockFreePlan as Plan);
      subRepo.update.mockResolvedValue({ affected: 0 } as any);
      const savedSub = {
        id: 'sub-new',
        merchantId: 'merchant-1',
        planId: 'plan-free',
        status: SubscriptionStatus.ACTIVE,
        trialStartsAt: new Date(),
        trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
      };
      subRepo.create.mockReturnValue(savedSub as Subscription);
      subRepo.save.mockResolvedValue(savedSub as Subscription);

      const result = await service.activateFreePlan('merchant-1');
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(subRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when free plan not found', async () => {
      planRepo.findOne.mockResolvedValue(null);
      await expect(service.activateFreePlan('merchant-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createSubscription', () => {
    it('should return Shopify billing URL for paid plans', async () => {
      planRepo.findOne.mockResolvedValue(mockProPlan as Plan);

      const result = await service.createSubscription(
        mockMerchant as Merchant,
        PlanName.PRO,
        'https://app.example.com/billing/confirm',
      );

      expect(result).toHaveProperty('confirmationUrl');
      expect((result as any).confirmationUrl).toContain('test.myshopify.com');
    });

    it('should activate free plan directly without billing URL', async () => {
      planRepo.findOne.mockResolvedValue(mockFreePlan as Plan);
      subRepo.update.mockResolvedValue({ affected: 0 } as any);
      const sub = { id: 'sub-1', status: SubscriptionStatus.ACTIVE };
      subRepo.create.mockReturnValue(sub as Subscription);
      subRepo.save.mockResolvedValue(sub as Subscription);

      const result = await service.createSubscription(
        mockMerchant as Merchant,
        PlanName.FREE,
        'https://app.example.com/billing/confirm',
      );
      expect(result).toHaveProperty('status', SubscriptionStatus.ACTIVE);
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel active subscription', async () => {
      subRepo.update.mockResolvedValue({ affected: 1 } as any);
      const result = await service.cancelSubscription('merchant-1');
      expect(result).toEqual({ success: true });
      expect(subRepo.update).toHaveBeenCalledWith(
        { merchantId: 'merchant-1', status: SubscriptionStatus.ACTIVE },
        expect.objectContaining({ status: SubscriptionStatus.CANCELLED }),
      );
    });
  });
});
