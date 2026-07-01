import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { Upload } from '../src/uploads/entities/upload.entity';
import { UploadField } from '../src/uploads/entities/upload-field.entity';
import { Merchant } from '../src/auth/entities/merchant.entity';
import { createMock } from '@golevelup/ts-jest';
import { Repository, SelectQueryBuilder } from 'typeorm';

describe('DashboardService', () => {
  let service: DashboardService;
  let uploadRepo: jest.Mocked<Repository<Upload>>;
  let fieldRepo: jest.Mocked<Repository<UploadField>>;
  let merchantRepo: jest.Mocked<Repository<Merchant>>;

  const mockMerchant: Partial<Merchant> = {
    id: 'merchant-1',
    shopDomain: 'test.myshopify.com',
    storageUsedBytes: 1_073_741_824, // 1 GB
    totalUploads: 150,
    monthlyUploads: 30,
  };

  const mockQb = (rawResult: any) => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      getRawOne: jest.fn().mockResolvedValue(rawResult),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    return qb as unknown as SelectQueryBuilder<any>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: getRepositoryToken(Upload),
          useValue: createMock<Repository<Upload>>(),
        },
        {
          provide: getRepositoryToken(UploadField),
          useValue: createMock<Repository<UploadField>>(),
        },
        {
          provide: getRepositoryToken(Merchant),
          useValue: createMock<Repository<Merchant>>(),
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    uploadRepo = module.get(getRepositoryToken(Upload));
    fieldRepo = module.get(getRepositoryToken(UploadField));
    merchantRepo = module.get(getRepositoryToken(Merchant));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStats', () => {
    it('should return all dashboard stats', async () => {
      merchantRepo.findOne.mockResolvedValue(mockMerchant as Merchant);
      uploadRepo.count.mockResolvedValue(150);
      uploadRepo.createQueryBuilder.mockImplementation(() => mockQb({ count: '12' }));
      fieldRepo.count.mockResolvedValue(5);

      const stats = await service.getStats('merchant-1');

      expect(stats).toMatchObject({
        totalUploads: 150,
        activeFields: 5,
        storageUsedBytes: 1_073_741_824,
      });
      expect(stats.storageUsedFormatted).toBe('1.00 GB');
    });

    it('should handle merchant with zero storage', async () => {
      merchantRepo.findOne.mockResolvedValue({
        ...mockMerchant,
        storageUsedBytes: 0,
      } as Merchant);
      uploadRepo.count.mockResolvedValue(0);
      uploadRepo.createQueryBuilder.mockImplementation(() => mockQb({ count: '0' }));
      fieldRepo.count.mockResolvedValue(0);

      const stats = await service.getStats('merchant-1');
      expect(stats.storageUsedFormatted).toBe('0 B');
      expect(stats.totalUploads).toBe(0);
    });
  });

  describe('getDailyUploads', () => {
    it('should return daily upload data', async () => {
      const mockRows = [
        { date: '2024-01-01', count: '5' },
        { date: '2024-01-02', count: '10' },
      ];
      const qb = {
        ...mockQb(null),
        getRawMany: jest.fn().mockResolvedValue(mockRows),
      } as unknown as SelectQueryBuilder<any>;
      uploadRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getDailyUploads('merchant-1');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getMonthlyUploads', () => {
    it('should return monthly upload data', async () => {
      const mockRows = [{ month: '2024-01', count: '50' }];
      const qb = {
        ...mockQb(null),
        getRawMany: jest.fn().mockResolvedValue(mockRows),
      } as unknown as SelectQueryBuilder<any>;
      uploadRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMonthlyUploads('merchant-1');
      expect(result).toEqual(mockRows);
    });
  });
});
