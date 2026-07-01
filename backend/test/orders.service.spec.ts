import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { OrdersService } from '../src/orders/orders.service';
import { Upload, UploadStatus } from '../src/uploads/entities/upload.entity';
import { StorageService } from '../src/storage/storage.service';
import { createMock } from '@golevelup/ts-jest';
import { Repository, SelectQueryBuilder } from 'typeorm';

describe('OrdersService', () => {
  let service: OrdersService;
  let uploadRepo: jest.Mocked<Repository<Upload>>;
  let storageService: jest.Mocked<StorageService>;

  const mockUploads: Partial<Upload>[] = [
    {
      id: 'upload-1',
      merchantId: 'merchant-1',
      orderId: '1001',
      shopifyOrderId: '987654321',
      originalFileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSizeBytes: 204800,
      status: UploadStatus.CLEAN,
      s3Key: 'merchant-1/1001/uploaded_files/photo.jpg',
      createdAt: new Date('2024-01-15'),
      deletedAt: null,
    },
    {
      id: 'upload-2',
      merchantId: 'merchant-1',
      orderId: '1001',
      shopifyOrderId: '987654321',
      originalFileName: 'document.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 102400,
      status: UploadStatus.CLEAN,
      s3Key: 'merchant-1/1001/uploaded_files/document.pdf',
      createdAt: new Date('2024-01-15'),
      deletedAt: null,
    },
  ];

  const mockQb = (rawMany: any[] = [], rawOne: any = { count: '0' }) => {
    return {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rawMany),
      getRawOne: jest.fn().mockResolvedValue(rawOne),
    } as unknown as SelectQueryBuilder<any>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Upload), useValue: createMock<Repository<Upload>>() },
        { provide: StorageService, useValue: createMock<StorageService>() },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    uploadRepo = module.get(getRepositoryToken(Upload));
    storageService = module.get(StorageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrderUploads', () => {
    it('should return uploads with signed URLs for clean files', async () => {
      uploadRepo.find.mockResolvedValue(mockUploads as Upload[]);
      storageService.getSignedDownloadUrl.mockResolvedValue('https://s3.example.com/signed-url');

      const result = await service.getOrderUploads('merchant-1', '1001');

      expect(result.orderId).toBe('1001');
      expect(result.totalFiles).toBe(2);
      expect(result.uploads).toHaveLength(2);
      expect(result.uploads[0].signedUrl).toBe('https://s3.example.com/signed-url');
      expect(storageService.getSignedDownloadUrl).toHaveBeenCalledTimes(2);
    });

    it('should throw NotFoundException when no uploads exist', async () => {
      uploadRepo.find.mockResolvedValue([]);
      await expect(service.getOrderUploads('merchant-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not generate signed URL for infected files', async () => {
      const infectedUploads: Partial<Upload>[] = [
        { ...mockUploads[0], status: UploadStatus.INFECTED },
      ];
      uploadRepo.find.mockResolvedValue(infectedUploads as Upload[]);

      const result = await service.getOrderUploads('merchant-1', '1001');
      expect(result.uploads[0].signedUrl).toBeNull();
      expect(storageService.getSignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('should calculate total size correctly', async () => {
      uploadRepo.find.mockResolvedValue(mockUploads as Upload[]);
      storageService.getSignedDownloadUrl.mockResolvedValue('https://s3.example.com/url');

      const result = await service.getOrderUploads('merchant-1', '1001');
      expect(result.totalSizeBytes).toBe(307200); // 204800 + 102400
    });
  });

  describe('getMerchantOrders', () => {
    it('should return paginated orders grouped by orderId', async () => {
      const mockOrderRows = [
        {
          orderId: '1001',
          shopifyOrderId: '987654321',
          fileCount: '2',
          totalSizeBytes: '307200',
          lastUploadAt: new Date().toISOString(),
        },
      ];
      uploadRepo.createQueryBuilder.mockReturnValue(mockQb(mockOrderRows, { count: '1' }));

      const result = await service.getMerchantOrders('merchant-1');

      expect(result.orders).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('should respect pagination parameters', async () => {
      uploadRepo.createQueryBuilder.mockReturnValue(mockQb([], { count: '50' }));

      const result = await service.getMerchantOrders('merchant-1', 3, 10);
      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
    });
  });

  describe('downloadAllForOrder', () => {
    it('should return signed download URLs for all order files', async () => {
      uploadRepo.find.mockResolvedValue(mockUploads as Upload[]);
      storageService.getSignedDownloadUrl
        .mockResolvedValueOnce('https://s3.example.com/photo')
        .mockResolvedValueOnce('https://s3.example.com/doc');

      const result = await service.downloadAllForOrder('merchant-1', '1001');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ fileName: 'photo.jpg', url: 'https://s3.example.com/photo' });
      expect(result[1]).toMatchObject({ fileName: 'document.pdf', url: 'https://s3.example.com/doc' });
    });
  });
});
