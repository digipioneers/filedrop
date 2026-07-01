import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StorefrontService } from '../src/storefront/storefront.service';
import { Upload, UploadStatus } from '../src/uploads/entities/upload.entity';
import { UploadField, FieldType, AssignmentType } from '../src/uploads/entities/upload-field.entity';
import { Merchant } from '../src/auth/entities/merchant.entity';
import { MerchantSettings } from '../src/settings/entities/merchant-settings.entity';
import { Plan, PlanName } from '../src/plans/entities/plan.entity';
import { Subscription, SubscriptionStatus } from '../src/billing/entities/subscription.entity';
import { StorageService } from '../src/storage/storage.service';
import { SecurityService } from '../src/security/security.service';
import { EmailService } from '../src/email/email.service';
import { createMock } from '@golevelup/ts-jest';
import { Repository } from 'typeorm';

describe('StorefrontService', () => {
  let service: StorefrontService;
  let uploadRepo: jest.Mocked<Repository<Upload>>;
  let fieldRepo: jest.Mocked<Repository<UploadField>>;
  let merchantRepo: jest.Mocked<Repository<Merchant>>;
  let settingsRepo: jest.Mocked<Repository<MerchantSettings>>;
  let planRepo: jest.Mocked<Repository<Plan>>;
  let subRepo: jest.Mocked<Repository<Subscription>>;
  let storageService: jest.Mocked<StorageService>;
  let securityService: jest.Mocked<SecurityService>;

  const mockMerchant: Partial<Merchant> = {
    id: 'merchant-1',
    shopDomain: 'test.myshopify.com',
    accessToken: 'shpat_test',
    isActive: true,
    storageUsedBytes: 0,
    totalUploads: 0,
    monthlyUploads: 0,
  };

  const mockSettings: Partial<MerchantSettings> = {
    merchantId: 'merchant-1',
    buttonColor: '#008060',
    buttonText: 'Upload File',
    language: 'en',
    notifyMerchantOnUpload: false,
    notifyCustomerOnUpload: false,
  };

  const mockFreePlan: Partial<Plan> = {
    id: 'plan-free',
    name: PlanName.FREE,
    uploadsPerMonth: 100,
    storageBytes: 1_073_741_824,
    maxFileSizeBytes: 10_485_760,
  };

  const mockActiveSub: Partial<Subscription> = {
    merchantId: 'merchant-1',
    planId: 'plan-free',
    status: SubscriptionStatus.ACTIVE,
    trialEndsAt: new Date(Date.now() + 86_400_000 * 14),
  };

  const storeField: Partial<UploadField> = {
    id: 'field-1',
    merchantId: 'merchant-1',
    fieldType: FieldType.IMAGE,
    assignmentType: AssignmentType.STORE,
    assignmentIds: [],
    label: 'Upload Image',
    maxFileSizeMb: 10,
    minFileSizeMb: 0,
    maxFiles: 3,
    allowedExtensions: ['jpg', 'png'],
    isActive: true,
    required: false,
    enableCropping: false,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorefrontService,
        { provide: getRepositoryToken(Upload), useValue: createMock<Repository<Upload>>() },
        { provide: getRepositoryToken(UploadField), useValue: createMock<Repository<UploadField>>() },
        { provide: getRepositoryToken(Merchant), useValue: createMock<Repository<Merchant>>() },
        { provide: getRepositoryToken(MerchantSettings), useValue: createMock<Repository<MerchantSettings>>() },
        { provide: getRepositoryToken(Plan), useValue: createMock<Repository<Plan>>() },
        { provide: getRepositoryToken(Subscription), useValue: createMock<Repository<Subscription>>() },
        { provide: StorageService, useValue: createMock<StorageService>() },
        { provide: SecurityService, useValue: createMock<SecurityService>() },
        { provide: EmailService, useValue: createMock<EmailService>() },
      ],
    }).compile();

    service = module.get<StorefrontService>(StorefrontService);
    uploadRepo = module.get(getRepositoryToken(Upload));
    fieldRepo = module.get(getRepositoryToken(UploadField));
    merchantRepo = module.get(getRepositoryToken(Merchant));
    settingsRepo = module.get(getRepositoryToken(MerchantSettings));
    planRepo = module.get(getRepositoryToken(Plan));
    subRepo = module.get(getRepositoryToken(Subscription));
    storageService = module.get(StorageService);
    securityService = module.get(SecurityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getFieldsForProduct', () => {
    it('should return store-wide fields for any product', async () => {
      merchantRepo.findOne.mockResolvedValue(mockMerchant as Merchant);
      fieldRepo.find.mockResolvedValue([storeField as UploadField]);
      settingsRepo.findOne.mockResolvedValue(mockSettings as MerchantSettings);

      const result = await service.getFieldsForProduct('merchant-1', 'product-123');
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].id).toBe('field-1');
    });

    it('should throw NotFoundException for inactive/unknown merchant', async () => {
      merchantRepo.findOne.mockResolvedValue(null);
      await expect(
        service.getFieldsForProduct('merchant-1', 'product-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should filter fields by product assignment', async () => {
      const productField: Partial<UploadField> = {
        ...storeField,
        id: 'field-2',
        assignmentType: AssignmentType.PRODUCT,
        assignmentIds: ['product-999'],
      };
      merchantRepo.findOne.mockResolvedValue(mockMerchant as Merchant);
      fieldRepo.find.mockResolvedValue([storeField as UploadField, productField as UploadField]);
      settingsRepo.findOne.mockResolvedValue(mockSettings as MerchantSettings);

      const result = await service.getFieldsForProduct('merchant-1', 'product-123');
      // Only store-wide field should be returned, not the product-specific one
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].assignmentType).toBe(AssignmentType.STORE);
    });
  });
});
