import {
  Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Upload, UploadStatus } from './entities/upload.entity';
import { UploadField } from './entities/upload-field.entity';
import { Merchant } from '../auth/entities/merchant.entity';
import { StorageService } from '../storage/storage.service';
import { SecurityService } from '../security/security.service';
import { getImageDimensions } from '../common/utils/image-dimensions';
import { CreateUploadFieldDto } from './dto/create-upload-field.dto';
import { UpdateUploadFieldDto } from './dto/update-upload-field.dto';
import { UploadFileDto } from './dto/upload-file.dto';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    @InjectRepository(Upload)        private readonly uploadRepo: Repository<Upload>,
    @InjectRepository(UploadField)   private readonly fieldRepo: Repository<UploadField>,
    @InjectRepository(Merchant)      private readonly merchantRepo: Repository<Merchant>,
    private readonly storageService: StorageService,
    private readonly securityService: SecurityService,
  ) {}

  // ── Upload Fields ────────────────────────────────────────────────────────────

  async createField(merchantId: string, dto: CreateUploadFieldDto): Promise<UploadField> {
    const field = this.fieldRepo.create({ ...dto, merchantId });
    return this.fieldRepo.save(field);
  }

  async findAllFields(merchantId: string): Promise<UploadField[]> {
    return this.fieldRepo.find({
      where: { merchantId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findField(merchantId: string, fieldId: string): Promise<UploadField> {
    const field = await this.fieldRepo.findOne({ where: { id: fieldId, merchantId } });
    if (!field) throw new NotFoundException('Upload field not found');
    return field;
  }

  async updateField(
    merchantId: string,
    fieldId: string,
    dto: UpdateUploadFieldDto,
  ): Promise<UploadField> {
    const field = await this.findField(merchantId, fieldId);
    Object.assign(field, dto);
    return this.fieldRepo.save(field);
  }

  async deleteField(merchantId: string, fieldId: string): Promise<void> {
    const field = await this.findField(merchantId, fieldId);
    await this.fieldRepo.remove(field);
  }

  async getFieldsForProduct(
    shopDomain: string,
    productId: string,
    variantId?: string,
    tags?: string[],
    collectionIds?: string[],
  ): Promise<UploadField[]> {
    const merchant = await this.merchantRepo.findOne({ where: { shopDomain } });
    if (!merchant) return [];

    const all = await this.fieldRepo.find({
      where: { merchantId: merchant.id, isActive: true },
    });

    return all.filter((f) => {
      switch (f.assignmentType) {
        case 'store':      return true;
        case 'product':    return f.assignedResourceIds?.includes(productId);
        case 'variant':    return !!variantId && f.assignedResourceIds?.includes(variantId);
        case 'collection': return collectionIds?.some((c) => f.assignedResourceIds?.includes(c));
        case 'tag':        return tags?.some((t) => f.assignedTags?.includes(t));
        default:           return false;
      }
    });
  }

  // ── File Upload ──────────────────────────────────────────────────────────────

  async uploadFile(
    merchantId: string,
    file: any,
    dto: UploadFileDto,
  ): Promise<Upload> {
    const merchant = await this.merchantRepo.findOne({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundException('Merchant not found');

    const field = dto.uploadFieldId
      ? await this.fieldRepo.findOne({ where: { id: dto.uploadFieldId, merchantId } })
      : null;

    // Validate file name
    const sanitizedName = this.securityService.sanitizeFileName(file.originalname);
    if (!this.securityService.validateExtension(sanitizedName, field?.allowedExtensions)) {
      throw new BadRequestException('File type not allowed');
    }

    // Validate file size
    const maxSizeMb = field?.maxFileSizeMb ?? 10;
    const minSizeMb = field?.minFileSizeMb ?? 0;
    this.securityService.validateFileSize(file.size, Number(maxSizeMb), Number(minSizeMb));

    // Detect MIME from buffer (no external package)
    const { valid, detectedMime } = this.securityService.validateMimeType(
      file.buffer,
      field?.fieldType ?? 'custom',
    );
    if (!valid) {
      throw new BadRequestException(`File type "${detectedMime}" is not allowed for this field`);
    }

    // Image dimension validation (no external package)
    let imageWidth: number = null;
    let imageHeight: number = null;
    if (detectedMime.startsWith('image/')) {
      const dims = getImageDimensions(file.buffer);
      if (dims) {
        imageWidth  = dims.width;
        imageHeight = dims.height;
        this.validateImageDimensions(dims, field);
      }
    }

    // Upload to storage
    const orderId  = dto.orderId ?? dto.cartToken ?? 'pending';
    const s3Key    = this.storageService.buildKey(merchantId, orderId, sanitizedName);
    await this.storageService.uploadFile(s3Key, file.buffer, detectedMime);

    // Save to database
    const upload = this.uploadRepo.create({
      merchantId,
      orderId:         dto.orderId      ?? null,
      cartToken:       dto.cartToken    ?? null,
      shopifyOrderId:  dto.shopifyOrderId ?? null,
      lineItemId:      dto.lineItemId   ?? null,
      productId:       dto.productId    ?? null,
      variantId:       dto.variantId    ?? null,
      uploadFieldId:   dto.uploadFieldId ?? null,
      customerEmail:   dto.customerEmail ?? null,
      customerId:      dto.customerId   ?? null,
      originalFileName:  sanitizedName,
      sanitizedFileName: sanitizedName,
      s3Key,
      s3Bucket: process.env.MINIO_BUCKET ?? process.env.R2_BUCKET ?? 'cfup-uploads',
      mimeType:      detectedMime,
      fileExtension: sanitizedName.split('.').pop() ?? '',
      fileSizeBytes: file.size,
      imageWidth,
      imageHeight,
      status: UploadStatus.PENDING,
    });

    const saved = await this.uploadRepo.save(upload);

    // Update merchant stats
    await this.merchantRepo.increment({ id: merchantId }, 'totalUploads', 1);
    await this.merchantRepo.increment({ id: merchantId }, 'monthlyUploads', 1);
    await this.merchantRepo.increment({ id: merchantId }, 'storageUsedBytes', file.size);

    // Virus scan async (does not block response)
    this.runVirusScan(saved.id, file.buffer).catch(() => {});

    return saved;
  }

  private validateImageDimensions(
    dims: { width: number; height: number },
    field: UploadField | null,
  ): void {
    if (!field) return;
    const { width, height } = dims;
    if (field.minWidth  && width  < field.minWidth)  throw new BadRequestException(`Min width ${field.minWidth}px required`);
    if (field.maxWidth  && width  > field.maxWidth)  throw new BadRequestException(`Max width ${field.maxWidth}px exceeded`);
    if (field.minHeight && height < field.minHeight) throw new BadRequestException(`Min height ${field.minHeight}px required`);
    if (field.maxHeight && height > field.maxHeight) throw new BadRequestException(`Max height ${field.maxHeight}px exceeded`);
    if (field.requiredAspectRatio) {
      const [w, h] = field.requiredAspectRatio.split(':').map(Number);
      if (w && h && Math.abs(width / height - w / h) > 0.02) {
        throw new BadRequestException(`Image must be ${field.requiredAspectRatio} aspect ratio`);
      }
    }
  }

  private async runVirusScan(uploadId: string, buffer: Buffer): Promise<void> {
    try {
      const { isClean, virusName } = await this.securityService.scanForViruses(buffer);
      await this.uploadRepo.update(uploadId, {
        status:      isClean ? UploadStatus.CLEAN : UploadStatus.INFECTED,
        scanResult:  isClean ? 'clean' : virusName,
        scannedAt:   new Date(),
      });
      if (!isClean) {
        const up = await this.uploadRepo.findOne({ where: { id: uploadId } });
        if (up?.s3Key) await this.storageService.deleteFile(up.s3Key).catch(() => {});
      }
    } catch (err) {
      this.logger.error('Virus scan error', err?.message);
    }
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  async findAll(
    merchantId: string,
    page = 1,
    limit = 20,
    orderId?: string,
  ): Promise<{ data: Upload[]; total: number }> {
    const qb = this.uploadRepo
      .createQueryBuilder('u')
      .where('u.merchantId = :merchantId', { merchantId })
      .andWhere('u.deletedAt IS NULL');
    if (orderId) qb.andWhere('u.orderId = :orderId', { orderId });
    qb.orderBy('u.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findByOrder(merchantId: string, orderId: string): Promise<Upload[]> {
    return this.uploadRepo.find({
      where: { merchantId, orderId, deletedAt: null },
      order: { createdAt: 'DESC' },
    });
  }

  async getSignedUrl(merchantId: string, uploadId: string): Promise<string> {
    const upload = await this.uploadRepo.findOne({ where: { id: uploadId, merchantId } });
    if (!upload) throw new NotFoundException('Upload not found');
    if (upload.status === UploadStatus.INFECTED) {
      throw new ForbiddenException('File is infected and cannot be downloaded');
    }
    return this.storageService.getSignedDownloadUrl(upload.s3Key, upload.originalFileName, 3600);
  }

  async deleteUpload(merchantId: string, uploadId: string): Promise<void> {
    const upload = await this.uploadRepo.findOne({ where: { id: uploadId, merchantId } });
    if (!upload) throw new NotFoundException('Upload not found');
    await this.storageService.deleteFile(upload.s3Key).catch(() => {});
    await this.uploadRepo.update(uploadId, { deletedAt: new Date() });
    await this.merchantRepo.decrement({ id: merchantId }, 'storageUsedBytes', Number(upload.fileSizeBytes));
  }
}
