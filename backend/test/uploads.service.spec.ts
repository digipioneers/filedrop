import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UploadsService } from '../src/uploads/uploads.service';
import { Upload, UploadStatus } from '../src/uploads/entities/upload.entity';
import { UploadField, FieldType } from '../src/uploads/entities/upload-field.entity';
import { Merchant } from '../src/auth/entities/merchant.entity';
import { StorageService } from '../src/storage/storage.service';
import { SecurityService } from '../src/security/security.service';
import { createMock } from '@golevelup/ts-jest';
import { Repository, DataSource } from 'typeorm';

describe('UploadsService', () => {
  let service: UploadsService;
  let uploadRepo: jest.Mocked<Repository<Upload>>;
  let fieldRepo: jest.Mocked<Repository<UploadField>>;
  let merchantRepo: jest.Mocked<Repository<Merchant>>;
  let storageService: jest.Mocked<StorageService>;
  let securityService: jest.Mocked<SecurityService>;

  const mockMerchant: Partial<Merchant> = {
    id: 'merchant-1',
    shopDomain: 'test.myshopify.com',
    storageUsedBytes: 0,
    totalUploads: 0,
    monthlyUploads: 0,
    isActive: true,
  };

  const mockField: Partial<UploadField> = {
    id: 'field-1',
    merchantId: 'merchant-1',
    fieldType: FieldType.IMAGE,
    maxFileSizeMb: 10,
    minFileSizeMb: 0,
    maxFiles: 5,
    allowedExtensions: ['jpg', 'png', 'gif'],
    required: false,
    isActive: true,
    enableCropping: false,
    enableRotation: false,
  };

  const mockFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'test-image.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    buffer: Buffer.from('fake-jpeg-\xff\xd8\xff'),
    size: 1024,
    destination: '',
    filename: '',
    path: '',
    stream: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        { provide: getRepositoryToken(Upload), useValue: createMock<Repository<Upload>>() },
        { provide: getRepositoryToken(UploadField), useValue: createMock<Repository<UploadField>>() },
        { provide: getRepositoryToken(Merchant), useValue: createMock<Repository<Merchant>>() },
        { provide: StorageService, useValue: createMock<StorageService>() },
        { provide: SecurityService, useValue: createMock<SecurityService>() },
        { provide: DataSource, useValue: createMock<DataSource>() },
      ],
    }).compile();

    service = module.get<UploadsService>(UploadsService);
    uploadRepo = module.get(getRepositoryToken(Upload));
    fieldRepo = module.get(getRepositoryToken(UploadField));
    merchantRepo = module.get(getRepositoryToken(Merchant));
    storageService = module.get(StorageService);
    securityService = module.get(SecurityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createField', () => {
    it('should create and return an upload field', async () => {
      const dto = { fieldType: FieldType.IMAGE, label: 'Product Photo', maxFileSizeMb: 5 };
      const created = { ...mockField, ...dto };
      fieldRepo.create.mockReturnValue(created as UploadField);
      fieldRepo.save.mockResolvedValue(created as UploadField);

      const result = await service.createField('merchant-1', dto as any);
      expect(result).toMatchObject(dto);
      expect(fieldRepo.save).toHaveBeenCalled();
    });
  });

  describe('findAllFields', () => {
    it('should return all fields for a merchant', async () => {
      fieldRepo.find.mockResolvedValue([mockField as UploadField]);
      const result = await service.findAllFields('merchant-1');
      expect(result).toHaveLength(1);
      expect(fieldRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { merchantId: 'merchant-1' } }),
      );
    });
  });

  describe('findField', () => {
    it('should return a field by id', async () => {
      fieldRepo.findOne.mockResolvedValue(mockField as UploadField);
      const result = await service.findField('merchant-1', 'field-1');
      expect(result).toEqual(mockField);
    });

    it('should throw NotFoundException for unknown field', async () => {
      fieldRepo.findOne.mockResolvedValue(null);
      await expect(service.findField('merchant-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateField', () => {
    it('should update field properties', async () => {
      fieldRepo.findOne.mockResolvedValue({ ...mockField } as UploadField);
      const updatedField = { ...mockField, label: 'Updated Label' };
      fieldRepo.save.mockResolvedValue(updatedField as UploadField);

      const result = await service.updateField('merchant-1', 'field-1', { label: 'Updated Label' } as any);
      expect(result.label).toBe('Updated Label');
    });
  });

  describe('deleteField', () => {
    it('should delete an upload field', async () => {
      fieldRepo.findOne.mockResolvedValue(mockField as UploadField);
      fieldRepo.remove.mockResolvedValue(mockField as UploadField);

      await service.deleteField('merchant-1', 'field-1');
      expect(fieldRepo.remove).toHaveBeenCalledWith(mockField);
    });
  });

  describe('uploadFile', () => {
    it('should reject files with invalid extension', async () => {
      merchantRepo.findOne.mockResolvedValue(mockMerchant as Merchant);
      fieldRepo.findOne.mockResolvedValue(mockField as UploadField);
      securityService.sanitizeFileName.mockReturnValue('malware.exe');
      securityService.validateExtension.mockReturnValue(false);

      const exeFile = { ...mockFile, originalname: 'malware.exe' };
      await expect(
        service.uploadFile('merchant-1', exeFile as Express.Multer.File, { uploadFieldId: 'field-1' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject files failing MIME validation', async () => {
      merchantRepo.findOne.mockResolvedValue(mockMerchant as Merchant);
      fieldRepo.findOne.mockResolvedValue(mockField as UploadField);
      securityService.sanitizeFileName.mockReturnValue('test-image.jpg');
      securityService.validateExtension.mockReturnValue(true);
      securityService.validateFileSize.mockImplementation(() => { /* no throw */ });
      securityService.validateMimeType.mockResolvedValue({ valid: false, detectedMime: 'application/x-sh' });

      await expect(
        service.uploadFile('merchant-1', mockFile, { uploadFieldId: 'field-1' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully upload a valid file', async () => {
      merchantRepo.findOne.mockResolvedValue(mockMerchant as Merchant);
      fieldRepo.findOne.mockResolvedValue(mockField as UploadField);
      securityService.sanitizeFileName.mockReturnValue('test-image.jpg');
      securityService.validateExtension.mockReturnValue(true);
      securityService.validateFileSize.mockImplementation(() => { /* no throw */ });
      securityService.validateMimeType.mockResolvedValue({ valid: true, detectedMime: 'image/jpeg' });
      securityService.scanForViruses.mockResolvedValue({ isClean: true });
      storageService.buildKey.mockReturnValue('merchant-1/pending/test-image.jpg');
      storageService.uploadFile.mockResolvedValue({ sizeBytes: 1024, url: 'https://s3.example.com/key' } as any);

      const savedUpload = {
        id: 'upload-new',
        merchantId: 'merchant-1',
        originalFileName: 'test-image.jpg',
        status: UploadStatus.PENDING,
      };
      uploadRepo.create.mockReturnValue(savedUpload as Upload);
      uploadRepo.save.mockResolvedValue(savedUpload as Upload);
      uploadRepo.update.mockResolvedValue({ affected: 1 } as any);
      merchantRepo.increment.mockResolvedValue(undefined as any);

      const result = await service.uploadFile('merchant-1', mockFile, { uploadFieldId: 'field-1' } as any);
      expect(result.id).toBe('upload-new');
      expect(storageService.uploadFile).toHaveBeenCalled();
    });
  });

  describe('deleteUpload', () => {
    it('should soft-delete upload and update storage stats', async () => {
      const mockUpload = {
        id: 'upload-1',
        merchantId: 'merchant-1',
        s3Key: 'merchant-1/1001/test.jpg',
        fileSizeBytes: 1024,
        deletedAt: null,
      };
      uploadRepo.findOne.mockResolvedValue(mockUpload as Upload);
      storageService.deleteFile.mockResolvedValue(undefined);
      uploadRepo.update.mockResolvedValue({ affected: 1 } as any);
      merchantRepo.decrement.mockResolvedValue(undefined as any);

      await service.deleteUpload('merchant-1', 'upload-1');
      expect(storageService.deleteFile).toHaveBeenCalledWith(mockUpload.s3Key);
      expect(merchantRepo.decrement).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent upload', async () => {
      uploadRepo.findOne.mockResolvedValue(null);
      await expect(service.deleteUpload('merchant-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getFieldsForProduct', () => {
    it('should return store-wide fields for any product', async () => {
      const storeField = { ...mockField, assignmentType: 'store' };
      merchantRepo.findOne.mockResolvedValue(mockMerchant as Merchant);
      fieldRepo.find.mockResolvedValue([storeField as UploadField]);

      const result = await service.getFieldsForProduct('test.myshopify.com', 'product-123');
      expect(result).toHaveLength(1);
    });

    it('should return empty array for unknown shop', async () => {
      merchantRepo.findOne.mockResolvedValue(null);
      const result = await service.getFieldsForProduct('unknown.myshopify.com', 'product-123');
      expect(result).toHaveLength(0);
    });
  });
});
