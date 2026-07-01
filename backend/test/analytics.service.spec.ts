import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsService } from '../src/analytics/analytics.service';
import { Upload } from '../src/uploads/entities/upload.entity';
import { Merchant } from '../src/auth/entities/merchant.entity';
import { createMock } from '@golevelup/ts-jest';
import { Repository, SelectQueryBuilder } from 'typeorm';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let uploadRepo: jest.Mocked<Repository<Upload>>;

  const buildQb = (rawManyResult: any[] = []) => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rawManyResult),
  } as unknown as SelectQueryBuilder<any>);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(Upload), useValue: createMock<Repository<Upload>>() },
        { provide: getRepositoryToken(Merchant), useValue: createMock<Repository<Merchant>>() },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    uploadRepo = module.get(getRepositoryToken(Upload));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDailyUploads', () => {
    it('should return 30 data points by default filling gaps', async () => {
      const rows = [
        { date: '2024-01-10', count: '5' },
        { date: '2024-01-15', count: '12' },
      ];
      uploadRepo.createQueryBuilder.mockReturnValue(buildQb(rows));

      const result = await service.getDailyUploads('merchant-1', 30);
      expect(result).toHaveLength(30);
      result.forEach((r) => {
        expect(r).toHaveProperty('date');
        expect(r).toHaveProperty('count');
        expect(typeof r.count).toBe('number');
      });
    });

    it('should fill missing dates with zero', async () => {
      uploadRepo.createQueryBuilder.mockReturnValue(buildQb([]));
      const result = await service.getDailyUploads('merchant-1', 7);
      expect(result).toHaveLength(7);
      result.forEach((r) => expect(r.count).toBe(0));
    });
  });

  describe('getMonthlyUploads', () => {
    it('should return monthly data', async () => {
      const rows = [
        { month: '2024-01', count: '45' },
        { month: '2024-02', count: '62' },
      ];
      uploadRepo.createQueryBuilder.mockReturnValue(buildQb(rows));

      const result = await service.getMonthlyUploads('merchant-1');
      expect(result).toEqual(rows);
    });
  });

  describe('getStorageGrowth', () => {
    it('should return cumulative storage growth', async () => {
      const rows = [
        { date: '2024-01-01', dailyBytes: '1048576' },  // 1 MB
        { date: '2024-01-02', dailyBytes: '2097152' },  // 2 MB
        { date: '2024-01-03', dailyBytes: '524288' },   // 0.5 MB
      ];
      uploadRepo.createQueryBuilder.mockReturnValue(buildQb(rows));

      const result = await service.getStorageGrowth('merchant-1');
      expect(result).toHaveLength(3);
      expect(result[0].bytes).toBe(1_048_576);
      expect(result[1].bytes).toBe(3_145_728);  // cumulative
      expect(result[2].bytes).toBe(3_670_016);  // cumulative
    });

    it('should handle empty data', async () => {
      uploadRepo.createQueryBuilder.mockReturnValue(buildQb([]));
      const result = await service.getStorageGrowth('merchant-1');
      expect(result).toHaveLength(0);
    });
  });

  describe('getUploadsByFieldType', () => {
    it('should return MIME type breakdown', async () => {
      const rows = [
        { mimeType: 'image/jpeg', count: '80' },
        { mimeType: 'application/pdf', count: '20' },
      ];
      uploadRepo.createQueryBuilder.mockReturnValue(buildQb(rows));

      const result = await service.getUploadsByFieldType('merchant-1');
      expect(result).toHaveLength(2);
      expect(result[0].mimeType).toBe('image/jpeg');
    });
  });

  describe('getScanStats', () => {
    it('should return scan status breakdown', async () => {
      const rows = [
        { status: 'clean', count: '95' },
        { status: 'infected', count: '2' },
        { status: 'pending', count: '3' },
      ];
      uploadRepo.createQueryBuilder.mockReturnValue(buildQb(rows));

      const result = await service.getScanStats('merchant-1');
      expect(result).toHaveLength(3);
    });
  });
});
